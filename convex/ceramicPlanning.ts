import { ceramicBilledMainLoad } from "../src/lib/ceramic-tiles/billing";
import { ConvexError } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { CERAMIC_MAIN_REGION, ceramicEqual, ceramicMainLoad, validCeramicDate } from "../src/lib/ceramic-tiles/planning";

/** Expected assignment failures are safe to show on production clients. */
export function ceramicAssignmentError(message: string, code = "CERAMIC_ASSIGNMENT_REVIEW") {
  return new ConvexError({ code, message });
}

/** Older shipments retain their original assignment day without a data migration. */
export async function ceramicAssignedAt(ctx: QueryCtx, shipment: Doc<"ceramicShipments">): Promise<number | undefined> {
  if (shipment.assignedAt !== undefined || !shipment.driverId || !shipment.truckId) return shipment.assignedAt;
  const assignment = await ctx.db.query("ceramicAssignments").withIndex("by_shipment", q => q.eq("shipmentId", shipment._id)).unique();
  return assignment?.createdAt;
}

/** Called only after authentication and region enforcement, in the assignment transaction. */
export async function syncCeramicAssignment(ctx: MutationCtx, shipment: Doc<"ceramicShipments">, input: {
  driverId: Id<"drivers">; truckId: Id<"trucks">; routeDate: string; actor: string;
}) {
  if (shipment.deletedAt !== undefined) throw ceramicAssignmentError("This shipment was deleted. Return to the shipment list.");
  if (!validCeramicDate(input.routeDate)) throw ceramicAssignmentError("Choose a valid planning date.");
  if (shipment.snapshot.destinations.length === 0) throw ceramicAssignmentError("Review shipment destinations before assigning.");
  const [driver, truck, existing] = await Promise.all([
    ctx.db.get(input.driverId), ctx.db.get(input.truckId),
    ctx.db.query("ceramicAssignments").withIndex("by_shipment", q => q.eq("shipmentId", shipment._id)).unique(),
  ]);
  const reassigning = shipment.assignmentResetAt !== undefined;
  if (existing?.deletedAt !== undefined && !reassigning) throw ceramicAssignmentError("This shipment assignment was deleted. Return to the shipment list.");
  if (reassigning) {
    const route = existing ? await ctx.db.get(existing.routeId) : null;
    if (!existing || existing.deletedAt === undefined || !route || !route.isDeleted || route.ceramicShipmentId !== shipment._id || route.region !== existing.region) {
      throw ceramicAssignmentError("The previous assignment or Planner link changed. Review it before reassigning.");
    }
    const invoice = await ctx.db.query("invoices").withIndex("by_routeId", q => q.eq("routeId", route._id)).first();
    if ((route.status || "planned") !== "planned" || invoice) throw ceramicAssignmentError("The previous Planner load is completed, locked or invoiced. Review it before reassigning.");
  }
  if (!driver) throw ceramicAssignmentError("Driver not found.");
  if (!truck) throw ceramicAssignmentError("Truck not found.");
  const driverName = (driver.driverName || driver.name || "").trim();
  const truckFleetNo = (truck.truckFleetNo || truck.fleetNumber || "").trim();
  if (!driverName || !truckFleetNo) throw ceramicAssignmentError("Choose a driver with a name and a truck with a fleet number.");
  const now = Date.now();
  const load = ceramicMainLoad(shipment.snapshot, shipment._id);
  let routeId: Id<"dailyRoutes">;
  if (existing && !reassigning) {
    const route = await ctx.db.get(existing.routeId);
    if (!route || route.isDeleted) throw ceramicAssignmentError("The linked Planner load was removed. Restore it before assigning again.");
    if (route.ceramicShipmentId !== shipment._id || route.region !== existing.region) throw ceramicAssignmentError("Planner link needs review.");
    const unchanged = existing.driverId === input.driverId && existing.truckId === input.truckId &&
      existing.driverName === driverName && existing.truckFleetNo === truckFleetNo &&
      existing.routeDate === input.routeDate && ceramicEqual(existing.snapshot, shipment.snapshot);
    // A retry never overwrites later Planner edits or creates another report row.
    if (unchanged && route.region === CERAMIC_MAIN_REGION && existing.region === CERAMIC_MAIN_REGION) return { routeId: route._id, unchanged: true, assignedAt: shipment.assignedAt ?? existing.createdAt };
    const invoice = await ctx.db.query("invoices").withIndex("by_routeId", q => q.eq("routeId", route._id)).first();
    if ((route.status || "planned") !== "planned" || invoice) throw ceramicAssignmentError("This Planner load is completed, locked or invoiced. Review it before changing the assignment.");
    const sourceChanged = !ceramicEqual(existing.snapshot, shipment.snapshot);
    const previousLoad = route.ceramicBillingTotal !== undefined && route.ceramicBillingTons !== undefined ? ceramicBilledMainLoad(existing.snapshot, shipment._id, route.ceramicBillingTons, route.ceramicBillingTotal, route.ceramicRatePerTon !== undefined && route.ceramicExtraStopCharge !== undefined ? { ratePerTon: route.ceramicRatePerTon, extraStops: route.ceramicExtraStopCharge } : undefined) : ceramicMainLoad(existing.snapshot, shipment._id);
    const manuallyEdited = !ceramicEqual(route.loads, [previousLoad]) ||
      route.rate !== 0 || route.kilometers !== 0 || route.routeKilometers !== undefined || !!route.legs?.length ||
      route.notes !== `${existing.snapshot.shipmentNumber}: rate and kilometres need review.`;
    if (sourceChanged && manuallyEdited) {
      throw ceramicAssignmentError("The Planner load has manual changes. Review the revised PDF and Planner load before resyncing; your changes were preserved.");
    }
    routeId = route._id;
    await ctx.db.patch(routeId, {
      region: CERAMIC_MAIN_REGION, routeDate: input.routeDate, driverName, truckFleetNoStr: truckFleetNo, truckFleetNo: undefined,
      ...(sourceChanged ? { ceramicBillingTotal: undefined, ceramicBillingTons: undefined, ceramicRatePerTon: undefined, ceramicExtraStopCharge: undefined, loads: [load], client: load.client, fromLocations: load.fromLocations,
        fromLocation: load.fromLocations[0], toLocations: load.toLocations, ceramicVersion: shipment.version } : {}),
    });
  } else {
    routeId = await ctx.db.insert("dailyRoutes", {
      ceramicShipmentId: shipment._id, ceramicVersion: shipment.version,
      routeDate: input.routeDate, region: CERAMIC_MAIN_REGION, driverName, truckFleetNoStr: truckFleetNo,
      client: load.client, fromLocations: load.fromLocations, fromLocation: load.fromLocations[0], toLocations: load.toLocations,
      loads: [load], kilometers: 0, rate: 0, notes: `${shipment.shipmentNumber}: rate and kilometres need review.`,
      status: "planned", createdAt: now,
    });
  }
  const record = {
    shipmentId: shipment._id, routeId, region: CERAMIC_MAIN_REGION, routeDate: input.routeDate,
    driverId: input.driverId, truckId: input.truckId, driverName, truckFleetNo,
    truckRegistration: truck.registration ?? "", snapshot: shipment.snapshot, updatedAt: now, updatedBy: input.actor,
  };
  if (existing) await ctx.db.patch(existing._id, { ...record, ...(reassigning ? {
    deletedAt: undefined, deletedBy: undefined, createdAt: now,
    billing: undefined, billingUpdatedAt: undefined, billingUpdatedBy: undefined, billingSourceVersion: undefined,
  } : {}) });
  else await ctx.db.insert("ceramicAssignments", { ...record, createdAt: now });
  return { routeId, unchanged: false, assignedAt: now };
}
