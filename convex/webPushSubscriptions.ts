import { internalMutation, internalQuery, mutation } from "./_generated/server";
import { v } from "convex/values";

/**
 * Web Push (PWA) subscription storage.
 * Mutations live in this module (default runtime); the sending logic lives in
 * `webPush.ts` which runs in the Node.js runtime ("use node") because the
 * `web-push` package requires Node APIs.
 */

export const saveSubscription = mutation({
  args: {
    endpoint: v.string(),
    keys: v.object({ p256dh: v.string(), auth: v.string() }),
    userAgent: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("webPushSubscriptions")
      .withIndex("by_endpoint", (q) => q.eq("endpoint", args.endpoint))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, {
        keys: args.keys,
        userAgent: args.userAgent,
        lastSeenAt: Date.now(),
      });
    } else {
      await ctx.db.insert("webPushSubscriptions", {
        endpoint: args.endpoint,
        keys: args.keys,
        userAgent: args.userAgent,
        lastSeenAt: Date.now(),
      });
    }
    return { ok: true };
  },
});

export const removeSubscription = mutation({
  args: { endpoint: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("webPushSubscriptions")
      .withIndex("by_endpoint", (q) => q.eq("endpoint", args.endpoint))
      .first();
    if (existing) await ctx.db.delete(existing._id);
    return { ok: true };
  },
});

export const listSubscriptions = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("webPushSubscriptions").collect();
  },
});

export const deleteSubscription = internalMutation({
  args: { id: v.id("webPushSubscriptions") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});
