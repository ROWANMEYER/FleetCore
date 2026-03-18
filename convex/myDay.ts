import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export const getMyDaySelections = query({
  handler: async (ctx) => {
    const today = todayStr();
    return await ctx.db
      .query("myDaySelections")
      .withIndex("by_selectedDate", (q) => q.eq("selectedDate", today))
      .collect();
  },
});

export const addMyDaySelection = mutation({
  args: {
    itemId: v.string(),
    itemType: v.string(),
    label: v.string(),
  },
  handler: async (ctx, args) => {
    const today = todayStr();
    await ctx.db.insert("myDaySelections", {
      itemId: args.itemId,
      itemType: args.itemType,
      label: args.label,
      selectedDate: today,
      createdAt: Date.now(),
    });
  },
});

export const removeMyDaySelection = mutation({
  args: { selectionId: v.id("myDaySelections") },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.selectionId);
    if (!existing) {
      return;
    }
    await ctx.db.delete(args.selectionId);
  },
});
