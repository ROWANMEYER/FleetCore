/* Pure DnD decision helpers for the Planner Board drag-and-drop.
   No React, no Convex, no mutations — only the frontend rules that
   decide whether a drop is legal and which allocation mutation to run.

   Backend (allocateToNewRoute / allocateToExistingRoute) remains the
   final authority. These functions NEVER mutate; they only classify. */

import type { BoardTruck } from "./boardHelpers";

/* ── DnD identities ─────────────────────────────────────────────────────────
   Drag sources carry a planning load id; drop targets carry a truck
   fleet number. The two namespaces are kept separate with a stable
   prefix so a future stage can distinguish truck targets from route
   targets without ambiguity. */

export const DRAG_SOURCE_TYPE = "unallocated-load" as const;
export const TRUCK_TARGET_PREFIX = "truck" as const;

/* Minimal, immutable drag payload. No mutable planningLoad object is ever
   placed into DnD state — only the stable Convex id plus the source kind. */
export type UnallocatedLoadDragData = {
  sourceType: typeof DRAG_SOURCE_TYPE;
  planningLoadId: string;
};

export function isTruckTargetId(id: string): boolean {
  return id.startsWith(`${TRUCK_TARGET_PREFIX}:`);
}

export function toTruckTargetId(truckFleetNoStr: string): string {
  return `${TRUCK_TARGET_PREFIX}:${truckFleetNoStr}`;
}

export function parseTruckTargetId(id: string): string | null {
  if (!isTruckTargetId(id)) return null;
  return id.slice(TRUCK_TARGET_PREFIX.length + 1);
}

/* Minimal payload attached to a droppable truck lane. The BoardTruck
   itself is never embedded — only the classification the page needs. */
export type TruckDropTargetData = {
  targetType: "truck";
  truckFleetNoStr: string;
  decision: DropDecision;
};

/* ── Drop classification ────────────────────────────────────────────────────
   Rules (frontend only; backend still validates):
   - unavailable trucks (dailyAvailability) never accept planning loads.
   - completed trucks (every route completed/locked) never accept loads.
   - trucks with zero eligible planned routes → NEW_ROUTE (create Route 1).
   - trucks with at least one eligible planned route → CHOOSE_DESTINATION
     (never auto-pick a route — the dispatcher must choose). */

export type DropDecision =
  | { kind: "no_action" }
  | { kind: "new_route" }
  | { kind: "choose_destination" };

export function resolveUnallocatedDropDecision(
  boardTruck: BoardTruck
): DropDecision {
  if (boardTruck.status === "unavailable") return { kind: "no_action" };
  if (boardTruck.status === "completed") return { kind: "no_action" };
  const eligible = boardTruck.routes.filter(
    (r) => (r.status ?? "planned") === "planned"
  );
  if (eligible.length === 0) return { kind: "new_route" };
  return { kind: "choose_destination" };
}

/* A truck accepts a drop when its decision is a real allocation. */
export function truckAcceptsDrop(boardTruck: BoardTruck): boolean {
  return resolveUnallocatedDropDecision(boardTruck).kind !== "no_action";
}

/* ── Eligible route choices ─────────────────────────────────────────────────
   Completed/locked routes can never receive planning loads (matches the
   backend assertEditableForPlanning rule). Only "planned" routes are
   offered as destinations. routeNumber follows the board's authoritative
   display order (the route array order produced by buildBoardTrucks). */

export type EligibleRouteChoice = {
  routeId: string;
  routeNumber: number;
  summary: string;
  boardManaged: boolean;
};

export function getEligibleRouteChoices(
  boardTruck: BoardTruck
): EligibleRouteChoice[] {
  return boardTruck.routes
    .filter((r) => (r.status ?? "planned") === "planned")
    .map((route, idx) => ({
      routeId: route._id,
      routeNumber: idx + 1,
      summary: route.loads.map((l) => l.client).join(", ") || "Empty",
      boardManaged: route.planningSource === "board",
    }));
}

/* ── Drop resolution ────────────────────────────────────────────────────────
   Maps a drop event onto a decision. A missing drop target (dropped
   outside any droppable, or onto a non-truck target) is NO_ACTION —
   the card simply returns to its original position with no mutation. */

export function resolveDropFromOver(
  overId: string | null,
  overData: TruckDropTargetData | null,
  planningLoadId: string | null
): DropDecision {
  if (!overId || !planningLoadId) return { kind: "no_action" };
  if (!isTruckTargetId(overId)) return { kind: "no_action" };
  if (!overData || overData.targetType !== "truck") return { kind: "no_action" };
  return overData.decision;
}

/* ── Allocation action mapping ──────────────────────────────────────────────
   The single translation from a drag + destination choice to the exact
   existing mutation shape. Nothing new is invented; the id flow remains:

     planningLoad._id → String(planningLoad._id) → dailyRoute.loads[].loadId */

export type DestinationChoice =
  | { kind: "existing_route"; routeId: string }
  | { kind: "new_route" };

export type AllocationAction =
  | { kind: "allocate_to_new_route"; planningLoadId: string; truckFleetNoStr: string }
  | { kind: "allocate_to_existing_route"; planningLoadId: string; routeId: string };

export function toAllocationAction(
  drag: UnallocatedLoadDragData,
  truckFleetNoStr: string,
  choice: DestinationChoice
): AllocationAction | null {
  if (drag.sourceType !== DRAG_SOURCE_TYPE || !drag.planningLoadId) return null;
  if (choice.kind === "existing_route") {
    return {
      kind: "allocate_to_existing_route",
      planningLoadId: drag.planningLoadId,
      routeId: choice.routeId,
    };
  }
  return {
    kind: "allocate_to_new_route",
    planningLoadId: drag.planningLoadId,
    truckFleetNoStr,
  };
}