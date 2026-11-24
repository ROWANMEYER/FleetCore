import { describe, expect, it } from "vitest";
import { assign, report, saveReportBilling } from "@/convex/ceramicTiles";
import { preview, confirm, saveSettings } from "@/convex/ceramicBilling";
import { DEFAULT_CERAMIC_BILLING, ceramicBilledMainLoad } from "./billing";
import { buildCeramicTemplateSheets } from "./templateWorkbook";
import { ceramicTemplateExcel } from "./templateExport";
import type { CeramicReportRow } from "./reportExport";
import { routeRevenue } from "@/convex/utils";
import type { CeramicShipment } from "./parser";
import type { Infer } from "convex/values";
import type { ceramicBillingPreview } from "@/convex/ceramicBillingFields";
type Row = Record<string, unknown>;
type Definition = { _handler: (ctx: unknown, args: Row) => Promise<unknown> };
type Preview = Infer<typeof ceramicBillingPreview>;
function fixture(singleWarehouse = false) {
  let sequence = 0;
  const tables = new Map<string, Map<string, Row>>();
  const table = (name: string) => { if (!tables.has(name)) tables.set(name, new Map()); return tables.get(name)!; };
  const put = (name: string, id: string, value: Row) => table(name).set(id, { _id: id, _creationTime: ++sequence, ...structuredClone(value) });
  put("users", "user", { role: "admin", email: "synthetic@example.invalid" });
  put("sessions", "session", { token: "valid", userId: "user", expiresAt: Date.now() + 100000 });
  put("customers", "customer", { name: "Ceramic Tile Marketing", normalizedName: "ceramic tile marketing", isActive: true });
  put("drivers", "driver", { driverName: "Synthetic Driver" }); put("trucks", "truck", { truckFleetNo: "T1" });
  const snapshot: CeramicShipment = { shipmentNumber: "SH00990111", version: 1, totalWeightKg: 34000, totalPallets: 30, transporter: null, plannedLoadingDate: "2026-11-23", plannedDeliveryDate: "2026-11-24", warnings: [], destinations: Array.from({ length: 6 }, (_, i) => ({ name: i === 0 ? "ITALTILE GEORGE" : `KNYSNA STORE ${i}`, addressLines: [], orders: [{ deliveryNumber: String(1000 + i), orderNumber: "", weightKg: i === 0 ? 5200 : 1000, palletsEstimate: i === 0 ? 4 : 1, collectFrom: singleWarehouse || i % 2 ? "1100-Betta Krugersdorp" : "1600-Vitro Vereeniging" }] })) };
  put("ceramicShipments", "shipment", { shipmentNumber: snapshot.shipmentNumber, version: 1, snapshot, region: "transvaal", fileHash: "a".repeat(64), createdAt: 1, updatedAt: 1, updatedBy: "test" });
  put("rateSheets", "sheet", { customerId: "customer", revision: 0, updatedAt: 1, effectiveDate: "2026-08-05", defaultPricingUnit: "ton", agreementType: "fixed", lanes: [{ id: "main", loadingPoint: "KRUGERSDORP + VEREENIGING", destination: "KNYSNA", rate: 600, sortOrder: 0 }, { id: "sp", loadingPoint: "KRUGERSDORP + VEREENIGING", destination: "KNYSNA (SP)", rate: 570, sortOrder: 1 }, { id: "george", loadingPoint: "KRUGERSDORP + VEREENIGING", destination: "GEORGE", rate: 520, sortOrder: 2 }] });
  const writes: string[] = [];
  const db = {
    get: async (id: string) => [...tables.values()].map(rows => rows.get(id)).find(Boolean) ?? null,
    insert: async (name: string, value: Row) => { const id = `${name}-${++sequence}`; put(name, id, value); writes.push(`insert:${name}`); return id; },
    patch: async (id: string, value: Row) => { const row = await db.get(id); if (!row) throw new Error("missing"); for (const [key, item] of Object.entries(value)) { if (item === undefined) delete row[key]; else row[key] = structuredClone(item); } writes.push(`patch:${id}`); },
    query: (name: string) => {
      const tests: ((row: Row) => boolean)[] = []; let descending = false;
      const index = { eq: (key: string, value: unknown) => { tests.push(row => row[key] === value); return index; }, lte: (key: string, value: string) => { tests.push(row => String(row[key]) <= value); return index; }, gte: (key: string, value: string) => { tests.push(row => String(row[key]) >= value); return index; }, lt: (key: string, value: string) => { tests.push(row => String(row[key]) < value); return index; } };
      const found = () => [...table(name).values()].filter(row => tests.every(test => test(row))).sort((a, b) => descending ? String(b.effectiveDate ?? "").localeCompare(String(a.effectiveDate ?? "")) || Number(b._creationTime) - Number(a._creationTime) : Number(a._creationTime) - Number(b._creationTime));
      const chain = { withIndex: (_name: string, cb: (q: typeof index) => unknown) => { cb(index); return chain; }, order: (direction: string) => { descending = direction === "desc"; return chain; }, first: async () => found()[0] ?? null, unique: async () => { if (found().length > 1) throw new Error("duplicate"); return found()[0] ?? null; }, take: async (count: number) => found().slice(0, count), paginate: async () => ({ page: found(), isDone: true, continueCursor: "" }) };
      return chain;
    },
  };
  const args = { token: "valid", region: "transvaal", shipmentId: "shipment", driverId: "driver", truckId: "truck", expectedVersion: 1, routeDate: "2026-11-23" };
  const run = (fn: unknown, overrides: Row = {}) => (fn as Definition)._handler({ db }, { ...args, ...overrides });
  const read = (overrides: Row = {}) => run(preview, overrides) as Promise<Preview>;
  const save = async (p: Preview, overrides: Row = {}) => run(confirm, { expectedVersion: p.version, expectedAssignmentUpdatedAt: p.assignmentUpdatedAt, expectedBillingUpdatedAt: p.billingUpdatedAt, expectedFingerprint: p.fingerprint, chargeableTons: p.calculation.chargeableTons, ...(p.selected ? { tariffKey: p.selected.key } : {}), ...overrides });
  const route = () => [...table("dailyRoutes").values()][0];
  return { table, put, writes, run, read, save, route };
}
describe("Ceramic billing confirmation transaction", () => {
  it("saves the agreed six-drop example once with main-only Planner revenue and local report charges", async () => {
    const f = fixture(); await f.run(assign); const p = await f.read();
    expect(p.calculation).toMatchObject({ freight: 20400, dropCharge: 3000, localTotal: 2700, mainTotal: 23400, combinedTotal: 26100 });
    await expect(f.save(p)).resolves.toMatchObject({ saved: true, complete: true });
    expect(routeRevenue(f.route())).toBe(23400); expect(f.table("dailyRoutes").size).toBe(1);
    const saved = await f.read(); expect(saved.saved).toMatchObject({ mainTotal: 23400, localTotal: 2700, sourceVersion: 1, status: "confirmed" });
    const reportResult = await f.run(report, { month: "2026-11", paginationOpts: { numItems: 50, cursor: null } }) as { page: Row[] };
    expect(reportResult.page[0].needsReview).toBe(false); expect(f.table("ceramicBillingHistory").size).toBe(1);
  });
  it("uses SP for a single town and rejects a forged multi-town SP choice", async () => {
    const one = fixture(true); await one.run(assign); expect((await one.read()).selected).toMatchObject({ variant: "sp", ratePerTon: 570 });
    const many = fixture(); await many.run(assign); const p = await many.read(); expect(p.choices.every(choice => choice.variant === "standard")).toBe(true);
    const count = many.writes.length; await expect(many.save(p, { tariffKey: "sheet:0:sp:2026-08-05" })).rejects.toThrow("highest applicable"); expect(many.writes).toHaveLength(count);
  });
  it("selects SP for multiple warehouses in Babelegi and keeps warehouse-based extra charges", async () => {
    const f = fixture();
    const source = f.table("ceramicShipments").get("shipment")!.snapshot as CeramicShipment;
    const warehouses = ["3000-Samca 1 Babelegi, Hammanskraal, RSA", "2100-Samca Wall Tiles Babalegi, Hammanskraal, RSA", "1900-Pegasus Babelegi"];
    for (const [i, d] of source.destinations.entries()) for (const order of d.orders) order.collectFrom = warehouses[i % warehouses.length];
    const lanes = f.table("rateSheets").get("sheet")!.lanes as Row[];
    for (const lane of lanes) lane.loadingPoint = "BABELEGI + KRUGERSDORP + VEREENIGING";
    await f.run(assign); const p = await f.read();
    expect(p.selected).toMatchObject({ variant: "sp", ratePerTon: 570 });
    expect(p.calculation).toMatchObject({ pickups: 3, pickupTownCount: 1, pickupCharge: 750 });
    await f.save(p); expect(routeRevenue(f.route())).toBe(23130);
    expect([...f.table("ceramicAssignments").values()][0].billing).toMatchObject({ automation: { variant: "sp", pickupCount: 3, pickupTownCount: 1 } });
  });
  it("uses customer notices for SP tariffs and preserves confirmed billing after a later notice", async () => {
    const f = fixture(true); f.table("rateSheets").get("sheet")!.agreementType = "customer_notified";
    f.put("fuelPrices","fuel",{effectiveDate:"2026-11-04",pricePerLitre:100,compositionPercent:90});
    await f.run(assign); expect((await f.read()).calculation.issues.join(" ")).toContain("monthly adjustment");
    f.put("customerRateAdjustments","notice",{customerId:"customer",sheetId:"sheet",effectiveDate:"2026-11-04",percentage:5,rates:[{laneId:"sp",rate:580.25}],reference:"Approved customer notice",recordedAt:10});
    const p=await f.read(); expect(p.selected).toMatchObject({variant:"sp",ratePerTon:580.25}); expect(p.calculation.issues).toEqual([]);
    await f.save(p); const stored = structuredClone([...f.table("ceramicAssignments").values()][0].billing); expect(routeRevenue(f.route())).toBe(22728.5);
    f.put("customerRateAdjustments","correction",{customerId:"customer",sheetId:"sheet",effectiveDate:"2026-11-04",percentage:10,rates:[{laneId:"sp",rate:590}],reference:"Corrected notice",recordedAt:11});
    expect((await f.read()).selected?.ratePerTon).toBe(590); expect([...f.table("ceramicAssignments").values()][0].billing).toEqual(stored); expect(routeRevenue(f.route())).toBe(22728.5);
  });
  it("does not silently choose a tariff for unknown pickup towns", async () => {
    const f = fixture(true), source = f.table("ceramicShipments").get("shipment")!.snapshot as CeramicShipment;
    source.destinations[0].orders[0].collectFrom = "Unknown warehouse";
    await f.run(assign); const p = await f.read();
    expect(p.calculation.pickupTownCount).toBeNull(); expect(p.selected).toBeNull();
    const writes = f.writes.length; await expect(f.save(p)).rejects.toThrow(); expect(f.writes).toHaveLength(writes);
    await f.save(p, { markForReview: true }); expect(routeRevenue(f.route())).toBe(0);
  });
  it("flags an old warehouse-based Standard snapshot and preserves it when SP is confirmed", async () => {
    const f = fixture(true); await f.run(assign); await f.save(await f.read());
    const source = f.table("ceramicShipments").get("shipment")!.snapshot as CeramicShipment;
    const assignment = [...f.table("ceramicAssignments").values()][0];
    const billing = assignment.billing as { ratePerTon: number; automation: Row };
    billing.ratePerTon = 600; Object.assign(billing.automation, { variant: "standard", freight: 20400, mainTotal: 23400 });
    Object.assign(f.route(), { ceramicBillingTotal: 23400, ceramicRatePerTon: 600, loads: [ceramicBilledMainLoad(source, "shipment", 34, 23400, { ratePerTon: 600, extraStops: 3000 })] });
    f.table("ceramicBillingHistory").clear(); f.put("ceramicBillingHistory", "original", { shipmentId: "shipment", billing: structuredClone(billing) });
    const p = await f.read(); expect(p.ruleIssues.join(" ")).toContain("pickup town"); expect(p.saved?.status).toBe("needs_review");
    expect(routeRevenue(f.route())).toBe(23400);
    await f.save(p); expect(routeRevenue(f.route())).toBe(22380);
    expect((await f.read()).ruleIssues).toEqual([]); expect(f.table("ceramicBillingHistory").size).toBe(2);
    expect(f.table("ceramicBillingHistory").get("original")!.billing).toMatchObject({ automation: { variant: "standard", mainTotal: 23400 } });
  });
  it("removes the false Naas local only on confirmation, retaining its original billing history", async () => {
    const f = fixture(), source = f.table("ceramicShipments").get("shipment")!.snapshot as CeramicShipment;
    source.destinations[0].name = "CASH110-CASHBUILD - NAAS 1251"; source.destinations[0].addressLines = ["RISSIK STREET", "KOMATIPOORT"];
    await f.run(assign); await f.save(await f.read());
    const assignment = [...f.table("ceramicAssignments").values()][0];
    const billing = assignment.billing as { locals: Row[]; automation: Row };
    billing.locals = [{ key: 'delivery:["1000"]', from: "GEORGE", to: "GEORGE", price: 2700 }]; billing.automation.localTotal = 2700;
    f.table("ceramicBillingHistory").clear(); f.put("ceramicBillingHistory", "original", { shipmentId: "shipment", billing: structuredClone(billing) });
    const p = await f.read(); expect(p.ruleIssues.join(" ")).toContain("George"); expect(p.calculation.locals).toEqual([]); expect(billing.locals).toHaveLength(1);
    const reportBefore = await f.run(report, { month: "2026-11", paginationOpts: { numItems: 50, cursor: null } }) as { page: CeramicReportRow[] };
    expect(reportBefore.page[0]).toMatchObject({ needsReview: true, locals: [] });
    await f.save(p); expect(assignment.billing).toMatchObject({ locals: [], automation: { localTotal: 0 } });
    expect(f.table("ceramicBillingHistory").get("original")!.billing).toMatchObject({ locals: [{ price: 2700 }] });
    expect(routeRevenue(f.route())).toBe(23400);
  });
  it.each(["completed", "locked", "invoiced", "manual-price", "extra-load"])("protects %s Planner records before any billing write", async reason => {
    const f = fixture(); await f.run(assign); const p = await f.read(), route = f.route();
    if (reason === "invoiced") f.put("invoices", "invoice", { routeId: route._id });
    else if (reason === "manual-price") (route.loads as Row[])[0].rate = "123";
    else if (reason === "extra-load") (route.loads as Row[]).push({ client: "Other", rate: "999", quantity: "1" });
    else route.status = reason;
    const before = f.writes.length; await expect(f.save(p)).rejects.toThrow(); expect(f.writes).toHaveLength(before); expect(f.table("ceramicBillingHistory").size).toBe(0);
  });
  it("keeps protected historical billing read-only while operational instructions remain available", async () => {
    const f = fixture(); await f.run(assign); await f.save(await f.read()); f.route().status = "completed";
    const p = await f.read(); expect(p.readOnly).toBe(true); expect(p.saved?.mainTotal).toBe(23400);
    const count = f.writes.length; await expect(f.save(p, { markForReview: true })).rejects.toThrow("completed"); expect(f.writes).toHaveLength(count);
  });
  it("flags manually priced loads for review without replacing their Planner values", async () => {
    const f = fixture(); await f.run(assign); (f.route().loads as Row[])[0].rate = "123";
    const p = await f.read(); expect(p.calculation.issues.join(" ")).toContain("manual pricing");
    await f.save(p, { markForReview: true }); expect((f.route().loads as Row[])[0].rate).toBe("123"); expect((await f.read()).saved?.status).toBe("needs_review");
  });
  it("rejects stale tariff/billing fingerprints and duplicate confirmation retries", async () => {
    const f = fixture(); await f.run(assign); const p = await f.read(); await f.save(p); const before = f.writes.length;
    await expect(f.save(p)).rejects.toThrow("changed"); expect(f.writes).toHaveLength(before);
    const next = await f.read(); const sheet = f.table("rateSheets").get("sheet")!; (sheet.lanes as Row[])[0].rate = 700;
    await expect(f.save(next)).rejects.toThrow("changed"); expect(routeRevenue(f.route())).toBe(23400);
    expect((await f.read()).saved?.mainTotal).toBe(23400);
  });
  it("allows signed-in dispatchers from other regions but never anonymous pricing", async () => {
    const f = fixture(); await f.run(assign); f.table("users").get("user")!.role = "regional"; f.table("users").get("user")!.region = "kaap";
    await f.save(await f.read()); const count = f.writes.length;
    await expect(f.read({ token: "invalid" })).rejects.toThrow("Sign in"); expect(f.writes).toHaveLength(count);
  });
  it("flags unmatched billing without setting Planner prices and preserves an existing manual baseline", async () => {
    const f = fixture(); await f.run(assign); f.table("rateSheets").clear();
    const assignment = [...f.table("ceramicAssignments").values()][0]; assignment.billing = { ratePerTon: 123, stops: 456, drops: 0, crossBorder: "Keep", load: "Historical", locals: [] }; assignment.billingUpdatedAt = 1;
    const p = await f.read(); expect(p.selected).toBeNull(); await f.save(p, { markForReview: true });
    expect(routeRevenue(f.route())).toBe(0); expect(assignment.billing).toMatchObject({ ratePerTon: 123, stops: 456, load: "Historical", automation: { status: "needs_review" } });
    expect(f.table("ceramicBillingHistory").size).toBe(2);
  });
  it("preserves billing snapshots through future configuration and requires a fresh preview", async () => {
    const f = fixture(); await f.run(assign); await f.save(await f.read());
    const saved = structuredClone([...f.table("ceramicAssignments").values()][0].billing);
    await f.run(saveSettings, { customerId: "customer", effectiveDate: "2026-12-01", expectedVersion: "defaults", ...DEFAULT_CERAMIC_BILLING, extraStopPrice: 900 });
    expect((await f.read()).config.extraStopPrice).toBe(750); expect([...f.table("ceramicAssignments").values()][0].billing).toEqual(saved);
    f.table("users").get("user")!.role = "regional";
    await expect(f.run(saveSettings, { customerId: "customer", effectiveDate: "2026-12-02", expectedVersion: "defaults", ...DEFAULT_CERAMIC_BILLING })).rejects.toThrow("Only administrators");
  });
  it("prevents the legacy editor from overwriting an automated snapshot", async () => {
    const f = fixture(); await f.run(assign); await f.save(await f.read()); const assignment = [...f.table("ceramicAssignments").values()][0], count = f.writes.length;
    await expect(f.run(saveReportBilling, { expectedBillingUpdatedAt: assignment.billingUpdatedAt, billing: assignment.billing })).rejects.toThrow("automated billing review"); expect(f.writes).toHaveLength(count);
  });
  it("rejects forged automated snapshots through the legacy amount endpoint", async () => {
    const f = fixture(); await f.run(assign); await f.save(await f.read());
    const billing = [...f.table("ceramicAssignments").values()][0].billing;
    const target = fixture(); await target.run(assign); const count = target.writes.length;
    await expect(target.run(saveReportBilling, { expectedBillingUpdatedAt: 0, billing })).rejects.toThrow("automated billing review"); expect(target.writes).toHaveLength(count);
  });
  it("rounds fractional-ton charges consistently in the report and exported formula", async () => {
    const f = fixture(); await f.run(assign); (f.table("rateSheets").get("sheet")!.lanes as Row[])[0].rate = 600.01;
    const p = await f.read({ chargeableTons: 28.5 }); await f.save(p);
    const result = await f.run(report, { month: "2026-11", paginationOpts: { numItems: 50, cursor: null } }) as { page: CeramicReportRow[] };
    const [sheet] = buildCeramicTemplateSheets(result.page, "2026-11");
    expect(sheet.rows[10].cells[24]).toMatchObject({ formula: "ROUND(H11*28.5,2)", value: 17100.29 });
    expect(sheet.rows[10].cells[27].value).toBe(20100.29); expect(routeRevenue(f.route())).toBe(20100.29);
  });
  it("supports a tonnage override without changing source PDF weight", async () => {
    const f = fixture(); await f.run(assign); const p = await f.read({ chargeableTons: 28 }); await f.save(p);
    expect(f.route().ceramicBillingTons).toBe(28); expect(routeRevenue(f.route())).toBe(19800);
    expect((f.table("ceramicShipments").get("shipment")!.snapshot as CeramicShipment).totalWeightKg).toBe(34000);
    const result = await f.run(report, { month: "2026-11", paginationOpts: { numItems: 50, cursor: null } }) as { page: CeramicReportRow[] };
    const sheets = buildCeramicTemplateSheets(result.page, "2026-11");
    expect(sheets[0].rows[10].cells[24]).toMatchObject({ formula: "H11*28", value: 16800 });
    expect(sheets[0].rows[10].cells[27]).toMatchObject({ formula: "Y11+Z11+AA11", value: 19800 });
    expect(sheets[1].rows[3].cells[5].value).toBe(2700);
    const { default: JSZip } = await import("jszip"); const zip = await JSZip.loadAsync(await ceramicTemplateExcel(sheets));
    expect(await zip.file("xl/worksheets/sheet1.xml")!.async("string")).toContain("<f>H11*28</f>");
  });
});
