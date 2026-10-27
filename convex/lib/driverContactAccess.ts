import type { QueryCtx } from "../_generated/server";

/** Preserve the existing admin/regional editors; guests can only read contacts. */
export async function requireDriverContactEditor(ctx: QueryCtx, token?: string) {
  if (!token) throw new Error("Sign in to edit driver phone numbers.");
  const session = await ctx.db.query("sessions").withIndex("by_token", q => q.eq("token", token)).first();
  if (!session || session.expiresAt <= Date.now()) throw new Error("Sign in again to edit driver phone numbers.");
  const user = await ctx.db.get(session.userId);
  if (!user || (user.role !== "admin" && user.role !== "regional")) throw new Error("You cannot edit driver phone numbers.");
  return user;
}
