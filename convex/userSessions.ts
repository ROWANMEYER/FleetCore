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

/**
 * Shared helper: resolve a session token to a user's role + region scope.
 * Returns null when the token is absent/invalid/expired (treat as admin/system).
 *
 * Queries that read region-scoped data (dailyRoutes etc.) should call this and,
 * when the resolved user is `regional`, hard-filter to `region === user.region`.
 */
export async function resolveUserScope(
  ctx: any,
  token?: string | null
): Promise<{ role: "admin" | "regional"; region: "garden_route" | "eastern_cape" | null } | null> {
  if (!token) return null;
  const user = await ctx.db
    .query("users")
    .withIndex("by_sessionToken", (q: any) => q.eq("sessionToken", token))
    .first();
  if (!user || !user.sessionExpiresAt || user.sessionExpiresAt < Date.now()) return null;
  return {
    role: user.role,
    region: user.region ?? null,
  };
}

/**
 * Convenience: given a resolved scope, return the region filter value or null.
 * - regional users -> their own region (hard filter)
 * - admin / unknown -> null (no filter)
 */
export function scopedRegion(
  scope: { role: "admin" | "regional"; region: "garden_route" | "eastern_cape" | null } | null
): "garden_route" | "eastern_cape" | null {
  if (scope?.role === "regional") return scope.region;
  return null;
}

/**
 * Stage 4 helper: resolve the effective region filter for a query.
 *
 * - regional users -> their own region, ALWAYS (never overridable from the client)
 * - admin -> the requested `regionOverride` if provided, otherwise null (see all)
 * - no/invalid token -> null (system-level, sees all)
 */
export async function resolveEffectiveRegion(
  ctx: any,
  token?: string | null,
  regionOverride?: "garden_route" | "eastern_cape" | null
): Promise<"garden_route" | "eastern_cape" | null> {
  const scope = await resolveUserScope(ctx, token);
  if (scope?.role === "regional") return scope.region;
  return regionOverride ?? null;
}
