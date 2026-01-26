import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("recipients").collect();
  },
});

export const seed = mutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db.query("recipients").first();
    if (!existing) {
      await ctx.db.insert("recipients", { name: "Operations", email: "ops@fleetcore.app" });
      await ctx.db.insert("recipients", { name: "Finance", email: "finance@fleetcore.app" });
    }
  },
});

export const add = mutation({
  args: { name: v.string(), email: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.insert("recipients", args);
  },
});
