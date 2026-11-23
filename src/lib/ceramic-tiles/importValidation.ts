import type { CeramicShipment } from "./parser";
import { validCeramicDate } from "./planning";

/** Shared preflight and server validation. SAP order numbers may legitimately be blank. */
export function ceramicImportErrors(shipment: CeramicShipment): string[] {
  const errors: string[] = [], label = shipment.shipmentNumber || "Shipment";
  if (!/^SH\d{6,12}$/i.test(shipment.shipmentNumber)) errors.push("Enter a valid shipment number (SH followed by 6 to 12 digits).");
  if (!Number.isInteger(shipment.version) || shipment.version < 1) errors.push(`${label}: enter a positive whole-number version.`);
  if (!shipment.destinations.length) errors.push(`${label}: add at least one delivery destination.`);
  if (shipment.totalWeightKg !== null && (!Number.isFinite(shipment.totalWeightKg) || shipment.totalWeightKg < 0)) errors.push(`${label}: shipment weight must be zero or greater.`);
  if (shipment.totalPallets !== null && (!Number.isFinite(shipment.totalPallets) || shipment.totalPallets < 0)) errors.push(`${label}: shipment pallets must be zero or greater.`);
  for (const [name, date] of [["loading", shipment.plannedLoadingDate], ["delivery", shipment.plannedDeliveryDate]] as const) {
    if (date !== null && !validCeramicDate(date)) errors.push(`${label}: choose a valid planned ${name} date.`);
  }
  const deliveries = new Set<string>();
  for (const destination of shipment.destinations) {
    if (!destination.name.trim()) errors.push(`${label}: enter a name for every delivery destination.`);
    if (!destination.orders.length) errors.push(`${label}: ${destination.name || "destination"} has no delivery orders.`);
    for (const order of destination.orders) {
      const delivery = order.deliveryNumber || "(missing reference)";
      if (!/^\d+$/.test(order.deliveryNumber)) errors.push(`${label}: delivery ${delivery} must have a numeric delivery reference.`);
      if (deliveries.has(order.deliveryNumber)) errors.push(`${label}: repeated delivery number ${delivery}. Review the delivery references.`);
      deliveries.add(order.deliveryNumber);
      if (!Number.isFinite(order.weightKg) || order.weightKg < 0) errors.push(`${label}: delivery ${delivery} has an invalid weight. Enter zero or greater.`);
      if (order.palletsEstimate !== null && (!Number.isFinite(order.palletsEstimate) || order.palletsEstimate < 0)) errors.push(`${label}: delivery ${delivery} has invalid pallets. Enter zero or greater, or leave blank.`);
    }
  }
  return errors;
}
