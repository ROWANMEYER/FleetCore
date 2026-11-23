import { describe, expect, it } from "vitest";
import { preview, apply } from "@/convex/ceramicRegionMigration";

type Row = Record<string, unknown>;
type Definition = { _handler: (ctx: unknown, args: Row) => Promise<unknown> };
function fixture() {
  const tables = new Map<string, Map<string, Row>>();
  const table = (name: string) => { if (!tables.has(name)) tables.set(name, new Map()); return tables.get(name)!; };
  const put = (name: string, id: string, data: Row) => table(name).set(id, { _id: id, ...data });
  for (const i of [1, 2]) {
    const region = i === 1 ? "garden_route" : "kaap", shipmentNumber = `SH0000000${i}`;
    const snapshot = { shipmentNumber, destinations: [{ name: "Keep source", orders: [] }] };
    put("ceramicShipments", `shipment-${i}`, { region, shipmentNumber, snapshot, fileHash: `hash-${i}`, updatedAt: 10 });
    put("ceramicShipmentVersions", `version-${i}`, { region, shipmentId: `shipment-${i}`, snapshot, storageId: `file-${i}` });
    put("dailyRoutes", `route-${i}`, { ceramicShipmentId: `shipment-${i}`, region, rate: 1234, routeDate: "2026-11-23", status: "locked", loads: [{ client: "Preserve", rate: "500" }], driverName: "Keep driver" });
    put("ceramicAssignments", `assignment-${i}`, { shipmentId: `shipment-${i}`, routeId: `route-${i}`, region, snapshot, routeDate: "2026-11-23", driverId: "driver", truckId: "truck", billingSourceVersion: 1,
      billing: { ratePerTon: 1000, stops: 1500, drops: 0, locals: [{ key: `local-${i}`, from: "GEO", to: "OTHER", price: 2700 }] } });
  }
  put("dailyRoutes", "manual", { region: "eastern_cape", rate: 9999, loads: [{ client: "Unrelated" }] });
  const writes: string[] = [];
  const db = {
    query: (name: string) => {
      const filters: ((row: Row) => boolean)[] = [];
      const index = { eq: (key: string, value: unknown) => { filters.push(row => row[key] === value); return index; } };
      const chain = { withIndex: (_name: string, callback: (q: typeof index) => unknown) => { callback(index); return chain; },
        take: async (n: number) => [...table(name).values()].filter(row => filters.every(filter => filter(row))).slice(0, n) };
      return chain;
    },
    patch: async (id: string, patch: Row) => { const row = [...tables.values()].map(t => t.get(id)).find(Boolean)!; Object.assign(row, structuredClone(patch)); writes.push(id); },
  };
  const run = (fn: unknown, args: Row = {}) => (fn as Definition)._handler({ db }, args);
  const read = () => run(preview) as Promise<{ fingerprint: string; counts: Record<string, number>; blockers: string[] }>;
  return { table, put, writes, run, read };
}
describe("Reviewed Ceramic TRANSVAAL migration", () => {
  it("moves only linked Ceramic classifications, retaining commercial inputs, statuses, source files and load identities", async () => {
    const f = fixture(), manual = structuredClone(f.table("dailyRoutes").get("manual"));
    const route = structuredClone(f.table("dailyRoutes").get("route-1"));
    const shipment = structuredClone(f.table("ceramicShipments").get("shipment-1"));
    const before = await f.read(); expect(before.blockers).toEqual([]);
    expect(before.counts).toEqual({ shipments: 2, versions: 2, assignments: 2, routes: 2, localRoutes: 2 });
    await f.run(apply, { expectedFingerprint: before.fingerprint });
    expect(f.table("dailyRoutes").get("route-1")).toEqual({ ...route, region: "transvaal" });
    expect(f.table("ceramicShipments").get("shipment-1")).toEqual({ ...shipment, region: "transvaal" });
    expect(f.table("dailyRoutes").get("manual")).toEqual(manual);
    expect(f.table("ceramicAssignments").get("assignment-1")).toMatchObject({ region: "transvaal", driverId: "driver", truckId: "truck", billingSourceVersion: 1,
      billing: { ratePerTon: 1000, stops: 1500, drops: 0, locals: [{ key: "local-1", from: "GEORGE", to: "GEORGE", price: 2700 }] } });
    const after = await f.read(); expect(Object.values(after.counts).every(value => value === 0)).toBe(true);
    const writes = f.writes.length; await f.run(apply, { expectedFingerprint: after.fingerprint }); expect(f.writes).toHaveLength(writes);
  });
  it("refuses to overwrite a concurrent commercial edit after the preview", async () => {
    const f = fixture(), before = await f.read(); f.table("dailyRoutes").get("route-1")!.rate = 4321;
    await expect(f.run(apply, { expectedFingerprint: before.fingerprint })).rejects.toThrow("records changed");
    expect(f.writes).toEqual([]); expect(f.table("dailyRoutes").get("route-1")!.rate).toBe(4321);
  });
  it.each(["duplicate number", "duplicate route", "missing link"])("stops before any write on %s", async reason => {
    const f = fixture();
    if (reason === "duplicate number") f.table("ceramicShipments").get("shipment-2")!.shipmentNumber = "SH00000001";
    if (reason === "duplicate route") f.put("dailyRoutes", "duplicate", { ceramicShipmentId: "shipment-1", region: "garden_route" });
    if (reason === "missing link") f.table("ceramicAssignments").get("assignment-1")!.routeId = "missing";
    const before = await f.read(); expect(before.blockers.length).toBeGreaterThan(0);
    await expect(f.run(apply, { expectedFingerprint: before.fingerprint })).rejects.toThrow(); expect(f.writes).toEqual([]);
  });
});
