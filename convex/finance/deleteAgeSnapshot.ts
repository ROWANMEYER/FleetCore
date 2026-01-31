import { mutation } from "../_generated/server";
import { v } from "convex/values";

export const deleteAgeSnapshot = mutation({
  args: {
    snapshotId: v.id("ageSnapshots"),
  },
  handler: async (ctx, args) => {
    // 1. Fetch all rows associated with this snapshot
    const rows = await ctx.db
      .query("ageSnapshotRows")
      .withIndex("by_snapshotId", (q) => q.eq("snapshotId", args.snapshotId))
      .collect();

    // 2. Delete all rows first (cleanup children)
    for (const row of rows) {
      await ctx.db.delete(row._id);
    }

    // 3. Delete the parent snapshot record
    await ctx.db.delete(args.snapshotId);

    return {
      success: true,
      deletedRows: rows.length,
      snapshotId: args.snapshotId,
    };
  },
});
