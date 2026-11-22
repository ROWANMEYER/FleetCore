import { ConvexError, v, type Infer } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { agreementType, compositionProblem, DEFAULT_FUEL_COMPOSITION, laneField, pricingUnit, pricingUnits, rateSheetDocument, tariffHistoryDocument, validDay, type AgreementType, type PricingUnit } from "./rateSheetFields";

/** Live cards remain one document per customer; every edit also writes an immutable tariff snapshot. */
export type SheetLane = Infer<typeof laneField>;
export type SheetState = { effectiveDate?: string; notes: string; oldDieselPrice: number; newDieselPrice: number; lanes: SheetLane[]; agreementType?: AgreementType; fuelCompositionPercent?: number };
export type Sheet = Doc<"rateSheets">;
const MAX_LANES = 200, MAX_LANE_TEXT = 160;

export function money(value: number): number {
  if (!Number.isFinite(value) || value < 0 || value > 1_000_000_000) throw new Error("Enter a valid non-negative amount.");
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
export function validDate(value: string) {
  if (!validDay(value)) throw new Error("Enter a valid date.");
}
export function laneKey(from: string, to: string) {
  return [from, to].map(s => s.trim().replace(/\s+/g, " ").toLowerCase()).join("\u0000");
}
/** The customer date is a fallback; a lane may have its own effective date. */
export function settleAddedDate(stored: string | undefined, incoming: string | undefined): string {
  const claimed = (incoming ?? "").trim();
  if (stored !== undefined && !claimed) return stored;
  if (!claimed) throw new Error("Set the date these rates were added before saving.");
  validDate(claimed);
  return claimed;
}
async function requireAdmin(ctx: QueryCtx, token: string) {
  const session = await ctx.db.query("sessions").withIndex("by_token", q => q.eq("token", token)).first();
  if (!session || session.expiresAt <= Date.now()) throw new Error("Sign in again.");
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
function checkRevision(sheet: Sheet, expected: number | undefined) {
  // Optional for compatibility with already-open legacy clients; the new editor always supplies it.
  if (expected !== undefined && expected !== sheet.revision) throw new ConvexError("These rates changed in another session. Reopen the customer before saving.");
}
export function normalizeLanes(input: SheetLane[], previous: SheetLane[]): SheetLane[] {
  if (!input.length) throw new Error("Add at least one lane.");
  if (input.length > MAX_LANES) throw new Error(`A customer can have at most ${MAX_LANES} lanes.`);
  const seen = new Set<string>(), ids = new Set<string>();
  return input.map((lane, index) => {
    const loadingPoint = lane.loadingPoint.trim(), destination = lane.destination.trim();
    if (!loadingPoint || !destination) throw new Error("Every lane needs a loading point and a destination.");
    if (loadingPoint.length > MAX_LANE_TEXT || destination.length > MAX_LANE_TEXT) throw new Error(`Loading point and destination are limited to ${MAX_LANE_TEXT} characters each.`);
    const key = laneKey(loadingPoint, destination);
    if (seen.has(key)) throw new Error(`${loadingPoint} to ${destination} is listed twice.`);
    seen.add(key);
    if (lane.pricingUnit && !pricingUnits.includes(lane.pricingUnit as PricingUnit)) throw new Error("Choose a valid pricing unit.");
    const date = lane.date?.trim();
    if (date && !validDay(date)) throw new Error(`${loadingPoint} to ${destination} needs a valid date in YYYY-MM-DD format.`);
    if (!Number.isFinite(lane.rate) || lane.rate < 0) throw new Error(`${loadingPoint} to ${destination} needs a rate of zero or more.`);
    const id = lane.id && previous.some(p => p.id === lane.id) ? lane.id : crypto.randomUUID();
    if (ids.has(id)) throw new Error("Each lane must have its own id.");
    ids.add(id);
    return { id, loadingPoint, destination, ...(lane.pricingUnit ? { pricingUnit: lane.pricingUnit } : {}), ...(date ? { date } : {}), rate: money(lane.rate), sortOrder: index };
  });
}
export function sameState(a: SheetState, b: SheetState) {
  return a.effectiveDate === b.effectiveDate && a.notes === b.notes && a.oldDieselPrice === b.oldDieselPrice && a.newDieselPrice === b.newDieselPrice
    && a.agreementType === b.agreementType && a.fuelCompositionPercent === b.fuelCompositionPercent
    && a.lanes.length === b.lanes.length && a.lanes.every((l, i) => l.loadingPoint === b.lanes[i].loadingPoint && l.destination === b.lanes[i].destination && l.rate === b.lanes[i].rate && l.pricingUnit === b.lanes[i].pricingUnit && l.date === b.lanes[i].date);
}
const stateOf = (sheet: Sheet): SheetState => ({ effectiveDate: sheet.effectiveDate, notes: sheet.notes, oldDieselPrice: sheet.oldDieselPrice, newDieselPrice: sheet.newDieselPrice, lanes: sheet.lanes, ...(sheet.agreementType ? { agreementType: sheet.agreementType } : {}), ...(sheet.fuelCompositionPercent !== undefined ? { fuelCompositionPercent: sheet.fuelCompositionPercent } : {}) });

async function recordHistory(ctx: MutationCtx, sheet: Sheet, action: Doc<"rateSheetHistory">["action"]) {
  // Avoid explicit undefined in inserted Convex values.
  const state = stateOf(sheet);
  const { effectiveDate, ...rest } = state;
  await ctx.db.insert("rateSheetHistory", {
    customerId: sheet.customerId, sheetId: sheet._id, revision: sheet.revision, action,
    snapshot: { ...rest, ...(effectiveDate ? { effectiveDate } : {}), defaultPricingUnit: sheet.defaultPricingUnit },
    recordedAt: sheet.updatedAt, recordedBy: sheet.updatedBy, recordedByEmail: sheet.updatedByEmail,
  });
}
async function preserveBaseline(ctx: MutationCtx, sheet: Sheet) {
  const existing = await ctx.db.query("rateSheetHistory").withIndex("by_sheet", q => q.eq("sheetId", sheet._id)).first();
  if (!existing) await recordHistory(ctx, sheet, "baseline");
}

export const get = query({
  args: { token: v.string(), customerId: v.id("customers") },
  returns: v.union(rateSheetDocument, v.null()),
  handler: async (ctx, args) => { await requireAdmin(ctx, args.token); return getSheet(ctx, args.customerId); },
});
export const list = query({
  args: { token: v.string() },
  returns: v.array(v.object({ customerId: v.id("customers"), customerName: v.string(), isActive: v.boolean(), laneCount: v.number(), effectiveDate: v.optional(v.string()), oldDieselPrice: v.number(), newDieselPrice: v.number(), updatedAt: v.number(), updatedByEmail: v.string() })),
  handler: async (ctx, args) => {
    await requireAdmin(ctx, args.token);
    const sheets = await ctx.db.query("rateSheets").take(2001);
    if (sheets.length > 2000) throw new Error("Too many customer rate sheets to display together.");
    const rows = await Promise.all(sheets.map(async sheet => {
      const customer = await ctx.db.get(sheet.customerId);
      return { customerId: sheet.customerId, customerName: customer?.name ?? "Missing customer", isActive: customer?.isActive ?? false,
        laneCount: sheet.lanes.length, effectiveDate: sheet.effectiveDate, oldDieselPrice: sheet.oldDieselPrice, newDieselPrice: sheet.newDieselPrice,
        updatedAt: sheet.updatedAt, updatedByEmail: sheet.updatedByEmail };
    }));
    return rows.sort((a, b) => a.customerName.localeCompare(b.customerName));
  },
});
/** Customer index keeps old sheets' history visible even after deletion/recreation. */
export const history = query({
  args: { token: v.string(), customerId: v.id("customers"), paginationOpts: paginationOptsValidator },
  returns: v.object({ page: v.array(tariffHistoryDocument), isDone: v.boolean(), continueCursor: v.string(), splitCursor: v.optional(v.union(v.string(), v.null())), pageStatus: v.optional(v.union(v.literal("SplitRecommended"), v.literal("SplitRequired"), v.null())) }),
  handler: async (ctx, args) => {
    await requireAdmin(ctx, args.token);
    if (!Number.isInteger(args.paginationOpts.numItems) || args.paginationOpts.numItems < 1 || args.paginationOpts.numItems > 25) throw new Error("Request between 1 and 25 historical records at a time.");
    return ctx.db.query("rateSheetHistory").withIndex("by_customer", q => q.eq("customerId", args.customerId)).order("desc").paginate(args.paginationOpts);
  },
});
export const create = mutation({
  args: { token: v.string(), customerId: v.id("customers"), defaultPricingUnit: pricingUnit },
  returns: v.id("rateSheets"),
  handler: async (ctx, args) => {
    const user = await requireAdmin(ctx, args.token);
    const customer = await ctx.db.get(args.customerId);
    if (!customer?.isActive) throw new Error("Select an active customer.");
    const existing = await getSheet(ctx, args.customerId);
    if (existing) return existing._id;
    const now = Date.now();
    return ctx.db.insert("rateSheets", { customerId: args.customerId, defaultPricingUnit: args.defaultPricingUnit, agreementType: "fuel_linked", fuelCompositionPercent: DEFAULT_FUEL_COMPOSITION, notes: "", oldDieselPrice: 0, newDieselPrice: 0, lanes: [], contacts: [], revision: 0, createdAt: now, updatedAt: now, updatedBy: user._id, updatedByEmail: user.email });
  },
});
export const saveLanes = mutation({
  args: { token: v.string(), customerId: v.id("customers"), expectedRevision: v.optional(v.number()), effectiveDate: v.optional(v.string()), notes: v.string(), oldDieselPrice: v.number(), newDieselPrice: v.number(), lanes: v.array(laneField), agreementType: v.optional(agreementType), fuelCompositionPercent: v.optional(v.number()) },
  returns: v.object({ lanes: v.array(laneField), effectiveDate: v.string(), revision: v.number() }),
  handler: async (ctx, args) => {
    const user = await requireAdmin(ctx, args.token);
    const sheet = await requireSheet(ctx, args.customerId);
    checkRevision(sheet, args.expectedRevision);
    const effectiveDate = settleAddedDate(sheet.effectiveDate, args.effectiveDate);
    const type = args.agreementType ?? sheet.agreementType;
    const percent = args.fuelCompositionPercent ?? sheet.fuelCompositionPercent ?? (type ? DEFAULT_FUEL_COMPOSITION : undefined);
    if (percent !== undefined && compositionProblem(percent)) throw new Error(compositionProblem(percent)!);
    const after: SheetState = { effectiveDate, notes: args.notes, oldDieselPrice: money(args.oldDieselPrice), newDieselPrice: money(args.newDieselPrice), lanes: normalizeLanes(args.lanes, sheet.lanes), ...(type ? { agreementType: type } : {}), ...(percent !== undefined ? { fuelCompositionPercent: percent } : {}) };
    if (sameState(stateOf(sheet), after)) throw new Error("Nothing changed. Edit a rate, lane or date first.");
    await preserveBaseline(ctx, sheet);
    const update = { ...after, revision: sheet.revision + 1, updatedAt: Date.now(), updatedBy: user._id, updatedByEmail: user.email };
    await ctx.db.patch(sheet._id, update);
    await recordHistory(ctx, { ...sheet, ...update }, "save");
    return { lanes: after.lanes, effectiveDate, revision: update.revision };
  },
});
export const setDefaultUnit = mutation({
  args: { token: v.string(), customerId: v.id("customers"), defaultPricingUnit: pricingUnit, expectedRevision: v.optional(v.number()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireAdmin(ctx, args.token);
    const sheet = await requireSheet(ctx, args.customerId);
    checkRevision(sheet, args.expectedRevision);
    if (sheet.defaultPricingUnit === args.defaultPricingUnit) return null;
    await preserveBaseline(ctx, sheet);
    const update = { defaultPricingUnit: args.defaultPricingUnit, revision: sheet.revision + 1, updatedAt: Date.now(), updatedBy: user._id, updatedByEmail: user.email };
    await ctx.db.patch(sheet._id, update);
    await recordHistory(ctx, { ...sheet, ...update }, "unit");
    return null;
  },
});
/** Removing a live card retains its tariff records and does not touch the customer or routes. */
export const deleteSheet = mutation({
  args: { token: v.string(), customerId: v.id("customers"), confirmName: v.string(), expectedRevision: v.optional(v.number()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireAdmin(ctx, args.token);
    const sheet = await requireSheet(ctx, args.customerId);
    checkRevision(sheet, args.expectedRevision);
    const customer = await ctx.db.get(args.customerId);
    if (!customer) throw new Error("Customer not found.");
    if (args.confirmName.trim() !== customer.name.trim()) throw new Error(`Type "${customer.name}" exactly to delete this rate sheet.`);
    await preserveBaseline(ctx, sheet);
    await recordHistory(ctx, { ...sheet, revision: sheet.revision + 1, updatedAt: Date.now(), updatedBy: user._id, updatedByEmail: user.email }, "delete");
    await ctx.db.delete(sheet._id);
    return null;
  },
});
