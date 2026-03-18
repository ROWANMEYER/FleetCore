import { mutation } from "./_generated/server";

export const cleanupTrucks = mutation({
  args: {},
  handler: async (ctx) => {
    const trucks = await ctx.db.query("trucks").collect();
    let deletedCount = 0;
    const invalidIds = [];

    for (const truck of trucks) {
      const fleetNo = truck.truckFleetNo;
      // Check for null, undefined, empty string, or whitespace only
      const isInvalid = !fleetNo || typeof fleetNo !== "string" || fleetNo.trim().length === 0 || fleetNo === "Unknown";

      if (isInvalid) {
        await ctx.db.delete(truck._id);
        deletedCount++;
        invalidIds.push(truck._id);
      }
    }

    console.log(`Cleanup complete. Deleted ${deletedCount} invalid truck records.`);
    return {
      deletedCount,
      status: "success",
      message: `Deleted ${deletedCount} invalid truck records.`
    };
  },
});
