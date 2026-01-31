import { query } from "../_generated/server";

export const getAgeSnapshots = query({
  args: {},
  handler: async (ctx) => {
    const snapshots = await ctx.db
      .query("ageSnapshots")
      .withIndex("by_month")
      .order("desc")
      .collect();

    const result = snapshots.map((snapshot) => {
      return {
        snapshotId: snapshot._id,
        month: snapshot.month,
        importedAt: snapshot.importedAt,
        totalDue: snapshot.totalDue || 0,
      };
    });

    return result;
  },
});
