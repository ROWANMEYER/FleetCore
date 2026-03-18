import { query } from "./_generated/server";

export const getStatus = query({
  handler: async (ctx) => {
    const trucks = await ctx.db.query("trucks").collect();

    const hasAnyPair = trucks.some(
      (t) => t.currentTrailerId !== undefined && t.currentTrailerId !== null
    );

    return { complete: hasAnyPair };
  },
});
