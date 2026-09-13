import { mutation } from "./_generated/server";

export const backfillTrucksAndTrailersStatus = mutation({
  handler: async (ctx) => {
    const trucks = await ctx.db.query("trucks").collect();
    const trailers = await ctx.db.query("trailers").collect();

    let trucksUpdated = 0;
    let trailersUpdated = 0;

    for (const t of trucks) {
      if (t.status === "inactive") continue;
      await ctx.db.patch(t._id, { status: "active" });
      trucksUpdated++;
    }

    for (const tr of trailers) {
      if (tr.status === "inactive") continue;
      await ctx.db.patch(tr._id, { status: "active" });
      trailersUpdated++;
    }

    return {
      trucksUpdated,
      trailersUpdated,
    };
  },
});

