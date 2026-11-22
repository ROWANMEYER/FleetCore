import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { ceramicEqual, ceramicMainLoad, validCeramicDate } from "../src/lib/ceramic-tiles/planning";

/** Called only after authentication and region enforcement, in the assignment transaction. */
export async function syncCeramicAssignment(ctx: MutationCtx, shipment: Doc<"ceramicShipments">, input: {
  driverId: Id<"drivers">; truckId: Id<"trucks">; routeDate: string; actor: string;
}) {
  if (!validCeramicDate(input.routeDate)) throw new Error("Choose a valid planning date.");
  if (shipment.snapshot.destinations.length === 0) throw new Error("Review shipment destinations before assigning.");
  const [driver, truck, existing] = await Promise.all([
    ctx.db.get(input.driverId), ctx.db.get(input.truckId),
    ctx.db.query("ceramicAssignments").withIndex("by_shipment", q => q.eq("shipmentId", shipment._id)).unique(),
  ]);
  if (!driver) throw new Error("Driver not found.");
  if (!truck) throw new Error("Truck not found.");
  const driverName = (driver.driverName || driver.name || "").trim();
  const truckFleetNo = (truck.truckFleetNo || truck.fleetNumber || "").trim();
  if (!driverName || !truckFleetNo) throw new Error("Choose a driver with a name and a truck with a fleet number.");
  const now = Date.now();
  const load = ceramicMainLoad(shipment.snapshot, shipment._id);
  let routeId: Id<"dailyRoutes">;
  if (existing) {
    const route = await ctx.db.get(existing.routeId);
    if (!route || route.isDeleted) throw new Error("The linked Planner load was removed. Restore it before assigning again.");
    if (route.ceramicShipmentId !== shipment._id || route.region !== shipment.region) throw new Error("Planner link needs review.");
    const unchanged = existing.driverId === input.driverId && existing.truckId === input.truckId &&
      existing.driverName === driverName && existing.truckFleetNo === truckFleetNo &&
      existing.routeDate === input.routeDate && ceramicEqual(existing.snapshot, shipment.snapshot);
    // A retry never overwrites later Planner edits or creates another report row.
    if (unchanged) return { routeId: route._id, unchanged: true };
    const invoice = await ctx.db.query("invoices").withIndex("by_routeId", q => q.eq("routeId", route._id)).first();
    if ((route.status || "planned") !== "planned" || invoice) throw new Error("This Planner load is completed, locked or invoiced. Review it before changing the assignment.");
    const sourceChanged = !ceramicEqual(existing.snapshot, shipment.snapshot);
    const manuallyEdited = !ceramicEqual(route.loads, [ceramicMainLoad(existing.snapshot, shipment._id)]) ||
      route.rate !== 0 || route.kilometers !== 0 || route.routeKilometers !== undefined || !!route.legs?.length ||
      route.notes !== `${existing.snapshot.shipmentNumber}: rate and kilometres need review.`;
    if (sourceChanged && manuallyEdited) {
      throw new Error("The Planner load has manual changes. Review the revised PDF and Planner load before resyncing; your changes were preserved.");
    }
    routeId = route._id;
    await ctx.db.patch(routeId, {
      routeDate: input.routeDate, driverName, truckFleetNoStr: truckFleetNo, truckFleetNo: undefined,
      ...(sourceChanged ? { loads: [load], client: load.client, fromLocations: load.fromLocations,
        fromLocation: load.fromLocations[0], toLocations: load.toLocations, ceramicVersion: shipment.version } : {}),
    });
  } else {
    routeId = await ctx.db.insert("dailyRoutes", {
      ceramicShipmentId: shipment._id, ceramicVersion: shipment.version,
      routeDate: input.routeDate, region: shipment.region, driverName, truckFleetNoStr: truckFleetNo,
      client: load.client, fromLocations: load.fromLocations, fromLocation: load.fromLocations[0], toLocations: load.toLocations,
      loads: [load], kilometers: 0, rate: 0, notes: `${shipment.shipmentNumber}: rate and kilometres need review.`,
      status: "planned", createdAt: now,
    });
  }
  const record = {
    shipmentId: shipment._id, routeId, region: shipment.region, routeDate: input.routeDate,
    driverId: input.driverId, truckId: input.truckId, driverName, truckFleetNo,
    truckRegistration: truck.registration ?? "", snapshot: shipment.snapshot, updatedAt: now, updatedBy: input.actor,
  };
  if (existing) await ctx.db.patch(existing._id, record);
  else await ctx.db.insert("ceramicAssignments", { ...record, createdAt: now });
  return { routeId, unchanged: false };
}
