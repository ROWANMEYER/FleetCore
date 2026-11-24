import { describe, expect, it } from "vitest";
import type { CeramicShipment } from "./parser";
import { DEFAULT_CERAMIC_BILLING, ceramicBillingCalculation, ceramicBilledMainLoad } from "./billing";
import { ceramicBillingPeriod, ceramicReportMonth, ceramicReportRange } from "./billingPeriod";
import { ceramicRateOnDate, ceramicTariffChoices, type CeramicTariffState } from "./tariffs";
import { routeRevenue } from "@/convex/utils";
const shipment = (): CeramicShipment => ({ shipmentNumber: "SH00999999", version: 1, totalWeightKg: 34000, totalPallets: 30, transporter: null, plannedLoadingDate: "2026-11-23", plannedDeliveryDate: "2026-11-24", warnings: [], destinations: Array.from({ length: 6 }, (_, i) => ({ name: i === 0 ? "ITALTILE GEORGE" : `KNYSNA STORE ${i}`, addressLines: [], orders: [{ deliveryNumber: String(1000 + i), orderNumber: "", weightKg: i === 0 ? 5200 : 1000, palletsEstimate: i === 0 ? 4 : 1, collectFrom: i % 2 ? "1600-Vitro Vereeniging" : "1100-Betta Krugersdorp" }] })) });
describe("agreed Ceramic billing rules", () => {
  it("charges the six-drop example as main 23400 plus report-only local 2700", () => {
    const source = shipment(), c = ceramicBillingCalculation(source, 600);
    expect(c).toMatchObject({ pickups: 2, deliveries: 6, extraPickups: 0, extraDrops: 4, freight: 20400, mainTotal: 23400, localTotal: 2700, combinedTotal: 26100, issues: [] });
    const load = ceramicBilledMainLoad(source, "shipment", 34, c.mainTotal!);
    expect(routeRevenue({ loads: [load], rate: 0 })).toBe(23400);
  });
  it("counts warehouses separately in one town and multiple orders once per destination", () => {
    const s = shipment(); s.destinations = s.destinations.slice(0, 3); s.destinations[0].orders.push({ ...s.destinations[0].orders[0], deliveryNumber: "9999", collectFrom: "1700-Gryphon Krugersdorp", weightKg: 1000, palletsEstimate: 1 });
    const c = ceramicBillingCalculation(s, 600); expect(c).toMatchObject({ pickups: 3, deliveries: 3, pickupCharge: 750, dropCharge: 750 });
  });
  it.each([[12000, 12, 2700], [12001, 4, 5400], [10000, 13, 5400], [13000, 13, 5400], [5200, 4, 2700]])("uses both local thresholds: %s kg / %s pallets", (kg, pallets, price) => {
    const s = shipment(); Object.assign(s.destinations[0].orders[0], { weightKg: kg, palletsEstimate: pallets }); expect(ceramicBillingCalculation(s, 600).locals[0].price).toBe(price);
  });
  it("flags missing pallets instead of assuming the lower local price", () => {
    const s = shipment(); s.destinations[0].orders[0].palletsEstimate = null; expect(ceramicBillingCalculation(s, 600)).toMatchObject({ localTotal: null, combinedTotal: null }); expect(ceramicBillingCalculation(s, 600).issues).not.toHaveLength(0);
  });
  it("uses editable chargeable tons independently of actual weight", () => {
    expect(ceramicBillingCalculation(shipment(), 600, 28)).toMatchObject({ freight: 16800, mainTotal: 19800 });
    expect(ceramicBillingCalculation(shipment(), null).mainTotal).toBeNull();
    expect(ceramicBillingCalculation(shipment(), 600, 0).issues).not.toHaveLength(0);
  });
  it("supports future configuration without modifying the defaults", () => {
    const c = ceramicBillingCalculation(shipment(), 600, 34, { ...DEFAULT_CERAMIC_BILLING, extraStopPrice: 800 }); expect(c.dropCharge).toBe(3200); expect(DEFAULT_CERAMIC_BILLING.extraStopPrice).toBe(750);
  });
});
describe("Ceramic billing periods", () => {
  it("names 25 October to 24 November as November and rolls January correctly", () => { expect(ceramicBillingPeriod("2026-11")).toEqual({ start: "2026-10-25", end: "2026-11-24" }); expect(ceramicBillingPeriod("2027-01")).toEqual({ start: "2026-12-25", end: "2027-01-24" }); expect(ceramicReportMonth("2026-11-24")).toBe("2026-11"); expect(ceramicReportMonth("2026-11-25")).toBe("2026-12"); });
  it("supports calendar months, adjusted boundaries and end-of-month clamping", () => { expect(ceramicBillingPeriod("2028-02", 1)).toEqual({ start: "2028-02-01", end: "2028-02-29" }); expect(ceramicBillingPeriod("2026-03", 31)).toEqual({ start: "2026-02-28", end: "2026-03-30" }); expect(ceramicReportRange("2026-11", "2026-10-24", "2026-11-25")).toEqual({ start: "2026-10-24", end: "2026-11-25" }); });
  it("rejects impossible and reversed dates", () => { expect(() => ceramicReportRange("2026-11", "2026-02-31", "2026-11-24")).toThrow(); expect(() => ceramicReportRange("2026-11", "2026-11-25", "2026-10-25")).toThrow(); });
});
const fuel = [{ effectiveDate: "2026-08-01", pricePerLitre: 20, compositionPercent: 50 }, { effectiveDate: "2026-09-01", pricePerLitre: 22, compositionPercent: 50 }, { effectiveDate: "2026-09-20", pricePerLitre: 24.2, compositionPercent: 50 }];
const state = (): CeramicTariffState => ({ sheetId: "sheet", revision: 0, recordedAt: 1, effectiveDate: "2026-08-05", defaultPricingUnit: "ton", agreementType: "fixed", lanes: [{ id: "knysna", loadingPoint: "KRUGERSDORP + VEREENIGING", destination: "KNYSNA / PLETT", rate: 600, sortOrder: 0 }, { id: "george", loadingPoint: "KRUGERSDORP + VEREENIGING", destination: "GEORGE", rate: 520, sortOrder: 1 }, { id: "sp", loadingPoint: "KRUGERSDORP + VEREENIGING", destination: "GEORGE (SP)", rate: 500, sortOrder: 2 }] });
describe("Ceramic exact-day tariff matching", () => {
  it("reuses fuel maths but excludes changes later in the planning month", () => { expect(ceramicRateOnDate(1000, "2026-08-05", "2026-09-10", fuel)).toBe(1050); expect(ceramicRateOnDate(1000, "2026-08-05", "2026-09-21", fuel)).toBe(1102.5); expect(ceramicRateOnDate(1000, "2026-08-05", "2026-09-10", fuel, { agreementType: "fuel_linked" })).toBe(1045); });
  it("respects fixed agreements, customer percentages, zeros and unknown fuel adjustments", () => { expect(ceramicRateOnDate(1000, "2026-08-05", "2026-09-21", [], { agreementType: "fixed" })).toBe(1000); expect(ceramicRateOnDate(1000, "2026-08-05", "2026-09-10", fuel, { agreementType: "fuel_linked", fuelCompositionPercent: 0 })).toBe(1000); expect(ceramicRateOnDate(1000, "2026-08-05", "2026-09-10", [fuel[1]])).toBeNull(); });
  it("matches destinations, keeps SP distinct and ranks the highest rate first", () => { expect(ceramicTariffChoices([state()], shipment(), "2026-11-23", []).map(c => [c.laneId, c.variant])).toEqual([["knysna", "standard"], ["george", "standard"], ["sp", "sp"]]); });
  it("uses historical rates until an individual future lane date takes effect", () => { const old = state(), next = state(); next.recordedAt = 2; next.revision = 1; next.lanes = next.lanes.map(l => ({ ...l, date: "2026-12-01", rate: l.rate + 100 })); expect(ceramicTariffChoices([old, next], shipment(), "2026-11-23", [])[0].ratePerTon).toBe(600); expect(ceramicTariffChoices([old, next], shipment(), "2026-12-01", [])[0].ratePerTon).toBe(700); });
  it("does not match a street named George and accepts Plett aliases", () => { const s = shipment(); s.destinations = [{ ...s.destinations[0], name: "Example store", addressLines: ["12 George Street", "CAPE TOWN"] }]; expect(ceramicTariffChoices([state()], s, "2026-11-23", [])).toEqual([]); s.destinations[0].name = "ITALTILE PLETTENBERG BAY"; expect(ceramicTariffChoices([state()], s, "2026-11-23", [])[0].destination).toBe("KNYSNA / PLETT"); });
  it("keeps Babalegi and Krugersdorp/Vereeniging loading groups separate", () => { const s = shipment(); s.destinations[0].orders[0].collectFrom = "SAMCA BABELEGI"; const base = state(), baba = state(); baba.lanes = baba.lanes.map(l => ({ ...l, loadingPoint: "BABELEGI + KRUGERSDORP + VEREENIGING", rate: l.rate + 100 })); expect(ceramicTariffChoices([base, baba], s, "2026-11-23", [])[0].ratePerTon).toBe(700); });
});
