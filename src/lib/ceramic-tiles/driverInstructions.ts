import type { CeramicShipment } from "./parser";
import { orderedCeramicStops, type CeramicStopOrder } from "./stopOrder";

const LEGACY_CERAMIC_SAFETY_NOTES = [
  "Perform a complete pre-trip vehicle and equipment inspection.",
  "Confirm the shipment, delivery orders and pallet quantities at every collection point.",
  "Inspect freight and packaging for visible damage before accepting it. Report shortages, damage or discrepancies to dispatch immediately.",
  "Secure the load correctly for its weight and fragile contents; recheck restraints during the trip.",
  "Use the required PPE and follow site loading/unloading instructions.",
  "Drive defensively, observe speed and legal weight limits and take required rest breaks.",
  "Obtain signed proof of delivery and report delays or problems without waiting until the end of the day.",
].join("\n");

export const DEFAULT_CERAMIC_SAFETY_NOTES = [
  "Please tarp all boxes that can get wet.",
  "Please ask the security at the last warehouse you are loading to weigh your axles.",
  "Please look for broken tiles; baths and toilets, and take pictures.",
  "Please all CASHBUILD delivery notes must be STAMPED",
].join("\n");

/** Refresh only the previous built-in template; preserve dispatch's custom notes. */
export function ceramicSafetyNotes(saved?: string): string {
  const normalize = (value: string) => value.replace(/\r\n/g, "\n").trim();
  return saved === undefined || normalize(saved) === normalize(LEGACY_CERAMIC_SAFETY_NOTES)
    ? DEFAULT_CERAMIC_SAFETY_NOTES : saved;
}

export type DriverMessageArgs = {
  shipment: CeramicShipment;
  driverName: string;
  truckNumber: string;
  truckRegistration?: string;
  safetyNotes: string;
  additionalNotes: string;
  stopOrder?: CeramicStopOrder;
};

/** Dispatch's compact WhatsApp draft; no sending and no inferred stop reordering. */
export function buildCeramicDriverMessage({
  shipment, driverName, truckNumber, truckRegistration, safetyNotes, additionalNotes, stopOrder,
}: DriverMessageArgs): string {
  const lines = [
    driverName.trim().toUpperCase() || "DRIVER TO BE ASSIGNED",
    truckRegistration?.trim().toUpperCase() || "TRUCK REGISTRATION TO BE CONFIRMED",
    truckNumber.trim().toUpperCase() || "TRUCK FLEET NUMBER TO BE CONFIRMED",
  ];
  lines.push("", `SHIPMENT ${shipment.shipmentNumber}`,
    shipment.totalPallets === null ? "PALLETS TO BE CONFIRMED" : `${shipment.totalPallets.toLocaleString("en-GB", { maximumFractionDigits: 3 })} PALLETS`);
  const notes = safetyNotes.split(/\r?\n/).map(note => note.replace(/^(?:\s|[•*\-]|🆘)+/u, "").trim()).filter(Boolean);
  if (notes.length) lines.push("", ...notes.map(note => `🆘${note}`));
  const stops = orderedCeramicStops(shipment, stopOrder);
  stops.pickups.forEach((town, index) => {
    lines.push("", "PICK UP " + (index + 1) + ") " + town.label);
    town.warehouses.forEach((warehouse, stopIndex) => lines.push((stopIndex + 1) + ". " + warehouse.label));
  });
  lines.push("", "PLEASE OFFLOAD AS FOLLOW:");
  stops.offloads.forEach((destination, index) => lines.push((index + 1) + ". " + destination.label));
  if (additionalNotes.trim()) lines.push("", additionalNotes.trim());
  lines.push("", "PLEASE TRAVEL SAFELY 🙏");
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
