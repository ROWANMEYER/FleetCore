import { v, type Infer } from "convex/values";
import { mutation, query, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { laneField, pricingUnit, pricingUnits, validDay, type PricingUnit } from "./rateSheetFields";

/**
 * A rate sheet is the customer's whole live rate card in one document: the lanes, their rates, the notes and the diesel the rates are priced against. One row, one write, no separate version to fall out of sync with.
 *
 * There is no history and no approval. Saving replaces what is live.
 */
export type SheetLane = Infer<typeof laneField>;
export type SheetState = { effectiveDate?: string; notes: string; oldDieselPrice: number; newDieselPrice: number; lanes: SheetLane[] };
export type Sheet = Doc<"rateSheets">;

const MAX_LANES = 200, MAX_LANE_TEXT = 160;

export function money(value: number): number {
  if (!Number.isFinite(value) || value < 0 || value > 1_000_000_000) throw new Error("Enter a valid non-negative amount.");
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
export function validDate(value: string) {
  if (!validDay(value)) throw new Error("Enter a valid date.");
}
/** Two lanes are the same lane when they say the same thing, whatever the spacing or capitalisation. */
export function laneKey(from: string, to: string) {
  return [from, to].map(s => s.trim().replace(/\s+/g, " ").toLowerCase()).join("\u0000");
}

/**
 * The day the rates were added: claimed on the first save, and movable after that.
 *
 * A sheet starts without one on purpose. It used to be stamped with whatever day
 * somebody pressed "Add rates", which is often not the day the rates are meant
 * to be counted from. The reader types the date they want, and the first save
 * stores it.
 *
 * One date governs the whole sheet: every lane lives in this one document and
 * reads this one field, so there is nothing to keep in step — moving the date
 * re-dates every lane at once, in the same single write that saves the rates.
 * Later lanes are dated by the sheet rather than by the day they happened to be
 * typed in.
 *
 * A save that arrives without a date keeps the stored one rather than wiping it,
 * so omission can never clear the field; only an explicit new date moves it, and
 * it is validated like a first claim every time.
 */
export function settleAddedDate(stored: string | undefined, incoming: string | undefined): string {
  const claimed = (incoming ?? "").trim();
  if (stored !== undefined && !claimed) return stored;
  if (!claimed) throw new Error("Set the date these rates were added before saving.");
  validDate(claimed);
  return claimed;
}

/** The signed-in admin, from the session token. Rates are managed by one role only. */
async function requireAdmin(ctx: QueryCtx, token: string) {
  const session = await ctx.db.query("sessions").withIndex("by_token", q => q.eq("token", token)).first();
  if (!session || session.expiresAt < Date.now()) throw new Error("Sign in again.");
  const user = await ctx.db.get(session.userId);
  if (!user) throw new Error("Sign in again.");
  if (user.role !== "admin") throw new Error("Admin access is required to manage customer rates.");
  return user;
}

export async function getSheet(ctx: QueryCtx, customerId: Id<"customers">) {
  return ctx.db.query("rateSheets").withIndex("by_customer", q => q.eq("customerId", customerId)).unique();
}
async function requireSheet(ctx: QueryCtx, customerId: Id<"customers">) {
  const sheet = await getSheet(ctx, customerId);
  if (!sheet) throw new Error("This customer has no rate sheet yet.");
  return sheet;
}

/** Checks a lane set and returns it trimmed, in order, with a stable id per row. */
export function normalizeLanes(input: SheetLane[], previous: SheetLane[]): SheetLane[] {
  if (!input.length) throw new Error("Add at least one lane.");
  if (input.length > MAX_LANES) throw new Error(`A customer can have at most ${MAX_LANES} lanes.`);
  const seen = new Set<string>();
  return input.map((lane, index) => {
    const loadingPoint = lane.loadingPoint.trim(), destination = lane.destination.trim();
    if (!loadingPoint || !destination) throw new Error("Every lane needs a loading point and a destination.");
    if (loadingPoint.length > MAX_LANE_TEXT || destination.length > MAX_LANE_TEXT) throw new Error(`Loading point and destination are limited to ${MAX_LANE_TEXT} characters each.`);
    const key = laneKey(loadingPoint, destination);
    if (seen.has(key)) throw new Error(`${loadingPoint} to ${destination} is listed twice.`);
    seen.add(key);
    if (lane.pricingUnit && !pricingUnits.includes(lane.pricingUnit as PricingUnit)) throw new Error("Choose a valid pricing unit.");
    if (lane.date && !validDay(lane.date)) throw new Error(`${loadingPoint} to ${destination} needs a valid date in YYYY-MM-DD format.`);
    // Zero is a real rate, a negative one is a typo, and an empty field arrives here as zero because the browser cannot send a blank number.
    if (!Number.isFinite(lane.rate) || lane.rate < 0) throw new Error(`${loadingPoint} to ${destination} needs a rate of zero or more.`);
    return { id: lane.id && previous.some(p => p.id === lane.id) ? lane.id : crypto.randomUUID().slice(0, 8), loadingPoint, destination, ...(lane.pricingUnit ? { pricingUnit: lane.pricingUnit } : {}), ...(lane.date ? { date: lane.date } : {}), rate: money(lane.rate), sortOrder: index };
  });
}
/**
 * Zero is allowed: it means no diesel price was ever recorded, not that fuel was free. The editor does not expose these fields yet, so a sheet created today has never had a diesel price and must still be savable.
 * `money()` still guards the number itself, so a negative price or a runaway one is refused.
 */
function validateDiesel(oldDieselPrice: number, newDieselPrice: number) {
  money(oldDieselPrice); money(newDieselPrice);
}
/** Everything the sheet holds apart from its lanes, compared so a save with no real edit is refused. */
export function sameState(a: SheetState, b: SheetState) {
  return a.effectiveDate === b.effectiveDate && a.notes === b.notes && a.oldDieselPrice === b.oldDieselPrice && a.newDieselPrice === b.newDieselPrice
    && a.lanes.length === b.lanes.length && a.lanes.every((l, i) => l.loadingPoint === b.lanes[i].loadingPoint && l.destination === b.lanes[i].destination && l.rate === b.lanes[i].rate && l.pricingUnit === b.lanes[i].pricingUnit && l.date === b.lanes[i].date);
}
const stateOf = (sheet: Sheet): SheetState => ({ effectiveDate: sheet.effectiveDate, notes: sheet.notes, oldDieselPrice: sheet.oldDieselPrice, newDieselPrice: sheet.newDieselPrice, lanes: sheet.lanes });

export const get = query({
  args: { token: v.string(), customerId: v.id("customers") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx, args.token);
    return getSheet(ctx, args.customerId);
  },
});
export const list = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx, args.token);
    const rows = await Promise.all((await ctx.db.query("rateSheets").collect()).map(async sheet => {
      const customer = await ctx.db.get(sheet.customerId);
      return { customerId: sheet.customerId, customerName: customer?.name ?? "Missing customer", isActive: customer?.isActive ?? false,
        laneCount: sheet.lanes.length, effectiveDate: sheet.effectiveDate, oldDieselPrice: sheet.oldDieselPrice, newDieselPrice: sheet.newDieselPrice,
        updatedAt: sheet.updatedAt, updatedByEmail: sheet.updatedByEmail };
    }));
    return rows.sort((a, b) => a.customerName.localeCompare(b.customerName));
  },
});
export const create = mutation({
  args: { token: v.string(), customerId: v.id("customers"), defaultPricingUnit: pricingUnit },
  handler: async (ctx, args) => {
    const user = await requireAdmin(ctx, args.token);
    const customer = await ctx.db.get(args.customerId);
    if (!customer?.isActive) throw new Error("Select an active customer.");
    const existing = await getSheet(ctx, args.customerId);
    if (existing) return existing._id;
    const now = Date.now();
    // No date yet on purpose: it is claimed by hand on the first save, not stamped from the day this sheet was opened.
    return ctx.db.insert("rateSheets", { customerId: args.customerId, defaultPricingUnit: args.defaultPricingUnit, notes: "", oldDieselPrice: 0, newDieselPrice: 0, lanes: [], contacts: [], revision: 0, createdAt: now, updatedAt: now, updatedBy: user._id, updatedByEmail: user.email });
  },
});
export const saveLanes = mutation({
  args: { token: v.string(), customerId: v.id("customers"), effectiveDate: v.optional(v.string()), notes: v.string(), oldDieselPrice: v.number(), newDieselPrice: v.number(), lanes: v.array(laneField) },
  handler: async (ctx, args) => {
    const user = await requireAdmin(ctx, args.token);
    const sheet = await requireSheet(ctx, args.customerId);
    // Claimed on the very first save, and a later save can move it, so a lane added months later still lands on the sheet's date.
    const effectiveDate = settleAddedDate(sheet.effectiveDate, args.effectiveDate);
    validateDiesel(args.oldDieselPrice, args.newDieselPrice);
    const after: SheetState = { effectiveDate, notes: args.notes, oldDieselPrice: money(args.oldDieselPrice), newDieselPrice: money(args.newDieselPrice), lanes: normalizeLanes(args.lanes, sheet.lanes) };
    if (sameState(stateOf(sheet), after)) throw new Error("Nothing changed. Edit a rate, lane or date first.");
    await ctx.db.patch(sheet._id, { ...after, updatedAt: Date.now(), updatedBy: user._id, updatedByEmail: user.email });
    // Lane ids for newly added rows are minted here, so the saved order is handed back and the browser can adopt them. Without this every later save would mint a fresh id for the same lane.
    return { lanes: after.lanes, effectiveDate };
  },
});
export const setDefaultUnit = mutation({
  args: { token: v.string(), customerId: v.id("customers"), defaultPricingUnit: pricingUnit },
  handler: async (ctx, args) => {
    const user = await requireAdmin(ctx, args.token);
    const sheet = await requireSheet(ctx, args.customerId);
    if (sheet.defaultPricingUnit === args.defaultPricingUnit) return;
    await ctx.db.patch(sheet._id, { defaultPricingUnit: args.defaultPricingUnit, updatedAt: Date.now(), updatedBy: user._id, updatedByEmail: user.email });
  },
});
/**
 * Permanently removes the customer's rate sheet; the customer record itself is untouched and a new sheet can be started at any time. The confirm word (the customer's exact name) is checked server-side so a deleted customer is a deliberate act, never a slip of a single click.
 */
export const deleteSheet = mutation({
  args: { token: v.string(), customerId: v.id("customers"), confirmName: v.string() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx, args.token);
    const sheet = await requireSheet(ctx, args.customerId);
    const customer = await ctx.db.get(args.customerId);
    if (!customer) throw new Error("Customer not found.");
    if (args.confirmName.trim() !== customer.name.trim()) throw new Error(`Type "${customer.name}" exactly to delete this rate sheet.`);
    await ctx.db.delete(sheet._id);
  },
});
