import { describe, expect, it } from "vitest";
import { ConvexError } from "convex/values";
import { commitBatch } from "@/convex/ceramicTiles";
import { ceramicImportErrors } from "./importValidation";
import { parseCeramicShipmentText, type CeramicShipment } from "./parser";

type Row = Record<string, unknown>;
type Definition = { _handler: (ctx: unknown, args: Row) => Promise<unknown> };
const snapshot: CeramicShipment = { shipmentNumber: "SH00990301", version: 3, totalWeightKg: 79, totalPallets: 1, transporter: null,
  plannedLoadingDate: "2026-11-23", plannedDeliveryDate: "2026-11-24", warnings: [], destinations: [{ name: "EXAMPLE DEPOT", addressLines: ["Example address"],
    orders: [{ deliveryNumber: "1090001613", orderNumber: "", weightKg: 79, collectFrom: "1250-Example Warehouse", palletsEstimate: 1 }] }] };
const file = (source = snapshot) => ({ snapshot: structuredClone(source), fileName: "example.pdf", fileHash: "a".repeat(64), storageId: "pdf" });
function fixture() {
  let sequence = 0;
  const tables = new Map<string, Map<string, Row>>();
  const table = (name: string) => { if (!tables.has(name)) tables.set(name, new Map()); return tables.get(name)!; };
  table("users").set("user", { role: "regional", region: "eastern_cape" });
  table("sessions").set("session", { token: "synthetic", userId: "user", expiresAt: Date.now() + 60000 });
  const writes: string[] = [];
  const db = {
    get: async (id: string) => [...tables.values()].map(rows => rows.get(id)).find(Boolean) ?? null,
    insert: async (name: string, value: Row) => { const id = `${name}-${++sequence}`; table(name).set(id, { _id: id, ...structuredClone(value) }); writes.push(`insert:${name}`); return id; },
    patch: async (id: string, value: Row) => { Object.assign((await db.get(id))!, structuredClone(value)); writes.push(`patch:${id}`); },
    system: { get: async () => ({ contentType: "application/pdf", size: 200 }) },
    query: (name: string) => {
      const filters: ((row: Row) => boolean)[] = [];
      const index = { eq: (key: string, value: unknown) => { filters.push(row => row[key] === value); return index; } };
      return { withIndex: (_name: string, cb: (q: typeof index) => unknown) => { cb(index); return { first: async () => [...table(name).values()].find(row => filters.every(f => f(row))) ?? null }; } };
    },
  };
  const run = (files = [file()]) => (commitBatch as unknown as Definition)._handler({ db }, { token: "synthetic", region: "eastern_cape", files });
  return { table, writes, run };
}
describe("Ceramic PDF import contract", () => {
  it("parses a SAP delivery with a blank Order No. without inventing a reference", () => {
    const parsed = parseCeramicShipmentText(`SHIPMENT SH00990301 79.00 KG
Version: 3
DELIVER TO : EXAMPLE DEPOT
Example address
Delivery : 1090001613 Order No. : 79.00 KG
Collect @ 1250-Example Warehouse
SKU 1.00 EA 1.0 PAL`);
    expect(parsed.ok).toBe(true); if (!parsed.ok) return;
    expect(parsed.shipment.destinations[0].orders[0]).toMatchObject({ deliveryNumber: "1090001613", orderNumber: "", weightKg: 79, palletsEstimate: 1 });
    expect(ceramicImportErrors(parsed.shipment)).toEqual([]);
    expect(parsed.shipment.warnings).toContain("Some deliveries have no order number; delivery references are retained.");
  });
  it("commits blank order numbers, remains idempotent and does not create a Planner load on import", async () => {
    const f = fixture(); expect(await f.run()).toEqual([{ shipmentNumber: snapshot.shipmentNumber, version: 3, status: "created" }]);
    expect([...f.table("ceramicShipments").values()][0]).toMatchObject({ region: "transvaal", snapshot });
    expect(await f.run()).toEqual([{ shipmentNumber: snapshot.shipmentNumber, version: 3, status: "duplicate" }]);
    expect(f.table("ceramicShipments").size).toBe(1); expect(f.table("ceramicShipmentVersions").size).toBe(1); expect(f.table("dailyRoutes").size).toBe(0);
  });
  it("keeps revisions and existing fleet/date fields when importing another blank-order PDF", async () => {
    const f = fixture(); await f.run(); const row = [...f.table("ceramicShipments").values()][0];
    Object.assign(row, { driverId: "driver", truckId: "truck", routeDate: "2026-11-23" });
    await f.run([file({ ...snapshot, version: 4 })]);
    expect(row).toMatchObject({ driverId: "driver", truckId: "truck", routeDate: "2026-11-23", version: 4 });
    expect(f.table("ceramicShipmentVersions").size).toBe(2);
  });
  it.each(["weight", "pallets", "reference", "duplicate", "date"])("still rejects invalid %s before any batch write", async reason => {
    const f = fixture(), bad = structuredClone(snapshot); bad.shipmentNumber = "SH00990302";
    const order = bad.destinations[0].orders[0];
    if (reason === "weight") order.weightKg = -1;
    if (reason === "pallets") order.palletsEstimate = -1;
    if (reason === "reference") order.deliveryNumber = "NOT-A-REFERENCE";
    if (reason === "duplicate") bad.destinations[0].orders.push({ ...order });
    if (reason === "date") bad.plannedLoadingDate = "2026-02-31";
    const issues = ceramicImportErrors(bad); expect(issues.length).toBeGreaterThan(0);
    await expect(f.run([file(), file(bad)])).rejects.toBeInstanceOf(ConvexError);
    await expect(f.run([file(bad)])).rejects.toMatchObject({ data: { message: issues[0] } });
    expect(f.writes).toEqual([]); expect(f.table("ceramicShipments").size).toBe(0);
  });
});
