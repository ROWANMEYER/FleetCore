import { describe, expect, it, vi } from "vitest";
import { remove } from "@/convex/ceramicTiles";
import * as mobile from "@/convex/ceramicTilesMobile";

type Row = Record<string, unknown>;
type Definition = { _handler: (ctx: unknown, args: Record<string, unknown>) => Promise<unknown> };
const args = { token: "valid", region: "garden_route", shipmentId: "shipment", expectedVersion: 2, expectedUpdatedAt: 100 };
function fixture(role = "admin", region: string | null = null) {
  const rows = new Map<string, Row>([
    ["user", { role, region }],
    ["shipment", { _id: "shipment", region: "garden_route", version: 2, updatedAt: 100 }],
    ["other-shipment", { _id: "other-shipment", region: "eastern_cape" }],
    ["driver", { name: "Example driver" }], ["truck", { registration: "EXAMPLE" }],
    ["v1", { _id: "v1", shipmentId: "shipment", storageId: "pdf1" }],
    ["v2", { _id: "v2", shipmentId: "shipment", storageId: "shared" }],
    ["v3", { _id: "v3", shipmentId: "shipment", storageId: "pdf1" }],
    ["other-version", { _id: "other-version", shipmentId: "other-shipment", storageId: "shared" }],
  ]);
  const reads: { index: string; field: string; value: string }[] = [];
  const session: Row = { userId: "user", expiresAt: Date.now() + 60000 };
  const db = {
    get: vi.fn(async (id: string) => rows.get(id) ?? null),
    delete: vi.fn(async (id: string) => { rows.delete(id); }),
    query: (table: string) => ({ withIndex: (index: string, cb: (q: { eq: (field: string, value: string) => void }) => void) => {
      let field = "", value = "";
      cb({ eq: (f, v) => { field = f; value = v; } });
      reads.push({ index, field, value });
      const found = () => table === "sessions" ? value === "valid" ? [session] : [] : [...rows.values()].filter(r => r[field] === value);
      return { first: async () => found()[0] ?? null, take: async (n: number) => found().slice(0, n) };
    } }),
  };
  const storage = { delete: vi.fn(async (id: string) => { void id; }) };
  const ctx = { db, storage };
  return { rows, db, storage, reads, session, run: (overrides: Row = {}) => (remove as unknown as Definition)._handler(ctx, { ...args, ...overrides }) };
}
function noDeletes(f: ReturnType<typeof fixture>) {
  expect(f.db.delete).not.toHaveBeenCalled(); expect(f.storage.delete).not.toHaveBeenCalled();
}
describe("Authenticated Ceramic Tiles shipment deletion", () => {
  it("deletes only the target and all its revisions, deduplicates PDFs and keeps shared files/fleet", async () => {
    const f = fixture(); expect(await f.run()).toEqual({ deleted: true });
    expect([...f.rows.keys()].sort()).toEqual(["driver", "other-shipment", "other-version", "truck", "user"]);
    expect(f.storage.delete.mock.calls).toEqual([["pdf1"]]);
    expect(f.reads).toContainEqual({ index: "by_shipment", field: "shipmentId", value: "shipment" });
    expect(f.reads).toContainEqual({ index: "by_storage", field: "storageId", value: "shared" });
  });
  it("rejects missing, invalid and expired sessions before any deletion", async () => {
    for (const token of ["", "invalid", "valid"]) {
      const f = fixture(); if (token === "valid") f.session.expiresAt = 0;
      await expect(f.run({ token })).rejects.toThrow("Sign in again"); noDeletes(f);
    }
  });
  it("allows a regional user to delete their own region regardless of the client selector", async () => {
    const f = fixture("regional", "garden_route"); await expect(f.run({ region: "eastern_cape" })).resolves.toEqual({ deleted: true });
  });
  it("rejects cross-region IDs and regional users without a region", async () => {
    const f = fixture("regional", "eastern_cape"); await expect(f.run()).rejects.toThrow("not found"); noDeletes(f);
    const g = fixture("regional"); await expect(g.run()).rejects.toThrow("no region"); noDeletes(g);
  });
  it("rejects a missing or already-deleted shipment without touching revisions/PDFs", async () => {
    const f = fixture(); f.rows.delete("shipment"); await expect(f.run()).rejects.toThrow("not found"); noDeletes(f);
  });
  it("rejects newer versions and concurrent assignment/instruction changes", async () => {
    for (const override of [{ expectedVersion: 1 }, { expectedUpdatedAt: 99 }]) {
      const f = fixture(); await expect(f.run(override)).rejects.toThrow("Shipment changed"); noDeletes(f);
    }
  });
  it("handles legacy revisions without files and a shipment without revisions", async () => {
    for (const legacy of [true, false]) {
      const f = fixture(); for (const id of ["v1", "v2", "v3"]) f.rows.delete(id);
      if (legacy) f.rows.set("legacy", { _id: "legacy", shipmentId: "shipment" });
      await expect(f.run()).resolves.toEqual({ deleted: true }); expect(f.storage.delete).not.toHaveBeenCalled();
    }
  });
  it("refuses an oversized revision history before any delete", async () => {
    const f = fixture(); for (let i=0; i<501; i++) f.rows.set(`extra${i}`, { _id: `extra${i}`, shipmentId: "shipment" });
    await expect(f.run()).rejects.toThrow("too many revisions"); noDeletes(f);
  });
  it("keeps deletion out of the anonymous mobile API", () => expect(Object.keys(mobile).sort()).toEqual(["assign", "fleetChoices", "list", "saveDriverInstructions"]));
});
