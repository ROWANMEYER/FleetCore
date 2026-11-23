import { afterEach, describe, expect, it, vi } from "vitest";
import * as mobile from "@/convex/ceramicTilesMobile";
import { resolveCeramicStopOrder } from "./stopOrder";

type Row = Record<string, unknown>;
type Definition = { exportArgs: () => string; _handler: (ctx: unknown, args: Record<string, unknown>) => Promise<unknown> };
const run = (fn: unknown, ctx: unknown, args: Record<string, unknown> = {}) => (fn as Definition)._handler(ctx, args);
const snapshot = { shipmentNumber: "SH00123456", version: 2, totalWeightKg: 1, totalPallets: 1, transporter: null, plannedLoadingDate: null, plannedDeliveryDate: null, warnings: [], destinations: [{ name: "EXAMPLE STORE", addressLines: [], orders: [{ deliveryNumber: "1001", orderNumber: "SAMPLE", collectFrom: "Betta Krugersdorp", weightKg: 1, palletsEstimate: 1 }] }] };
function fixture() {
  const shipment = { _id: "shipment-one", _creationTime: 1, region: "garden_route", shipmentNumber: "SH00123456", version: 2, snapshot, fileHash: "private-file-hash", updatedAt: 10, updatedBy: "admin", createdAt: 1 };
  const east = { ...shipment, _id: "shipment-east", region: "eastern_cape", updatedAt: 20 };
  const additional = ["transvaal", "kaap", "durban"].map((region, i) => ({ ...shipment, _id: `shipment-${region}`, region, updatedAt: 30 + i }));
  const shipments = [shipment, east, ...additional];
  const driver = { _id: "driver-one", driverName: "Example Driver", phone: "0821234567", privateField: "excluded" };
  const truck = { _id: "truck-one", truckFleetNo: "108", registration: "ABC123GP", privateField: "excluded" };
  const rows = new Map<string, Row>([[shipment._id, shipment], [east._id, east], ...additional.map(row => [row._id, row] as [string, Row]), [driver._id, driver], [truck._id, truck]]);
  const takes: { table: string; count: number; region?: string }[] = [];
  type Chain = { withIndex: (name: string, cb: (q: { eq: (field: string, value: string) => void }) => void) => Chain; order: (direction: string) => Chain; take: (count: number) => Promise<Row[]> };
  const db = {
    get: vi.fn(async (id: string) => rows.get(id) ?? null), patch: vi.fn(async (...args: [string, Row]) => { void args; }),
    query: vi.fn((table: string) => {
      let region: string | undefined;
      const chain: Chain = { withIndex: (_name, cb) => { cb({ eq: (_field, value) => { region = value; } }); return chain; }, order: () => chain,
        take: async count => { takes.push({ table, count, region }); return table === "ceramicShipments" ? shipments.filter(r => r.region === region).slice(0, count) : table === "drivers" ? [driver] : [truck]; } };
      return chain;
    }),
  };
  return { ctx: { db }, db, rows, shipment, takes };
}
const assignment = { shipmentId: "shipment-one", driverId: "driver-one", truckId: "truck-one", expectedVersion: 2 };
const instructions = { shipmentId: "shipment-one", safetyNotes: "  Check the load.  ", additionalNotes: "  Call dispatch.  ", stopOrder: resolveCeramicStopOrder(snapshot), expectedVersion: 2 };
afterEach(() => vi.restoreAllMocks());
describe("Explicit public Ceramic Tiles mobile surface", () => {
  it("exports only dispatch functions, with no import/delete/archive surface", () => expect(Object.keys(mobile).sort()).toEqual(["assign", "fleetChoices", "list", "saveDriverInstructions"]));
  it("takes no session, role or region selector for public reads", () => { expect(Object.keys(JSON.parse((mobile.list as unknown as Definition).exportArgs()).value)).toEqual([]); expect(Object.keys(JSON.parse((mobile.fleetChoices as unknown as Definition).exportArgs()).value)).toEqual([]); });
  it("lists all five indexed regions without exposing import or audit metadata", async () => {
    const f = fixture(); const result = await run(mobile.list, f.ctx) as Row[];
    expect(result.map(r => r.region)).toEqual(["durban", "kaap", "transvaal", "eastern_cape", "garden_route"]);
    expect(result[0]).not.toHaveProperty("fileHash"); expect(result[0]).not.toHaveProperty("createdAt"); expect(result[0]).not.toHaveProperty("updatedBy");
    expect(f.takes).toEqual([{ table: "ceramicShipments", count: 200, region: "garden_route" }, { table: "ceramicShipments", count: 200, region: "eastern_cape" }, ...["transvaal", "kaap", "durban"].map(region => ({ table: "ceramicShipments", count: 200, region }))]);
  });
  it("returns only shared fleet identity/contact fields", async () => {
    const f = fixture(); expect(await run(mobile.fleetChoices, f.ctx)).toEqual({ drivers: [{ id: "driver-one", name: "Example Driver", phone: "0821234567" }], trucks: [{ id: "truck-one", fleetNumber: "108", registration: "ABC123GP" }] });
    expect(f.takes.every(t => t.count === 5000)).toBe(true);
  });
  it("requires a session before assignment can write to Planner or reports", async () => {
    const f = fixture();
    await expect(run(mobile.assign, f.ctx, { ...assignment, routeDate: "2026-11-22" })).rejects.toThrow("Sign in");
    expect(f.db.patch).not.toHaveBeenCalled();
  });
  it("saves only trimmed instructions/order with the reviewed version", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1000); const f = fixture(); await run(mobile.saveDriverInstructions, f.ctx, instructions);
    expect(f.db.patch).toHaveBeenCalledWith("shipment-one", { driverInstructions: { safetyNotes: "Check the load.", additionalNotes: "Call dispatch.", stopOrder: instructions.stopOrder, reviewedVersion: 2, updatedAt: 1000, updatedBy: "public:ceramic-mobile" }, updatedAt: 1000, updatedBy: "public:ceramic-mobile" });
  });
  it("rejects a stale instruction review before writing", async () => { const f = fixture(); await expect(run(mobile.saveDriverInstructions, f.ctx, { ...instructions, expectedVersion: 1 })).rejects.toThrow("Shipment updated"); expect(f.db.patch).not.toHaveBeenCalled(); });
  it("rejects missing, duplicate or foreign stops without writing", async () => {
    for (const offloads of [[], ["foreign"], [...instructions.stopOrder.offloads, ...instructions.stopOrder.offloads]]) { const f = fixture(); await expect(run(mobile.saveDriverInstructions, f.ctx, { ...instructions, stopOrder: { ...instructions.stopOrder, offloads } })).rejects.toThrow("invalid"); expect(f.db.patch).not.toHaveBeenCalled(); }
  });
  it("rejects oversized notes without writing", async () => { const f = fixture(); await expect(run(mobile.saveDriverInstructions, f.ctx, { ...instructions, safetyNotes: "x".repeat(4001) })).rejects.toThrow("4,000"); expect(f.db.patch).not.toHaveBeenCalled(); });
});
