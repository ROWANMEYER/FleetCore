import { mutation } from "./_generated/server";

/**
 * One-time backfill: sets `region: "garden_route"` on every existing
 * dailyRoutes record that does not yet have a region.
 *
 * Callable from the Convex dashboard function runner or via the API:
 *   npx convex run backfillRegion:backfillRoutesRegion --prod
 */
export const backfillRoutesRegion = mutation({
  handler: async (ctx) => {
    const routes = await ctx.db.query("dailyRoutes").collect();

    let updated = 0;
    for (const route of routes) {
      if (!route.region) {
        await ctx.db.patch(route._id, { region: "garden_route" });
        updated += 1;
      }
    }

    return {
      totalRoutes: routes.length,
      updated,
    };
  },
});
