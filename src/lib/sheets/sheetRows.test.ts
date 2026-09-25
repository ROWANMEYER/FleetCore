import { describe, expect, it } from "vitest";
import {
  buildSheetRows,
  countSheetLoads,
  assignRouteLabels,
  type SheetRouteInput,
} from "./sheetRows";

/**
 * Regression tests for the Sheets → SpreadsheetDataTable route/load hierarchy.
 *
 * Verified real backend state (22/09/2026):
 * - Truck 56 has ONE dailyRoute `j57dktk5e1n9dh4wyf445qax698f107h`
 *   (planningSource "board", routeOrder 1) containing 5 loads, each with a
 *   Convex loadId.
 * - Truck 111 has ONE dailyRoute `j572wm4pgy7srmkb0gf4xnac6n8ewsna`
 *   (routeOrder 1) containing 1 load.
 *
 * The Sheets table must render 5 LOAD rows that share ONE route identity
 * (routeId + routeLabel), with per-route LOAD NO numbering 1..N that resets
 * per route and never exposes the raw Convex loadId.
 */

const LOAD_ID_A = "jd70r70wc2fw3xbp7ysawk94j18f0c02";
const LOAD_ID_B = "jd7fgxzd1vhc6w5pke9bhy0kb98f182g";
const LOAD_ID_BOARDED = "jd77qnhhjtb3ztqns69d8v09vn8ewv1b";
const ROUTE_56 = "j57dktk5e1n9dh4wyf445qax698f107h";
const ROUTE_111 = "j572wm4pgy7srmkb0gf4xnac6n8ewsna";

function load(client: string, loadId?: string) {
  return {
    client,
    fromLocations: ["George"],
    toLocations: ["Cape Town"],
    quantity: 34,
    rate: 1250,
    rateType: "per_unit",
    loadId,
  };
}

function route(overrides: Partial<SheetRouteInput>): SheetRouteInput {
  return {
    _id: "route-missing",
    routeDate: "2026-09-22",
    truckFleetNoStr: "56",
    trailerFleetNoStr: "TB-01",
    driverName: "John Doe",
    fromLocations: ["Karatara"],
    toLocations: ["George"],
    routeOrder: 1,
    planningSource: "board",
    loads: [],
    ...overrides,
  } as SheetRouteInput;
}

describe("A/B — one route with 5 loads = ONE route identity", () => {
  const truck56 = route({
    _id: ROUTE_56,
    routeOrder: 1,
    loads: [
      load("Geelhout", LOAD_ID_A),
      load("Geo Parkes", LOAD_ID_B),
      load("Richard Kane"),
      load("Shaveco"),
      load("Poleyard"),
    ],
  });

  it("A: 5 loads render as 5 LOAD rows", () => {
    expect(buildSheetRows([truck56])).toHaveLength(5);
  });

  it("B: all 5 rows share the same route identity (routeId + routeLabel)", () => {
    const rows = buildSheetRows([truck56]);
    for (const row of rows) {
      expect(row.routeId).toBe(ROUTE_56);
      expect(row.routeLabel).toBe("R1");
      expect(row.routeOrder).toBe(1);
    }
  });
});

describe("C — second route on the same truck is a distinct route identity", () => {
  const routes = [
    route({ _id: ROUTE_56, routeOrder: 1, loads: [load("Geelhout", LOAD_ID_A)] }),
    route({ _id: "second-route", routeOrder: 2, loads: [load("Poleyard")] }),
  ];

  it("C: two load rows with distinct routeId and distinct ascending route labels", () => {
    const rows = buildSheetRows(routes);
    expect(rows).toHaveLength(2);
    expect(rows[0].routeId).not.toBe(rows[1].routeId);
    expect(rows[0].routeLabel).toBe("R1");
    expect(rows[1].routeLabel).toBe("R2");
    expect(rows[0].routeOrder).toBe(1);
    expect(rows[1].routeOrder).toBe(2);
  });
});

describe("D — different trucks are distinct routes", () => {
  const routes = [
    route({ _id: ROUTE_56, truckFleetNoStr: "56", routeOrder: 1, loads: [load("Geelhout", LOAD_ID_A)] }),
    route({ _id: ROUTE_111, truckFleetNoStr: "111", routeOrder: 1, loads: [load("Shaveco", LOAD_ID_BOARDED)] }),
  ];

  it("D: each truck's load keeps its own route identity with the same label", () => {
    const rows = buildSheetRows(routes);
    expect(rows).toHaveLength(2);
    expect(rows[0].routeId).toBe(ROUTE_56);
    expect(rows[1].routeId).toBe(ROUTE_111);
    expect(rows[0].routeLabel).toBe("R1");
    expect(rows[1].routeLabel).toBe("R1");
    expect(rows[0].truckNo).toBe("56");
    expect(rows[1].truckNo).toBe("111");
  });
});

describe("E/F — LOAD NO numbering 1..N per route, reset per route", () => {
  const routes = [
    route({ _id: ROUTE_56, routeOrder: 1, loads: [load("Geelhout", LOAD_ID_A), load("Shaveco"), load("Poleyard")] }),
    route({ _id: ROUTE_111, truckFleetNoStr: "111", routeOrder: 1, loads: [load("Shaveco", LOAD_ID_BOARDED)] }),
  ];

  it("E: numbering is 1..N within a route", () => {
    const rows = buildSheetRows(routes);
    expect(rows.filter((r) => r.routeId === ROUTE_56).map((r) => r.loadNo)).toEqual(["1", "2", "3"]);
  });

  it("F: numbering resets to 1 for the next route", () => {
    const rows = buildSheetRows(routes);
    expect(rows.filter((r) => r.routeId === ROUTE_111).map((r) => r.loadNo)).toEqual(["1"]);
  });
});

describe("G/H — raw loadId stays internal, never the displayed LOAD NO", () => {
  const routes = [
    route({ _id: ROUTE_56, routeOrder: 1, loads: [load("Geelhout", LOAD_ID_A), load("Geo Parkes", LOAD_ID_B)] }),
  ];

  it("G: the raw loadId is carried on the row for internal consumers", () => {
    const rows = buildSheetRows(routes);
    expect(rows[0].loadId).toBe(LOAD_ID_A);
    expect(rows[1].loadId).toBe(LOAD_ID_B);
  });

  it("H: LOAD NO is the position 1..N, never the raw Convex ID", () => {
    const rows = buildSheetRows(routes);
    expect(rows[0].loadNo).toBe("1");
    expect(rows[1].loadNo).toBe("2");
    expect(rows[0].loadNo).not.toBe(LOAD_ID_A);
    expect(rows[1].loadNo).not.toBe(LOAD_ID_B);
  });
});

describe("I — legacy route without routeOrder renders gracefully", () => {
  it("I: renders rows with a fallback route label, no crash", () => {
    const legacy = route({
      _id: "legacy-1",
      routeOrder: undefined,
      planningSource: undefined,
      loads: [load("Legacy Client"), load("Legacy Client 2")],
    });
    const rows = buildSheetRows([legacy]);
    expect(rows).toHaveLength(2);
    expect(rows[0].routeLabel).toMatch(/^R\d+$/);
    expect(rows[0].loadNo).toBe("1");
    expect(rows[1].loadNo).toBe("2");
  });

  it("I: legacy fallback never collides with a Board routeOrder label", () => {
    const routes = [
      route({ _id: ROUTE_56, routeOrder: 1, loads: [load("Board", LOAD_ID_A)] }),
      route({ _id: "legacy-2", routeOrder: undefined, planningSource: undefined, loads: [load("Legacy")] }),
    ];
    const rows = buildSheetRows(routes);
    const labels = rows.map((r) => r.routeLabel);
    expect(labels).toEqual(["R1", "R2"]);
  });
});

describe("J — legacy load without loadId renders with positional LOAD NO", () => {
  it("J: a load with no loadId still renders a stable in-route LOAD NO", () => {
    const legacy = route({
      _id: "legacy-3",
      routeOrder: undefined,
      planningSource: undefined,
      loads: [load("Client A"), load("Client B")],
    });
    const rows = buildSheetRows([legacy]);
    expect(rows[0].loadId).toBeUndefined();
    expect(rows.map((r) => r.loadNo)).toEqual(["1", "2"]);
    expect(rows[0].customer).toBe("CLIENT A");
  });
});

describe("K — LOADS KPI counts loads, not routes", () => {
  it("K: a 5-load route + a 1-load route = 6 loads", () => {
    const routes = [
      route({
        _id: ROUTE_56,
        routeOrder: 1,
        loads: [load("Geelhout", LOAD_ID_A), load("Geo Parkes", LOAD_ID_B), load("Richard Kane"), load("Shaveco"), load("Poleyard")],
      }),
      route({ _id: ROUTE_111, truckFleetNoStr: "111", routeOrder: 1, loads: [load("Shaveco", LOAD_ID_BOARDED)] }),
    ];
    expect(countSheetLoads(routes)).toBe(6);
    expect(routes.length).toBe(2);
  });

  it("K: routes with no loads contribute zero", () => {
    expect(countSheetLoads([route({ loads: [] }), route({ loads: undefined })])).toBe(0);
  });
});

describe("L — empty route (no loads) renders as ONE summary row", () => {
  it("L: an empty route produces a single row with no load number", () => {
    const rows = buildSheetRows([route({ _id: "empty-1", loads: [] })]);
    expect(rows).toHaveLength(1);
    expect(rows[0].loadIndex).toBe(-1);
    expect(rows[0].loadNo).toBe("");
    expect(rows[0].routeLabel).toBe("R1");
  });
});

describe("M — moved loads follow the authoritative loads[] order", () => {
  it("M: rows reflect the appended position of a moved load", () => {
    const movedInto = route({
      _id: ROUTE_56,
      routeOrder: 1,
      loads: [load("Geelhout", LOAD_ID_A), load("Moved Shaveco", LOAD_ID_BOARDED)],
    });
    const rows = buildSheetRows([movedInto]);
    expect(rows.map((r) => r.loadNo)).toEqual(["1", "2"]);
    expect(rows[1].loadId).toBe(LOAD_ID_BOARDED);
    expect(rows[1].customer).toBe("MOVED SHAVECO");
  });
});

describe("assignRouteLabels — label derivation", () => {
  it("labels Board routes by their authoritative routeOrder", () => {
    const routes = [route({ _id: "a", routeOrder: 2, loads: [] }), route({ _id: "b", routeOrder: 1, loads: [] })];
    const labels = assignRouteLabels(routes);
    expect(labels.get("a")).toBe("R2");
    expect(labels.get("b")).toBe("R1");
  });

  it("keeps legacy routes deterministic per truck and collision-free", () => {
    const routes = [
      route({ _id: "b1", routeOrder: 1, loads: [] }),
      route({ _id: "l1", routeOrder: undefined, loads: [] }),
    ];
    const labels = assignRouteLabels(routes);
    expect(labels.get("b1")).toBe("R1");
    expect(labels.get("l1")).toBe("R2");
  });
});

describe("buildSheetRows — field stability across the historic flatten", () => {
  it("preserves the exact per-row field computations the table relied on", () => {
    const r = route({
      _id: "fmt-1",
      routeOrder: 1,
      region: "garden_route",
      fromLocations: ["Karatara"],
      toLocations: ["George"],
      kilometers: 100,
      loads: [load("Geelhout", LOAD_ID_A)],
    });
    const [row] = buildSheetRows([r]);
    expect(row.date).toBe("22 09 2026");
    expect(row.dateIso).toBe("2026-09-22");
    expect(row.driverName).toBe("JOHN DOE");
    expect(row.origin).toBe("GEORGE");
    expect(row.destination).toBe("CAPE TOWN");
    expect(row.amount).toBe(34 * 1250);
    expect(row.rkm).toBe(425);
    expect(row.region).toBe("garden_route");
  });

  it("returns an empty array for empty input", () => {
    expect(buildSheetRows([])).toEqual([]);
    expect(buildSheetRows(undefined as unknown as SheetRouteInput[])).toEqual([]);
  });
});