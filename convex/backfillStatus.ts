import { mutation } from "./_generated/server";

export const backfillTrucksAndTrailersStatus = mutation({
  handler: async (ctx) => {
    const trucks = await ctx.db.query("trucks").collect();
    const trailers = await ctx.db.query("trailers").collect();

    for (const t of trucks) {
      await ctx.db.patch(t._id, { status: "active" });
    }

    for (const tr of trailers) {
      await ctx.db.patch(tr._id, { status: "active" });
    }

    return {
      trucksUpdated: trucks.length,
      trailersUpdated: trailers.length,
    };
  },
});

