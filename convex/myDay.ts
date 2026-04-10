import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const getMyDaySelections = query({
  args: {},
  handler: async (ctx) => {
    const d = new Date();
    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return await ctx.db
      .query("myDaySelections")
      .withIndex("by_selectedDate", q => q.eq("selectedDate", today))
      .collect();
  },
});

export const addMyDaySelection = mutation({
  args: {
    itemId: v.string(),
    itemType: v.string(),
    label: v.string(),
  },
  handler: async (ctx, { itemId, itemType, label }) => {
    // Ensure itemId and itemType are not empty
    if (!itemId || !itemType) {
      throw new Error("itemId and itemType must be provided.");
    }

    // Insert the new selection with today's date and creation timestamp
    const d = new Date();
    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return await ctx.db.insert("myDaySelections", {
      itemId,
      itemType,
      label,
      selectedDate: today,
      createdAt: Date.now(),
      completed: false,
    });
  },
});

export const removeMyDaySelection = mutation({
  args: { selectionId: v.id("myDaySelections") }, 
  handler: async (ctx, { selectionId }) => {
    const doc = await ctx.db.get(selectionId);
    if (!doc) {
      throw new Error("Document not found");
    }
    await ctx.db.delete(selectionId);
    return selectionId;
  },
});

export const toggleMyDaySelection = mutation({
  args: { selectionId: v.id("myDaySelections") },
  handler: async (ctx, { selectionId }) => {
    const doc = await ctx.db.get(selectionId);
    if (!doc) {
      throw new Error("Document not found");
    }
    // Toggle the completed status
    await ctx.db.patch(selectionId, { completed: !doc.completed });
    return selectionId;
  },
});

export const getEndOfDaySummary = query({
  args: {},
  handler: async (ctx) => {
    const d = new Date();
    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const all = await ctx.db
      .query("myDaySelections")
      .withIndex("by_selectedDate", q => q.eq("selectedDate", today))
      .collect();
    const completed = all.filter((s: any) => s.completed === true);
    const pending = all.filter((s: any) => s.completed !== true);
    return { date: today, completed, pending, total: all.length };
  },
});
