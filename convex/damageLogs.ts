import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const list = query({
  args: {
    assetType: v.optional(v.union(v.literal("truck"), v.literal("trailer"), v.literal("driver"))),
    assetUnit: v.optional(v.string()),
    status: v.optional(v.union(v.literal("open"), v.literal("closed"))),
  },
  handler: async (ctx, args) => {
    const rows = await (async () => {
      if (args.assetType && args.assetUnit) {
        return await ctx.db
          .query("damageLogs")
          .withIndex("by_assetType_assetUnit", (i) =>
            i.eq("assetType", args.assetType!).eq("assetUnit", args.assetUnit!)
          )
          .collect();
      }

      if (args.assetType) {
        return await ctx.db
          .query("damageLogs")
          .withIndex("by_assetType", (i) => i.eq("assetType", args.assetType!))
          .collect();
      }

      if (args.assetUnit) {
        return await ctx.db
          .query("damageLogs")
          .withIndex("by_assetUnit", (i) => i.eq("assetUnit", args.assetUnit!))
          .collect();
      }

      return await ctx.db.query("damageLogs").collect();
    })();

    const filtered = args.status ? rows.filter((r) => r.status === args.status) : rows;

    return filtered;
  },
});

export const create = mutation({
  args: {
    assetType: v.union(v.literal("truck"), v.literal("trailer"), v.literal("driver")),
    assetUnit: v.string(),
    date: v.string(),
    notes: v.optional(v.string()),
    photoUrls: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("damageLogs", {
      assetType: args.assetType,
      assetUnit: args.assetUnit,
      date: args.date,
      notes: args.notes,
      photoUrls: args.photoUrls ?? [],
      status: "open",
      closedAt: undefined,
    });

    return id;
  },
});

export const close = mutation({
  args: {
    id: v.id("damageLogs"),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();
    await ctx.db.patch(args.id, {
      status: "closed",
      closedAt: now,
    });
  },
});
