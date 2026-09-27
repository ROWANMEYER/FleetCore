import { v } from "convex/values";

/**
 * Field validators for a rate sheet. These live apart from both the schema and the rate sheet functions, because the schema cannot import from a module that imports the generated server code: that cycle stops Convex reading the schema at all.
 */
export const pricingUnits = ["full", "ton", "pallet", "bag", "bale"] as const;
export type PricingUnit = (typeof pricingUnits)[number];
export const pricingUnit = v.union(v.literal("full"), v.literal("ton"), v.literal("pallet"), v.literal("bag"), v.literal("bale"));
export const laneField = v.object({ id: v.string(), loadingPoint: v.string(), destination: v.string(), pricingUnit: v.optional(v.string()), rate: v.number(), sortOrder: v.number() });
