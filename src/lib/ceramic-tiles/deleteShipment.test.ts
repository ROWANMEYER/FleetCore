import { describe, expect, it, vi } from "vitest";
import { remove, list } from "@/convex/ceramicTiles";
import * as mobile from "@/convex/ceramicTilesMobile";

type Row = Record<string, unknown>;
type Definition = { _handler: (ctx: unknown, args: Row) => Promise<unknown> };
const args = { token: "valid", region: "transvaal", shipmentId: "shipment", expectedVersion: 2, expectedUpdatedAt: 100 };
function fixture(role = "admin", region: string | null = null) {
  const tables = new Map<string, Map<string, Row>>();
  const table = (name: string) => { if (!tables.has(name)) tables.set(name, new Map()); return tables.get(name)!; };
  const put = (name: string, id: string, value: Row) => table(name).set(id, { _id: id, ...value });
  put("users", "user", { role, region });
  put("sessions", "session", { token: "valid", userId: "user", expiresAt: Date.now() + 60000 });
  put("ceramicShipments", "shipment", { region: "transvaal", version: 2, updatedAt: 100 });
  put("ceramicShipments", "other", { region: "transvaal", version: 1, updatedAt: 100 });
  put("ceramicShipmentVersions", "v1", { shipmentId: "shipment", storageId: "pdf1", snapshot: { original: true } });
  put("drivers", "driver", { name: "Example driver" }); put("trucks", "truck", { registration: "EXAMPLE" });
  const db = {
    get: vi.fn(async (id: string) => [...tables.values()].map(rows => rows.get(id)).find(Boolean) ?? null),
    patch: vi.fn(async (id: string, value: Row) => { Object.assign((await db.get(id))!, value); }),
    delete: vi.fn(async () => { throw new Error("No physical record deletion allowed"); }),
    query: (name: string) => {
      const filters: ((row: Row) => boolean)[] = [];
      const index = { eq: (key: string, value: unknown) => { filters.push(row => row[key] === value); return index; } };
      const found = () => [...table(name).values()].filter(row => filters.every(f => f(row)));
      const chain = { withIndex: (_name: string, cb: (q: typeof index) => unknown) => { cb(index); return chain; }, order: () => chain,
        first: async () => found()[0] ?? null, unique: async () => { if (found().length > 1) throw new Error("duplicate"); return found()[0] ?? null; }, take: async (n: number) => found().slice(0, n) };
      return chain;
    },
  };
  const storage = { delete: vi.fn(async () => { throw new Error("No PDF deletion allowed"); }) };
  const ctx = { db, storage };
  const run = (overrides: Row = {}) => (remove as unknown as Definition)._handler(ctx, { ...args, ...overrides });
  const linked = () => {
    put("dailyRoutes", "route", { ceramicShipmentId: "shipment", region: "transvaal", status: "planned", rate: 1234, loads: [{ manualRate: 1234 }] });
    put("ceramicAssignments", "assignment", { shipmentId: "shipment", routeId: "route", billing: { ratePerTon: 123 } });
  };
  return { table, put, db, storage, ctx, run, linked };
}
function noWrites(f: ReturnType<typeof fixture>) {
  expect(f.db.patch).not.toHaveBeenCalled(); expect(f.db.delete).not.toHaveBeenCalled(); expect(f.storage.delete).not.toHaveBeenCalled();
}
describe("Authenticated Ceramic shipment deletion", () => {
  it("hides a draft from active lists while retaining PDFs, revisions and fleet records", async () => {
    const f = fixture(); const before = structuredClone(f.table("ceramicShipmentVersions").get("v1"));
    expect(await f.run()).toEqual({ deleted: true });
    expect(f.table("ceramicShipments").get("shipment")).toMatchObject({ deletedBy: "admin", deletedAt: expect.any(Number) });
    expect(await (list as unknown as Definition)._handler(f.ctx, args)).toEqual([f.table("ceramicShipments").get("other")]);
    expect(f.table("ceramicShipmentVersions").get("v1")).toEqual(before);
    expect(f.table("drivers").size).toBe(1); expect(f.table("trucks").size).toBe(1);
    expect(f.db.delete).not.toHaveBeenCalled(); expect(f.storage.delete).not.toHaveBeenCalled();
  });
  it("soft-deletes the linked planned load and report entry together without erasing amounts", async () => {
    const f = fixture(); f.linked(); await f.run();
    expect(f.table("dailyRoutes").get("route")).toMatchObject({ isDeleted: true, deletedAt: expect.any(Number), rate: 1234, loads: [{ manualRate: 1234 }] });
    expect(f.table("ceramicAssignments").get("assignment")).toMatchObject({ deletedAt: expect.any(Number), billing: { ratePerTon: 123 } });
  });
  it.each(["completed", "locked", "invoiced", "wrong-link", "wrong-region"])("protects %s loads before any write", async reason => {
    const f = fixture(); f.linked(); const route = f.table("dailyRoutes").get("route")!;
    if (reason === "invoiced") f.put("invoices", "invoice", { routeId: "route" });
    else if (reason === "wrong-link") route.ceramicShipmentId = "other";
    else if (reason === "wrong-region") route.region = "kaap";
    else route.status = reason;
    await expect(f.run()).rejects.toThrow(); noWrites(f);
  });
  it("does not delete unrelated loads and catches protected extra links", async () => {
    const f = fixture(); f.linked(); f.put("dailyRoutes", "other-route", { ceramicShipmentId: "other", status: "locked" });
    await f.run(); expect(f.table("dailyRoutes").get("other-route")).not.toHaveProperty("isDeleted");
    const g = fixture(); g.linked(); g.put("dailyRoutes", "extra", { ceramicShipmentId: "shipment", region: "transvaal", status: "completed" });
    await expect(g.run()).rejects.toThrow("completed"); noWrites(g);
  });
  it("rejects invalid and expired sessions", async () => {
    for (const token of ["", "invalid", "valid"]) {
      const f = fixture(); if (token === "valid") f.table("sessions").get("session")!.expiresAt = 0;
      await expect(f.run({ token })).rejects.toThrow("Sign in again"); noWrites(f);
    }
  });
  it("keeps deletion scoped to administrators and the main-load region owner", async () => {
    const f = fixture("regional", "transvaal"); await expect(f.run()).resolves.toEqual({ deleted: true });
    const g = fixture("regional", "kaap"); await expect(g.run()).rejects.toThrow("not found"); noWrites(g);
  });
  it("rejects stale or missing shipments, while a successful delete retry is idempotent", async () => {
    for (const override of [{ expectedVersion: 1 }, { expectedUpdatedAt: 99 }, { shipmentId: "missing" }]) {
      const f = fixture(); await expect(f.run(override)).rejects.toThrow(); noWrites(f);
    }
    const f = fixture(); await f.run(); f.db.patch.mockClear(); await expect(f.run()).resolves.toEqual({ deleted: true }); noWrites(f);
  });
  it("keeps deletion out of the anonymous API", () => expect(Object.keys(mobile).sort()).toEqual(["assign", "fleetChoices", "list", "saveDriverInstructions"]));
});
