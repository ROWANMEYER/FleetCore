import { describe, it, expect } from "vitest";
import {
  buildBoardTrucks,
  getTruckStatus,
  isBoardManaged,
  getCompleteRouteIds,
  getPhysicalTrailerFleetNo,
  getAssignmentState,
  getTruckReadinessSummary,
  isReady,
  type TruckInfo,
  type TrailerInfo,
  type TruckRoute,
  type DailyAvailability,
} from "./boardHelpers";

function makeTruck(overrides: Partial<TruckInfo> = {}): TruckInfo {
  return {
    _id: "t1",
    truckFleetNo: "T001",
    registration: "ABC 123",
    status: "active",
    ...overrides,
  };
}

function makeRoute(overrides: Partial<TruckRoute> = {}): TruckRoute {
  return {
    _id: "r1",
    client: "Test Client",
    routeDate: "2026-09-22",
    truckFleetNoStr: "T001",
    loads: [],
    kilometers: 0,
    notes: "",
    createdAt: Date.now(),
    ...overrides,
  };
}

function makeAvailability(overrides: Partial<DailyAvailability> = {}): DailyAvailability {
  return {
    _id: "a1",
    date: "2026-09-22",
    dayKey: "2026-09-22",
    status: "available",
    trucks: [],
    drivers: [],
    trailers: [],
    ...overrides,
  };
}

function makeTrailer(overrides: Partial<TrailerInfo> = {}): TrailerInfo {
  return {
    _id: "tr1",
    trailerFleetNoStr: "TR01",
    type: "flatbed",
    status: "active",
    ...overrides,
  };
}

describe("isBoardManaged", () => {
  it("returns true for board source", () => {
    expect(isBoardManaged(makeRoute({ planningSource: "board" }))).toBe(true);
  });

  it("returns false for undefined source", () => {
    expect(isBoardManaged(makeRoute())).toBe(false);
  });

  it("returns false for non-board source", () => {
    expect(isBoardManaged(makeRoute({ planningSource: "quickcapture" as any }))).toBe(false);
  });
});

describe("getTruckStatus", () => {
  describe("with no availability record", () => {
    it("returns 'available' when no routes", () => {
      expect(getTruckStatus(makeTruck(), [])).toBe("available");
    });

    it("returns 'planned' when has non-completed routes", () => {
      expect(getTruckStatus(makeTruck(), [makeRoute({ status: "planned" })])).toBe("planned");
    });

    it("returns 'completed' when all routes are completed", () => {
      const routes = [
        makeRoute({ status: "completed" }),
        makeRoute({ _id: "r2", status: "completed" }),
      ];
      expect(getTruckStatus(makeTruck(), routes)).toBe("completed");
    });

    it("returns 'completed' when all routes are locked", () => {
      const routes = [
        makeRoute({ status: "locked" }),
        makeRoute({ _id: "r2", status: "locked" }),
      ];
      expect(getTruckStatus(makeTruck(), routes)).toBe("completed");
    });

    it("returns 'completed' when mix of completed and locked", () => {
      const routes = [
        makeRoute({ status: "completed" }),
        makeRoute({ _id: "r2", status: "locked" }),
      ];
      expect(getTruckStatus(makeTruck(), routes)).toBe("completed");
    });

    it("returns 'planned' when mix of completed and planned", () => {
      const routes = [
        makeRoute({ status: "completed" }),
        makeRoute({ _id: "r2", status: "planned" }),
      ];
      expect(getTruckStatus(makeTruck(), routes)).toBe("planned");
    });
  });

  describe("with availability record", () => {
    it("returns 'unavailable' when status is unavailable AND truck is in list", () => {
      const availability = makeAvailability({
        status: "unavailable",
        trucks: ["T001"],
      });
      expect(getTruckStatus(makeTruck(), [], availability)).toBe("unavailable");
    });

    it("returns 'unavailable' when status is maintenance AND truck is in list", () => {
      const availability = makeAvailability({
        status: "maintenance",
        trucks: ["T001"],
      });
      expect(getTruckStatus(makeTruck(), [], availability)).toBe("unavailable");
    });

    it("returns 'available' when status is unavailable but truck is NOT in list", () => {
      const availability = makeAvailability({
        status: "unavailable",
        trucks: ["T999"],
      });
      expect(getTruckStatus(makeTruck(), [], availability)).toBe("available");
    });

    it("returns 'available' when status is available even if truck is in list", () => {
      const availability = makeAvailability({
        status: "available",
        trucks: ["T001"],
      });
      expect(getTruckStatus(makeTruck(), [], availability)).toBe("available");
    });

    it("returns 'available' when status is maintenance but truck is NOT in list", () => {
      const availability = makeAvailability({
        status: "maintenance",
        trucks: ["T999"],
      });
      expect(getTruckStatus(makeTruck(), [], availability)).toBe("available");
    });

    it("returns 'planned' when availability says available but truck has routes", () => {
      const availability = makeAvailability({ status: "available", trucks: ["T001"] });
      expect(getTruckStatus(makeTruck(), [makeRoute()], availability)).toBe("planned");
    });

    it("availability unavailable overrides planned routes", () => {
      const availability = makeAvailability({
        status: "unavailable",
        trucks: ["T001"],
      });
      expect(
        getTruckStatus(makeTruck(), [makeRoute({ status: "planned" })], availability)
      ).toBe("unavailable");
    });
  });
});

describe("getCompleteRouteIds", () => {
  it("returns empty for no routes", () => {
    expect(getCompleteRouteIds([])).toEqual([]);
  });

  it("filters to board-managed planned only", () => {
    const routes = [
      makeRoute({ _id: "r1", planningSource: "board", status: "planned" }),
      makeRoute({ _id: "r2", status: "planned" }),
      makeRoute({ _id: "r3", planningSource: "board", status: "completed" }),
    ];
    expect(getCompleteRouteIds(routes)).toEqual(["r1"]);
  });

  it("sorts by routeOrder then createdAt", () => {
    const now = Date.now();
    const routes = [
      makeRoute({ _id: "r1", planningSource: "board", status: "planned", routeOrder: 2, createdAt: now }),
      makeRoute({ _id: "r2", planningSource: "board", status: "planned", routeOrder: 1, createdAt: now + 1000 }),
      makeRoute({ _id: "r3", planningSource: "board", status: "planned", routeOrder: undefined, createdAt: now - 1000 }),
    ];
    const ids = getCompleteRouteIds(routes);
    expect(ids).toEqual(["r2", "r1", "r3"]);
  });

  describe("mixed manual + Board routes", () => {
    it("extracts only Board route IDs when manual routes are interspersed", () => {
      const now = Date.now();
      const routes = [
        makeRoute({ _id: "manual1", status: "planned", createdAt: now }),
        makeRoute({ _id: "board1", planningSource: "board", status: "planned", createdAt: now + 100 }),
        makeRoute({ _id: "manual2", status: "planned", createdAt: now + 200 }),
        makeRoute({ _id: "board2", planningSource: "board", status: "planned", routeOrder: 1, createdAt: now + 300 }),
      ];
      const ids = getCompleteRouteIds(routes);
      expect(ids).toEqual(["board2", "board1"]);
    });

    it("returns empty when all routes are manual", () => {
      const routes = [
        makeRoute({ _id: "manual1", status: "planned" }),
        makeRoute({ _id: "manual2", status: "planned" }),
      ];
      expect(getCompleteRouteIds(routes)).toEqual([]);
    });
  });
});

describe("buildBoardTrucks", () => {
  it("groups routes by truck fleet number", () => {
    const trucks = [makeTruck()];
    const routes = [
      makeRoute({ truckFleetNoStr: "T001", planningSource: "board" }),
      makeRoute({ _id: "r2", truckFleetNoStr: "T001", planningSource: "board" }),
    ];
    const result = buildBoardTrucks(trucks, routes);
    expect(result).toHaveLength(1);
    expect(result[0].routes).toHaveLength(2);
  });

  it("includes trucks with no routes as available", () => {
    const trucks = [makeTruck()];
    const result = buildBoardTrucks(trucks, []);
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe("available");
    expect(result[0].routes).toHaveLength(0);
  });

  it("filters out trucks with no fleet number", () => {
    const trucks = [makeTruck({ truckFleetNo: undefined })];
    const result = buildBoardTrucks(trucks, []);
    expect(result).toHaveLength(0);
  });

  it("sorts trucks by fleet number numerically", () => {
    const trucks = [
      makeTruck({ _id: "t1", truckFleetNo: "T10" }),
      makeTruck({ _id: "t2", truckFleetNo: "T2" }),
      makeTruck({ _id: "t3", truckFleetNo: "T1" }),
    ];
    const result = buildBoardTrucks(trucks, []);
    expect(result.map((r) => r.truck.truckFleetNo)).toEqual(["T1", "T2", "T10"]);
  });

  describe("mixed manual + Board route ordering", () => {
    it("preserves authoritative route order (routeOrder then createdAt) across mixed types", () => {
      const now = Date.now();
      const trucks = [makeTruck()];
      const routes = [
        makeRoute({
          _id: "manual1",
          status: "planned",
          createdAt: now - 3000,
        }),
        makeRoute({
          _id: "board1",
          planningSource: "board",
          status: "planned",
          routeOrder: 2,
          createdAt: now,
        }),
        makeRoute({
          _id: "board2",
          planningSource: "board",
          status: "planned",
          routeOrder: 1,
          createdAt: now + 1000,
        }),
        makeRoute({
          _id: "manual2",
          status: "planned",
          routeOrder: 3,
          createdAt: now - 1000,
        }),
      ];
      const result = buildBoardTrucks(trucks, routes);
      expect(result).toHaveLength(1);
      // Manual routes get routeOrder ?? 9999, Board routes get explicit routeOrder
      // Expected sort: board2(order:1), board1(order:2), manual2(order:3), manual1(9999)
      expect(result[0].routes.map((r) => r._id)).toEqual([
        "board2",
        "board1",
        "manual2",
        "manual1",
      ]);
    });

    it("manual route with explicit routeOrder sorts alongside Board routes", () => {
      const now = Date.now();
      const trucks = [makeTruck()];
      const routes = [
        makeRoute({
          _id: "board1",
          planningSource: "board",
          status: "planned",
          routeOrder: 1,
          createdAt: now,
        }),
        makeRoute({
          _id: "manual1",
          status: "planned",
          routeOrder: 2,
          createdAt: now + 1000,
        }),
      ];
      const result = buildBoardTrucks(trucks, routes);
      expect(result[0].routes.map((r) => r._id)).toEqual(["board1", "manual1"]);
    });

    it("Board route without routeOrder falls back to createdAt after manual with order", () => {
      const now = Date.now();
      const trucks = [makeTruck()];
      const routes = [
        makeRoute({
          _id: "manual1",
          status: "planned",
          routeOrder: 1,
          createdAt: now,
        }),
        makeRoute({
          _id: "board1",
          planningSource: "board",
          status: "planned",
          routeOrder: undefined,
          createdAt: now - 5000,
        }),
      ];
      const result = buildBoardTrucks(trucks, routes);
      // manual1 has routeOrder=1, board1 has routeOrder=9999 (fallback)
      expect(result[0].routes.map((r) => r._id)).toEqual(["manual1", "board1"]);
    });
  });

  describe("driver and trailer from routes", () => {
    it("uses first route's driverName and trailerFleetNoStr", () => {
      const trucks = [makeTruck()];
      const routes = [
        makeRoute({
          driverName: "John",
          trailerFleetNoStr: "TR01",
        }),
      ];
      const result = buildBoardTrucks(trucks, routes);
      expect(result[0].driverName).toBe("John");
      expect(result[0].trailerFleetNo).toBe("TR01");
    });

    it("returns undefined when no routes have driver/trailer", () => {
      const trucks = [makeTruck()];
      const routes = [makeRoute()];
      const result = buildBoardTrucks(trucks, routes);
      expect(result[0].driverName).toBeUndefined();
      expect(result[0].trailerFleetNo).toBeUndefined();
    });
  });

  describe("physical trailer resolution", () => {
    it("resolves physicalTrailerFleetNo from truck's currentTrailerId", () => {
      const trucks = [makeTruck({ currentTrailerId: "tr1" })];
      const trailers = [makeTrailer({ _id: "tr1", trailerFleetNoStr: "TR01" })];
      const result = buildBoardTrucks(trucks, [], undefined, trailers);
      expect(result[0].physicalTrailerFleetNo).toBe("TR01");
    });

    it("returns undefined physicalTrailerFleetNo when truck has no currentTrailerId", () => {
      const trucks = [makeTruck({ currentTrailerId: undefined })];
      const result = buildBoardTrucks(trucks, [], undefined, []);
      expect(result[0].physicalTrailerFleetNo).toBeUndefined();
    });
  });

  describe("readiness summary", () => {
    it("computes readiness from routes and truck data", () => {
      const trucks = [makeTruck({ currentTrailerId: "tr1" })];
      const trailers = [makeTrailer({ _id: "tr1", trailerFleetNoStr: "TR01" })];
      const routes = [
        makeRoute({ driverName: "John", trailerFleetNoStr: "TR01" }),
        makeRoute({ _id: "r2", driverName: undefined, trailerFleetNoStr: "TR01" }),
      ];
      const result = buildBoardTrucks(trucks, routes, undefined, trailers);
      expect(result[0].readiness).toEqual({ totalRoutes: 2, readyRoutes: 1 });
    });

    it("returns zero readiness when no routes", () => {
      const trucks = [makeTruck()];
      const result = buildBoardTrucks(trucks, []);
      expect(result[0].readiness).toEqual({ totalRoutes: 0, readyRoutes: 0 });
    });
  });
});

describe("getPhysicalTrailerFleetNo", () => {
  it("returns trailer fleet number when currentTrailerId matches", () => {
    const truck = makeTruck({ currentTrailerId: "tr1" });
    const trailers = [makeTrailer({ _id: "tr1", trailerFleetNoStr: "TR01" })];
    expect(getPhysicalTrailerFleetNo(truck, trailers)).toBe("TR01");
  });

  it("returns undefined when truck has no currentTrailerId", () => {
    const truck = makeTruck({ currentTrailerId: undefined });
    const trailers = [makeTrailer()];
    expect(getPhysicalTrailerFleetNo(truck, trailers)).toBeUndefined();
  });

  it("returns undefined when currentTrailerId does not match any trailer", () => {
    const truck = makeTruck({ currentTrailerId: "tr_nonexistent" });
    const trailers = [makeTrailer({ _id: "tr1" })];
    expect(getPhysicalTrailerFleetNo(truck, trailers)).toBeUndefined();
  });

  it("returns undefined when trailers array is empty", () => {
    const truck = makeTruck({ currentTrailerId: "tr1" });
    expect(getPhysicalTrailerFleetNo(truck, [])).toBeUndefined();
  });
});

describe("getAssignmentState", () => {
  const truck = makeTruck({ currentTrailerId: "tr1" });
  const trailers = [makeTrailer({ _id: "tr1", trailerFleetNoStr: "TR01" })];

  it("A: driver + planned TR01 + physical TR01 => ready_match", () => {
    const route = makeRoute({ driverName: "John", trailerFleetNoStr: "TR01" });
    expect(getAssignmentState(route, truck, trailers)).toBe("ready_match");
  });

  it("B: driver + planned TR51 + physical TR01 => ready_mismatch", () => {
    const route = makeRoute({ driverName: "John", trailerFleetNoStr: "TR51" });
    expect(getAssignmentState(route, truck, trailers)).toBe("ready_mismatch");
  });

  it("C: driver + NO planned trailer + physical TR01 => missing_planned_trailer", () => {
    const route = makeRoute({ driverName: "John", trailerFleetNoStr: undefined });
    expect(getAssignmentState(route, truck, trailers)).toBe("missing_planned_trailer");
  });

  it("D: driver + planned TR01 + NO physical trailer => ready_physical_unpaired", () => {
    const truckNoPhysical = makeTruck({ currentTrailerId: undefined });
    const route = makeRoute({ driverName: "John", trailerFleetNoStr: "TR01" });
    expect(getAssignmentState(route, truckNoPhysical, [])).toBe("ready_physical_unpaired");
  });

  it("E: NO driver + planned TR01 => missing_driver", () => {
    const route = makeRoute({ driverName: undefined, trailerFleetNoStr: "TR01" });
    expect(getAssignmentState(route, truck, trailers)).toBe("missing_driver");
  });

  it("F: NO driver + NO planned trailer => missing_driver_and_planned_trailer", () => {
    const route = makeRoute({ driverName: undefined, trailerFleetNoStr: undefined });
    expect(getAssignmentState(route, truck, trailers)).toBe("missing_driver_and_planned_trailer");
  });

  it("treats empty string driverName as no driver", () => {
    const route = makeRoute({ driverName: "  ", trailerFleetNoStr: "TR01" });
    expect(getAssignmentState(route, truck, trailers)).toBe("missing_driver");
  });

  it("treats empty string trailerFleetNoStr as no planned trailer", () => {
    const truckNoPhysical = makeTruck({ currentTrailerId: undefined });
    const route = makeRoute({ driverName: "John", trailerFleetNoStr: "  " });
    expect(getAssignmentState(route, truckNoPhysical, [])).toBe("missing_planned_trailer");
  });

  it("planned TR01 + physical TR51 => ready_mismatch (planned differs from physical)", () => {
    const otherTrailer = makeTrailer({ _id: "tr2", trailerFleetNoStr: "TR51" });
    const route = makeRoute({ driverName: "John", trailerFleetNoStr: "TR01" });
    const truckWithOther = makeTruck({ currentTrailerId: "tr2" });
    expect(getAssignmentState(route, truckWithOther, [otherTrailer])).toBe("ready_mismatch");
  });

  it("no physical trailer + no planned trailer + driver => missing_planned_trailer", () => {
    const truckNoPhysical = makeTruck({ currentTrailerId: undefined });
    const route = makeRoute({ driverName: "John", trailerFleetNoStr: undefined });
    expect(getAssignmentState(route, truckNoPhysical, [])).toBe("missing_planned_trailer");
  });
});

describe("isReady", () => {
  it("returns true for ready_match", () => expect(isReady("ready_match")).toBe(true));
  it("returns true for ready_mismatch", () => expect(isReady("ready_mismatch")).toBe(true));
  it("returns true for ready_physical_unpaired", () => expect(isReady("ready_physical_unpaired")).toBe(true));
  it("returns false for missing_driver", () => expect(isReady("missing_driver")).toBe(false));
  it("returns false for missing_planned_trailer", () => expect(isReady("missing_planned_trailer")).toBe(false));
  it("returns false for missing_driver_and_planned_trailer", () => expect(isReady("missing_driver_and_planned_trailer")).toBe(false));
});

describe("getTruckReadinessSummary", () => {
  const truck = makeTruck({ currentTrailerId: "tr1" });
  const trailers = [makeTrailer({ _id: "tr1", trailerFleetNoStr: "TR01" })];

  it("returns 0 total when no routes", () => {
    const result = getTruckReadinessSummary([], truck, trailers);
    expect(result).toEqual({ totalRoutes: 0, readyRoutes: 0 });
  });

  it("A: driver + planned TR01 + physical TR01 => ready", () => {
    const routes = [makeRoute({ driverName: "John", trailerFleetNoStr: "TR01" })];
    const result = getTruckReadinessSummary(routes, truck, trailers);
    expect(result).toEqual({ totalRoutes: 1, readyRoutes: 1 });
  });

  it("C: driver + NO planned trailer + physical TR01 => not ready", () => {
    const routes = [makeRoute({ driverName: "John", trailerFleetNoStr: undefined })];
    const result = getTruckReadinessSummary(routes, truck, trailers);
    expect(result).toEqual({ totalRoutes: 1, readyRoutes: 0 });
  });

  it("D: driver + planned TR01 + NO physical => ready (unpaired)", () => {
    const truckNoPhysical = makeTruck({ currentTrailerId: undefined });
    const routes = [makeRoute({ driverName: "John", trailerFleetNoStr: "TR01" })];
    const result = getTruckReadinessSummary(routes, truckNoPhysical, []);
    expect(result).toEqual({ totalRoutes: 1, readyRoutes: 1 });
  });

  it("G: mixed - one complete, one missing planned => 1/2 ready", () => {
    const routes = [
      makeRoute({ _id: "r1", driverName: "John", trailerFleetNoStr: "TR01", status: "completed" }),
      makeRoute({ _id: "r2", driverName: "Jane", trailerFleetNoStr: undefined }),
    ];
    const result = getTruckReadinessSummary(routes, truck, trailers);
    expect(result).toEqual({ totalRoutes: 1, readyRoutes: 0 });
  });

  it("H: multiple routes with different drivers/trailers => both ready (one match, one mismatch)", () => {
    const routes = [
      makeRoute({ _id: "r1", driverName: "John", trailerFleetNoStr: "TR01" }),
      makeRoute({ _id: "r2", driverName: "Jane", trailerFleetNoStr: "TR51" }),
    ];
    const result = getTruckReadinessSummary(routes, truck, trailers);
    expect(result).toEqual({ totalRoutes: 2, readyRoutes: 2 });
  });

  it("all ready when every route has driver and matching trailer", () => {
    const routes = [
      makeRoute({ _id: "r1", driverName: "John", trailerFleetNoStr: "TR01" }),
      makeRoute({ _id: "r2", driverName: "Jane", trailerFleetNoStr: "TR01" }),
    ];
    const result = getTruckReadinessSummary(routes, truck, trailers);
    expect(result).toEqual({ totalRoutes: 2, readyRoutes: 2 });
  });

  it("none ready when no routes have driver", () => {
    const truckNoTrailer = makeTruck({ currentTrailerId: undefined });
    const routes = [
      makeRoute({ _id: "r1", driverName: undefined }),
      makeRoute({ _id: "r2", driverName: undefined }),
    ];
    const result = getTruckReadinessSummary(routes, truckNoTrailer, []);
    expect(result).toEqual({ totalRoutes: 2, readyRoutes: 0 });
  });

  it("J: completed route => not counted in editable total", () => {
    const routes = [
      makeRoute({ _id: "r1", driverName: "John", trailerFleetNoStr: "TR01", status: "completed" }),
    ];
    const result = getTruckReadinessSummary(routes, truck, trailers);
    expect(result).toEqual({ totalRoutes: 0, readyRoutes: 0 });
  });

  it("K: locked route => not counted in editable total", () => {
    const routes = [
      makeRoute({ _id: "r1", driverName: "John", trailerFleetNoStr: "TR01", status: "locked" }),
    ];
    const result = getTruckReadinessSummary(routes, truck, trailers);
    expect(result).toEqual({ totalRoutes: 0, readyRoutes: 0 });
  });
});
