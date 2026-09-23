import { describe, it, expect } from "vitest";
import {
  computeBoardKpis,
  filterBoardTrucks,
  type BoardKpis,
} from "./boardStats";
import {
  type BoardTruck,
  type TruckInfo,
  type TruckRoute,
  type AssignmentState,
} from "./boardHelpers";

type Load = {
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
};

function makeLoad(overrides: Partial<Load> = {}): Load {
  return {
    client: "SHAVECO",
    fromLocations: ["George"],
    toLocations: ["Cape Town"],
    quantity: "1",
    quantityType: "trip",
    rate: "100",
    rateType: "flat",
    ...overrides,
  };
}

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
  overrides: Partial<TruckRoute> & { assignmentState?: AssignmentState } = {}
): TruckRoute {
  return {
    _id: "r1",
    client: "SHAVECO",
    routeDate: "2026-09-22",
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

const ZERO: BoardKpis = {
  totalLoads: 0,
  plannedTrucks: 0,
  readyRoutes: 0,
  availableTrucks: 0,
  unallocated: 0,
};

describe("computeBoardKpis", () => {
  it("returns all zeros for an empty board (no unallocated)", () => {
    expect(computeBoardKpis([], 0)).toEqual(ZERO);
  });

  it("passes the unallocated count through", () => {
    expect(computeBoardKpis([], 7).unallocated).toBe(7);
    expect(computeBoardKpis([], 7).totalLoads).toBe(7);
  });

  it("totalLoads counts allocated planning loads (with loadId) + unallocated", () => {
    const bt = makeBoardTruck({
      status: "planned",
      routes: [
        makeRoute({
          loads: [
            makeLoad({ loadId: "p1" }),
            makeLoad({ loadId: "p2" }),
            makeLoad({ loadId: "p3" }),
          ],
        }),
      ],
    });
    expect(computeBoardKpis([bt], 4).totalLoads).toBe(7);
    expect(computeBoardKpis([bt], 4).unallocated).toBe(4);
  });

  it("totalLoads does NOT count legacy loads without a planningLoad identity", () => {
    const bt = makeBoardTruck({
      status: "planned",
      routes: [makeRoute({ loads: [makeLoad({ loadId: "p1" }), makeLoad()] })],
    });
    const result = computeBoardKpis([bt], 0);
    expect(result.totalLoads).toBe(1);
  });

  it("counts allocated planning loads across multiple routes and trucks", () => {
    const bt1 = makeBoardTruck({
      truck: makeTruck({ _id: "t1", truckFleetNo: "111" }),
      status: "planned",
      routes: [makeRoute({ loads: [makeLoad({ loadId: "p1" })] })],
    });
    const bt2 = makeBoardTruck({
      truck: makeTruck({ _id: "t2", truckFleetNo: "112" }),
      status: "planned",
      routes: [
        makeRoute({ _id: "r1", loads: [makeLoad({ loadId: "p2" })] }),
        makeRoute({ _id: "r2", loads: [makeLoad({ loadId: "p3" })] }),
      ],
    });
    expect(computeBoardKpis([bt1, bt2], 0).totalLoads).toBe(3);
  });

  it("plannedTrucks counts trucks with Board status planned only", () => {
    const trucks = [
      makeBoardTruck({ status: "planned" }),
      makeBoardTruck({ status: "planned" }),
      makeBoardTruck({ status: "available" }),
      makeBoardTruck({ status: "unavailable" }),
      makeBoardTruck({ status: "completed" }),
    ];
    expect(computeBoardKpis(trucks, 0).plannedTrucks).toBe(2);
  });

  it("availableTrucks counts trucks with Board status available only", () => {
    const trucks = [
      makeBoardTruck({ status: "available" }),
      makeBoardTruck({ status: "available" }),
      makeBoardTruck({ status: "planned" }),
      makeBoardTruck({ status: "unavailable" }),
    ];
    expect(computeBoardKpis(trucks, 0).availableTrucks).toBe(2);
  });

  it("readyRoutes counts ready_match / ready_mismatch / ready_physical_unpaired", () => {
    const bt = makeBoardTruck({
      status: "planned",
      routes: [
        makeRoute({ _id: "r1", assignmentState: "ready_match" }),
        makeRoute({ _id: "r2", assignmentState: "ready_mismatch" }),
        makeRoute({ _id: "r3", assignmentState: "ready_physical_unpaired" }),
        makeRoute({ _id: "r4", assignmentState: "missing_driver" }),
        makeRoute({ _id: "r5", assignmentState: "missing_planned_trailer" }),
        makeRoute({ _id: "r6", assignmentState: "missing_driver_and_planned_trailer" }),
      ],
    });
    expect(computeBoardKpis([bt], 0).readyRoutes).toBe(3);
  });

  it("readyRoutes excludes completed and locked routes even when state is ready", () => {
    const bt = makeBoardTruck({
      status: "completed",
      routes: [
        makeRoute({ _id: "r1", assignmentState: "ready_match", status: "completed" }),
        makeRoute({ _id: "r2", assignmentState: "ready_match", status: "locked" }),
      ],
    });
    expect(computeBoardKpis([bt], 0).readyRoutes).toBe(0);
  });

  it("readyRoutes counts only planned (editable) routes", () => {
    const bt = makeBoardTruck({
      status: "planned",
      routes: [
        makeRoute({ _id: "r1", assignmentState: "ready_match", status: "planned" }),
        makeRoute({ _id: "r2", assignmentState: "ready_match" }),
      ],
    });
    expect(computeBoardKpis([bt], 0).readyRoutes).toBe(2);
  });
});

describe("filterBoardTrucks", () => {
  const fleet = [
    makeBoardTruck({
      truck: makeTruck({ _id: "t1", truckFleetNo: "111", registration: "CAW 32208" }),
      driverName: "A.GQOMFA",
      readiness: { totalRoutes: 2, readyRoutes: 2 },
      status: "planned",
    }),
    makeBoardTruck({
      truck: makeTruck({ _id: "t2", truckFleetNo: "112", registration: "CAW 22999" }),
      driverName: "B.MEYER",
      readiness: { totalRoutes: 2, readyRoutes: 1 },
      status: "planned",
    }),
    makeBoardTruck({
      truck: makeTruck({ _id: "t3", truckFleetNo: "120", registration: "DHP 1542" }),
      readiness: { totalRoutes: 0, readyRoutes: 0 },
      status: "available",
    }),
    makeBoardTruck({
      truck: makeTruck({ _id: "t4", truckFleetNo: "121", registration: "DHP 7777" }),
      readiness: { totalRoutes: 0, readyRoutes: 0 },
      status: "unavailable",
    }),
  ];

  it("'all' returns every truck unchanged", () => {
    expect(filterBoardTrucks(fleet, "", "all")).toEqual(fleet);
  });

  it("searches by fleet number (case-insensitive, substring)", () => {
    const result = filterBoardTrucks(fleet, "11", "all");
    expect(result.map((t) => t.truck.truckFleetNo)).toEqual(["111", "112"]);
  });

  it("searches by registration", () => {
    const result = filterBoardTrucks(fleet, "dhp 1542", "all");
    expect(result.map((t) => t.truck.truckFleetNo)).toEqual(["120"]);
  });

  it("searches by driver name", () => {
    const result = filterBoardTrucks(fleet, "gqomfa", "all");
    expect(result.map((t) => t.truck.truckFleetNo)).toEqual(["111"]);
  });

  it("searches drivers from any route on the truck", () => {
    const withRouteDriver = makeBoardTruck({
      truck: makeTruck({ _id: "t9" }),
      status: "planned",
      routes: [makeRoute({ driverName: "C.VAN WYK" })],
    });
    const result = filterBoardTrucks([...fleet, withRouteDriver], "van wyk", "all");
    expect(result.map((t) => t.truck._id)).toEqual(["t9"]);
  });

  it("filters by planned status", () => {
    const result = filterBoardTrucks(fleet, "", "planned");
    expect(result.map((t) => t.truck._id)).toEqual(["t1", "t2"]);
  });

  it("filters by available status", () => {
    const result = filterBoardTrucks(fleet, "", "available");
    expect(result.map((t) => t.truck._id)).toEqual(["t3"]);
  });

  it("filters by unavailable status", () => {
    const result = filterBoardTrucks(fleet, "", "unavailable");
    expect(result.map((t) => t.truck._id)).toEqual(["t4"]);
  });

  it("'ready' keeps only trucks whose planned routes are all ready", () => {
    const result = filterBoardTrucks(fleet, "", "ready");
    expect(result.map((t) => t.truck._id)).toEqual(["t1"]);
  });

  it("'ready' excludes 0-route (available) trucks", () => {
    const result = filterBoardTrucks(fleet, "", "ready");
    expect(result.some((t) => t.truck._id === "t3")).toBe(false);
  });

  it("'ready' treats trucks with no routes as not ready", () => {
    const allAvailable = [makeBoardTruck(), makeBoardTruck({ truck: makeTruck({ _id: "t2" }) })];
    expect(filterBoardTrucks(allAvailable, "", "ready")).toEqual([]);
  });

  it("combines search and status filter", () => {
    const result = filterBoardTrucks(fleet, "caw", "planned");
    expect(result.map((t) => t.truck._id)).toEqual(["t1", "t2"]);
    const narrow = filterBoardTrucks(fleet, "caw", "available");
    expect(narrow).toEqual([]);
  });

  it("empty search with 'all' returns all trucks", () => {
    expect(filterBoardTrucks(fleet, "   ", "all")).toEqual(fleet);
  });
});