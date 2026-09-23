export type TruckRoute = {
  _id: string;
  client: string;
  driverName?: string;
  truckFleetNoStr?: string;
  trailerFleetNoStr?: string;
  status?: string;
  routeOrder?: number;
  planningSource?: "board";
  assignmentState?: AssignmentState;
  loads: {
    client: string;
    fromLocations: string[];
    toLocations: string[];
    loadId?: string;
    quantity: string;
    quantityType: string;
    rate: string;
    rateType: string;
    kilometers?: number;
    notes?: string;
  }[];
  routeDate: string;
  region?: string;
  kilometers: number;
  notes: string;
  createdAt: number;
};

export type TruckInfo = {
  _id: string;
  truckFleetNo?: string;
  registration?: string;
  make?: string;
  model?: string;
  status?: string;
  currentTrailerId?: string;
  subcontractorId?: string;
};

export type TrailerInfo = {
  _id: string;
  trailerFleetNo?: number;
  trailerFleetNoStr?: string;
  type?: string;
  status?: string;
};

export type DriverInfo = {
  _id: string;
  name?: string;
  driverName?: string;
  status?: string;
};

/** Assignment state for a single route — UI-derived only, never persisted. */
export type AssignmentState =
  | "ready_match"
  | "ready_mismatch"
  | "ready_physical_unpaired"
  | "missing_driver"
  | "missing_planned_trailer"
  | "missing_driver_and_planned_trailer";

/** Summary of route readiness for a truck lane. */
export type TruckReadinessSummary = {
  totalRoutes: number;
  readyRoutes: number;
};

export type BoardTruck = {
  truck: TruckInfo;
  routes: TruckRoute[];
  driverName?: string;
  trailerFleetNo?: string;
  physicalTrailerFleetNo?: string;
  readiness: TruckReadinessSummary;
  status: "available" | "planned" | "completed" | "unavailable";
};

export type DailyAvailability = {
  _id: string;
  date: string;
  dayKey: string;
  status: "available" | "unavailable" | "maintenance";
  trucks: string[];
  drivers: string[];
  trailers: string[];
};

/**
 * Resolve a truck's physical trailer fleet number from its currentTrailerId.
 * Returns undefined if the truck has no currentTrailerId or the trailer
 * record is not found.
 */
export function getPhysicalTrailerFleetNo(
  truck: TruckInfo,
  trailers: TrailerInfo[]
): string | undefined {
  if (!truck.currentTrailerId) return undefined;
  const trailer = trailers.find((t) => t._id === truck.currentTrailerId);
  return trailer?.trailerFleetNoStr;
}

/**
 * Derive the assignment state for a single route.
 *
 * Physical trailer (trucks.currentTrailerId) is NEVER a substitute for
 * the route's planned trailer (dailyRoute.trailerFleetNoStr).
 *
 * States:
 * - ready_match: driver assigned + planned trailer matches physical trailer
 * - ready_mismatch: driver assigned + planned trailer differs from physical trailer
 *   (requires BOTH planned AND physical to exist AND differ)
 * - ready_physical_unpaired: driver assigned + planned trailer set + no physical trailer
 * - missing_driver: planned trailer assigned but no driver
 * - missing_planned_trailer: driver assigned but no planned trailer
 * - missing_driver_and_planned_trailer: neither driver nor planned trailer
 */
export function getAssignmentState(
  route: TruckRoute,
  truck: TruckInfo,
  trailers: TrailerInfo[]
): AssignmentState {
  const hasDriver = Boolean(route.driverName && route.driverName.trim().length > 0);
  const hasPlannedTrailer = Boolean(
    route.trailerFleetNoStr && route.trailerFleetNoStr.trim().length > 0
  );

  if (!hasDriver && !hasPlannedTrailer) return "missing_driver_and_planned_trailer";
  if (!hasDriver) return "missing_driver";
  if (!hasPlannedTrailer) return "missing_planned_trailer";

  const physicalFleetNo = getPhysicalTrailerFleetNo(truck, trailers);
  const hasPhysical = Boolean(physicalFleetNo);

  if (!hasPhysical) return "ready_physical_unpaired";
  if (physicalFleetNo !== route.trailerFleetNoStr) return "ready_mismatch";
  return "ready_match";
}

/** Whether the assignment state represents a fully ready route. */
export function isReady(state: AssignmentState): boolean {
  return state === "ready_match" || state === "ready_mismatch" || state === "ready_physical_unpaired";
}

/**
 * Compute a readiness summary for all routes on a truck.
 * Only routes with status "planned" or undefined (defaulting to "planned")
 * are counted — completed/locked routes are excluded from the summary.
 */
export function getTruckReadinessSummary(
  routes: TruckRoute[],
  truck: TruckInfo,
  trailers: TrailerInfo[]
): TruckReadinessSummary {
  const editableRoutes = routes.filter(
    (r) => (r.status ?? "planned") === "planned"
  );
  const totalRoutes = editableRoutes.length;
  const readyRoutes = editableRoutes.filter(
    (r) => isReady(getAssignmentState(r, truck, trailers))
  ).length;
  return { totalRoutes, readyRoutes };
}

/**
 * Derive the display status for a truck on the Board.
 *
 * Status meanings:
 * - "available": No routes for this date AND no availability record marking it unavailable.
 * - "planned": At least one route exists and not all are completed/locked.
 * - "completed": All routes for this truck on this date are completed or locked.
 * - "unavailable": dailyAvailability has status "unavailable" or "maintenance"
 *   AND this truck's fleet number appears in the trucks array.
 *
 * dailyAvailability semantics:
 * The record is day-level. When status is "unavailable" or "maintenance",
 * the trucks[] array lists which specific trucks are affected.
 * A truck NOT in the list is available regardless of the day-level status.
 * When status is "available", the trucks[] array is informational only
 * and does not override the truck's status.
 */
export function getTruckStatus(
  truck: TruckInfo,
  routes: TruckRoute[],
  availability?: DailyAvailability
): "available" | "planned" | "completed" | "unavailable" {
  if (availability) {
    const fleetNo = truck.truckFleetNo || "";
    const isInList = availability.trucks.includes(fleetNo);
    if (availability.status === "unavailable" && isInList) return "unavailable";
    if (availability.status === "maintenance" && isInList) return "unavailable";
  }

  if (routes.length > 0) {
    const allCompleted = routes.every(
      (r) => r.status === "completed" || r.status === "locked"
    );
    if (allCompleted) return "completed";
    return "planned";
  }

  return "available";
}

/**
 * Build the Board's truck-centric view.
 *
 * Routes are grouped by truckFleetNoStr and sorted within each truck
 * by routeOrder (legacy routes fall back to createdAt).
 * The final truck list is sorted fleet-number-lexicographically.
 *
 * IMPORTANT: The routes array in each BoardTruck preserves the
 * authoritative sort order (routeOrder → createdAt).
 * Do NOT re-sort for display — use this order directly.
 */
export function buildBoardTrucks(
  trucks: TruckInfo[],
  routes: TruckRoute[],
  availability?: DailyAvailability,
  trailers?: TrailerInfo[]
): BoardTruck[] {
  const routesByTruck = new Map<string, TruckRoute[]>();
  for (const route of routes) {
    const fleetNo = route.truckFleetNoStr || "";
    if (!routesByTruck.has(fleetNo)) routesByTruck.set(fleetNo, []);
    routesByTruck.get(fleetNo)!.push(route);
  }

  for (const [, truckRoutes] of routesByTruck) {
    truckRoutes.sort((a, b) => {
      const orderA = a.routeOrder ?? 9999;
      const orderB = b.routeOrder ?? 9999;
      if (orderA !== orderB) return orderA - orderB;
      return a.createdAt - b.createdAt;
    });
  }

  const trailerList = trailers || [];

  return trucks
    .filter((t) => t.truckFleetNo)
    .map((truck) => {
      const fleetNo = truck.truckFleetNo || "";
      const truckRoutes = routesByTruck.get(fleetNo) || [];
      const status = getTruckStatus(truck, truckRoutes, availability);

      const lastRoute = truckRoutes[0];
      const driverName = lastRoute?.driverName;
      const trailerFleetNo = lastRoute?.trailerFleetNoStr;
      const physicalTrailerFleetNo = getPhysicalTrailerFleetNo(truck, trailerList);
      const readiness = getTruckReadinessSummary(truckRoutes, truck, trailerList);

      const routesWithState = truckRoutes.map((r) => ({
        ...r,
        assignmentState: getAssignmentState(r, truck, trailerList),
      }));

      return {
        truck,
        routes: routesWithState,
        driverName,
        trailerFleetNo,
        physicalTrailerFleetNo,
        readiness,
        status,
      };
    })
    .sort((a, b) => {
      const numA = a.truck.truckFleetNo || "";
      const numB = b.truck.truckFleetNo || "";
      return numA.localeCompare(numB, undefined, { numeric: true });
    });
}

export function isBoardManaged(route: TruckRoute): boolean {
  return route.planningSource === "board";
}

/**
 * Get the complete set of Board-created planned route IDs for reorder.
 * Used by the frontend to send the exact set expected by the
 * backend reorderRoutes mutation.
 */
export function getCompleteRouteIds(truckRoutes: TruckRoute[]): string[] {
  return truckRoutes
    .filter((r) => isBoardManaged(r) && (r.status || "planned") === "planned")
    .sort((a, b) => {
      const orderA = a.routeOrder ?? 9999;
      const orderB = b.routeOrder ?? 9999;
      if (orderA !== orderB) return orderA - orderB;
      return a.createdAt - b.createdAt;
    })
    .map((r) => r._id);
}
