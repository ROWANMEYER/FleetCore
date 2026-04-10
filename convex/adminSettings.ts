import { mutation, query, action, internalMutation, type QueryCtx, type MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import * as bcrypt from "bcryptjs";
import { internal } from "./_generated/api";

const DEFAULT_PASSWORD = "admin123";
const DEFAULT_MODE = "ADMIN";

// Internal mutation to ensure admin settings exists
export const ensureAdminSettingsExists = internalMutation({
  args: {},
  handler: async (ctx: MutationCtx) => {
    const existing = await ctx.db.query("adminSettings").first();
    if (!existing) {
      await ctx.db.insert("adminSettings", {
        mode: DEFAULT_MODE,
        passwordHash: "pending_initialization",
      });
    }
  },
});

// Internal mutation to set mode
export const setAdminModeInternal = internalMutation({
  args: { mode: v.string() },
  handler: async (ctx: MutationCtx, args) => {
    const settings = await ctx.db.query("adminSettings").first();
    if (!settings) return { success: false };
    await ctx.db.patch(settings._id, { mode: args.mode });
    return { success: true };
  },
});

// Internal mutation to set password hash
export const setPasswordHashInternal = internalMutation({
  args: { passwordHash: v.string() },
  handler: async (ctx: MutationCtx, args) => {
    const settings = await ctx.db.query("adminSettings").first();
    if (!settings) return { success: false };
    await ctx.db.patch(settings._id, { passwordHash: args.passwordHash });
    return { success: true };
  },
});

// Public mutation: ensure single adminSettings document exists and normalize extras
export const ensureAdminInitialized = mutation({
  handler: async (ctx: MutationCtx) => {
    const all = await ctx.db.query("adminSettings").collect();
    if (all.length === 0) {
      await ctx.db.insert("adminSettings", {
        mode: DEFAULT_MODE,
        passwordHash: "pending_initialization",
      });
      return { success: true };
    }
    if (all.length > 1) {
      const oldest = all.reduce((min, curr) =>
        curr._creationTime < min._creationTime ? curr : min
      );
      for (const doc of all) {
        if (doc._id !== oldest._id) {
          await ctx.db.delete(doc._id);
        }
      }
    }
    return { success: true };
  },
});

// Internal mutation to get settings
export const getSettingsInternal = internalMutation({
  args: {},
  handler: async (ctx: MutationCtx) => {
    // Ensure settings exist by creating if needed
    const existing = await ctx.db.query("adminSettings").first();
    if (!existing) {
      await ctx.db.insert("adminSettings", {
        mode: DEFAULT_MODE,
        passwordHash: "pending_initialization",
      });
    }
    return await ctx.db.query("adminSettings").first();
  },
});

// Internal query to get all settings
export const getAllSettingsInternal = internalMutation({
  args: {},
  handler: async (ctx: MutationCtx) => {
    return await ctx.db.query("adminSettings").collect();
  },
});

// Internal mutation to delete settings by id
export const deleteSettingsInternal = internalMutation({
  args: { id: v.id("adminSettings") },
  handler: async (ctx: MutationCtx, args) => {
    await ctx.db.delete(args.id);
  },
});

// Internal mutation to create new settings
export const createSettingsInternal = internalMutation({
  args: { mode: v.string(), passwordHash: v.string() },
  handler: async (ctx: MutationCtx, args) => {
    await ctx.db.insert("adminSettings", {
      mode: args.mode,
      passwordHash: args.passwordHash,
    });
  },
});

export const getAppMode = query({
  handler: async (ctx: QueryCtx) => {
    const settings = await ctx.db.query("adminSettings").first();
    return { mode: settings?.mode || DEFAULT_MODE };
  },
});

export const setMode = mutation({
  args: { mode: v.string() },
  handler: async (ctx: MutationCtx, args) => {
    const settings = await ctx.db.query("adminSettings").first();

    if (!settings) {
      await ctx.db.insert("adminSettings", {
        mode: args.mode,
        passwordHash: "pending_initialization",
      });
      return { success: true };
    }

    await ctx.db.patch(settings._id, { mode: args.mode });

    return { success: true };
  },
});

export const verifyAdminPassword = action({
  args: { password: v.string() },
  handler: async (ctx, args) => {
    // Ensure settings exist
    await ctx.runMutation(internal.adminSettings.ensureAdminSettingsExists);
    
    // Get current settings
    const settings = await ctx.runMutation(internal.adminSettings.getSettingsInternal);
    
    if (!settings) {
      throw new Error("Admin settings not initialized");
    }
    
    // Initialize password hash if needed
    if (settings.passwordHash === "pending_initialization") {
      const hashed = await bcrypt.hash(DEFAULT_PASSWORD, 10);
      await ctx.runMutation(internal.adminSettings.setPasswordHashInternal, { passwordHash: hashed });
      settings.passwordHash = hashed;
    }
    
    // Verify password
    const isValid = await bcrypt.compare(args.password, settings.passwordHash);
    if (isValid) {
      await ctx.runMutation(internal.adminSettings.setAdminModeInternal, { mode: "ADMIN" });
      return { success: true };
    }
    return { success: false };
  },
});

export const hardResetAdmin = action({
  handler: async (ctx) => {
    // Generate bcrypt hash for admin123
    const hashed = await bcrypt.hash("admin123", 10);
    
    // Use internal mutations to handle database operations
    // Delete all existing adminSettings documents
    const allSettings = await ctx.runMutation(internal.adminSettings.getAllSettingsInternal);
    for (const doc of allSettings) {
      await ctx.runMutation(internal.adminSettings.deleteSettingsInternal, { id: doc._id });
    }
    
    // Insert exactly one new document with real bcrypt hash
    await ctx.runMutation(internal.adminSettings.createSettingsInternal, {
      mode: "ADMIN",
      passwordHash: hashed,
    });
    
    return "Admin settings reset successfully with bcrypt-hashed password";
  },
});
