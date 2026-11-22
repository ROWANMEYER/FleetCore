import { describe, expect, it } from "vitest";
import { assign, report, remove, saveReportBilling } from "@/convex/ceramicTiles";
import { assign as mobileAssign } from "@/convex/ceramicTilesMobile";
import { ceramicMainLoad } from "./planning";
import { ceramicReportSheets } from "./reportExport";
import type { CeramicShipment } from "./parser";
import type { CeramicReportRow } from "./reportExport";

type Row = Record<string, unknown>;
type Definition = { _handler: (ctx: unknown, args: Row) => Promise<unknown> };
const snapshot: CeramicShipment = { shipmentNumber: "SH00123456", version: 1, totalWeightKg: 32500, totalPallets: 20,
  transporter: null, plannedLoadingDate: "2026-11-20", plannedDeliveryDate: "2026-11-23", warnings: [], destinations: [
    { name: "CASHBUILD GEORGE", addressLines: ["George"], orders: [{ deliveryNumber: "1001", orderNumber: "SO1", weightKg: 2500, collectFrom: "CTM KRUGERSDORP", palletsEstimate: 2 }] },
    { name: "ITALTILE GEORGE", addressLines: ["George"], orders: [{ deliveryNumber: "1002", orderNumber: "SO2", weightKg: 30000, collectFrom: "CTM VEREENIGING", palletsEstimate: 18 }] },
  ] };
const args = { token: "test-session", region: "garden_route", shipmentId: "shipment", driverId: "driver", truckId: "truck", routeDate: "2026-11-22", expectedVersion: 1 };
function fixture(role = "admin", region: string | undefined = undefined) {
  let seq = 0;
  const tables = new Map<string, Map<string, Row>>();
  const table = (name: string) => { if (!tables.has(name)) tables.set(name, new Map()); return tables.get(name)!; };
  const put = (name: string, id: string, value: Row) => table(name).set(id, { ...value, _id: id, _creationTime: 1 });
  put("users", "user", { role, ...(region ? { region } : {}) });
  put("sessions", "session", { userId: "user", token: "test-session", expiresAt: Date.now() + 100000 });
  put("drivers", "driver", { driverName: "Example Driver" }); put("drivers", "driver-two", { driverName: "Replacement Driver" });
  put("trucks", "truck", { truckFleetNo: "T100" }); put("trucks", "truck-two", { truckFleetNo: "T200" });
  put("ceramicShipments", "shipment", { region: "garden_route", snapshot: structuredClone(snapshot), shipmentNumber: snapshot.shipmentNumber,
    version: 1, fileHash: "a".repeat(64), createdAt: 1, updatedAt: 1, updatedBy: "admin" });
  const writes: string[] = [];
  const db = {
    get: async (id: string) => [...tables.values()].map(rows => rows.get(id)).find(Boolean) ?? null,
    insert: async (name: string, value: Row) => { const id = `${name}-${++seq}`; put(name, id, value); writes.push(`insert:${name}`); return id; },
    patch: async (id: string, value: Row) => { const row = await db.get(id); if (!row) throw new Error("missing");
      for (const [key, entry] of Object.entries(value)) { if (entry === undefined) delete row[key]; else row[key] = structuredClone(entry); } writes.push(`patch:${id}`); },
    delete: async (id: string) => { for (const rows of tables.values()) rows.delete(id); writes.push(`delete:${id}`); },
    query: (name: string) => {
      const filters: ((row: Row) => boolean)[] = [];
      const index = {
        eq: (key: string, value: unknown) => { filters.push(row => row[key] === value); return index; },
        gte: (key: string, value: string) => { filters.push(row => String(row[key]) >= value); return index; },
        lt: (key: string, value: string) => { filters.push(row => String(row[key]) < value); return index; },
      };
      const found = () => [...table(name).values()].filter(row => filters.every(f => f(row))).sort((a, b) => String(a.routeDate).localeCompare(String(b.routeDate)));
      const chain = {
        withIndex: (_name: string, callback: (q: typeof index) => unknown) => { callback(index); return chain; },
        first: async () => found()[0] ?? null,
        unique: async () => { const all = found(); if (all.length > 1) throw new Error("duplicate"); return all[0] ?? null; },
        take: async (count: number) => found().slice(0, count),
        paginate: async ({ numItems, cursor }: { numItems: number; cursor: string | null }) => {
          const start = Number(cursor || 0), all = found();
          return { page: all.slice(start, start + numItems), continueCursor: String(start + numItems), isDone: start + numItems >= all.length };
        },
      };
      return chain;
    },
  };
  const ctx = { db, storage: { delete: async () => { throw new Error("No source PDF may be removed"); } } };
  const run = (fn: unknown, overrides: Row = {}) => (fn as Definition)._handler(ctx, { ...args, ...overrides });
  const read = (overrides: Row = {}) => run(report, { month: "2026-11", paginationOpts: { numItems: 50, cursor: null }, ...overrides }) as Promise<{ page: CeramicReportRow[]; isDone: boolean; continueCursor: string }>;
  return { db, table, put, writes, run, read, shipment: table("ceramicShipments").get("shipment")! };
}

describe("Ceramic assignment → main Planner load and both reports", () => {
  it("creates exactly one main load and a report record, and does nothing on PDF import alone", async () => {
    const f = fixture(); expect(f.table("dailyRoutes").size).toBe(0); expect((await f.read()).page).toEqual([]);
    await f.run(assign);
    const route = [...f.table("dailyRoutes").values()][0];
    expect(route).toMatchObject({ routeDate: "2026-11-22", region: "garden_route", driverName: "Example Driver", truckFleetNoStr: "T100" });
    expect(route.loads).toEqual([ceramicMainLoad(snapshot, "shipment")]);
    const rows = (await f.read()).page; expect(rows).toHaveLength(1); expect(rows[0].locals).toHaveLength(2);
    expect(rows[0]).toMatchObject({ version: 1, weightKg: 32500, needsReview: false, driverName: "Example Driver" });
    expect(f.table("dailyRoutes").size).toBe(1);
    const sheets = ceramicReportSheets(rows); expect(sheets[0].rows).toHaveLength(2); expect(sheets[1].rows).toHaveLength(3);
  });
  it("retries and repeat saves preserve route/load identities and do not duplicate either report", async () => {
    const f = fixture(); await f.run(assign); const first = [...f.table("dailyRoutes").keys()][0];
    for (let i = 0; i < 3; i++) await f.run(assign);
    expect([...f.table("dailyRoutes").keys()]).toEqual([first]); expect(f.table("ceramicAssignments").size).toBe(1);
    expect((await f.read()).page[0].locals).toHaveLength(2);
  });
  it("moves the same load between days/months and updates the reports to the new driver/truck", async () => {
    const f = fixture(); await f.run(assign); await f.run(assign, { driverId: "driver-two", truckId: "truck-two", routeDate: "2026-12-01" });
    expect(f.table("dailyRoutes").size).toBe(1); expect((await f.read()).page).toHaveLength(0);
    const row = (await f.read({ month: "2026-12" })).page[0];
    expect(row).toMatchObject({ driverName: "Replacement Driver", truckFleetNo: "T200", routeDate: "2026-12-01" }); expect(row.locals).toHaveLength(2);
  });
  it("does not append local legs or touch an unrelated manually created route", async () => {
    const f = fixture(); f.put("dailyRoutes", "manual", { routeDate: args.routeDate, driverName: "Example Driver", truckFleetNoStr: "T100", rate: 1234, loads: [{ notes: "Manual" }] });
    const before = structuredClone(f.table("dailyRoutes").get("manual")); await f.run(assign);
    expect(f.table("dailyRoutes").get("manual")).toEqual(before); expect(f.table("dailyRoutes").size).toBe(2);
  });
  it("does not silently sync a revised PDF; flags it until assignment is saved again", async () => {
    const f = fixture(); await f.run(assign);
    const revised = { ...snapshot, version: 2, destinations: [snapshot.destinations[0]], totalWeightKg: 2500, totalPallets: 2 };
    f.shipment.version = 2; f.shipment.snapshot = revised;
    expect((await f.read()).page[0]).toMatchObject({ version: 1, needsReview: true });
    await f.run(assign, { expectedVersion: 2 }); const row = (await f.read()).page[0];
    expect(row).toMatchObject({ version: 2, needsReview: false }); expect(row.locals).toHaveLength(1); expect(f.table("dailyRoutes").size).toBe(1);
  });
  it("keeps manual prices and notes when only reassigning, and refuses to overwrite them for a revised PDF", async () => {
    const f = fixture(); await f.run(assign); const route = [...f.table("dailyRoutes").values()][0];
    const loads = route.loads as Row[]; loads[0].rate = "500"; route.rate = 16250; route.kilometers = 900; route.notes = "Negotiated";
    await f.run(assign, { driverId: "driver-two" }); expect(loads[0].rate).toBe("500"); expect(route.notes).toBe("Negotiated");
    f.shipment.version = 2; f.shipment.snapshot = { ...snapshot, version: 2 };
    const count = f.writes.length;
    await expect(f.run(assign, { expectedVersion: 2 })).rejects.toThrow("manual changes");
    expect(f.writes).toHaveLength(count); expect(loads[0].rate).toBe("500");
  });
  it.each(["completed", "locked", "invoiced"])("protects %s loads from reassignment", async status => {
    const f = fixture(); await f.run(assign); const route = [...f.table("dailyRoutes").values()][0];
    if (status === "invoiced") f.put("invoices", "invoice", { routeId: route._id }); else route.status = status;
    const count = f.writes.length; await expect(f.run(assign, { driverId: "driver-two" })).rejects.toThrow("completed, locked or invoiced"); expect(f.writes).toHaveLength(count);
  });
  it("does not resurrect a deleted linked route or leave a healthy-looking report", async () => {
    const f = fixture(); await f.run(assign); const route = [...f.table("dailyRoutes").values()][0]; route.isDeleted = true;
    expect((await f.read()).page[0].needsReview).toBe(true); await expect(f.run(assign)).rejects.toThrow("Restore"); expect(f.table("dailyRoutes").size).toBe(1);
  });
  it("rejects stale PDFs, partial assignments, impossible dates and missing fleet before any write", async () => {
    for (const override of [{ expectedVersion: 2 }, { driverId: null }, { truckId: null }, { routeDate: "2026-11-31" }, { driverId: "missing" }, { truckId: "missing" }]) {
      const f = fixture(); await expect(f.run(assign, override)).rejects.toThrow(); expect(f.writes).toEqual([]);
    }
  });
  it("rejects missing/expired sessions and cross-region assignment on desktop and mobile", async () => {
    for (const fn of [assign, mobileAssign]) {
      const f = fixture(); await expect(f.run(fn, { token: "invalid" })).rejects.toThrow("Sign in"); expect(f.writes).toEqual([]);
      const g = fixture("regional", "eastern_cape"); await expect(g.run(fn)).rejects.toThrow("not found"); expect(g.writes).toEqual([]);
      const h = fixture(); h.table("sessions").get("session")!.expiresAt = 0; await expect(h.run(fn)).rejects.toThrow("Sign in"); expect(h.writes).toEqual([]);
    }
  });
  it("uses the server-owned region even when a regional user changes the selector", async () => {
    const f = fixture("regional", "garden_route"); await f.run(assign, { region: "eastern_cape" });
    expect((await f.read({ region: "eastern_cape" })).page[0].region).toBe("garden_route");
  });
  it("gives authenticated mobile assignment the same idempotent path", async () => {
    const f = fixture(); await f.run(mobileAssign); await f.run(mobileAssign);
    expect(f.table("dailyRoutes").size).toBe(1); expect((await f.read()).page[0].locals).toHaveLength(2);
  });
  it("prevents deletion of a shipment referenced by Planner/reporting history", async () => {
    const f = fixture(); await f.run(assign);
    await expect(f.run(remove, { expectedUpdatedAt: f.shipment.updatedAt })).rejects.toThrow("reporting history");
    expect(f.table("ceramicShipments").has("shipment")).toBe(true);
  });
  it("scopes reports by region/month and paginates rather than losing older rows", async () => {
    const f = fixture(); await f.run(assign);
    expect((await f.read({ month: "2026-10" })).page).toEqual([]); expect((await f.read({ region: "eastern_cape" })).page).toEqual([]);
    const existing = [...f.table("ceramicAssignments").values()][0]; f.put("ceramicAssignments", "extra", { ...existing, routeDate: "2026-11-23" });
    const first = await f.read({ paginationOpts: { numItems: 1, cursor: null } }); expect(first.page).toHaveLength(1); expect(first.isDone).toBe(false);
    const second = await f.read({ paginationOpts: { numItems: 1, cursor: first.continueCursor } }); expect(second.page).toHaveLength(1); expect(second.isDone).toBe(true);
    await expect(f.read({ month: "2026-13" })).rejects.toThrow("valid report month");
    await expect(f.read({ token: "invalid" })).rejects.toThrow("Sign in");
  });
});

const billing = {ratePerTon:1000,stops:0,drops:1500,crossBorder:"",load:"",locals:[]};
describe("Saved Ceramic template amounts",()=>{
  it("saves inputs on the report only and preserves them on driver/date reassignment",async()=>{
    const f=fixture();await f.run(assign);const route=structuredClone([...f.table("dailyRoutes").values()][0]);
    await f.run(saveReportBilling,{expectedBillingUpdatedAt:0,billing});
    expect((await f.read()).page[0]).toMatchObject({billing,billingSourceVersion:1});expect([...f.table("dailyRoutes").values()][0]).toEqual(route);
    await f.run(assign,{driverId:"driver-two"});expect((await f.read()).page[0].billing).toEqual(billing);
  });
  it("rejects stale edits and never silently overwrites another user's inputs",async()=>{
    const f=fixture();await f.run(assign);await f.run(saveReportBilling,{expectedBillingUpdatedAt:0,billing});const count=f.writes.length;
    await expect(f.run(saveReportBilling,{expectedBillingUpdatedAt:0,billing:{...billing,drops:0}})).rejects.toThrow("Amounts changed");expect(f.writes).toHaveLength(count);
  });
  it("enforces authentication and region scope before editing report prices",async()=>{
    const f=fixture();await f.run(assign);await expect(f.run(saveReportBilling,{token:"invalid",expectedBillingUpdatedAt:0,billing})).rejects.toThrow("Sign in");
    f.table("users").get("user")!.role="regional";f.table("users").get("user")!.region="eastern_cape";
    await expect(f.run(saveReportBilling,{expectedBillingUpdatedAt:0,billing})).rejects.toThrow("not found");
  });
  it("refuses stale versions, foreign local keys and invoiced routes",async()=>{
    for(const reason of ["version","local","invoice"]){const f=fixture();await f.run(assign);
      if(reason==="invoice")f.put("invoices","invoice",{routeId:[...f.table("dailyRoutes").keys()][0]});
      await expect(f.run(saveReportBilling,{expectedBillingUpdatedAt:0,expectedVersion:reason==="version"?2:1,billing:reason==="local"?{...billing,locals:[{key:"foreign",from:"GEO",to:"GEO",price:1}]}:billing})).rejects.toThrow();
    }
  });
});
