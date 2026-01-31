import { query } from "../_generated/server";
import { v } from "convex/values";

export const getAgeSnapshotSummary = query({
  args: { snapshotId: v.id("ageSnapshots") },
  handler: async (ctx, args) => {
    // 1. Get Snapshot Metadata
    const snapshot = await ctx.db.get(args.snapshotId);
    if (!snapshot) {
      return null;
    }

    // Return values directly from snapshot (Excel Source of Truth)
    return {
      total120: snapshot.days120 || 0,
      total90: snapshot.days90 || 0,
      total60: snapshot.days60 || 0,
      total30: snapshot.days30 || 0,
      totalCurrent: snapshot.current || 0,
      totalDue: snapshot.totalDue || 0,
      month: snapshot.month,
      fileName: snapshot.fileName,
      importedAt: snapshot.importedAt,
    };
  },
});
