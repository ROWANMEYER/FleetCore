import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const getAll = query({
  args: {},
  handler: async (ctx) => {
    const trailers = await ctx.db.query("trailers").collect();
    const trucks = await ctx.db.query("trucks").collect();

    // Map trailerId -> truckId
    const trailerToTruckMap = new Map();
    for (const truck of trucks) {
      if (truck.currentTrailerId) {
        trailerToTruckMap.set(truck.currentTrailerId, truck._id);
      }
    }

    return trailers.map((trailer) => ({
      ...trailer,
      number: trailer.trailerFleetNoStr, // Proj: ensure number field exists
      currentTruckId: trailerToTruckMap.get(trailer._id) ?? trailerToTruckMap.get(trailer.trailerFleetNoStr) ?? null,
    }));
  },
});

export const getWithoutTrucks = query({
  args: {},
  handler: async (ctx) => {
    const trailers = await ctx.db.query("trailers").collect();
    const trucks = await ctx.db.query("trucks").collect();

    const assignedTrailerIds = new Set(
      trucks
        .map((t) => t.currentTrailerId)
        .filter((id) => id !== undefined && id !== null)
    );

    return trailers.filter(
      (t) => !assignedTrailerIds.has(t._id)
    );
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("trailers").collect();

    return rows;
  },
});

export const patchByFleetNoStr = mutation({
  args: {
    trailerFleetNoStr: v.string(),
    patch: v.object({
      licenseExpiryDate: v.optional(v.string()),
      serviceDueDate: v.optional(v.string()),
      serviceDueKm: v.optional(v.float64()),
      currentKm: v.optional(v.float64()),
    }),
  },
  handler: async (ctx, args) => {
    const trailer = await ctx.db
      .query("trailers")
      .withIndex("by_trailerFleetNoStr", (q) => q.eq("trailerFleetNoStr", args.trailerFleetNoStr))
      .first();
    if (!trailer) throw new Error("Trailer not found");
    await ctx.db.patch(trailer._id, args.patch);
  },
});
