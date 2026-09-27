import { v, type Infer } from "convex/values";
import { mutation, query, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { laneField, pricingUnit, pricingUnits, type PricingUnit } from "./rateSheetFields";

/**
 * A rate sheet is the customer's whole live rate card in one document: the lanes, their rates, the notes and the diesel the rates are priced against. One row, one write, no separate version to fall out of sync with.
 *
 * There is no history and no approval. Saving replaces what is live.
 */
export type SheetLane = Infer<typeof laneField>;
export type SheetState = { effectiveDate: string; notes: string; oldDieselPrice: number; newDieselPrice: number; lanes: SheetLane[] };
export type Sheet = Doc<"rateSheets">;

const MAX_LANES = 200, MAX_LANE_TEXT = 160;

export function money(value: number): number {
  if (!Number.isFinite(value) || value < 0 || value > 1_000_000_000) throw new Error("Enter a valid non-negative amount.");
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
export function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) throw new Error("Enter a valid effective date.");
}
/** Two lanes are the same lane when they say the same thing, whatever the spacing or capitalisation. */
export function laneKey(from: string, to: string) {
  return [from, to].map(s => s.trim().replace(/\s+/g, " ").toLowerCase()).join("\u0000");
}
const today = () => new Date().toISOString().slice(0, 10);

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
    // Zero is a real rate, a negative one is a typo, and an empty field arrives here as zero because the browser cannot send a blank number.
    if (!Number.isFinite(lane.rate) || lane.rate < 0) throw new Error(`${loadingPoint} to ${destination} needs a rate of zero or more.`);
    return { id: lane.id && previous.some(p => p.id === lane.id) ? lane.id : crypto.randomUUID().slice(0, 8), loadingPoint, destination, ...(lane.pricingUnit ? { pricingUnit: lane.pricingUnit } : {}), rate: money(lane.rate), sortOrder: index };
  });
}
function validateDiesel(oldDieselPrice: number, newDieselPrice: number) {
  money(oldDieselPrice); money(newDieselPrice);
  // Zero means the price was never recorded, not that fuel was free.
  if (oldDieselPrice <= 0 || newDieselPrice <= 0) throw new Error("Enter the diesel prices these rates are based on. Zero means the price is unknown.");
}
/** Everything the sheet holds apart from its lanes, compared so a save with no real edit is refused. */
export function sameState(a: SheetState, b: SheetState) {
  return a.effectiveDate === b.effectiveDate && a.notes === b.notes && a.oldDieselPrice === b.oldDieselPrice && a.newDieselPrice === b.newDieselPrice
    && a.lanes.length === b.lanes.length && a.lanes.every((l, i) => l.loadingPoint === b.lanes[i].loadingPoint && l.destination === b.lanes[i].destination && l.rate === b.lanes[i].rate && l.pricingUnit === b.lanes[i].pricingUnit);
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
    return ctx.db.insert("rateSheets", { customerId: args.customerId, defaultPricingUnit: args.defaultPricingUnit, effectiveDate: today(), notes: "", oldDieselPrice: 0, newDieselPrice: 0, lanes: [], contacts: [], revision: 0, createdAt: now, updatedAt: now, updatedBy: user._id, updatedByEmail: user.email });
  },
});
export const saveLanes = mutation({
  args: { token: v.string(), customerId: v.id("customers"), effectiveDate: v.string(), notes: v.string(), oldDieselPrice: v.number(), newDieselPrice: v.number(), lanes: v.array(laneField) },
  handler: async (ctx, args) => {
    const user = await requireAdmin(ctx, args.token);
    const sheet = await requireSheet(ctx, args.customerId);
    validDate(args.effectiveDate); validateDiesel(args.oldDieselPrice, args.newDieselPrice);
    const after: SheetState = { effectiveDate: args.effectiveDate, notes: args.notes, oldDieselPrice: money(args.oldDieselPrice), newDieselPrice: money(args.newDieselPrice), lanes: normalizeLanes(args.lanes, sheet.lanes) };
    if (sameState(stateOf(sheet), after)) throw new Error("Nothing changed. Edit a rate, lane or date first.");
    await ctx.db.patch(sheet._id, { ...after, updatedAt: Date.now(), updatedBy: user._id, updatedByEmail: user.email });
    // Lane ids for newly added rows are minted here, so the saved order is handed back and the browser can adopt them. Without this every later save would mint a fresh id for the same lane.
    return { lanes: after.lanes };
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
