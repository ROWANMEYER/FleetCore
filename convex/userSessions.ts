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

/** Max simultaneous sessions per user — oldest are dropped beyond this. */
export const MAX_SESSIONS_PER_USER = 5;

/** Look up a user by token — only when a live (non-expired) session exists. */
export const getUserBySessionToken = internalQuery({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();
    if (!session || session.expiresAt < Date.now()) return null;
    return await ctx.db.get(session.userId);
  },
});

/**
 * Register a new session for a user (login). Multi-device: each login appends
 * a session instead of overwriting the previous one, so other devices stay
 * signed in. Prunes expired sessions and enforces the per-user cap.
 */
export const setSessionToken = internalMutation({
  args: {
    userId: v.id("users"),
    token: v.string(),
    device: v.optional(v.string()),
    userAgent: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("sessions")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .collect();

    // Drop expired sessions, then the oldest if over the per-user cap.
    const live = existing.filter((s) => s.expiresAt > now);
    for (const s of existing) {
      if (s.expiresAt <= now) await ctx.db.delete(s._id);
    }
    if (live.length >= MAX_SESSIONS_PER_USER) {
      const overflow = [...live]
        .sort((a, b) => a.createdAt - b.createdAt)
        .slice(0, live.length - MAX_SESSIONS_PER_USER + 1);
      for (const s of overflow) await ctx.db.delete(s._id);
    }

    await ctx.db.insert("sessions", {
      userId: args.userId,
      token: args.token,
      expiresAt: now + SESSION_MS,
      device: args.device,
      userAgent: args.userAgent,
      createdAt: now,
    });
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
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();
    if (!session || session.expiresAt < Date.now()) return { user: null };
    const user = await ctx.db.get(session.userId);
    if (!user) return { user: null };
    return {
      user: { _id: user._id, email: user.email, role: user.role, region: user.region ?? null },
    };
  },
});

export const logout = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    // Per-device logout: remove only this device's session, so the user stays
    // signed in on their other devices (e.g. mobile while on desktop).
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();
    if (session) {
      await ctx.db.delete(session._id);
    }
  },
});

/** Public: list all live sessions for the signed-in user — device labels and
 * timestamps only, never tokens. The caller's own session is flagged isCurrent. */
export const listMySessions = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const current = await ctx.db
      .query("sessions")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();
    if (!current || current.expiresAt < Date.now()) return { sessions: [] };

    const all = await ctx.db
      .query("sessions")
      .withIndex("by_userId", (q) => q.eq("userId", current.userId))
      .collect();
    const now = Date.now();
    const sessions = all
      .filter((s) => s.expiresAt > now)
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((s) => ({
        _id: s._id,
        device: s.device ?? "Browser",
        userAgent: s.userAgent ?? null,
        createdAt: s.createdAt,
        expiresAt: s.expiresAt,
        isCurrent: s.token === args.token,
      }));
    return { sessions };
  },
});

/**
 * Remotely sign out a specific device. Ownership-checked: the caller can only
 * revoke their own sessions (matching userId), never another user's.
 */
export const logoutSession = mutation({
  args: { token: v.string(), sessionId: v.id("sessions") },
  handler: async (ctx, args) => {
    const caller = await ctx.db
      .query("sessions")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();
    if (!caller || caller.expiresAt < Date.now()) {
      throw new Error("Invalid session.");
    }
    const target = await ctx.db.get(args.sessionId);
    if (!target) return { ok: true }; // already gone
    if (target.userId !== caller.userId) {
      throw new Error("You can only sign out your own devices.");
    }
    await ctx.db.delete(target._id);
    return { ok: true };
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
  const session = await ctx.db
    .query("sessions")
    .withIndex("by_token", (q: any) => q.eq("token", token))
    .first();
  if (!session || session.expiresAt < Date.now()) return null;
  const user = await ctx.db.get(session.userId);
  if (!user) return null;
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
