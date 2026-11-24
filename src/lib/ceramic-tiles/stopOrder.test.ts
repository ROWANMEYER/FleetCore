import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CeramicShipment } from "./parser";
import { assertCeramicStopOrder, ceramicStops, moveCeramicStop, reorderCeramicStop, orderedCeramicStops, resolveCeramicStopOrder, type CeramicStopOrder } from "./stopOrder";
import { buildCeramicDriverMessage } from "./driverInstructions";
import { saveDriverInstructions } from "@/convex/ceramicTiles";

const { scope } = vi.hoisted(() => ({ scope: vi.fn() }));
vi.mock("@/convex/userSessions", async importOriginal => ({ ...await importOriginal<typeof import("@/convex/userSessions")>(), resolveUserScope: scope }));
const order = (deliveryNumber: string, collectFrom: string) => ({ deliveryNumber, collectFrom, orderNumber: "SAMPLE", weightKg: 1, palletsEstimate: 1 });
const shipment: CeramicShipment = {
  shipmentNumber: "SH00123456", version: 1, totalPallets: 4, totalWeightKg: 4, transporter: null, plannedLoadingDate: null, plannedDeliveryDate: null, warnings: [],
  destinations: [
    { name: "SHOP01-EXAMPLE TILES", addressLines: ["1 Sample Road"], orders: [order("1001", "1100-Betta Sanitaryware Krugersdorp"), order("1002", "1700-Gryphon Vereeniging")] },
    { name: "SHOP01-EXAMPLE TILES", addressLines: ["2 Sample Road"], orders: [order("1003", "1500-Betta Baths Krugersdorp")] },
    { name: "SHOP02-SECOND STORE", addressLines: [], orders: [order("1004", "1900-Pegasus Vereeniging")] },
  ],
};
const reversed = (): CeramicStopOrder => {
  const original = resolveCeramicStopOrder(shipment);
  return { pickupTowns: [...original.pickupTowns].reverse(), pickupWarehouses: [...original.pickupWarehouses].reverse(), offloads: [...original.offloads].reverse() };
};

describe("Ceramic stop ordering", () => {
  it("reorders towns, warehouses and offloads independently in the actual message", () => {
    const stops = orderedCeramicStops(shipment, reversed());
    expect(stops.pickups.map(town => town.label)).toEqual(["VEREENIGING", "KRUGERSDORP"]);
    expect(stops.pickups[0].warehouses.map(stop => stop.label)).toEqual(["PEGASUS", "GRYPHON"]);
    expect(stops.pickups[1].warehouses.map(stop => stop.label)).toEqual(["BETTA BATHS", "BETTA"]);
    const draft = buildCeramicDriverMessage({ shipment, driverName: "Example", truckNumber: "147", safetyNotes: "", additionalNotes: "", stopOrder: reversed() });
    expect(draft).toContain("PICK UP 1) VEREENIGING\n1. PEGASUS\n2. GRYPHON");
    expect(draft).toContain("PLEASE OFFLOAD AS FOLLOW:\n1. SECOND STORE\n2. EXAMPLE TILES\n3. EXAMPLE TILES");
    expect(shipment.destinations[0].orders[0].deliveryNumber).toBe("1001");
  });
  it("groups Samca warehouses under BABELEGI in stops and driver instructions", () => {
    const source = structuredClone(shipment);
    source.destinations = source.destinations.slice(0, 1);
    source.destinations[0].orders[0].collectFrom = "3000-Samca 1 Babelegi, Hammanskraal, RSA";
    source.destinations[0].orders[1].collectFrom = "2100-Samca Wall Tiles Babalegi, Hammanskraal, RSA";
    const stops = ceramicStops(source);
    expect(stops.pickups).toHaveLength(1);
    expect(stops.pickups[0]).toMatchObject({ id: "BABELEGI", label: "BABELEGI" });
    expect(stops.pickups[0].warehouses.map(w => w.label)).toEqual(["SAMCA 1", "SAMCA WALL TILES"]);
    const draft = buildCeramicDriverMessage({ shipment: source, driverName: "Example", truckNumber: "147", safetyNotes: "", additionalNotes: "" });
    expect(draft).toContain("PICK UP 1) BABELEGI\n1. SAMCA 1\n2. SAMCA WALL TILES");
    expect(draft).not.toContain("COLLECTION TOWN TO BE CONFIRMED");
  });
  it("keeps same-name destinations distinct by their delivery references", () => {
    const stops = ceramicStops(shipment);
    expect(stops.offloads[0].id).not.toBe(stops.offloads[1].id);
    expect(stops.offloads[0].detail).toBe("1 Sample Road");
    const rearranged = { ...shipment, destinations: [...shipment.destinations].reverse() };
    expect(orderedCeramicStops(rearranged, reversed()).offloads.map(stop => stop.id)).toEqual(reversed().offloads);
  });
  it("reconciles a revised PDF by retaining surviving order and appending new stops", () => {
    const revised = { ...shipment, destinations: [shipment.destinations[0], { name: "NEW03-NEW STORE", addressLines: [], orders: [order("1005", "1600-VITRO Vereeniging")] }] };
    const result = resolveCeramicStopOrder(revised, reversed());
    expect(result.offloads).toEqual([JSON.stringify(["1001", "1002"]), JSON.stringify(["1005"])]);
    expect(orderedCeramicStops(revised, result).pickups[0].warehouses.map(stop => stop.label)).toEqual(["GRYPHON", "VITRO"]);
    expect(() => assertCeramicStopOrder(revised, result)).not.toThrow();
  });
  it("rejects missing, repeated and foreign stop identities before saving", () => {
    const valid = resolveCeramicStopOrder(shipment);
    for (const offloads of [valid.offloads.slice(1), [valid.offloads[0], valid.offloads[0], valid.offloads[2]], [...valid.offloads.slice(1), "foreign"]]) {
      expect(() => assertCeramicStopOrder(shipment, { ...valid, offloads })).toThrow(/stop order is invalid/);
    }
  });
  it("drops a stop directly at any target position without mutating the source", () => {
    const ids = ["a", "b", "c", "d"];
    expect(reorderCeramicStop(ids, "d", "a")).toEqual(["d", "a", "b", "c"]);
    expect(reorderCeramicStop(ids, "a", "d")).toEqual(["b", "c", "d", "a"]);
    expect(reorderCeramicStop(ids, "b", "b")).toEqual(ids);
    expect(reorderCeramicStop(ids, "b", "foreign")).toEqual(ids);
    expect(ids).toEqual(["a", "b", "c", "d"]);
  });
  it("moves one position and keeps boundary/unknown moves unchanged", () => {
    expect(moveCeramicStop(["a", "b", "c"], "b", -1)).toEqual(["b", "a", "c"]);
    expect(moveCeramicStop(["a", "b"], "a", -1)).toEqual(["a", "b"]);
    expect(moveCeramicStop(["a", "b"], "b", 1)).toEqual(["a", "b"]);
    expect(moveCeramicStop(["a", "b"], "unknown", 1)).toEqual(["a", "b"]);
  });
});

const invoke = (saveDriverInstructions as unknown as { _handler: (ctx: unknown, args: unknown) => Promise<unknown> })._handler;
const args = { token: "fixture-token", region: "garden_route", shipmentId: "fixture-shipment", safetyNotes: "Safety", additionalNotes: "Dispatch", stopOrder: reversed() };
const context = () => ({ db: { get: vi.fn().mockResolvedValue({ _id: "fixture-shipment", version: 1, region: "garden_route", snapshot: shipment, driverInstructions: { safetyNotes: "Old", additionalNotes: "Old", stopOrder: reversed() } }), patch: vi.fn().mockResolvedValue(undefined) } });
describe("Saved stop-order mutation", () => {
  beforeEach(() => { scope.mockReset(); scope.mockResolvedValue({ role: "admin" }); });
  it("saves the selected order under authenticated dispatch instructions only", async () => {
    const ctx = context();
    await invoke(ctx, args);
    expect(ctx.db.patch).toHaveBeenCalledWith("fixture-shipment", expect.objectContaining({ driverInstructions: expect.objectContaining({ stopOrder: reversed(), safetyNotes: "Safety" }) }));
    expect(Object.keys(ctx.db.patch.mock.calls[0][1]).sort()).toEqual(["driverInstructions", "updatedAt", "updatedBy"]);
  });
  it("preserves saved ordering when an older client saves notes without an order", async () => {
    const ctx = context();
    await invoke(ctx, { ...args, stopOrder: undefined });
    expect(ctx.db.patch).toHaveBeenCalledWith("fixture-shipment", expect.objectContaining({ driverInstructions: expect.objectContaining({ stopOrder: reversed() }) }));
  });
  it("marks only the version actually reviewed and rejects a stale client", async () => {
    const ctx = context();
    await invoke(ctx, { ...args, expectedVersion: 1 });
    expect(ctx.db.patch).toHaveBeenCalledWith("fixture-shipment", expect.objectContaining({ driverInstructions: expect.objectContaining({ reviewedVersion: 1 }) }));
    ctx.db.patch.mockClear();
    await expect(invoke(ctx, { ...args, expectedVersion: 2 })).rejects.toThrow(/Shipment updated/);
    expect(ctx.db.patch).not.toHaveBeenCalled();
  });
  it("does not mark a newer version reviewed when an older client only saves notes", async () => {
    const ctx = context();
    ctx.db.get.mockResolvedValue({ _id: "fixture-shipment", version: 2, region: "garden_route", snapshot: { ...shipment, version: 2 }, driverInstructions: { safetyNotes: "Old", additionalNotes: "Old", stopOrder: reversed(), reviewedVersion: 1 } });
    await invoke(ctx, args);
    expect(ctx.db.patch).toHaveBeenCalledWith("fixture-shipment", expect.objectContaining({ driverInstructions: expect.objectContaining({ reviewedVersion: 1 }) }));
  });
  it("rejects missing sessions and forged permutations while permitting shared dispatch", async () => {
    const ctx = context();
    scope.mockResolvedValueOnce(null);
    await expect(invoke(ctx, args)).rejects.toThrow(/Sign in again/);
    scope.mockResolvedValueOnce({ role: "regional", region: "eastern_cape" });
    await expect(invoke(ctx, args)).resolves.toMatchObject({ saved: true });
    ctx.db.patch.mockClear();
    await expect(invoke(ctx, { ...args, stopOrder: { ...reversed(), offloads: [] } })).rejects.toThrow(/stop order is invalid/);
    expect(ctx.db.patch).not.toHaveBeenCalled();
  });
});
