import { describe, it, expect } from "vitest";
import {
  type UnallocatedLoadDragData,
  type TruckDropTargetData,
  resolveUnallocatedDropDecision,
  truckAcceptsDrop,
  getEligibleRouteChoices,
  resolveDropFromOver,
  toAllocationAction,
  toTruckTargetId,
  isTruckTargetId,
  parseTruckTargetId,
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
    expect(isTruckTargetId("route:abc")).toBe(false);
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
    expect(resolveDropFromOver("route:r1", null, DRAG.planningLoadId)).toEqual({
      kind: "no_action",
    });
  });

  it("no drag identity → NO_ACTION even over a truck", () => {
    const data: TruckDropTargetData = {
      targetType: "truck",
      truckFleetNoStr: "111",
      decision: { kind: "new_route" },
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