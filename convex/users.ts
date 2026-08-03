import { action } from "./_generated/server";
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

/** One-time setup: create or update the admin user (role=admin, region ignored). */
export const seedAdmin = action({
  args: { email: v.string(), password: v.string() },
  handler: (ctx, args) => runSeedAdmin(ctx, args),
});
