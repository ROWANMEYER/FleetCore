import {
  type BoardTruck,
  isReady,
} from "./boardHelpers";

/**
 * Stage 6.1 Board KPIs + presentation filters.
 *
 * Pure functions only — no hooks, no Convex, no mutations.
 */

export type BoardStatusFilter =
  | "all"
  | "planned"
  | "ready"
  | "available"
  | "unavailable";

export type BoardKpis = {
  totalLoads: number;
  plannedTrucks: number;
  readyRoutes: number;
  availableTrucks: number;
  unallocated: number;
};

/**
 * Compute the Board KPI strip values from the authoritative Board data.
 *
 * - totalLoads: allocated planning loads represented on routes (any route whose
 *   loads carry a planningLoad identity via `load.loadId`) plus the current
 *   unallocated planning loads. Legacy/manual loads without a planningLoad
 *   identity are NOT counted — same identity rule the Board uses everywhere.
 * - plannedTrucks: trucks whose Board status is "planned".
 * - readyRoutes: planned (editable) routes whose assignment state is a ready_*
 *   state, exactly matching the existing `isReady` semantics used by
 *   getTruckReadinessSummary. Completed/locked routes are never "ready".
 * - availableTrucks: trucks whose Board status is "available".
 * - unallocated: the unallocated planning-load count passed in.
 */
export function computeBoardKpis(
  boardTrucks: BoardTruck[],
  unallocatedCount: number
): BoardKpis {
  let totalLoads = 0;
  let readyRoutes = 0;

  for (const bt of boardTrucks) {
    for (const route of bt.routes) {
      if ((route.status ?? "planned") === "planned") {
        const state = route.assignmentState;
        if (state && isReady(state)) readyRoutes += 1;
      }
      for (const load of route.loads) {
        if (load.loadId) totalLoads += 1;
      }
    }
  }

  return {
    totalLoads: totalLoads + unallocatedCount,
    plannedTrucks: boardTrucks.filter((bt) => bt.status === "planned").length,
    readyRoutes,
    availableTrucks: boardTrucks.filter((bt) => bt.status === "available").length,
    unallocated: unallocatedCount,
  };
}

/**
 * Client-side presentation filter for the truck grid.
 *
 * - search matches fleet number, registration, or any driver name on the truck.
 * - status "all" passes everything; "planned"/"available"/"unavailable" match
 *   the truck's Board status; "ready" only passes trucks whose planned routes
 *   are ALL ready (readiness.totalRoutes > 0 and every route ready).
 *
 * Presentation only — never changes backend queries.
 */
export function filterBoardTrucks(
  boardTrucks: BoardTruck[],
  search: string,
  status: BoardStatusFilter
): BoardTruck[] {
  const q = search.trim().toLowerCase();

  return boardTrucks.filter((bt) => {
    if (status !== "all") {
      if (status === "ready") {
        if (
          bt.readiness.totalRoutes === 0 ||
          bt.readiness.readyRoutes !== bt.readiness.totalRoutes
        ) {
          return false;
        }
      } else if (bt.status !== status) {
        return false;
      }
    }

    if (!q) return true;

    const fleetNo = (bt.truck.truckFleetNo || "").toLowerCase();
    const reg = (bt.truck.registration || "").toLowerCase();
    const drivers = [
      bt.driverName,
      ...bt.routes.map((r) => r.driverName),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return fleetNo.includes(q) || reg.includes(q) || drivers.includes(q);
  });
}