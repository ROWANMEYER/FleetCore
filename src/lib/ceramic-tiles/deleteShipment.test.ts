import { describe, expect, it, vi } from "vitest";
import { remove, list, restore, previewBatch } from "@/convex/ceramicTiles";
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
  let sequence = 0;
  const db = {
    insert: vi.fn(async (name: string, value: Row) => { const id = `audit-${++sequence}`; put(name, id, value); return id; }),
    get: vi.fn(async (id: string) => [...tables.values()].map(rows => rows.get(id)).find(Boolean) ?? null),
    patch: vi.fn(async (id: string, value: Row) => { const row = (await db.get(id))!; for (const [key, entry] of Object.entries(value)) { if (entry === undefined) delete row[key]; else row[key] = structuredClone(entry); } }),
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
    put("ceramicAssignments", "assignment", { shipmentId: "shipment", routeId: "route", region: "transvaal", billing: { ratePerTon: 123 } });
  };
  return { table, put, db, storage, ctx, run, linked };
}
function noWrites(f: ReturnType<typeof fixture>) {
  expect(f.db.insert).not.toHaveBeenCalled(); expect(f.db.patch).not.toHaveBeenCalled(); expect(f.db.delete).not.toHaveBeenCalled(); expect(f.storage.delete).not.toHaveBeenCalled();
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

const recover = (f: ReturnType<typeof fixture>, overrides: Row = {}) => (restore as unknown as Definition)._handler(f.ctx, { ...args, expectedUpdatedAt: f.table("ceramicShipments").get("shipment")!.updatedAt, ...overrides });
describe("Explicit deleted-shipment recovery", () => {
  it("restores a draft without creating Planner or report records and retains an audit", async () => {
    const f = fixture(); await f.run();
    const deleted = structuredClone(f.table("ceramicShipments").get("shipment")!);
    const versions = structuredClone([...f.table("ceramicShipmentVersions").values()]);
    expect(await recover(f)).toEqual({ restored: true });
    expect(f.table("ceramicShipments").get("shipment")).not.toHaveProperty("deletedAt");
    expect(f.table("dailyRoutes").size).toBe(0); expect(f.table("ceramicAssignments").size).toBe(0);
    expect([...f.table("ceramicShipmentVersions").values()]).toEqual(versions);
    expect([...f.table("ceramicShipmentRestorations").values()]).toEqual([expect.objectContaining({ shipmentId: "shipment", deletedAt: deleted.deletedAt, deletedBy: "admin", restoredBy: "admin", routeIds: [] })]);
  });
  it("restores the original assignment and main route without changing money or making duplicates", async () => {
    const f = fixture(); f.linked(); await f.run();
    const route = structuredClone(f.table("dailyRoutes").get("route")!);
    expect(await recover(f)).toEqual({ restored: true });
    const { deletedAt: _deletedAt, ...retained } = route; void _deletedAt;
    expect(f.table("dailyRoutes").get("route")).toEqual({ ...retained, isDeleted: false });
    expect(f.table("ceramicAssignments").get("assignment")).toMatchObject({ billing: { ratePerTon: 123 }, routeId: "route" });
    expect(f.table("ceramicAssignments").get("assignment")).not.toHaveProperty("deletedAt");
    expect(f.table("dailyRoutes").size).toBe(1); expect(f.table("ceramicAssignments").size).toBe(1);
    expect(await recover(f)).toEqual({ restored: false }); expect(f.table("ceramicShipmentRestorations").size).toBe(1);
  });
  it("keeps older, separately removed routes deleted across repeated recovery cycles", async () => {
    const f = fixture(); f.linked(); f.put("dailyRoutes", "old", { ceramicShipmentId: "shipment", region: "transvaal", status: "planned", isDeleted: true, deletedAt: 5 });
    for (let i = 0; i < 2; i++) {
      await f.run({ expectedUpdatedAt: f.table("ceramicShipments").get("shipment")!.updatedAt });
      await recover(f);
      expect(f.table("dailyRoutes").get("old")).toMatchObject({ isDeleted: true, deletedAt: 5 });
    }
    expect(f.table("ceramicShipmentRestorations").size).toBe(2);
  });
  it.each(["locked", "completed", "invoiced", "active-route", "foreign-link", "foreign-region", "missing-route", "different-deletion", "active-assignment", "extra-route"])("rejects %s before any restore write", async reason => {
    const f = fixture(); f.linked(); await f.run();
    const route = f.table("dailyRoutes").get("route")!, assignment = f.table("ceramicAssignments").get("assignment")!;
    if (reason === "invoiced") f.put("invoices", "invoice", { routeId: "route" });
    else if (reason === "active-route") route.isDeleted = false;
    else if (reason === "foreign-link") route.ceramicShipmentId = "other";
    else if (reason === "foreign-region") route.region = "kaap";
    else if (reason === "missing-route") f.table("dailyRoutes").delete("route");
    else if (reason === "different-deletion") route.deletedAt = 5;
    else if (reason === "active-assignment") delete assignment.deletedAt;
    else if (reason === "extra-route") f.put("dailyRoutes", "extra", { ...route, _id: "extra" });
    else route.status = reason;
    f.db.patch.mockClear(); await expect(recover(f)).rejects.toThrow(); noWrites(f);
  });
  it("keeps recovery restricted to the administrator or main-region owner", async () => {
    const f = fixture("regional", "transvaal"); await f.run(); await expect(recover(f)).resolves.toEqual({ restored: true });
    const g = fixture(); await g.run(); g.table("users").get("user")!.role = "regional"; g.table("users").get("user")!.region = "kaap";
    g.db.patch.mockClear(); await expect(recover(g)).rejects.toThrow("not found"); noWrites(g);
    const h = fixture(); await h.run(); h.db.patch.mockClear();
    for (const override of [{ token: "invalid" }, { expectedVersion: 1 }, { expectedUpdatedAt: 99 }, { shipmentId: "missing" }]) await expect(recover(h, override)).rejects.toThrow();
    h.table("sessions").get("session")!.expiresAt = 0; await expect(recover(h)).rejects.toThrow("Sign in"); noWrites(h);
  });
  it("exposes a fresh recovery target only for deleted import matches", async () => {
    const f = fixture(); Object.assign(f.table("ceramicShipments").get("shipment")!, { shipmentNumber: "SH00130726", fileHash: "a".repeat(64) });
    const compare = () => (previewBatch as unknown as Definition)._handler(f.ctx, { token: "valid", region: "transvaal", files: [{ shipmentNumber: "SH00130726", version: 2, fileHash: "a".repeat(64) }] });
    await f.run(); expect(await compare()).toEqual([expect.objectContaining({ status: "deleted", restoreTarget: { shipmentId: "shipment", updatedAt: f.table("ceramicShipments").get("shipment")!.updatedAt } })]);
    await recover(f); expect(await compare()).toEqual([expect.objectContaining({ status: "duplicate", restoreTarget: null })]);
  });
});
