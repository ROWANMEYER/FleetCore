import { v } from "convex/values";
export const ceramicDestinationCheck = v.object({ destination: v.string(), towns: v.array(v.string()), matched: v.boolean(), tariffs: v.array(v.string()) });
const nullable = v.union(v.number(), v.null());
export const ceramicBillingRules = { defaultTons: v.number(), extraStopPrice: v.number(), localSmallPrice: v.number(), localLargePrice: v.number(), localMaxWeightKg: v.number(), localMaxPallets: v.number(), billingStartDay: v.number() };
export const ceramicBillingConfig = v.object({ ...ceramicBillingRules, effectiveDate: v.string(), customerId: v.optional(v.id("customers")), version: v.string() });
export const ceramicBillingVariant = v.union(v.literal("standard"), v.literal("sp"));
export const ceramicAutomation = v.object({
  destinationMatchVersion: v.optional(v.number()),
  status: v.union(v.literal("confirmed"), v.literal("needs_review")), routeDate: v.string(), variant: ceramicBillingVariant,
  chargeableTons: v.number(), pickupCount: v.number(), pickupTownCount: v.optional(v.number()), dropCount: v.number(), extraPickups: v.number(), extraDrops: v.number(),
  ...ceramicBillingRules, freight: nullable, mainTotal: nullable, localTotal: nullable,
  fingerprint: v.string(), settingsVersion: v.string(), confirmedAt: v.number(), confirmedBy: v.string(),
  tariff: v.union(v.null(), v.object({ key: v.string(), sheetId: v.string(), revision: v.number(), laneId: v.string(), loadingPoint: v.string(), destination: v.string(), effectiveDate: v.string(), ratePerTon: v.number() })),
  issues: v.array(v.string()),
});
export const ceramicTariffChoice = v.object({ key: v.string(), sheetId: v.string(), revision: v.number(), laneId: v.string(), loadingPoint: v.string(), destination: v.string(), effectiveDate: v.string(), ratePerTon: v.number(), variant: v.union(v.literal("standard"), v.literal("sp")), destinationTowns: v.optional(v.array(v.string())), matchedDestinations: v.array(v.string()) });
export const ceramicBillingPreview = v.object({
  readOnly: v.boolean(), routeDate: v.string(), version: v.number(), assignmentUpdatedAt: v.number(), billingUpdatedAt: v.number(),
  destinationChecks: v.optional(v.array(ceramicDestinationCheck)),
  ruleIssues: v.array(v.string()), fingerprint: v.string(), config: ceramicBillingConfig, choices: v.array(ceramicTariffChoice), selected: v.union(ceramicTariffChoice, v.null()),
  calculation: v.object({ chargeableTons: v.number(), pickups: v.number(), pickupTowns: v.array(v.string()), pickupTownCount: nullable, deliveries: v.number(), extraPickups: v.number(), extraDrops: v.number(), pickupCharge: v.number(), dropCharge: v.number(), freight: nullable, mainTotal: nullable, localTotal: nullable, combinedTotal: nullable,
    locals: v.array(v.object({ key: v.string(), kind: v.union(v.literal("collection"), v.literal("delivery")), name: v.string(), address: v.string(), deliveryNumbers: v.array(v.string()), weightKg: v.number(), pallets: nullable, from: v.string(), to: v.string(), price: nullable })), issues: v.array(v.string()) }),
  saved: v.union(v.null(), v.object({ ratePerTon: nullable, mainTotal: nullable, localTotal: nullable, chargeableTons: v.number(), status: v.string(), routeDate: v.string(), tariffLabel: v.string(), sourceVersion: v.number(), tariffKey: v.string(), fingerprint: v.string(), confirmedAt: v.number() })),
});
