/* Pure DnD decision helpers for the Planner Board drag-and-drop.
   No React, no Convex, no mutations — only the frontend rules that
   decide whether a drop is legal and which allocation mutation to run.

   Backend (allocateToNewRoute / allocateToExistingRoute) remains the
   final authority. These functions NEVER mutate; they only classify. */

import { type BoardTruck, type TruckRoute, getCompleteRouteIds } from "./boardHelpers";

/* ── DnD identities ─────────────────────────────────────────────────────────
   Drag sources carry stable Convex ids; drop targets carry the same id
   family under a namespaced prefix. Three namespaces exist:

     unallocated-load:<planningLoadId>   — 6.3A drag source
     allocated-load:<planningLoadId>     — 6.3B drag source
     truck:<truckFleetNoStr>             — truck drop target
     route-drag:<dailyRoute._id>         — 6.3C route DRAG source
     route-drop:<dailyRoute._id>         — 6.3C route DROP target

   Route sources and targets carry SEPARATE prefixes (they are never
   equal), so the drag-type-aware collision strategy can classify the
   active id unambiguously: a route drag only ever resolves route-drop
   targets and a load drag only ever resolves truck targets. The
   authoritative dailyRoute._id is carried verbatim in both payloads. */

export const DRAG_SOURCE_TYPE = "unallocated-load" as const;
export const ALLOCATED_DRAG_SOURCE_TYPE = "allocated-load" as const;
export const ROUTE_DRAG_SOURCE_TYPE = "route" as const;
export const TRUCK_TARGET_PREFIX = "truck" as const;
export const ROUTE_DRAG_PREFIX = "route-drag" as const;
export const ROUTE_DROP_PREFIX = "route-drop" as const;

/* Minimal, immutable drag payload. No mutable planningLoad object is ever
   placed into DnD state — only the stable Convex id plus the source kind. */
export type UnallocatedLoadDragData = {
  sourceType: typeof DRAG_SOURCE_TYPE;
  planningLoadId: string;
};

/* Payload for dragging an ALREADY-ALLOCATED Board-managed load between
   trucks/routes. Identity is the stable planning load id
   (String(planningLoad._id) → dailyRoute.loads[].loadId). Source info is
   included only so the destination lifecycle can be executed and the drag
   overlay labelled — it is never used as an identity shortcut. */
export type AllocatedLoadDragData = {
  sourceType: typeof ALLOCATED_DRAG_SOURCE_TYPE;
  planningLoadId: string;
  sourceRouteId: string;
  sourceTruckFleetNoStr: string;
  sourceRouteNumber: number;
  client: string;
  fromLocations: string[];
  toLocations: string[];
};

/* Payload for dragging a ROUTE with the SAME truck. Identity is the stable
   dailyRoutes._id — never routeOrder, route number, or array index. The
   display fields (routeNumber / loadCount / driverName) exist only to label
   the compact DragOverlay; the mutable route object is never put into state. */
export type RouteDragData = {
  sourceType: typeof ROUTE_DRAG_SOURCE_TYPE;
  routeId: string;
  sourceTruckFleetNoStr: string;
  routeNumber: number;
  loadCount: number;
  driverName: string;
};

/* Discriminated union of every drag source the Board can lift. */
export type PlanningDragData =
  | UnallocatedLoadDragData
  | AllocatedLoadDragData
  | RouteDragData;

/* Keep the historical name available so existing 6.3A/6.3B imports and type
   narrowing continue to compile unchanged. */
export type PlanningLoadDragData = PlanningDragData;

export function isAllocatedDrag(
  data: PlanningDragData | undefined
): data is AllocatedLoadDragData {
  return data?.sourceType === ALLOCATED_DRAG_SOURCE_TYPE;
}

export function isUnallocatedDrag(
  data: PlanningDragData | undefined
): data is UnallocatedLoadDragData {
  return data?.sourceType === DRAG_SOURCE_TYPE;
}

export function isRouteDrag(
  data: PlanningDragData | undefined
): data is RouteDragData {
  return data?.sourceType === ROUTE_DRAG_SOURCE_TYPE;
}

/* ── Allocated-load draggability ────────────────────────────────────────────
   A route load may be lifted only when it carries a valid planning loadId
   (Board-managed) AND its route is editable ("planned"). Legacy/manual loads
   without a loadId are never draggable through the planning lifecycle, and
   completed/locked sources stay locked exactly like the backend. */
export function isAllocatedLoadDraggable(
  routeStatus: string | undefined,
  loadId: string | undefined
): boolean {
  if (!loadId) return false;
  return (routeStatus ?? "planned") === "planned";
}

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

export function isRouteDropId(id: string): boolean {
  return id.startsWith(`${ROUTE_DROP_PREFIX}:`);
}

export function toRouteDropId(routeId: string): string {
  return `${ROUTE_DROP_PREFIX}:${routeId}`;
}

export function parseRouteDropId(id: string): string | null {
  if (!isRouteDropId(id)) return null;
  return id.slice(ROUTE_DROP_PREFIX.length + 1);
}

export function isRouteDragId(id: string): boolean {
  return id.startsWith(`${ROUTE_DRAG_PREFIX}:`);
}

export function toRouteDragId(routeId: string): string {
  return `${ROUTE_DRAG_PREFIX}:${routeId}`;
}

/* Minimal payload attached to a droppable truck lane. The BoardTruck
   itself is never embedded — only the classification the page needs.
   eligibleRouteIds exposes the truck's editable ("planned") route ids so
   the allocated-load path can exclude the drag's own source route without
   trusting array position. */
export type TruckDropTargetData = {
  targetType: "truck";
  truckFleetNoStr: string;
  decision: DropDecision;
  eligibleRouteIds: string[];
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

/* ── Allocated-load drop classification ─────────────────────────────────────
   Same truck-lane rules as 6.3A, with one extra rule: the drag's OWN source
   route is never a destination (same-route no-op). A truck whose only
   edible route is the source therefore resolves to NEW_ROUTE (creating a
   sibling route on the same truck, or a fresh Route 1 on another truck). */

export function resolveAllocatedDropDecision(
  overData: TruckDropTargetData | null,
  sourceRouteId: string
): DropDecision {
  if (!overData || overData.targetType !== "truck") return { kind: "no_action" };
  if (overData.decision.kind === "no_action") return overData.decision;
  const usable = overData.eligibleRouteIds.filter((id) => id !== sourceRouteId);
  if (usable.length > 0) return { kind: "choose_destination" };
  // No other editable route exists. If the target truck still contains the
  // source route, the load is being returned to where it came from — a
  // no-op. Only a DIFFERENT truck with zero routes creates a new route.
  if (overData.eligibleRouteIds.includes(sourceRouteId)) return { kind: "no_action" };
  return { kind: "new_route" };
}

/* Build the droppable payload for a truck lane once, from Board data. */
export function buildTruckDropTargetData(
  boardTruck: BoardTruck
): TruckDropTargetData {
  return {
    targetType: "truck",
    truckFleetNoStr: boardTruck.truck.truckFleetNo || "",
    decision: resolveUnallocatedDropDecision(boardTruck),
    eligibleRouteIds: boardTruck.routes
      .filter((r) => (r.status ?? "planned") === "planned")
      .map((r) => r._id),
  };
}

/* Same-route reference equality — the authoritative no-op test. */
export function isSameRouteNoOp(
  sourceRouteId: string,
  destinationRouteId: string
): boolean {
  return sourceRouteId === destinationRouteId;
}

/* ── Move destination choices ───────────────────────────────────────────────
   Authoritative route id (dailyRoutes._id) is preserved verbatim — never a
   display index. The source route is always excluded. */

export function getMoveDestinationChoices(
  boardTruck: BoardTruck,
  sourceRouteId: string
): EligibleRouteChoice[] {
  return boardTruck.routes
    .filter((r) => (r.status ?? "planned") === "planned" && r._id !== sourceRouteId)
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

/* ── Allocated-load move action mapping ─────────────────────────────────────
   The single translation from an allocated drag + destination choice to the
   exact existing lifecycle mutation:

     moveLoadBetweenRoutes (existing route)
     moveLoadToNewRoute    (new route)

   Same-route destination returns null (frontend no-op guard — the backend
   moveLoadBetweenRoutes also short-circuits this case). */

export type MoveAction =
  | { kind: "move_to_new_route"; planningLoadId: string; truckFleetNoStr: string }
  | { kind: "move_between_routes"; planningLoadId: string; destinationRouteId: string };

export function toMoveAction(
  drag: Pick<AllocatedLoadDragData, "sourceType" | "planningLoadId" | "sourceRouteId">,
  truckFleetNoStr: string,
  choice: DestinationChoice
): MoveAction | null {
  if (drag.sourceType !== ALLOCATED_DRAG_SOURCE_TYPE || !drag.planningLoadId) {
    return null;
  }
  if (choice.kind === "new_route") {
    return {
      kind: "move_to_new_route",
      planningLoadId: drag.planningLoadId,
      truckFleetNoStr,
    };
  }
  if (isSameRouteNoOp(drag.sourceRouteId, choice.routeId)) return null;
  return {
    kind: "move_between_routes",
    planningLoadId: drag.planningLoadId,
    destinationRouteId: choice.routeId,
  };
}

/* ── 6.3C Route reorder ─────────────────────────────────────────────────────
   Reordering PLANNED BOARD ROUTES within the SAME truck. Identity is
   dailyRoutes._id; dailyRoute.loads[]/loadId never change. This section only
   CLASSIFIES and computes the proposed ordering — the existing backend
   reorderRoutes mutation remains authoritative and receives the COMPLETE
   eligible Board route set for the truck (never a partial list). */

/* A route may be reordered only when it is Board-managed AND editable
   ("planned"). Manual routes, completed routes and locked routes are neither
   draggable nor valid reorder targets — matching backend eligibility. */
export function isRouteReorderDraggable(
  route: Pick<TruckRoute, "planningSource" | "status">
): boolean {
  return route.planningSource === "board" && (route.status ?? "planned") === "planned";
}

/* The COMPLETE eligible Board route id set for a truck, in current
   authoritative order (routeOrder, then createdAt). This is exactly the set
   the backend reorderRoutes full-set validation expects. Manual routes and
   completed/locked routes are never included. */
export function getReorderEligibleRouteIds(
  truckRoutes: readonly TruckRoute[]
): string[] {
  return getCompleteRouteIds([...truckRoutes]);
}

/* Before/after classification: the pointer is relative to the target
   RouteCard's vertical midpoint. Upper half → insert BEFORE; lower half →
   insert AFTER. Pure so it can be unit-tested. */
export type RouteDropPosition = "before" | "after";

export function resolveRouteDropPosition(
  pointerY: number,
  targetRectTop: number,
  targetRectHeight: number
): RouteDropPosition {
  const midpoint = targetRectTop + targetRectHeight / 2;
  return pointerY < midpoint ? "before" : "after";
}

/* Pure reorder calculation over stable route ids. Returns a NEW array or null
   when nothing changes (self-target, dragged id absent, target absent, or the
   computed order is identical to the current order). Never mutates input. */
export function reorderRouteIds(
  currentOrderedRouteIds: readonly string[],
  draggedRouteId: string,
  targetRouteId: string,
  position: RouteDropPosition
): string[] | null {
  if (draggedRouteId === targetRouteId) return null;
  const rest = currentOrderedRouteIds.filter((id) => id !== draggedRouteId);
  if (rest.length === currentOrderedRouteIds.length) return null;
  const targetIndex = rest.indexOf(targetRouteId);
  if (targetIndex === -1) return null;
  const insertAt = position === "before" ? targetIndex : targetIndex + 1;
  const result = [...rest.slice(0, insertAt), draggedRouteId, ...rest.slice(insertAt)];
  const unchanged =
    result.length === currentOrderedRouteIds.length &&
    result.every((id, i) => id === currentOrderedRouteIds[i]);
  return unchanged ? null : result;
}

/* Minimal payload attached to a droppable RouteCard slot. routeId is the
   stable identity; truckFleetNoStr enables the cross-truck no-op; reorderEligible
   reflects 6.3C eligibility; orderedRouteIds is the COMPLETE eligible Board
   route set for that truck in current authoritative order (embedded so the
   drop handler can build the full reorder set without trusting indexes). */
export type RouteDropTargetData = {
  targetType: "route";
  routeId: string;
  truckFleetNoStr: string;
  reorderEligible: boolean;
  orderedRouteIds: string[];
};

/* Final decision produced by consuming a validated RouteInsert at drop time.
   no_action covers every legal nothing-to-do: missing/stale/cross-truck insert
   and same-position insert. reorder carries the full computed ordered set for
   the backend mutation. */
export type RouteDropDecision =
  | { kind: "no_action" }
  | { kind: "reorder"; orderedRouteIds: string[] };

/* The insertion decision captured during drag-over and consumed VERBATIM at
   drag-end — the SINGLE source of truth for both the visible cyan line and
   the submitted operation. Identity only: the ordered set is recomputed at
   drop time from current authoritative route data, never trusted across the
   drag. Built only after handleDragOver has validated the target (route drop
   target, eligible, same truck, not self); otherwise null. */
export type RouteInsert = {
  sourceRouteId: string;
  targetRouteId: string;
  position: RouteDropPosition;
  truckFleetNoStr: string;
};

/* Resolve the drop from the LAST VALIDATED insertion decision instead of
   re-deriving geometry from the drag-end event. The visible line and the
   submitted operation are the SAME value by construction — they can never
   disagree. Validation is defensive, not trusting the stored identity:
   - sourceRouteId must still match the active drag;
   - truckFleetNoStr must still match the drag's source truck;
   - the target must still exist within the truck's CURRENT authoritative
     eligible route set (recomputed here from targetTruckRoutes, so a target
     that was completed / made manual / removed between drag-over and drag-end
     resolves to no_action);
   - reordering to the exact current order is a no-op.
   Backend reorderRoutes remains the final authority. */
export function resolveRouteInsertDrop(
  routeInsert: RouteInsert | null | undefined,
  drag: RouteDragData,
  targetTruckRoutes: readonly TruckRoute[]
): RouteDropDecision {
  if (!routeInsert) return { kind: "no_action" };
  if (routeInsert.sourceRouteId !== drag.routeId) return { kind: "no_action" };
  if (routeInsert.truckFleetNoStr !== drag.sourceTruckFleetNoStr) {
    return { kind: "no_action" };
  }
  const ordered = reorderRouteIds(
    getReorderEligibleRouteIds(targetTruckRoutes),
    routeInsert.sourceRouteId,
    routeInsert.targetRouteId,
    routeInsert.position
  );
  if (!ordered) return { kind: "no_action" };
  return { kind: "reorder", orderedRouteIds: ordered };
}