import type { CeramicShipment } from "./parser";

/** Initial guidance is generated for each shipment and may be edited by dispatch. */
export const DEFAULT_CERAMIC_SAFETY_NOTES = [
  "Perform a complete pre-trip vehicle and equipment inspection.",
  "Confirm the shipment, delivery orders and pallet quantities at every collection point.",
  "Inspect freight and packaging for visible damage before accepting it. Report shortages, damage or discrepancies to dispatch immediately.",
  "Secure the load correctly for its weight and fragile contents; recheck restraints during the trip.",
  "Use the required PPE and follow site loading/unloading instructions.",
  "Drive defensively, observe speed and legal weight limits and take required rest breaks.",
  "Obtain signed proof of delivery and report delays or problems without waiting until the end of the day.",
].join("\n");

const number = (value: number | null): string =>
  value === null ? "Not specified" : value.toLocaleString("en-GB", { maximumFractionDigits: 3 });

const displayDate = (value: string | null): string =>
  value ? `${value.slice(8, 10)}/${value.slice(5, 7)}/${value.slice(0, 4)}` : "To be confirmed";

export type DriverMessageArgs = {
  shipment: CeramicShipment;
  driverName: string;
  truckNumber: string;
  safetyNotes: string;
  additionalNotes: string;
};

/**
 * Deterministic, reviewable plain-text WhatsApp draft.
 * No transmission occurs in this helper.
 */
export function buildCeramicDriverMessage({
  shipment, driverName, truckNumber, safetyNotes, additionalNotes,
}: DriverMessageArgs): string {
  const lines: string[] = [
    "*CERAMIC TILES — DRIVER INSTRUCTIONS*",
    `Shipment: ${shipment.shipmentNumber} (Version ${shipment.version})`,
    `Driver: ${driverName.trim() || "Unassigned"}`,
    `Truck: ${truckNumber.trim() || "Unassigned"}`,
    `Planned loading: ${displayDate(shipment.plannedLoadingDate)}`,
    `Planned delivery: ${displayDate(shipment.plannedDeliveryDate)}`,
    `Shipment weight: ${number(shipment.totalWeightKg)} kg`,
    `Shipment pallets: ${number(shipment.totalPallets)}`,
    "",
    "*COLLECTION POINTS*",
  ];
  const collectionMap = new Map<string, string[]>();
  for (const destination of shipment.destinations) {
    for (const order of destination.orders) {
      const place = order.collectFrom.trim() || "Collection point to be confirmed";
      const list = collectionMap.get(place) ?? [];
      list.push(order.deliveryNumber);
      collectionMap.set(place, list);
    }
  }
  for (const [place, deliveries] of collectionMap) {
    lines.push(`• ${place} — delivery refs: ${deliveries.join(", ")}`);
  }
  lines.push("", "*DELIVERY DESTINATIONS*");
  shipment.destinations.forEach((destination, index) => {
    lines.push(`${index + 1}. ${destination.name}`);
    if (destination.addressLines.length) {
      lines.push(`   ${destination.addressLines.join(", ")}`);
    }
    for (const order of destination.orders) {
      lines.push(
        `   Delivery ${order.deliveryNumber} | Order ${order.orderNumber} | ${number(order.weightKg)} kg | ${number(order.palletsEstimate)} PAL`
      );
    }
  });
  if (additionalNotes.trim()) lines.push("", "*ADDITIONAL INSTRUCTIONS*", additionalNotes.trim());
  if (safetyNotes.trim()) {
    lines.push("", "*SAFETY & DELIVERY PROCEDURES*");
    safetyNotes.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
      .forEach((note) => lines.push(`• ${note.replace(/^[•\-*\s]+/, "")}`));
  }
  lines.push("", "Please confirm you received these instructions and contact dispatch about any discrepancies.");
  return lines.join("\n");
}

/** Returns a wa.me-compatible number; null means it must be corrected first. */
export function normaliseWhatsAppNumber(value: string | null | undefined): string | null {
  if (!value) return null;
  let digits = value.replace(/\D/g, "");
  if (digits.startsWith("0027")) digits = digits.slice(2);
  if (/^0\d{9}$/.test(digits)) digits = `27${digits.slice(1)}`;
  if (!/^[1-9]\d{8,14}$/.test(digits)) return null;
  return digits;
}
