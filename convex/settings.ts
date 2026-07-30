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
  args: {},
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

export const saveFleetDefaults = mutation({
  args: {
    defaultQuantityType: v.optional(v.string()),
    defaultRateType: v.optional(v.string()),
    defaultCurrency: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ensureSingleAppSettings(ctx);
    const settings = await ctx.db.query("appSettings").first();
    if (!settings) throw new Error("Failed to initialize app settings");
    const patch: Record<string, any> = {};
    if (args.defaultQuantityType) patch.defaultQuantityType = args.defaultQuantityType;
    if (args.defaultRateType) patch.defaultRateType = args.defaultRateType;
    if (args.defaultCurrency) patch.defaultCurrency = args.defaultCurrency;
    await ctx.db.patch(settings._id, patch);
    return { success: true };
  },
});

export const saveSubDefaults = mutation({
  args: {
    defaultSubRateType: v.optional(v.string()),
    autoSubNotes: v.optional(v.boolean()),
    showSubMarginOnCards: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await ensureSingleAppSettings(ctx);
    const settings = await ctx.db.query("appSettings").first();
    if (!settings) throw new Error("Failed to initialize app settings");
    const patch: Record<string, any> = {};
    if (args.defaultSubRateType) patch.defaultSubRateType = args.defaultSubRateType;
    if (args.autoSubNotes !== undefined) patch.autoSubNotes = args.autoSubNotes;
    if (args.showSubMarginOnCards !== undefined) patch.showSubMarginOnCards = args.showSubMarginOnCards;
    await ctx.db.patch(settings._id, patch);
    return { success: true };
  },
});

export const saveDisplayDefaults = mutation({
  args: {
    compactMode: v.optional(v.boolean()),
    reduceMotion: v.optional(v.boolean()),
    zoomLevel: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await ensureSingleAppSettings(ctx);
    const settings = await ctx.db.query("appSettings").first();
    if (!settings) throw new Error("Failed to initialize app settings");
    const patch: Record<string, any> = {};
    if (args.compactMode !== undefined) patch.compactMode = args.compactMode;
    if (args.reduceMotion !== undefined) patch.reduceMotion = args.reduceMotion;
    if (args.zoomLevel !== undefined) patch.zoomLevel = args.zoomLevel;
    await ctx.db.patch(settings._id, patch);
    return { success: true };
  },
});

export const saveInvoiceDefaults = mutation({
  args: {
    companyName: v.optional(v.string()),
    companyPobox: v.optional(v.string()),
    companyCity: v.optional(v.string()),
    companyPostal: v.optional(v.string()),
    companyPhone: v.optional(v.string()),
    companyFax: v.optional(v.string()),
    vatNumber: v.optional(v.string()),
    defaultVatRate: v.optional(v.number()),
    bankName: v.optional(v.string()),
    accountNumber: v.optional(v.string()),
    branchCode: v.optional(v.string()),
    paymentTerms: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ensureSingleAppSettings(ctx);
    const settings = await ctx.db.query("appSettings").first();
    if (!settings) throw new Error("Failed to initialize app settings");
    const patch: Record<string, any> = {};
    if (args.companyName !== undefined) patch.companyName = args.companyName;
    if (args.companyPobox !== undefined) patch.companyPobox = args.companyPobox;
    if (args.companyCity !== undefined) patch.companyCity = args.companyCity;
    if (args.companyPostal !== undefined) patch.companyPostal = args.companyPostal;
    if (args.companyPhone !== undefined) patch.companyPhone = args.companyPhone;
    if (args.companyFax !== undefined) patch.companyFax = args.companyFax;
    if (args.vatNumber !== undefined) patch.vatNumber = args.vatNumber;
    if (args.defaultVatRate !== undefined) patch.defaultVatRate = args.defaultVatRate;
    if (args.bankName !== undefined) patch.bankName = args.bankName;
    if (args.accountNumber !== undefined) patch.accountNumber = args.accountNumber;
    if (args.branchCode !== undefined) patch.branchCode = args.branchCode;
    if (args.paymentTerms !== undefined) patch.paymentTerms = args.paymentTerms;
    await ctx.db.patch(settings._id, patch);
    return { success: true };
  },
});

export const saveExportDefaults = mutation({
  args: {
    defaultExportFormat: v.optional(v.string()),
    includeChartsInPdf: v.optional(v.boolean()),
    includeKpisInPdf: v.optional(v.boolean()),
    defaultDateRange: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ensureSingleAppSettings(ctx);
    const settings = await ctx.db.query("appSettings").first();
    if (!settings) throw new Error("Failed to initialize app settings");
    const patch: Record<string, any> = {};
    if (args.defaultExportFormat !== undefined) patch.defaultExportFormat = args.defaultExportFormat;
    if (args.includeChartsInPdf !== undefined) patch.includeChartsInPdf = args.includeChartsInPdf;
    if (args.includeKpisInPdf !== undefined) patch.includeKpisInPdf = args.includeKpisInPdf;
    if (args.defaultDateRange !== undefined) patch.defaultDateRange = args.defaultDateRange;
    await ctx.db.patch(settings._id, patch);
    return { success: true };
  },
});

export const saveSecurityDefaults = mutation({
  args: {
    sessionTimeoutMinutes: v.optional(v.number()),
    enableAuditLog: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await ensureSingleAppSettings(ctx);
    const settings = await ctx.db.query("appSettings").first();
    if (!settings) throw new Error("Failed to initialize app settings");
    const patch: Record<string, any> = {};
    if (args.sessionTimeoutMinutes !== undefined) patch.sessionTimeoutMinutes = args.sessionTimeoutMinutes;
    if (args.enableAuditLog !== undefined) patch.enableAuditLog = args.enableAuditLog;
    await ctx.db.patch(settings._id, patch);
    return { success: true };
  },
});
