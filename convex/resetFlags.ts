import { mutation } from "./_generated/server";

export const setFleetSetupIncomplete = mutation({
  handler: async (ctx) => {
    // 1. Set fleetSetup.complete = false
    const setup = await ctx.db.query("fleetSetupStatus").first();
    if (setup) {
      await ctx.db.patch(setup._id, { complete: false });
    } else {
      await ctx.db.insert("fleetSetupStatus", { complete: false });
    }

    // 2. Unpair all trucks (remove currentTrailerId)
    const trucks = await ctx.db.query("trucks").collect();
    for (const truck of trucks) {
      // Only patch if it has a trailer to save DB ops
      if (truck.currentTrailerId !== undefined && truck.currentTrailerId !== null) {
        await ctx.db.patch(truck._id, { currentTrailerId: undefined });
      }
    }

    // 3. Unpair all trailers (remove currentTruckId)
    // NOTE: trailers table does NOT have currentTruckId in schema.
    // The relationship is defined one-way on the Truck (truck.currentTrailerId).
    // By clearing truck.currentTrailerId above, we effectively unpair the trailers.
    // We do NOT patch trailers here to avoid schema validation errors.

    return { success: true };
  },
});
