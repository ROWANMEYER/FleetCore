import { v } from "convex/values";

/**
 * Field validators for a rate sheet. These live apart from both the schema and the rate sheet functions, because the schema cannot import from a module that imports the generated server code: that cycle stops Convex reading the schema at all.
 */
export const pricingUnits = ["full", "ton", "pallet", "bag", "bale"] as const;
export type PricingUnit = (typeof pricingUnits)[number];
export const pricingUnit = v.union(v.literal("full"), v.literal("ton"), v.literal("pallet"), v.literal("bag"), v.literal("bale"));
export const laneField = v.object({ id: v.string(), loadingPoint: v.string(), destination: v.string(), pricingUnit: v.optional(v.string()), rate: v.number(), sortOrder: v.number() });

/**
 * A real calendar day written as YYYY-MM-DD.
 *
 * The round trip through Date is what catches the impossible dates that a regex
 * alone waves through: Date.parse("2026-02-31") returns a real timestamp for the
 * 3rd of March, so the written value has to be compared with what came back.
 * Shared with the editor, which checks the same rule before it offers a save.
 */
export function validDay(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(value))
    && new Date(value).toISOString().slice(0, 10) === value;
}
