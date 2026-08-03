import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";

const SESSION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export const getUserByEmail = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email.toLowerCase()))
      .first();
  },
});

export const getUserBySessionToken = internalQuery({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("users")
      .withIndex("by_sessionToken", (q) => q.eq("sessionToken", args.token))
      .first();
  },
});

export const setSessionToken = internalMutation({
  args: { userId: v.id("users"), token: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.userId, {
      sessionToken: args.token,
      sessionExpiresAt: Date.now() + SESSION_MS,
    });
  },
});

export const clearSessionToken = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.userId, { sessionToken: undefined, sessionExpiresAt: undefined });
  },
});

export const createUserInternal = internalMutation({
  args: {
    email: v.string(),
    passwordHash: v.string(),
    role: v.union(v.literal("admin"), v.literal("regional")),
    region: v.optional(v.union(v.literal("garden_route"), v.literal("eastern_cape"))),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("users", {
      email: args.email.toLowerCase(),
      passwordHash: args.passwordHash,
      role: args.role,
      region: args.region,
    });
  },
});

export const updateUserInternal = internalMutation({
  args: {
    userId: v.id("users"),
    passwordHash: v.optional(v.string()),
    role: v.optional(v.union(v.literal("admin"), v.literal("regional"))),
    region: v.optional(v.union(v.literal("garden_route"), v.literal("eastern_cape"))),
  },
  handler: async (ctx, args) => {
    const patch: Record<string, unknown> = {};
    if (args.passwordHash !== undefined) patch.passwordHash = args.passwordHash;
    if (args.role !== undefined) patch.role = args.role;
    if (args.region !== undefined) patch.region = args.region;
    await ctx.db.patch(args.userId, patch as any);
  },
});

/** Public: resolve the current session user from a token (or null when invalid/expired). */
export const getSessionUser = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_sessionToken", (q) => q.eq("sessionToken", args.token))
      .first();
    if (!user || !user.sessionExpiresAt || user.sessionExpiresAt < Date.now()) {
      return { user: null };
    }
    return {
      user: { _id: user._id, email: user.email, role: user.role, region: user.region ?? null },
    };
  },
});

export const logout = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_sessionToken", (q) => q.eq("sessionToken", args.token))
      .first();
    if (user) {
      await ctx.db.patch(user._id, { sessionToken: undefined, sessionExpiresAt: undefined });
    }
  },
});
