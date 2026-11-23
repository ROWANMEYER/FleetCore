import { ConvexError } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { CERAMIC_MAIN_REGION, ceramicEqual, ceramicMainLoad, validCeramicDate } from "../src/lib/ceramic-tiles/planning";

/** Expected assignment failures are safe to show on production clients. */
export function ceramicAssignmentError(message: string, code = "CERAMIC_ASSIGNMENT_REVIEW") {
  return new ConvexError({ code, message });
}

/** Called only after authentication and region enforcement, in the assignment transaction. */
export async function syncCeramicAssignment(ctx: MutationCtx, shipment: Doc<"ceramicShipments">, input: {
  driverId: Id<"drivers">; truckId: Id<"trucks">; routeDate: string; actor: string;
}) {
  if (!validCeramicDate(input.routeDate)) throw ceramicAssignmentError("Choose a valid planning date.");
  if (shipment.snapshot.destinations.length === 0) throw ceramicAssignmentError("Review shipment destinations before assigning.");
  const [driver, truck, existing] = await Promise.all([
    ctx.db.get(input.driverId), ctx.db.get(input.truckId),
    ctx.db.query("ceramicAssignments").withIndex("by_shipment", q => q.eq("shipmentId", shipment._id)).unique(),
  ]);
  if (!driver) throw ceramicAssignmentError("Driver not found.");
  if (!truck) throw ceramicAssignmentError("Truck not found.");
  const driverName = (driver.driverName || driver.name || "").trim();
  const truckFleetNo = (truck.truckFleetNo || truck.fleetNumber || "").trim();
  if (!driverName || !truckFleetNo) throw ceramicAssignmentError("Choose a driver with a name and a truck with a fleet number.");
  const now = Date.now();
  const load = ceramicMainLoad(shipment.snapshot, shipment._id);
  let routeId: Id<"dailyRoutes">;
  if (existing) {
    const route = await ctx.db.get(existing.routeId);
    if (!route || route.isDeleted) throw ceramicAssignmentError("The linked Planner load was removed. Restore it before assigning again.");
    if (route.ceramicShipmentId !== shipment._id || route.region !== existing.region) throw ceramicAssignmentError("Planner link needs review.");
    const unchanged = existing.driverId === input.driverId && existing.truckId === input.truckId &&
      existing.driverName === driverName && existing.truckFleetNo === truckFleetNo &&
      existing.routeDate === input.routeDate && ceramicEqual(existing.snapshot, shipment.snapshot);
    // A retry never overwrites later Planner edits or creates another report row.
    if (unchanged && route.region === CERAMIC_MAIN_REGION && existing.region === CERAMIC_MAIN_REGION) return { routeId: route._id, unchanged: true };
    const invoice = await ctx.db.query("invoices").withIndex("by_routeId", q => q.eq("routeId", route._id)).first();
    if ((route.status || "planned") !== "planned" || invoice) throw ceramicAssignmentError("This Planner load is completed, locked or invoiced. Review it before changing the assignment.");
    const sourceChanged = !ceramicEqual(existing.snapshot, shipment.snapshot);
    const manuallyEdited = !ceramicEqual(route.loads, [ceramicMainLoad(existing.snapshot, shipment._id)]) ||
      route.rate !== 0 || route.kilometers !== 0 || route.routeKilometers !== undefined || !!route.legs?.length ||
      route.notes !== `${existing.snapshot.shipmentNumber}: rate and kilometres need review.`;
    if (sourceChanged && manuallyEdited) {
      throw ceramicAssignmentError("The Planner load has manual changes. Review the revised PDF and Planner load before resyncing; your changes were preserved.");
    }
    routeId = route._id;
    await ctx.db.patch(routeId, {
      region: CERAMIC_MAIN_REGION, routeDate: input.routeDate, driverName, truckFleetNoStr: truckFleetNo, truckFleetNo: undefined,
      ...(sourceChanged ? { loads: [load], client: load.client, fromLocations: load.fromLocations,
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
  if (existing) await ctx.db.patch(existing._id, record);
  else await ctx.db.insert("ceramicAssignments", { ...record, createdAt: now });
  return { routeId, unchanged: false };
}
