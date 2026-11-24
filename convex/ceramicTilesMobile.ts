import { REGIONS } from "../src/lib/regions";
import { resolveUserScope } from "./userSessions";
import { ceramicAssignedAt, ceramicAssignmentError, syncCeramicAssignment } from "./ceramicPlanning";
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { ceramicRegion, ceramicShipmentSnapshot, ceramicStopOrder } from "./ceramicTilesFields";
import { assertCeramicStopOrder } from "../src/lib/ceramic-tiles/stopOrder";

// Explicitly public dispatch access authorized by the owner. No import, delete,
// history/archive or general Operations endpoints belong on this surface.
const publicActor = "public:ceramic-mobile";
const savedResult = v.object({ saved: v.boolean(), updatedAt: v.number() });
const dispatchShipment = v.object({
  _id: v.id("ceramicShipments"), region: ceramicRegion, shipmentNumber: v.string(),
  version: v.number(), snapshot: ceramicShipmentSnapshot, updatedAt: v.number(),
  assignedAt: v.optional(v.number()), routeDate: v.optional(v.string()), plannerVersion: v.optional(v.number()),
  driverId: v.optional(v.id("drivers")), truckId: v.optional(v.id("trucks")),
  driverInstructions: v.optional(v.object({
    stopOrder: v.optional(ceramicStopOrder), reviewedVersion: v.optional(v.number()),
    safetyNotes: v.string(), additionalNotes: v.string(), updatedAt: v.number(), updatedBy: v.string(),
  })),
});
function assertVersion(actual: number, expected: number) {
  if (!Number.isInteger(expected) || expected < 1 || actual !== expected) {
    throw ceramicAssignmentError("Shipment updated. Reopen it and review the latest version before saving.", "CERAMIC_VERSION_CHANGED");
  }
}

/** Public mobile list across every supported region; original files are excluded. */
export const list = query({
  args: {}, returns: v.array(dispatchShipment),
  handler: async ctx => {
    const regions = REGIONS;
    const rows = (await Promise.all(regions.map(region => ctx.db.query("ceramicShipments")
      .withIndex("by_region_active_updated", q => q.eq("region", region).eq("deletedAt", undefined)).order("desc").take(200)))).flat();
    return await Promise.all(rows.sort((a, b) => b.updatedAt - a.updatedAt || b._creationTime - a._creationTime).map(async row => {
      const assignedAt = await ceramicAssignedAt(ctx, row);
      return {
        _id: row._id, region: row.region, shipmentNumber: row.shipmentNumber,
      version: row.version, snapshot: row.snapshot, updatedAt: row.updatedAt,
      ...(assignedAt !== undefined ? { assignedAt } : {}),
      ...(row.routeDate ? { routeDate: row.routeDate } : {}), ...(row.plannerVersion !== undefined ? { plannerVersion: row.plannerVersion } : {}),
      ...(row.driverId ? { driverId: row.driverId } : {}), ...(row.truckId ? { truckId: row.truckId } : {}),
      ...(row.driverInstructions ? { driverInstructions: row.driverInstructions } : {}),
      };
    }));
  },
});

/** Only the existing shared fleet fields needed for assignment/WhatsApp. */
export const fleetChoices = query({
  args: {},
  returns: v.object({
    drivers: v.array(v.object({ id: v.id("drivers"), name: v.string(), phone: v.union(v.string(), v.null()) })),
    trucks: v.array(v.object({ id: v.id("trucks"), fleetNumber: v.string(), registration: v.union(v.string(), v.null()) })),
  }),
  handler: async ctx => {
    const [drivers, trucks] = await Promise.all([ctx.db.query("drivers").take(5000), ctx.db.query("trucks").take(5000)]);
    return {
      drivers: drivers.map(driver => ({ id: driver._id, name: driver.driverName ?? driver.name ?? "", phone: driver.phone ?? null }))
        .filter(driver => driver.name.trim()).sort((a, b) => a.name.localeCompare(b.name)),
      trucks: trucks.map(truck => ({ id: truck._id, fleetNumber: String(truck.truckFleetNo || truck.fleetNumber || ""), registration: truck.registration ?? null }))
        .sort((a, b) => a.fleetNumber.localeCompare(b.fleetNumber, undefined, { numeric: true })),
    };
  },
});

/** Planner-linked assignments require login; public browsing/instructions remain available. */
export const assign = mutation({
  args: { shipmentId: v.id("ceramicShipments"), driverId: v.id("drivers"), truckId: v.id("trucks"), expectedVersion: v.number(), token: v.optional(v.string()), routeDate: v.string() },
  returns: savedResult,
  handler: async (ctx, args) => {
    const scope = await resolveUserScope(ctx, args.token);
    if (!scope) throw ceramicAssignmentError("Sign in to assign the main load to Daily Planner and reports.", "CERAMIC_SIGN_IN_REQUIRED");
    const shipment = await ctx.db.get(args.shipmentId);
    if (!shipment || shipment.deletedAt !== undefined) throw ceramicAssignmentError("Shipment not found. Return to shipments and refresh the list.", "CERAMIC_SHIPMENT_REMOVED");
    assertVersion(shipment.version, args.expectedVersion);
    const actor = scope.role === "regional" ? `regional:${shipment.region}` : "admin";
    const result = await syncCeramicAssignment(ctx, shipment, { driverId: args.driverId, truckId: args.truckId, routeDate: args.routeDate, actor });
    const now = Date.now();
    await ctx.db.patch(shipment._id, { driverId: args.driverId, truckId: args.truckId, routeDate: args.routeDate, plannerVersion: shipment.version, assignedAt: result.assignedAt, assignmentResetAt: undefined, updatedAt: now, updatedBy: actor });
    return { saved: true, updatedAt: now };
  },
});

/** Public dispatch saves only notes/order for the reviewed shipment version. */
export const saveDriverInstructions = mutation({
  args: { shipmentId: v.id("ceramicShipments"), safetyNotes: v.string(), additionalNotes: v.string(), stopOrder: ceramicStopOrder, expectedVersion: v.number() },
  returns: savedResult,
  handler: async (ctx, args) => {
    const shipment = await ctx.db.get(args.shipmentId);
    if (!shipment || shipment.deletedAt !== undefined) throw ceramicAssignmentError("Shipment not found. Return to shipments and refresh the list.", "CERAMIC_SHIPMENT_REMOVED");
    assertVersion(shipment.version, args.expectedVersion);
    if (args.safetyNotes.length > 4000 || args.additionalNotes.length > 4000) throw new Error("Each instruction field has a 4,000-character limit.");
    assertCeramicStopOrder(shipment.snapshot, args.stopOrder);
    const now = Date.now();
    await ctx.db.patch(shipment._id, {
      driverInstructions: { ...shipment.driverInstructions, safetyNotes: args.safetyNotes.trim(), additionalNotes: args.additionalNotes.trim(),
        stopOrder: args.stopOrder, reviewedVersion: shipment.version, updatedAt: now, updatedBy: publicActor },
      updatedAt: now, updatedBy: publicActor,
    });
    return { saved: true, updatedAt: now };
  },
});
