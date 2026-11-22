import { describe, expect, it } from "vitest";
import { ceramicEqual, ceramicLocalLegs, ceramicMainLoad, ceramicPlanningDate, validCeramicDate } from "./planning";
import type { CeramicShipment } from "./parser";
const snapshot: CeramicShipment = { shipmentNumber: "SH00123456", version: 1, totalWeightKg: 32750, totalPallets: null,
  transporter: null, plannedLoadingDate: "2026-11-20", plannedDeliveryDate: "2026-11-23", warnings: [], destinations: [] };
const stop = (name: string, deliveryNumber: string, addressLines: string[] = []) => ({ name, addressLines, orders: [
  { deliveryNumber, orderNumber: "SO-1", weightKg: 1250, collectFrom: "CTM KRUGERSDORP", palletsEstimate: null },
] });
describe("Ceramic assignment mapping", () => {
  it("creates only one main load with all destinations and keeps missing rates blank", () => {
    const source = { ...snapshot, destinations: [stop("CASHBUILD GEORGE", "1"), stop("ITALTILE GEORGE", "2"), stop("CTM KNYSNA", "3")] };
    const load = ceramicMainLoad(source, "shipment");
    expect(load.loadId).toBe("ceramic:shipment"); expect(load.toLocations).toHaveLength(3);
    expect(load.quantity).toBe("32.75"); expect(load.rate).toBe(""); expect(load).not.toHaveProperty("kilometers");
    expect(ceramicLocalLegs(source)).toHaveLength(2);
    expect(source).toEqual({ ...snapshot, destinations: [stop("CASHBUILD GEORGE", "1"), stop("ITALTILE GEORGE", "2"), stop("CTM KNYSNA", "3")] });
  });
  it("detects Cashbuild names case-insensitively, including cash build, without substring matches", () => {
    const source = { ...snapshot, destinations: [stop("009 - Cashbuild Knysna", "1"), stop("Cash Build Mossel Bay", "2"), stop("Notcashbuild", "3")] };
    expect(ceramicLocalLegs(source).map(leg => leg.deliveryNumbers)).toEqual([["1"], ["2"]]);
  });
  it("detects George Italtile from store name or town address but excludes other branches", () => {
    const source = { ...snapshot, destinations: [stop("ITALTILE GEORGE", "1"), stop("Italtile", "2", ["1 Main Rd", "George 6529"]),
      stop("ITALTILE CAPE TOWN", "3", ["1 George Street", "Cape Town"]), stop("CTM GEORGE", "4")] };
    expect(ceramicLocalLegs(source).map(leg => leg.deliveryNumbers)).toEqual([["1"], ["2"]]);
  });
  it("preserves distinct same-name stops and keeps unknown pallets unavailable", () => {
    const source = { ...snapshot, destinations: [stop("Cashbuild", "1", ["Address A"]), stop("Cashbuild", "2", ["Address B"])] };
    const legs = ceramicLocalLegs(source); expect(new Set(legs.map(l => l.key)).size).toBe(2); expect(legs[0].pallets).toBeNull();
  });
  it("groups local collections by source warehouse without losing delivery references", () => {
    const first = stop("CTM", "1"), second = stop("CTM", "2");
    first.orders[0].collectFrom = "Cashbuild George"; second.orders[0].collectFrom = "CASHBUILD GEORGE";
    const legs = ceramicLocalLegs({ ...snapshot, destinations: [first, second] });
    expect(legs).toHaveLength(1); expect(legs[0]).toMatchObject({ kind: "collection", weightKg: 2500, deliveryNumbers: ["1", "2"] });
  });
  it("keeps unknown tonnage blank and preserves a deliberate zero", () => {
    expect(ceramicMainLoad({ ...snapshot, totalWeightKg: null }, "id").quantity).toBe("");
    expect(ceramicMainLoad({ ...snapshot, totalWeightKg: 0 }, "id").quantity).toBe("0");
  });
  it("uses the South African calendar date across UTC month boundaries", () => {
    expect(ceramicPlanningDate(new Date("2026-11-30T22:30:00Z"))).toBe("2026-12-01");
    expect(validCeramicDate("2026-02-29")).toBe(false); expect(validCeramicDate("2028-02-29")).toBe(true);
    expect(validCeramicDate("2026-11-31")).toBe(false); expect(validCeramicDate("")).toBe(false);
  });
  it("compares snapshots independently of Convex object key order", () => {
    expect(ceramicEqual({ a: 1, b: [{ x: 2, y: 3 }] }, { b: [{ y: 3, x: 2 }], a: 1 })).toBe(true);
    expect(ceramicEqual([1, 2], [2, 1])).toBe(false);
  });
});
