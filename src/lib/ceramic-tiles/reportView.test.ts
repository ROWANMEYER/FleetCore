import { describe, expect, it } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";
import type { CeramicReportRow } from "./reportExport";
import { ceramicReportItems, ceramicReportLocalPrice, ceramicReportMissing, ceramicReportStatus } from "./reportView";
const row = (number: string, rate: number | null = 600): CeramicReportRow => ({ shipmentId: number as Id<"ceramicShipments">, routeId: `route-${number}` as Id<"dailyRoutes">, region: "transvaal", shipmentNumber: number, version: 1, routeDate: "2026-11-23", driverName: "Example Driver", truckFleetNo: "120", truckRegistration: "TEST-120", fromLocations: ["SAMCA BABELEGI"], toLocations: ["CTM KNYSNA"], deliveryNumbers: ["100"], weightKg: 34000, pallets: 30, needsReview: false, warehouseWeights: [{ code: "3000", weightKg: 34000 }], locals: [], billingSourceVersion: 1, billing: { ratePerTon: rate, stops: 0, drops: 0, crossBorder: "", load: "", locals: [] } });
const items = (rows: CeramicReportRow[], sort: "date" | "shipment" | "driver" | "amount" = "date", descending = false) => ceramicReportItems(rows, "monthly", "", "all", sort, descending);
describe("Ceramic working report view", () => {
  it("shows only populated shipment rows, with no template filler", () => { expect(items([row("SH1"), row("SH2")])).toHaveLength(2); expect(items([])).toEqual([]); });
  it("matches all search words across shipment, driver, truck and destination", () => { expect(ceramicReportItems([row("SH1")], "monthly", "example KNYSNA 120", "all", "date", false)).toHaveLength(1); expect(ceramicReportItems([row("SH1")], "monthly", "unknown", "all", "date", false)).toEqual([]); });
  it("sorts numeric shipment references naturally without modifying the input", () => { const rows = [row("SH10"), row("SH2")], before = structuredClone(rows); expect(items(rows, "shipment").map(item => item.row.shipmentNumber)).toEqual(["SH2", "SH10"]); expect(rows).toEqual(before); });
  it("keeps unconfirmed amounts last in either sort direction, preserving real zeros", () => { const rows = [row("missing", null), row("zero", 0), row("priced", 600)]; expect(items(rows, "amount").map(item => item.key)).toEqual(["zero", "priced", "missing"]); expect(items(rows, "amount", true).map(item => item.key)).toEqual(["priced", "zero", "missing"]); expect(ceramicReportStatus(rows[1])).toBe("Ready"); });
  it("identifies revised source versions, missing values and unmapped warehouses", () => { const r = row("SH1"); r.billingSourceVersion = 0; expect(ceramicReportMissing(r)).toBe(true); expect(ceramicReportStatus(r)).toBe("Missing amounts"); r.unmappedWarehouses = [{ name: "Unknown warehouse", weightKg: 100 }]; expect(ceramicReportStatus(r)).toBe("Needs review"); });
  it("filters review and missing amounts independently", () => { const review = row("review"); review.needsReview = true; const rows = [row("ready"), review, row("missing", null)]; expect(ceramicReportItems(rows,"monthly","","review","date",false).map(i=>i.key)).toEqual(["review"]); expect(ceramicReportItems(rows,"monthly","","missing","date",false).map(i=>i.key)).toEqual(["missing"]); });
  it("lists actual local delivery legs and searches each branch independently", () => {
    const r = row("SH1"); r.toLocations = ["Cashbuild George", "Italtile George"];
    r.locals = ["Cashbuild George", "Italtile George"].map((name,i) => ({ key: String(i), kind: "delivery", name, address: "GEORGE", deliveryNumbers: [String(i)], weightKg: 2000, pallets: 2 }));
    r.billing!.locals = r.locals.map(local => ({ key: local.key, from: "GEORGE", to: "GEORGE", price: 2700 }));
    expect(ceramicReportItems([r, row("no-local")],"local","","all","date",false)).toHaveLength(2);
    const filtered = ceramicReportItems([r],"local","italtile","all","date",false); expect(filtered).toHaveLength(1); expect(filtered[0].local?.name).toBe("Italtile George"); expect(ceramicReportLocalPrice(filtered[0])).toBe(2700); expect(ceramicReportLocalPrice({key:r.shipmentId,row:r})).toBe(5400);
  });
  it("does not include orphaned historical local prices in current displayed transport totals", () => { const r = row("SH1"); r.billing!.locals = [{ key: "removed", from:"GEORGE",to:"GEORGE",price:2700 }]; expect(ceramicReportLocalPrice({key:r.shipmentId,row:r})).toBe(0); });
});
