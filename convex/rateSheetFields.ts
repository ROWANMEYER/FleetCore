import { v } from "convex/values";

/**
 * Field validators for a rate sheet. These live apart from both the schema and the rate sheet functions, because the schema cannot import from a module that imports the generated server code: that cycle stops Convex reading the schema at all.
 */
export const pricingUnits = ["full", "ton", "pallet", "bag", "bale"] as const;
export type PricingUnit = (typeof pricingUnits)[number];
export const pricingUnit = v.union(v.literal("full"), v.literal("ton"), v.literal("pallet"), v.literal("bag"), v.literal("bale"));
export const laneField = v.object({ id: v.string(), loadingPoint: v.string(), destination: v.string(), pricingUnit: v.optional(v.string()), rate: v.number(), date: v.optional(v.string()), sortOrder: v.number() });

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

/** Missing agreementType preserves the original recorded-composition calculation. */
export const DEFAULT_FUEL_COMPOSITION = 45;
export const agreementType = v.union(v.literal("fuel_linked"), v.literal("fixed"), v.literal("customer_notified"));
export type AgreementType = "fuel_linked" | "fixed" | "customer_notified";
export function compositionProblem(value: number): string | null {
  return Number.isFinite(value) && value >= 0 && value <= 100 ? null : "Fuel composition must be between 0 and 100%.";
}

export const tariffSnapshotFields = {
  effectiveDate: v.optional(v.string()),
  notes: v.string(), oldDieselPrice: v.number(), newDieselPrice: v.number(),
  lanes: v.array(laneField), defaultPricingUnit: pricingUnit,
  agreementType: v.optional(agreementType), fuelCompositionPercent: v.optional(v.number()),
};
export const rateSheetFields = {
  ...tariffSnapshotFields,
  customerId: v.id("customers"),
  contacts: v.array(v.object({ name: v.string(), email: v.string(), isPrimary: v.boolean(), isActive: v.boolean() })),
  revision: v.number(), createdAt: v.number(), updatedAt: v.number(),
  updatedBy: v.id("users"), updatedByEmail: v.string(),
};
export const rateSheetDocument = v.object({ _id: v.id("rateSheets"), _creationTime: v.number(), ...rateSheetFields });
export const tariffHistoryFields = {
  customerId: v.id("customers"), sheetId: v.id("rateSheets"), revision: v.number(),
  action: v.union(v.literal("baseline"), v.literal("save"), v.literal("unit"), v.literal("delete"), v.literal("customer_adjustment")),
  customerAdjustmentId: v.optional(v.id("customerRateAdjustments")),
  snapshot: v.object(tariffSnapshotFields),
  recordedAt: v.number(), recordedBy: v.id("users"), recordedByEmail: v.string(),
};
export const tariffHistoryDocument = v.object({ _id: v.id("rateSheetHistory"), _creationTime: v.number(), ...tariffHistoryFields });
