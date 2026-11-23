import { regionValidator } from "./regionFields";
import { getUserRegions, type Region } from "../src/lib/regions";
import { assertRegionsAvailable } from "./userRegionAssignments";
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


async function assertAdminToken(ctx: Parameters<typeof assertRegionsAvailable>[0], token: string) {
  const scope = await resolveUserScope(ctx, token);
  if (scope?.role !== "admin") throw new Error("Admin access required");
}

export const createUserInternal = internalMutation({
  args: {
    email: v.string(), passwordHash: v.string(),
    role: v.union(v.literal("admin"), v.literal("regional")),
    region: v.optional(regionValidator), regions: v.optional(v.array(regionValidator)),
    adminToken: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (args.adminToken) await assertAdminToken(ctx, args.adminToken);
    const email = args.email.toLowerCase();
    if (await ctx.db.query("users").withIndex("by_email", q => q.eq("email", email)).first()) throw new Error("A user with that email already exists");
    const regions = args.role === "regional" ? getUserRegions(args) : [];
    if (args.role === "regional") await assertRegionsAvailable(ctx, regions);
    await ctx.db.insert("users", {
      email, passwordHash: args.passwordHash, role: args.role,
      ...(args.role === "regional" ? { region: regions[0], regions } : {}),
    });
    return null;
  },
});

export const updateUserInternal = internalMutation({
  args: {
    userId: v.id("users"), passwordHash: v.optional(v.string()),
    role: v.optional(v.union(v.literal("admin"), v.literal("regional"))),
    region: v.optional(regionValidator), regions: v.optional(v.array(regionValidator)),
    adminToken: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (args.adminToken) await assertAdminToken(ctx, args.adminToken);
    const current = await ctx.db.get(args.userId);
    if (!current) throw new Error("User not found");
    const patch: Partial<Pick<typeof current, "passwordHash" | "role" | "region" | "regions">> = {};
    if (args.passwordHash !== undefined) patch.passwordHash = args.passwordHash;
    if (args.role !== undefined) patch.role = args.role;
    if (args.role !== undefined || args.region !== undefined || args.regions !== undefined) {
      const role = args.role ?? current.role;
      if (args.adminToken && current.role === "admin" && role !== "admin") {
        const session = await ctx.db.query("sessions").withIndex("by_token", q => q.eq("token", args.adminToken!)).first();
        if (session?.userId === current._id) throw new Error("You cannot change your own role");
        const admins = await ctx.db.query("users").withIndex("by_role", q => q.eq("role", "admin")).take(2);
        if (admins.length <= 1) throw new Error("Cannot demote the last admin");
      }
      const regions = args.regions !== undefined ? getUserRegions({ regions: args.regions })
        : args.region !== undefined ? [args.region] : getUserRegions(current);
      if (role === "regional") await assertRegionsAvailable(ctx, regions, current._id);
      patch.regions = role === "regional" ? regions : undefined;
      patch.region = role === "regional" ? regions[0] : undefined;
    }
    await ctx.db.patch(args.userId, patch);
    return null;
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
      user: { _id: user._id, email: user.email, role: user.role, region: getUserRegions(user)[0] ?? null, regions: getUserRegions(user) },
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
 * when the resolved user is `regional`, validate the requested region against their assigned regions.
 */
export async function resolveUserScope(
  ctx: any,
  token?: string | null
): Promise<{ role: "admin" | "regional"; region: Region | null; regions?: Region[] } | null> {
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
    region: getUserRegions(user)[0] ?? null,
    regions: getUserRegions(user),
  };
}

/**
 * Convenience: given a resolved scope, return the region filter value or null.
 * - regional users -> their own region (hard filter)
 * - admin / unknown -> null (no filter)
 */
export function scopedRegion(
  scope: { role: "admin" | "regional"; region: Region | null; regions?: Region[] } | null
): Region | null {
  if (scope?.role === "regional") return scope.region;
  return null;
}

/**
 * Stage 4 helper: resolve the effective region filter for a query.
 *
 * - regional users -> an assigned region only, validated on the server
 * - admin -> the requested `regionOverride` if provided, otherwise null (see all)
 * - no/invalid token -> null (system-level, sees all)
 */
export async function resolveEffectiveRegion(
  ctx: any,
  token?: string | null,
  regionOverride?: Region | null
): Promise<Region | null> {
  const scope = await resolveUserScope(ctx, token);
  return selectScopeRegion(scope, regionOverride);
}

/** Select one authorized region; missing assignments fail closed. */
export function selectScopeRegion(scope: { role: string; region: Region | null; regions?: Region[] } | null, requested?: Region | null, requireRequested = false): Region | null {
  if (scope?.role !== "regional") return requested ?? null;
  const allowed = getUserRegions(scope);
  if (!allowed.length) throw new Error("Your account has no region assigned.");
  if (requested && !allowed.includes(requested) && requireRequested) throw new Error("This region is not assigned to your account. Select an assigned region before saving.");
  return requested && allowed.includes(requested) ? requested : allowed[0];
}
export function canAccessRegion(scope: { role: string; region: Region | null; regions?: Region[] } | null, region: string | undefined): boolean {
  return scope?.role !== "regional" || getUserRegions(scope).some(allowed => allowed === region);
}
