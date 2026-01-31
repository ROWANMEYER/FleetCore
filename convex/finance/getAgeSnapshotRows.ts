import { query } from "../_generated/server";
import { v } from "convex/values";

export const getAgeSnapshotRows = query({
  args: {
    snapshotId: v.id("ageSnapshots"),
  },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("ageSnapshotRows")
      .withIndex("by_snapshotId", (q) => q.eq("snapshotId", args.snapshotId))
      .collect();

    // Sort by Total Due DESC (in memory since we don't have a compound index for sorting)
    // For typical snapshot sizes (hundreds of rows), this is performant.
    return rows.sort((a, b) => b.totalDue - a.totalDue).map((row) => ({
      _id: row._id,
      accountNumber: row.accountNumber,
      clientName: row.clientName,
      days120: row.days120,
      days90: row.days90,
      days60: row.days60,
      days30: row.days30,
      current: row.current,
      totalDue: row.totalDue,
    }));
  },
});
