import { describe, it, expect } from "vitest";
import {
  type UnallocatedLoadDragData,
  type AllocatedLoadDragData,
  type RouteDragData,
  type TruckDropTargetData,
  type RouteDropTargetData,
  type PlanningLoadDragData,
  resolveUnallocatedDropDecision,
  truckAcceptsDrop,
  getEligibleRouteChoices,
  resolveDropFromOver,
  toAllocationAction,
  toTruckTargetId,
  isTruckTargetId,
  parseTruckTargetId,
  isAllocatedDrag,
  isUnallocatedDrag,
  isAllocatedLoadDraggable,
  resolveAllocatedDropDecision,
  isSameRouteNoOp,
  getMoveDestinationChoices,
  toMoveAction,
  isRouteDrag,
  isRouteReorderDraggable,
  getReorderEligibleRouteIds,
  toRouteDragId,
  isRouteDragId,
  toRouteDropId,
  isRouteDropId,
  parseRouteDropId,
  reorderRouteIds,
  resolveRouteDropPosition,
  resolveRouteInsertDrop,
} from "./dndPlanning";
import type { BoardTruck, TruckInfo, TruckRoute } from "./boardHelpers";

function makeTruck(overrides: Partial<TruckInfo> = {}): TruckInfo {
  return {
    _id: "t1",
    truckFleetNo: "111",
    registration: "CAW 32208",
    status: "active",
    ...overrides,
  };
}

function makeRoute(
  overrides: Partial<TruckRoute> = {}
): TruckRoute {
  return {
    _id: "r1",
    client: "SHAVECO",
    routeDate: "2026-09-28",
    truckFleetNoStr: "111",
    loads: [],
    kilometers: 0,
    notes: "",
    createdAt: Date.now(),
    ...overrides,
  } as TruckRoute;
}

function makeBoardTruck(overrides: Partial<BoardTruck> = {}): BoardTruck {
  return {
    truck: makeTruck(),
    routes: [],
    readiness: { totalRoutes: 0, readyRoutes: 0 },
    status: "available",
    ...overrides,
  };
}

const DRAG: UnallocatedLoadDragData = {
  sourceType: "unallocated-load",
  planningLoadId: "p_load_1",
};

const MOVED: AllocatedLoadDragData = {
  sourceType: "allocated-load",
  planningLoadId: "p_load_1",
  sourceRouteId: "r1",
  sourceTruckFleetNoStr: "111",
  sourceRouteNumber: 1,
  client: "SHAVECO",
  fromLocations: ["George"],
  toLocations: ["Oudtshoorn"],
};

function truckTarget(
  overrides: Partial<TruckDropTargetData> & {
    decision: TruckDropTargetData["decision"];
  }
): TruckDropTargetData {
  return {
    targetType: "truck",
    truckFleetNoStr: "112",
    eligibleRouteIds: [],
    ...overrides,
  };
}

describe("resolveUnallocatedDropDecision", () => {
  it("A: unallocated load + empty eligible truck → NEW_ROUTE", () => {
    const emptyAvailable = makeBoardTruck({ status: "available" });
    const emptyPlanned = makeBoardTruck({ status: "planned" });
    expect(resolveUnallocatedDropDecision(emptyAvailable)).toEqual({ kind: "new_route" });
    expect(resolveUnallocatedDropDecision(emptyPlanned)).toEqual({ kind: "new_route" });
  });

  it("B: unallocated load + truck with one eligible route → CHOOSE_DESTINATION", () => {
    const bt = makeBoardTruck({
      status: "planned",
      routes: [makeRoute({ _id: "r1" })],
    });
    expect(resolveUnallocatedDropDecision(bt)).toEqual({ kind: "choose_destination" });
  });

  it("C: unallocated load + truck with multiple routes → CHOOSE_DESTINATION", () => {
    const bt = makeBoardTruck({
      status: "planned",
      routes: [makeRoute({ _id: "r1" }), makeRoute({ _id: "r2" })],
    });
    expect(resolveUnallocatedDropDecision(bt).kind).toBe("choose_destination");
  });

  it("D: completed/locked routes excluded from eligible route choices", () => {
    const bt = makeBoardTruck({
      status: "planned",
      routes: [
        makeRoute({ _id: "r_planned", status: "planned" }),
        makeRoute({ _id: "r_completed", status: "completed" }),
        makeRoute({ _id: "r_locked", status: "locked" }),
      ],
    });
    const choices = getEligibleRouteChoices(bt);
    expect(choices.map((c) => c.routeId)).toEqual(["r_planned"]);
    expect(resolveUnallocatedDropDecision(bt).kind).toBe("choose_destination");
  });

  it("D2: a truck whose only routes are completed/locked is a completed truck → NO_ACTION", () => {
    const bt = makeBoardTruck({
      status: "completed",
      routes: [
        makeRoute({ _id: "r_completed", status: "completed" }),
        makeRoute({ _id: "r_locked", status: "locked" }),
      ],
    });
    expect(resolveUnallocatedDropDecision(bt)).toEqual({ kind: "no_action" });
    expect(getEligibleRouteChoices(bt)).toEqual([]);
  });

  it("E: unavailable truck → NO_ACTION (truthful Board eligibility)", () => {
    const unavailable = makeBoardTruck({ status: "unavailable" });
    expect(resolveUnallocatedDropDecision(unavailable)).toEqual({ kind: "no_action" });
    expect(truckAcceptsDrop(unavailable)).toBe(false);
  });

  it("E2: completed truck → NO_ACTION", () => {
    const completed = makeBoardTruck({ status: "completed" });
    expect(resolveUnallocatedDropDecision(completed)).toEqual({ kind: "no_action" });
    expect(truckAcceptsDrop(completed)).toBe(false);
  });

  it("available empty truck accepts a drop", () => {
    expect(truckAcceptsDrop(makeBoardTruck({ status: "available" }))).toBe(true);
  });
});

describe("target identity", () => {
  it("truck target ids are namespaced and parse back to the fleet number", () => {
    const id = toTruckTargetId("111");
    expect(isTruckTargetId(id)).toBe(true);
    expect(parseTruckTargetId(id)).toBe("111");
  });

  it("non-truck ids are rejected by the namespace check", () => {
    expect(isTruckTargetId("route-drop:abc")).toBe(false);
    expect(parseTruckTargetId("anything")).toBeNull();
  });
});

describe("resolveDropFromOver", () => {
  it("G: dropping outside any target → NO_ACTION", () => {
    expect(resolveDropFromOver(null, null, DRAG.planningLoadId)).toEqual({
      kind: "no_action",
    });
  });

  it("G2: dropping on a non-truck target → NO_ACTION", () => {
    expect(resolveDropFromOver("route-drop:r1", null, DRAG.planningLoadId)).toEqual({
      kind: "no_action",
    });
  });

  it("no drag identity → NO_ACTION even over a truck", () => {
    const data: TruckDropTargetData = {
      targetType: "truck",
      truckFleetNoStr: "111",
      decision: { kind: "new_route" },
      eligibleRouteIds: [],
    };
    expect(resolveDropFromOver(toTruckTargetId("111"), data, null)).toEqual({
      kind: "no_action",
    });
  });

  it("resolves to the over target's decision for a real drag", () => {
    const data: TruckDropTargetData = {
      targetType: "truck",
      truckFleetNoStr: "111",
      decision: { kind: "choose_destination" },
      eligibleRouteIds: ["r1"],
    };
    expect(resolveDropFromOver(toTruckTargetId("111"), data, DRAG.planningLoadId)).toEqual({
      kind: "choose_destination",
    });
  });
});

describe("toAllocationAction", () => {
  it("F: load identity (planningLoadId) is preserved through the mapping", () => {
    const action = toAllocationAction(DRAG, "111", { kind: "new_route" });
    expect(action).not.toBeNull();
    expect(action!.planningLoadId).toBe("p_load_1");
  });

  it("F2: keeps the concrete planningLoad id string (String(planningLoad._id) flow)", () => {
    const dragId = String("planningLoads1234567890abcdef");
    const action = toAllocationAction(
      { sourceType: "unallocated-load", planningLoadId: dragId },
      "111",
      { kind: "new_route" }
    );
    expect(action!.planningLoadId).toBe(dragId);
  });

  it("H: existing route choice → allocate_to_existing_route with that routeId", () => {
    const action = toAllocationAction(DRAG, "111", { kind: "existing_route", routeId: "r9" });
    expect(action).toEqual({
      kind: "allocate_to_existing_route",
      planningLoadId: "p_load_1",
      routeId: "r9",
    });
  });

  it("I: new route choice → allocate_to_new_route with the truck fleet number", () => {
    const action = toAllocationAction(DRAG, "111", { kind: "new_route" });
    expect(action).toEqual({
      kind: "allocate_to_new_route",
      planningLoadId: "p_load_1",
      truckFleetNoStr: "111",
    });
  });

  it("null when the drag payload is not an unallocated load drag", () => {
    expect(
      toAllocationAction(
        { sourceType: "unallocated-load", planningLoadId: "" },
        "111",
        { kind: "new_route" }
      )
    ).toBeNull();
  });
});

/* ── Stage 6.3B: allocated load → another truck / route ───────────────────── */

describe("allocated vs unallocated payload classification", () => {
  it("A: discriminated union — the two drag sources are distinct kinds", () => {
    const unallocated: PlanningLoadDragData = DRAG;
    const allocated: PlanningLoadDragData = MOVED;
    expect(unallocated.sourceType).toBe("unallocated-load");
    expect(allocated.sourceType).toBe("allocated-load");
    expect(isUnallocatedDrag(unallocated)).toBe(true);
    expect(isUnallocatedDrag(allocated)).toBe(false);
    expect(isAllocatedDrag(allocated)).toBe(true);
    expect(isAllocatedDrag(unallocated)).toBe(false);
    expect(isAllocatedDrag(undefined)).toBe(false);
  });

  it("A2: allocated payload carries stable planning-load identity + source context", () => {
    expect(MOVED.planningLoadId).toBe("p_load_1");
    expect(MOVED.sourceRouteId).toBe("r1");
    expect(MOVED.sourceTruckFleetNoStr).toBe("111");
  });
});

describe("allocated load draggability", () => {
  it("B: Board load with valid loadId on an editable route is draggable", () => {
    expect(isAllocatedLoadDraggable("planned", "p_load_1")).toBe(true);
    expect(isAllocatedLoadDraggable(undefined, "p_load_1")).toBe(true);
  });

  it("C: legacy/manual load without loadId is NOT draggable", () => {
    expect(isAllocatedLoadDraggable("planned", undefined)).toBe(false);
    expect(isAllocatedLoadDraggable("planned", "")).toBe(false);
  });

  it("D: completed/locked source route is NOT draggable", () => {
    expect(isAllocatedLoadDraggable("completed", "p_load_1")).toBe(false);
    expect(isAllocatedLoadDraggable("locked", "p_load_1")).toBe(false);
  });
});

describe("allocated drop classification", () => {
  it("F: dropping onto the source truck when the source route is its only route → NO_ACTION (returned no-op)", () => {
    const over = truckTarget({
      decision: { kind: "choose_destination" },
      eligibleRouteIds: ["r1"],
    });
    expect(resolveAllocatedDropDecision(over, "r1")).toEqual({ kind: "no_action" });
  });

  it("G: same truck / different route → CHOOSE_DESTINATION (source excluded)", () => {
    const over = truckTarget({
      decision: { kind: "choose_destination" },
      eligibleRouteIds: ["r1", "r2"],
    });
    expect(resolveAllocatedDropDecision(over, "r1")).toEqual({
      kind: "choose_destination",
    });
  });

  it("H: different truck with an existing eligible route → CHOOSE_DESTINATION", () => {
    const over = truckTarget({
      decision: { kind: "choose_destination" },
      eligibleRouteIds: ["r9"],
    });
    expect(resolveAllocatedDropDecision(over, "r1")).toEqual({
      kind: "choose_destination",
    });
  });

  it("I: different truck with no routes → NEW_ROUTE", () => {
    const over = truckTarget({ decision: { kind: "new_route" }, eligibleRouteIds: [] });
    expect(resolveAllocatedDropDecision(over, "r1")).toEqual({ kind: "new_route" });
  });

  it("unavailable / completed truck stays NO_ACTION for allocated drags", () => {
    const over = truckTarget({ decision: { kind: "no_action" }, eligibleRouteIds: [] });
    expect(resolveAllocatedDropDecision(over, "r1")).toEqual({ kind: "no_action" });
  });

  it("non-truck / null target → NO_ACTION", () => {
    expect(resolveAllocatedDropDecision(null, "r1")).toEqual({ kind: "no_action" });
  });
});

describe("_move destination choices_", () => {
  it("G2: same truck offers only the sibling planned routes, never the source", () => {
    const bt = makeBoardTruck({
      status: "planned",
      routes: [
        makeRoute({ _id: "r_source", status: "planned", loads: [{ client: "SHAVECO" } as never] }),
        makeRoute({ _id: "r2", status: "planned", loads: [{ client: "MTO" } as never] }),
        makeRoute({ _id: "r_completed", status: "completed" }),
        makeRoute({ _id: "r_locked", status: "locked" }),
      ],
    });
    const choices = getMoveDestinationChoices(bt, "r_source");
    expect(choices.map((c) => c.routeId)).toEqual(["r2"]);
  });

  it("J: completed/locked destination routes are never offered", () => {
    const bt = makeBoardTruck({
      status: "planned",
      routes: [
        makeRoute({ _id: "r_source", status: "planned" }),
        makeRoute({ _id: "r_done", status: "completed" }),
        makeRoute({ _id: "r_lock", status: "locked" }),
      ],
    });
    expect(getMoveDestinationChoices(bt, "r_source").map((c) => c.routeId)).toEqual([]);
  });

  it("K: chooser options preserve authoritative route IDs (never display index)", () => {
    const bt = makeBoardTruck({
      status: "planned",
      routes: [
        makeRoute({ _id: "route_abc_123", status: "planned" }),
        makeRoute({ _id: "route_xyz_789", status: "planned" }),
      ],
    });
    const choices = getMoveDestinationChoices(bt, "route_abc_123");
    expect(choices.map((c) => c.routeId)).toEqual(["route_xyz_789"]);
  });
});

describe("same-route no-op & move mapping", () => {
  it("E: current source route identified by id reference equality", () => {
    expect(isSameRouteNoOp("r1", "r1")).toBe(true);
    expect(isSameRouteNoOp("r1", "r2")).toBe(false);
  });

  it("F2: same-route destination maps to a NULL action (no mutation)", () => {
    expect(toMoveAction(MOVED, "111", { kind: "existing_route", routeId: "r1" })).toBeNull();
  });

  it("H2: different route on the destination truck → move_between_routes", () => {
    const action = toMoveAction(MOVED, "112", { kind: "existing_route", routeId: "r9" });
    expect(action).toEqual({
      kind: "move_between_routes",
      planningLoadId: "p_load_1",
      destinationRouteId: "r9",
    });
  });

  it("I2: new-route destination → move_to_new_route with the truck fleet number", () => {
    const action = toMoveAction(MOVED, "112", { kind: "new_route" });
    expect(action).toEqual({
      kind: "move_to_new_route",
      planningLoadId: "p_load_1",
      truckFleetNoStr: "112",
    });
  });

  it("L: no array-index identity — concrete planning-load ids and route ids pass verbatim", () => {
    const drag: AllocatedLoadDragData = {
      ...MOVED,
      planningLoadId: "planningLoads_7b3f8e2a",
      sourceRouteId: "dailyRoutes_ab01",
    };
    const between = toMoveAction(drag, "113", {
      kind: "existing_route",
      routeId: "dailyRoutes_cd02",
    });
    expect(between?.kind).toBe("move_between_routes");
    if (between?.kind === "move_between_routes") {
      expect(between.planningLoadId).toBe("planningLoads_7b3f8e2a");
      expect(between.destinationRouteId).toBe("dailyRoutes_cd02");
    }
    const toNew = toMoveAction(drag, "113", { kind: "new_route" });
    expect(toNew?.kind).toBe("move_to_new_route");
    if (toNew?.kind === "move_to_new_route") {
      expect(toNew.truckFleetNoStr).toBe("113");
    }
  });

  it("null when the allocated payload is missing its planning-load id", () => {
    expect(
      toMoveAction({ ...MOVED, planningLoadId: "" }, "113", { kind: "new_route" })
    ).toBeNull();
  });
});

/* ── Stage 6.3C: route reorder within the same truck ─────────────────────── */

function routeDrag(overrides: Partial<RouteDragData> = {}): RouteDragData {
  return {
    sourceType: "route",
    routeId: "r2",
    sourceTruckFleetNoStr: "111",
    routeNumber: 2,
    loadCount: 3,
    driverName: "J. Smith",
    ...overrides,
  };
}

function routeTarget(
  overrides: Partial<RouteDropTargetData> = {}
): RouteDropTargetData {
  return {
    targetType: "route",
    routeId: "r3",
    truckFleetNoStr: "111",
    reorderEligible: true,
    orderedRouteIds: ["r1", "r2", "r3"],
    ...overrides,
  };
}

/* Current authoritative Board route list for a truck, in display order. */
function boardRoutes(ids: string[]): TruckRoute[] {
  return ids.map((id, i) =>
    makeRoute({
      _id: id,
      planningSource: "board",
      status: "planned",
      routeOrder: i + 1,
    })
  );
}

/* A RouteInsert as captured by handleDragOver for the truck "111". */
function insert(
  overrides: Partial<{
    sourceRouteId: string;
    targetRouteId: string;
    position: "before" | "after";
    truckFleetNoStr: string;
  }> = {}
) {
  return {
    sourceRouteId: "r2",
    targetRouteId: "r3",
    position: "before" as const,
    truckFleetNoStr: "111",
    ...overrides,
  };
}

describe("route payload classification (6.3C)", () => {
  it("A: route payload is its own discriminated kind; loads are not routes", () => {
    const rd = routeDrag();
    expect(isRouteDrag(rd)).toBe(true);
    if (isRouteDrag(rd)) {
      const narrowed: RouteDragData = rd;
      expect(narrowed.routeId).toBe("r2");
    }
    expect(isRouteDrag(DRAG)).toBe(false);
    expect(isRouteDrag(MOVED)).toBe(false);
    expect(isRouteDrag(undefined)).toBe(false);
  });

  it("R: route drop target is never a valid load destination", () => {
    const routeOver = routeTarget() as unknown as TruckDropTargetData;
    expect(resolveDropFromOver("route-drop:r3", routeOver, DRAG.planningLoadId)).toEqual({
      kind: "no_action",
    });
  });

  it("P: allocated-load classification unchanged by 6.3C", () => {
    expect(isAllocatedDrag(MOVED)).toBe(true);
    expect(isAllocatedDrag(routeDrag())).toBe(false);
  });

  it("Q: unallocated-load classification unchanged by 6.3C", () => {
    expect(isUnallocatedDrag(DRAG)).toBe(true);
    expect(isUnallocatedDrag(routeDrag())).toBe(false);
  });
});

describe("route reorder eligibility (6.3C)", () => {
  it("B: planned Board route is reorder-draggable (explicit + legacy status)", () => {
    expect(isRouteReorderDraggable(makeRoute({ planningSource: "board" }))).toBe(true);
    expect(
      isRouteReorderDraggable(makeRoute({ planningSource: "board", status: "planned" }))
    ).toBe(true);
  });

  it("C: manual route is NOT reorder-draggable", () => {
    expect(isRouteReorderDraggable(makeRoute({ planningSource: undefined }))).toBe(false);
  });

  it("D: completed route is NOT reorder-draggable", () => {
    expect(
      isRouteReorderDraggable(
        makeRoute({ planningSource: "board", status: "completed" })
      )
    ).toBe(false);
  });

  it("E: locked route is NOT reorder-draggable", () => {
    expect(
      isRouteReorderDraggable(makeRoute({ planningSource: "board", status: "locked" }))
    ).toBe(false);
  });
});

describe("route reorder target identity (6.3C)", () => {
  it("F: route drag/drop namespaces are separate and encode/decode the stable dailyRoutes._id", () => {
    expect(toRouteDropId("dailyRoutes_ab01")).toBe("route-drop:dailyRoutes_ab01");
    expect(isRouteDropId("route-drop:dailyRoutes_ab01")).toBe(true);
    expect(isRouteDropId("route-drag:dailyRoutes_ab01")).toBe(false);
    expect(isRouteDropId("truck:111")).toBe(false);
    expect(parseRouteDropId("route-drop:dailyRoutes_ab01")).toBe("dailyRoutes_ab01");
    expect(parseRouteDropId("truck:111")).toBeNull();

    expect(toRouteDragId("dailyRoutes_ab01")).toBe("route-drag:dailyRoutes_ab01");
    expect(isRouteDragId("route-drag:dailyRoutes_ab01")).toBe(true);
    expect(isRouteDragId("route-drop:dailyRoutes_ab01")).toBe(false);
    expect(isRouteDragId("anything")).toBe(false);
  });

  it("T: stable dailyRoutes._id is used, never an array index", () => {
    const routes = boardRoutes([
      "dailyRoutes_a",
      "dailyRoutes_b",
      "dailyRoutes_c",
    ]);
    const decision = resolveRouteInsertDrop(
      insert({
        sourceRouteId: "dailyRoutes_c",
        targetRouteId: "dailyRoutes_b",
        position: "before",
        truckFleetNoStr: "111",
      }),
      routeDrag({ routeId: "dailyRoutes_c" }),
      routes
    );
    expect(decision).toEqual({
      kind: "reorder",
      orderedRouteIds: ["dailyRoutes_a", "dailyRoutes_c", "dailyRoutes_b"],
    });
  });
});

describe("route reorder calculation (6.3C)", () => {
  it("I: [A,B,C] drag C before A → [C,A,B]", () => {
    expect(reorderRouteIds(["A", "B", "C"], "C", "A", "before")).toEqual([
      "C",
      "A",
      "B",
    ]);
  });

  it("J: [A,B,C] drag A after C → [B,C,A]", () => {
    expect(reorderRouteIds(["A", "B", "C"], "A", "C", "after")).toEqual([
      "B",
      "C",
      "A",
    ]);
  });

  it("K: [A,B,C] drag B before C when B is already before C → unchanged (null)", () => {
    expect(reorderRouteIds(["A", "B", "C"], "B", "C", "before")).toBeNull();
  });

  it("L: input array is never mutated", () => {
    const input = Object.freeze(["idC", "idA", "idB"]);
    expect(reorderRouteIds(input, "idC", "idB", "before")).toEqual([
      "idA", "idC", "idB",
    ]);
    expect(input).toEqual(["idC", "idA", "idB"]);
  });

  it("G: self-target → no-op at the calculation level", () => {
    expect(reorderRouteIds(["A", "B", "C"], "B", "B", "before")).toBeNull();
    expect(reorderRouteIds(["A", "B", "C"], "B", "B", "after")).toBeNull();
  });

  it("dragged id absent from the set → null", () => {
    expect(reorderRouteIds(["A", "B", "C"], "Z", "B", "before")).toBeNull();
  });

  it("target id absent from the set → null", () => {
    expect(reorderRouteIds(["A", "B", "C"], "A", "Z", "after")).toBeNull();
  });
});

describe("route drop position (6.3C)", () => {
  it("pointer in upper half of target → BEFORE", () => {
    expect(resolveRouteDropPosition(40, 0, 100)).toBe("before");
  });

  it("pointer in lower half of target → AFTER", () => {
    expect(resolveRouteDropPosition(80, 0, 100)).toBe("after");
  });

  it("pointer at exact midpoint → AFTER", () => {
    expect(resolveRouteDropPosition(50, 0, 100)).toBe("after");
  });
});

describe("route drop consumes the validated insert (6.3C)", () => {
  it("no insert → NO_ACTION (drop with no visible line is never submitted)", () => {
    expect(resolveRouteInsertDrop(null, routeDrag(), boardRoutes(["A", "B", "C"]))).toEqual({
      kind: "no_action",
    });
  });

  it("stale insert with wrong sourceRouteId → NO_ACTION", () => {
    expect(
      resolveRouteInsertDrop(
        insert({ sourceRouteId: "Z" }),
        routeDrag({ routeId: "r2" }),
        boardRoutes(["r1", "r2", "r3"])
      )
    ).toEqual({ kind: "no_action" });
  });

  it("cross-truck insert → NO_ACTION (no route-to-another-truck moves)", () => {
    expect(
      resolveRouteInsertDrop(
        insert({ truckFleetNoStr: "999" }),
        routeDrag(),
        boardRoutes(["r1", "r2", "r3"])
      )
    ).toEqual({ kind: "no_action" });
  });

  it("stale insert with a target that vanished from the truck → NO_ACTION", () => {
    expect(
      resolveRouteInsertDrop(
        insert({ targetRouteId: "GONE" }),
        routeDrag(),
        boardRoutes(["r1", "r2", "r3"])
      )
    ).toEqual({ kind: "no_action" });
  });

  it("stale insert whose target became ineligible (completed) → NO_ACTION", () => {
    // Target completed between drag-over and drag-end → drop resolves to no-op.
    const routes = [
      makeRoute({ _id: "A", planningSource: "board", status: "planned", routeOrder: 1 }),
      makeRoute({ _id: "B", planningSource: "board", status: "completed", routeOrder: 2 }),
      makeRoute({ _id: "C", planningSource: "board", status: "planned", routeOrder: 3 }),
    ];
    expect(
      resolveRouteInsertDrop(
        insert({ sourceRouteId: "C", targetRouteId: "B", position: "before", truckFleetNoStr: "111" }),
        routeDrag({ routeId: "C" }),
        routes
      )
    ).toEqual({ kind: "no_action" });
  });

  it("self insert (source === target) → NO_ACTION", () => {
    expect(
      resolveRouteInsertDrop(
        insert({ sourceRouteId: "r2", targetRouteId: "r2" }),
        routeDrag(),
        boardRoutes(["r1", "r2", "r3"])
      )
    ).toEqual({ kind: "no_action" });
  });

  it("[A,B,C] insert route C BEFORE A → reorder [C,A,B]", () => {
    const decision = resolveRouteInsertDrop(
      insert({ sourceRouteId: "C", targetRouteId: "A", position: "before", truckFleetNoStr: "111" }),
      routeDrag({ routeId: "C" }),
      boardRoutes(["A", "B", "C"])
    );
    expect(decision).toEqual({ kind: "reorder", orderedRouteIds: ["C", "A", "B"] });
  });

  it("[A,B,C] insert route C AFTER A → reorder [A,C,B]", () => {
    const decision = resolveRouteInsertDrop(
      insert({ sourceRouteId: "C", targetRouteId: "A", position: "after", truckFleetNoStr: "111" }),
      routeDrag({ routeId: "C" }),
      boardRoutes(["A", "B", "C"])
    );
    expect(decision).toEqual({ kind: "reorder", orderedRouteIds: ["A", "C", "B"] });
  });

  it("[A,B,C] insert route C AFTER B → same order → NO_ACTION", () => {
    const decision = resolveRouteInsertDrop(
      insert({ sourceRouteId: "C", targetRouteId: "B", position: "after", truckFleetNoStr: "111" }),
      routeDrag({ routeId: "C" }),
      boardRoutes(["A", "B", "C"])
    );
    expect(decision).toEqual({ kind: "no_action" });
  });

  it("[A,B,C] insert route A AFTER C → reorder [B,C,A]", () => {
    const decision = resolveRouteInsertDrop(
      insert({ sourceRouteId: "A", targetRouteId: "C", position: "after", truckFleetNoStr: "111" }),
      routeDrag({ routeId: "A" }),
      boardRoutes(["A", "B", "C"])
    );
    expect(decision).toEqual({ kind: "reorder", orderedRouteIds: ["B", "C", "A"] });
  });

  it("the visible insert is consumed verbatim — BEFORE vs AFTER of the same target produce DIFFERENT submitted operations", () => {
    const drag = routeDrag({ routeId: "C" });
    const routes = boardRoutes(["A", "B", "C"]);
    const before = insert({ sourceRouteId: "C", targetRouteId: "A", position: "before", truckFleetNoStr: "111" });
    const after = insert({ sourceRouteId: "C", targetRouteId: "A", position: "after", truckFleetNoStr: "111" });
    expect(resolveRouteInsertDrop(before, drag, routes)).toEqual({
      kind: "reorder",
      orderedRouteIds: ["C", "A", "B"],
    });
    expect(resolveRouteInsertDrop(after, drag, routes)).toEqual({
      kind: "reorder",
      orderedRouteIds: ["A", "C", "B"],
    });
  });

  it("G: the complete eligible Board set is recomputed from current routes and preserved verbatim (no loss / no extras)", () => {
    const routes = boardRoutes(["dailyRoutes_a", "dailyRoutes_b", "dailyRoutes_c"]);
    const decision = resolveRouteInsertDrop(
      insert({
        sourceRouteId: "dailyRoutes_c",
        targetRouteId: "dailyRoutes_a",
        position: "before",
        truckFleetNoStr: "111",
      }),
      routeDrag({ routeId: "dailyRoutes_c" }),
      routes
    );
    expect(decision.kind).toBe("reorder");
    if (decision.kind === "reorder") {
      expect(decision.orderedRouteIds).toHaveLength(3);
      expect([...decision.orderedRouteIds].sort()).toEqual([
        "dailyRoutes_a",
        "dailyRoutes_b",
        "dailyRoutes_c",
      ]);
    }
  });
});

describe("complete reorder set construction (6.3C)", () => {
  it("N: manual routes are excluded from the eligible Board set", () => {
    const ids = getReorderEligibleRouteIds([
      makeRoute({ _id: "A", planningSource: "board", status: "planned" }),
      makeRoute({ _id: "M", planningSource: undefined, status: "planned" }),
      makeRoute({ _id: "B", planningSource: "board", status: "planned" }),
    ]);
    expect(ids).toEqual(["A", "B"]);
  });

  it("O: completed/locked routes are excluded per existing eligibility", () => {
    const ids = getReorderEligibleRouteIds([
      makeRoute({ _id: "A", planningSource: "board", status: "planned" }),
      makeRoute({ _id: "C", planningSource: "board", status: "completed" }),
      makeRoute({ _id: "L", planningSource: "board", status: "locked" }),
      makeRoute({ _id: "U", planningSource: "board" }),
    ]);
    expect(ids).toEqual(["A", "U"]);
  });

  it("ordered by routeOrder then createdAt (authoritative order, not array index)", () => {
    const ids = getReorderEligibleRouteIds([
      makeRoute({ _id: "third", planningSource: "board", status: "planned", routeOrder: 3, createdAt: 3 }),
      makeRoute({ _id: "first", planningSource: "board", status: "planned", routeOrder: 1, createdAt: 1 }),
      makeRoute({ _id: "second", planningSource: "board", status: "planned", routeOrder: 2, createdAt: 2 }),
    ]);
    expect(ids).toEqual(["first", "second", "third"]);
  });
});