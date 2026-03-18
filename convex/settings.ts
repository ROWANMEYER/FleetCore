import { internalQuery, mutation, query, type MutationCtx } from "./_generated/server";
import { v } from "convex/values";

const DEFAULTS = {
  stage1AlertDays: 3,
  stage2AlertDays: 2,
  stage3AlertDays: 5,
  expiryReminder90: true,
  expiryReminder60: true,
  expiryReminder30: true,
};

async function ensureSingleAppSettings(ctx: MutationCtx) {
  const all = await ctx.db.query("appSettings").collect();
  if (all.length === 0) {
    await ctx.db.insert("appSettings", { ...DEFAULTS });
    return;
  }
  if (all.length > 1) {
    const oldest = all.reduce((min, curr) => (curr._creationTime < min._creationTime ? curr : min));
    for (const doc of all) {
      if (doc._id !== oldest._id) {
        await ctx.db.delete(doc._id);
      }
    }
  }
}

export const ensureDefaults = mutation({
  handler: async (ctx) => {
    await ensureSingleAppSettings(ctx);
    return { success: true };
  },
});

export const getAppSettings = query({
  handler: async (ctx) => {
    return await ctx.db.query("appSettings").first();
  },
});

export const getAppSettingsInternal = internalQuery({
  handler: async (ctx) => {
    return await ctx.db.query("appSettings").first();
  },
});

export const savePushToken = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    await ensureSingleAppSettings(ctx);
    const settings = await ctx.db.query("appSettings").first();
    if (!settings) throw new Error("Failed to initialize app settings");
    await ctx.db.patch(settings._id, { pushToken: args.token });
    return { success: true };
  },
});

export const saveReminderThresholds = mutation({
  args: {
    stage1AlertDays: v.number(),
    stage2AlertDays: v.number(),
    stage3AlertDays: v.number(),
    expiryReminder90: v.boolean(),
    expiryReminder60: v.boolean(),
    expiryReminder30: v.boolean(),
  },
  handler: async (ctx, args) => {
    await ensureSingleAppSettings(ctx);
    const settings = await ctx.db.query("appSettings").first();
    if (!settings) throw new Error("Failed to initialize app settings");
    await ctx.db.patch(settings._id, {
      stage1AlertDays: args.stage1AlertDays,
      stage2AlertDays: args.stage2AlertDays,
      stage3AlertDays: args.stage3AlertDays,
      expiryReminder90: args.expiryReminder90,
      expiryReminder60: args.expiryReminder60,
      expiryReminder30: args.expiryReminder30,
    });
    return { success: true };
  },
});

