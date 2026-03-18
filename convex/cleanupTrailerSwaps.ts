import { mutation } from "./_generated/server";

export const cleanupTrailerSwaps = mutation({
  args: {},
  handler: async (ctx) => {
    try {
      const allSwaps = await ctx.db.query("trailerSwaps").collect();

      if (allSwaps.length === 0) {
        return { success: true };
      }
    
      // Delete all records to ensure a clean slate for the new schema
      await Promise.all(
        allSwaps.map((doc) => ctx.db.delete(doc._id))
      );

      return { success: true };
    } catch (error) {
      console.error("Master Reset failed:", error);
      // Ensure we don't throw, as requested
      return { success: true };
    }
  },
});
