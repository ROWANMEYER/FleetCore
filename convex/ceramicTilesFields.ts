import { ceramicAutomation } from "./ceramicBillingFields";
import { regionValidator } from "./regionFields";
import { v } from "convex/values";

/** Share the exact shipment contract between the schema and import mutations. */
export const ceramicRegion = regionValidator;
export const ceramicNullableNumber = v.union(v.number(), v.null());
export const ceramicNullableText = v.union(v.string(), v.null());
export const ceramicOrder = v.object({
  deliveryNumber: v.string(),
  orderNumber: v.string(),
  weightKg: v.number(),
  collectFrom: v.string(),
  palletsEstimate: ceramicNullableNumber,
});
export const ceramicDestination = v.object({
  name: v.string(),
  addressLines: v.array(v.string()),
  orders: v.array(ceramicOrder),
});
export const ceramicShipmentSnapshot = v.object({
  shipmentNumber: v.string(),
  version: v.number(),
  totalWeightKg: ceramicNullableNumber,
  totalPallets: ceramicNullableNumber,
  transporter: ceramicNullableText,
  plannedLoadingDate: ceramicNullableText,
  plannedDeliveryDate: ceramicNullableText,
  destinations: v.array(ceramicDestination),
  warnings: v.array(v.string()),
});

export const ceramicStopOrder = v.object({
  pickupTowns: v.array(v.string()),
  pickupWarehouses: v.array(v.string()),
  offloads: v.array(v.string()),
});

export const ceramicLocalLeg = v.object({
  key: v.string(), kind: v.union(v.literal("collection"), v.literal("delivery")), name: v.string(), address: v.string(),
  deliveryNumbers: v.array(v.string()), weightKg: v.number(), pallets: ceramicNullableNumber,
});
export const ceramicBilling = v.object({
  automation: v.optional(ceramicAutomation),
  ratePerTon: ceramicNullableNumber, stops: ceramicNullableNumber, drops: ceramicNullableNumber,
  crossBorder: v.string(), load: v.string(),
  locals: v.array(v.object({ key: v.string(), from: v.string(), to: v.string(), price: ceramicNullableNumber })),
});
export const ceramicReportRow = v.object({
  shipmentId: v.id("ceramicShipments"), routeId: v.id("dailyRoutes"), region: ceramicRegion,
  shipmentNumber: v.string(), version: v.number(), routeDate: v.string(), driverName: v.string(), truckFleetNo: v.string(),
  fromLocations: v.array(v.string()), toLocations: v.array(v.string()), deliveryNumbers: v.array(v.string()),
  truckRegistration: v.optional(v.string()), billing: v.optional(ceramicBilling), billingUpdatedAt: v.optional(v.number()), billingSourceVersion: v.optional(v.number()),
  warehouseWeights: v.optional(v.array(v.object({ code: v.string(), weightKg: v.number() }))),
  unmappedWarehouses: v.optional(v.array(v.object({ name: v.string(), weightKg: v.number() }))),
  weightKg: ceramicNullableNumber, pallets: ceramicNullableNumber, needsReview: v.boolean(), locals: v.array(ceramicLocalLeg),
});
