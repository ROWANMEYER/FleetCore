/* Pure decision logic for cancelling UNALLOCATED planning loads.

   The board UI uses this to decide what a row may offer and to scope a bulk
   action, so the rules are unit-testable without a Convex test database. The
   mutations remain the authority: cancelPlanningLoad and cancelBulkPlanningLoads
   re-check status and region server-side and both refuse an allocated load. */

export type PlanningLoadStatus = "unallocated" | "allocated" | "cancelled";

export type CancellablePlanningLoad = {
  _id: string;
  loadDate: string;
  region: string;
  status: PlanningLoadStatus;
  client: string;
  fromLocations?: string[];
  toLocations?: string[];
};

export type CancelEligibility =
  | { allowed: true }
  | { allowed: false; reason: string };

export const DEALLOCATE_FIRST_MESSAGE =
  "Cannot cancel an allocated planning load. Deallocate it first.";

export const ALREADY_CANCELLED_MESSAGE = "Planning load is already cancelled.";

/**
 * Mirrors cancelPlanningLoad (convex/planningLoads.ts:308-342). An allocated
 * load must be returned to Unallocated first; cancelled is terminal.
 */
export function canCancelPlanningLoad(load: PlanningLoadStatus): CancelEligibility {
  if (load === "allocated") {
    return { allowed: false, reason: DEALLOCATE_FIRST_MESSAGE };
  }
  if (load === "cancelled") {
    return { allowed: false, reason: ALREADY_CANCELLED_MESSAGE };
  }
  return { allowed: true };
}

/**
 * Mirrors getUnallocatedByDate (convex/planningLoads.ts:273-304): cancelled
 * rows are excluded, by index on the scoped path and by an explicit filter on
 * the all-regions path.
 */
export function isVisibleInUnallocatedList(load: {
  status: PlanningLoadStatus;
}): boolean {
  return load.status === "unallocated";
}

/**
 * Selects the exact set a bulk cancel may touch: one planning date, one
 * effective region, unallocated only. Cancellation is by document id, never by
 * route content, so an equivalent load on another date is a different document
 * and is never selected.
 *
 * An empty region means "all regions" and is not narrowed, matching how
 * getUnallocatedByDate behaves for an admin without a region override.
 */
export function selectCancellableUnallocatedIds(
  loads: CancellablePlanningLoad[],
  targetDate: string,
  effectiveRegion: string | null | undefined
): string[] {
  return loads
    .filter(
      (load) =>
        load.loadDate === targetDate &&
        (effectiveRegion ? load.region === effectiveRegion : true) &&
        canCancelPlanningLoad(load.status).allowed
    )
    .map((load) => load._id);
}

export type CancelTargetSummary = {
  client: string;
  route: string;
  date: string;
};

function formatLocationList(locations?: string[]): string {
  const cleaned = (locations ?? []).map((l) => l.trim()).filter(Boolean);
  return cleaned.length > 0 ? cleaned.join(" + ") : "—";
}

export function describeCancelTarget(load: CancellablePlanningLoad): CancelTargetSummary {
  return {
    client: load.client.trim() || "—",
    route: `${formatLocationList(load.fromLocations)} → ${formatLocationList(load.toLocations)}`,
    date: load.loadDate,
  };
}

export function buildCancelTargetMessage(load: CancellablePlanningLoad): string {
  const target = describeCancelTarget(load);
  return `${target.client}\n${target.route}\n${target.date}\n\nIt will be removed from the active planning board.`;
}
