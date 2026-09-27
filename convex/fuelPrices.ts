import { mutation, query, type QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { cents, compositionEffect, MAX_COMPOSITION, MAX_PRICE, percentChange, priceChange } from "./fuelPriceFields";

/**
 * The diesel price history: what a litre cost on each date it changed.
 *
 * Only the date and the price are stored. The movement in rand and the percentage are derived on read from the price before it, so a row cannot claim a change the prices do not support, and a missing figure is impossible rather than merely unlikely.
 *
 * One record per effective date. Re-saving a date amends that price rather than adding a second one, because a date can only have had one price.
 */
const MAX_NOTES = 400;
/** The signed-in admin, from the session token. Fuel pricing is managed by one role only. */
async function requireAdmin(ctx: QueryCtx, token: string) {
  const session = await ctx.db.query("sessions").withIndex("by_token", q => q.eq("token", token)).first();
  if (!session || session.expiresAt < Date.now()) throw new Error("Sign in again.");
  const user = await ctx.db.get(session.userId);
  if (!user) throw new Error("Sign in again.");
  if (user.role !== "admin") throw new Error("Admin access is required to manage fuel prices.");
  return user;
}

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) throw new Error("Enter a valid effective date.");
}

/**
 * Every recorded price with the movement it represents, oldest effective date first.
 *
 * The derived figures are worked out walking forwards from the oldest row, because each price can only be compared with the one before it. A first row has nothing before it, so it carries no movement at all. The order returned is the order it was worked out in, so the list reads as a timeline from the start.
 */
export const list = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx, args.token);
    const rows = await ctx.db.query("fuelPrices").withIndex("by_effectiveDate").collect();
    const ascending = [...rows].sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate));
    return ascending.map((row, index) => {
      const previous = ascending[index - 1]?.pricePerLitre ?? null;
      const percent = percentChange(row.pricePerLitre, previous);
      return { ...row, change: priceChange(row.pricePerLitre, previous), percentChange: percent, carriedPercent: compositionEffect(percent, row.compositionPercent) };
    });
  },
});

/** Records the price for one date, amending the existing one if that date already has a price. The composition is optional, and leaving it out of an amended row clears whatever was there. */
export const save = mutation({
  args: { token: v.string(), effectiveDate: v.string(), pricePerLitre: v.number(), compositionPercent: v.optional(v.number()), notes: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const user = await requireAdmin(ctx, args.token);
    validDate(args.effectiveDate);
    if (!Number.isFinite(args.pricePerLitre) || args.pricePerLitre <= 0) throw new Error("Enter a diesel price above zero.");
    if (args.pricePerLitre > MAX_PRICE) throw new Error(`A diesel price cannot be above ${MAX_PRICE} a litre. Check for a misplaced decimal.`);
    // Absent is a real answer here: it means no composition was recorded for this price, which is not the same as recording zero.
    if (args.compositionPercent !== undefined && (!Number.isFinite(args.compositionPercent) || args.compositionPercent < 0 || args.compositionPercent > MAX_COMPOSITION))
      throw new Error(`A composition must be between 0 and ${MAX_COMPOSITION}%. Leave it blank if there is none.`);
    const notes = (args.notes ?? "").trim();
    if (notes.length > MAX_NOTES) throw new Error(`Notes are limited to ${MAX_NOTES} characters.`);
    const body = { effectiveDate: args.effectiveDate, pricePerLitre: cents(args.pricePerLitre), compositionPercent: args.compositionPercent === undefined ? undefined : cents(args.compositionPercent), notes };
    const existing = await ctx.db.query("fuelPrices").withIndex("by_effectiveDate", q => q.eq("effectiveDate", args.effectiveDate)).unique();
    const now = Date.now();
    const who = { updatedAt: now, updatedBy: user._id, updatedByEmail: user.email };
    if (existing) {
      // undefined on a patch removes the field, so clearing the composition on an amended row really clears it.
      await ctx.db.patch(existing._id, { ...body, ...who });
      return existing._id;
    }
    return ctx.db.insert("fuelPrices", { ...body, createdAt: now, ...who });
  },
});

/** Removes one recorded price. The rows around it carry on, and their movements are worked out afresh from what is left. */
export const remove = mutation({
  args: { token: v.string(), id: v.id("fuelPrices") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx, args.token);
    const row = await ctx.db.get(args.id);
    if (!row) throw new Error("That diesel price has already been removed.");
    await ctx.db.delete(args.id);
  },
});
