import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const DEFAULTS = {
  zoomLevel: 100,
  compactMode: false,
  theme: "dark",
  reduceMotion: false,
} as const;

export const getByClientId = query({
  args: { clientId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("clientDisplaySettings")
      .withIndex("by_clientId", (q) => q.eq("clientId", args.clientId))
      .first();
  },
});

export const upsert = mutation({
  args: {
    clientId: v.string(),
    zoomLevel: v.optional(v.number()),
    compactMode: v.optional(v.boolean()),
    theme: v.optional(v.string()),
    reduceMotion: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("clientDisplaySettings")
      .withIndex("by_clientId", (q) => q.eq("clientId", args.clientId))
      .first();

    const now = Date.now();
    if (!existing) {
      const id = await ctx.db.insert("clientDisplaySettings", {
        clientId: args.clientId,
        zoomLevel: typeof args.zoomLevel === "number" ? args.zoomLevel : DEFAULTS.zoomLevel,
        compactMode: typeof args.compactMode === "boolean" ? args.compactMode : DEFAULTS.compactMode,
        theme: typeof args.theme === "string" ? args.theme : DEFAULTS.theme,
        reduceMotion: typeof args.reduceMotion === "boolean" ? args.reduceMotion : DEFAULTS.reduceMotion,
        createdAt: now,
        updatedAt: now,
      });
      return await ctx.db.get(id);
    }

    await ctx.db.patch(existing._id, {
      zoomLevel: typeof args.zoomLevel === "number" ? args.zoomLevel : existing.zoomLevel,
      compactMode: typeof args.compactMode === "boolean" ? args.compactMode : existing.compactMode,
      theme: typeof args.theme === "string" ? args.theme : existing.theme,
      reduceMotion: typeof args.reduceMotion === "boolean" ? args.reduceMotion : existing.reduceMotion,
      updatedAt: now,
    });
    return await ctx.db.get(existing._id);
  },
});
