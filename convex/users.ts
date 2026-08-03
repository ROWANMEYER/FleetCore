import { action, internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import * as bcrypt from "bcryptjs";
import { internal } from "./_generated/api";

type AuthUserView = {
  _id: string;
  email: string;
  role: "admin" | "regional";
  region: "garden_route" | "eastern_cape" | null;
};

async function runLogin(
  ctx: any,
  args: { email: string; password: string; token: string }
): Promise<{ ok: boolean; error?: string; user?: AuthUserView }> {
  const user = await ctx.runQuery(internal.userSessions.getUserByEmail, { email: args.email });
  if (!user) return { ok: false, error: "Invalid email or password" };
  const valid = await bcrypt.compare(args.password, user.passwordHash);
  if (!valid) return { ok: false, error: "Invalid email or password" };
  await ctx.runMutation(internal.userSessions.setSessionToken, { userId: user._id, token: args.token });
  return {
    ok: true,
    user: { _id: user._id, email: user.email, role: user.role, region: user.region ?? null },
  };
}

export const login = action({
  args: { email: v.string(), password: v.string(), token: v.string() },
  handler: (ctx, args) => runLogin(ctx, args),
});

async function runSeedAdmin(
  ctx: any,
  args: { email: string; password: string }
): Promise<{ ok: boolean; message: string }> {
  const hashed = await bcrypt.hash(args.password, 10);
  const existing = await ctx.runQuery(internal.userSessions.getUserByEmail, { email: args.email });
  if (existing) {
    await ctx.runMutation(internal.userSessions.updateUserInternal, {
      userId: existing._id,
      passwordHash: hashed,
      role: "admin",
    });
    return { ok: true, message: "Admin updated" };
  }
  await ctx.runMutation(internal.userSessions.createUserInternal, {
    email: args.email,
    passwordHash: hashed,
    role: "admin",
  });
  return { ok: true, message: "Admin created" };
}

type UserRole = "admin" | "regional";
type UserRegion = "garden_route" | "eastern_cape";

/** Resolve the session user and enforce that they are an admin with a live session. */
async function requireAdmin(ctx: any, token: string): Promise<any | null> {
  const user = await ctx.runQuery(internal.userSessions.getUserBySessionToken, { token });
  if (!user || user.role !== "admin" || !user.sessionExpiresAt || user.sessionExpiresAt < Date.now()) return null;
  return user;
}

/** Count how many admins exist (used to protect against lockout). */
export const countAdminsInternal = internalQuery({
  args: {},
  handler: async (ctx) => {
    const admins = await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("role"), "admin"))
      .collect();
    return admins.length;
  },
});

export const getUserByIdInternal = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.userId);
  },
});

async function countAdmins(ctx: any): Promise<number> {
  return ctx.runQuery(internal.users.countAdminsInternal);
}

async function getUserById(ctx: any, userId: string): Promise<any | null> {
  return ctx.runQuery(internal.users.getUserByIdInternal, { userId });
}

/** Admin-only: list every user without exposing password hashes. */
export const listUsers = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx, args.token);
    if (!admin) throw new Error("Admin access required");
    const users = await ctx.db.query("users").collect();
    return users
      .map((u) => ({
        _id: u._id,
        email: u.email,
        role: u.role as UserRole,
        region: (u.region as UserRegion) ?? null,
        signedIn: !!u.sessionToken && (u.sessionExpiresAt ?? 0) > Date.now(),
      }))
      .sort((a, b) => (a.role === b.role ? a.email.localeCompare(b.email) : a.role === "admin" ? -1 : 1));
  },
});

/** Admin-only: create a new user with a password (bcrypt-hashed). */
export const createUser = action({
  args: {
    token: v.string(),
    email: v.string(),
    password: v.string(),
    role: v.union(v.literal("admin"), v.literal("regional")),
    region: v.optional(v.union(v.literal("garden_route"), v.literal("eastern_cape"))),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx, args.token);
    if (!admin) return { ok: false, error: "Admin access required" };
    const email = args.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: "Invalid email address" };
    if (args.password.length < 6) return { ok: false, error: "Password must be at least 6 characters" };
    if (args.role === "regional" && !args.region) return { ok: false, error: "A region is required for regional users" };
    const existing = await ctx.runQuery(internal.userSessions.getUserByEmail, { email });
    if (existing) return { ok: false, error: "A user with that email already exists" };
    const hashed = await bcrypt.hash(args.password, 10);
    await ctx.runMutation(internal.userSessions.createUserInternal, {
      email,
      passwordHash: hashed,
      role: args.role,
      region: args.region,
    });
    return { ok: true, error: undefined };
  },
});

/** Admin-only: update a user's role/region and/or reset their password. */
export const updateUser = action({
  args: {
    token: v.string(),
    userId: v.id("users"),
    role: v.optional(v.union(v.literal("admin"), v.literal("regional"))),
    region: v.optional(v.union(v.literal("garden_route"), v.literal("eastern_cape"))),
    newPassword: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx, args.token);
    if (!admin) return { ok: false, error: "Admin access required" };
    const target = await getUserById(ctx, args.userId);
    if (!target) return { ok: false, error: "User not found" };

    if (target._id === admin._id) {
      if (args.role && args.role !== "admin") return { ok: false, error: "You cannot change your own role" };
      if (args.newPassword) return { ok: false, error: "Use the Settings page to change your own password" };
    }
    if (args.role === "regional" && !args.region && target.role !== "regional") {
      return { ok: false, error: "A region is required for regional users" };
    }
    if (args.role && target.role === "admin" && args.role !== "admin") {
      const adminCount = await countAdmins(ctx);
      if (adminCount <= 1) return { ok: false, error: "Cannot demote the last admin" };
    }
    if (args.newPassword && args.newPassword.length < 6) {
      return { ok: false, error: "Password must be at least 6 characters" };
    }

    await ctx.runMutation(internal.userSessions.updateUserInternal, {
      userId: args.userId,
      role: args.role,
      region: args.region,
      passwordHash: args.newPassword ? await bcrypt.hash(args.newPassword, 10) : undefined,
    });
    return { ok: true, error: undefined };
  },
});

/** Admin-only: delete a user. Cannot delete yourself or the last admin. */
export const deleteUser = mutation({
  args: { token: v.string(), userId: v.id("users") },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx, args.token);
    if (!admin) throw new Error("Admin access required");
    const target = await ctx.db.get(args.userId);
    if (!target) throw new Error("User not found");
    if (target._id === admin._id) throw new Error("You cannot delete your own account");
    if (target.role === "admin") {
      const adminCount = await countAdmins(ctx);
      if (adminCount <= 1) throw new Error("Cannot delete the last admin");
    }
    await ctx.db.delete(args.userId);
  },
});

/** One-time setup: create or update the admin user (role=admin, region ignored). */
export const seedAdmin = action({
  args: { email: v.string(), password: v.string() },
  handler: (ctx, args) => runSeedAdmin(ctx, args),
});

/**
 * Change the signed-in user's password from the UI.
 * Verifies the current password first, then stores a fresh bcrypt hash.
 */
export const changePassword = action({
  args: {
    token: v.string(),
    currentPassword: v.string(),
    newPassword: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.runQuery(internal.userSessions.getUserBySessionToken, {
      token: args.token,
    });
    if (!user || !user.sessionExpiresAt || user.sessionExpiresAt < Date.now()) {
      return { ok: false, error: "Your session has expired. Please sign in again." };
    }
    const valid = await bcrypt.compare(args.currentPassword, user.passwordHash);
    if (!valid) return { ok: false, error: "Current password is incorrect." };
    if (args.newPassword.length < 6) {
      return { ok: false, error: "New password must be at least 6 characters." };
    }
    const hashed = await bcrypt.hash(args.newPassword, 10);
    await ctx.runMutation(internal.userSessions.updateUserInternal, {
      userId: user._id,
      passwordHash: hashed,
    });
    return { ok: true, error: undefined };
  },
});
