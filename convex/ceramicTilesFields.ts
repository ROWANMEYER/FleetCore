import { v } from "convex/values";

/** Share the exact shipment contract between the schema and import mutations. */
export const ceramicRegion = v.union(v.literal("garden_route"), v.literal("eastern_cape"));
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
