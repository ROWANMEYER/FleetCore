import { describe, expect, it } from "vitest";
import { buildCeramicDriverMessage, ceramicSafetyNotes, normaliseWhatsAppNumber, DEFAULT_CERAMIC_SAFETY_NOTES } from "./driverInstructions";
import type { CeramicShipment } from "./parser";

const shipment: CeramicShipment = {
  shipmentNumber: "SH00123456", version: 5, totalWeightKg: 258.9, totalPallets: 31.5,
  transporter: "Example Carrier", plannedLoadingDate: "2026-11-20", plannedDeliveryDate: "2026-11-24", warnings: [],
  destinations: [{ name: "SHOP01-Example Tiles George", addressLines: ["1 Sample Road", "George"], orders: [
    { deliveryNumber: "281400001", orderNumber: "ABC123", weightKg: 201.5, palletsEstimate: 1.8, collectFrom: "1100-Betta Sanitaryware Krugersdorp, Chamdor" },
    { deliveryNumber: "281400002", orderNumber: "ABC456", weightKg: 57.4, palletsEstimate: 0.5, collectFrom: "1700-Gryphon Vereeniging" },
    { deliveryNumber: "281400003", orderNumber: "ABC789", weightKg: 10, palletsEstimate: 0.1, collectFrom: "1500-Betta Baths Krugersdorp, Chamdor" },
    { deliveryNumber: "281400004", orderNumber: "ABC999", weightKg: 10, palletsEstimate: 0.1, collectFrom: "1900-Pegasus Vereeniging" },
    { deliveryNumber: "281400005", orderNumber: "ABC000", weightKg: 10, palletsEstimate: 0.1, collectFrom: "1100-Betta Sanitaryware Krugersdorp, Chamdor" },
  ] }],
};
const args = { shipment, driverName: "Example Driver", truckRegistration: "ABC123EC", truckNumber: "V147", safetyNotes: DEFAULT_CERAMIC_SAFETY_NOTES, additionalNotes: "" };

describe("Ceramic Tiles compact driver instructions", () => {
  it("matches dispatch's requested WhatsApp format exactly", () => {
    expect(buildCeramicDriverMessage(args)).toBe([
      "EXAMPLE DRIVER", "ABC123EC", "V147", "", "SHIPMENT SH00123456", "31.5 PALLETS", "",
      "🆘Please tarp all boxes that can get wet.",
      "🆘Please ask the security at the last warehouse you are loading to weigh your axles.",
      "🆘Please look for broken tiles; baths and toilets, and take pictures.",
      "🆘Please all CASHBUILD delivery notes must be STAMPED", "",
      "PICK UP 1) KRUGERSDORP", "1. BETTA", "2. BETTA BATHS", "",
      "PICK UP 2) VEREENIGING", "1. GRYPHON", "2. PEGASUS", "",
      "PLEASE OFFLOAD AS FOLLOW:", "1. EXAMPLE TILES GEORGE", "", "PLEASE TRAVEL SAFELY 🙏",
    ].join("\n"));
  });
  it("retains offload order and separate stops at the same customer", () => {
    const destinations = [shipment.destinations[0], { ...shipment.destinations[0], name: "OTHER02-Other Store", addressLines: ["2 Road"] }, { ...shipment.destinations[0], addressLines: ["3 Road"] }];
    expect(buildCeramicDriverMessage({ ...args, shipment: { ...shipment, destinations } })).toContain("1. EXAMPLE TILES GEORGE\n2. OTHER STORE\n3. EXAMPLE TILES GEORGE");
  });
  it("uses a trading name supplied by the PDF instead of the legal company heading", () => {
    const destinations = [{ ...shipment.destinations[0], name: "SHOP02-Example Holdings T/A", addressLines: ["Example Hardware George", "1 Sample Road"] }];
    expect(buildCeramicDriverMessage({ ...args, shipment: { ...shipment, destinations } })).toContain("1. EXAMPLE HARDWARE GEORGE");
  });
  it("keeps decimal-point pallets and omits the old per-order report", () => {
    const draft = buildCeramicDriverMessage({ ...args, shipment: { ...shipment, totalPallets: 27.731 } });
    expect(draft).toContain("27.731 PALLETS");
    for (const detail of ["Version", "Planned loading", "258.9", "Order ABC123", "281400001", "1 Sample Road", "Trailer"]) expect(draft).not.toContain(detail);
  });
  it("keeps custom safety and dispatch notes and avoids duplicate warning markers", () => {
    const draft = buildCeramicDriverMessage({ ...args, safetyNotes: "🆘Custom notice\n• Second notice", additionalNotes: "Call dispatch before offloading." });
    expect(draft).toContain("🆘Custom notice\n🆘Second notice");
    expect(draft).toContain("Call dispatch before offloading.\n\nPLEASE TRAVEL SAFELY 🙏");
    expect(ceramicSafetyNotes("Custom saved notes")).toBe("Custom saved notes");
    expect(ceramicSafetyNotes("")).toBe("");
    expect(ceramicSafetyNotes()).toBe(DEFAULT_CERAMIC_SAFETY_NOTES);
  });
  it("does not fabricate unknown vehicle, pallet or collection details", () => {
    const draft = buildCeramicDriverMessage({ ...args, driverName: "", truckNumber: "", truckRegistration: "", shipment: { ...shipment, totalPallets: null, destinations: [{ ...shipment.destinations[0], orders: [{ ...shipment.destinations[0].orders[0], collectFrom: "" }] }] } });
    expect(draft).toContain("DRIVER TO BE ASSIGNED\nTRUCK REGISTRATION TO BE CONFIRMED\nTRUCK FLEET NUMBER TO BE CONFIRMED");
    expect(draft).toContain("PALLETS TO BE CONFIRMED");
    expect(draft).toContain("PICK UP 1) COLLECTION TOWN TO BE CONFIRMED\n1. COLLECTION POINT TO BE CONFIRMED");
  });
  it("refreshes the previous built-in safety text without overwriting custom notes", () => {
    const previous = [
      "Perform a complete pre-trip vehicle and equipment inspection.",
      "Confirm the shipment, delivery orders and pallet quantities at every collection point.",
      "Inspect freight and packaging for visible damage before accepting it. Report shortages, damage or discrepancies to dispatch immediately.",
      "Secure the load correctly for its weight and fragile contents; recheck restraints during the trip.",
      "Use the required PPE and follow site loading/unloading instructions.",
      "Drive defensively, observe speed and legal weight limits and take required rest breaks.",
      "Obtain signed proof of delivery and report delays or problems without waiting until the end of the day.",
    ].join("\r\n");
    expect(ceramicSafetyNotes(previous)).toBe(DEFAULT_CERAMIC_SAFETY_NOTES);
    expect(ceramicSafetyNotes(previous + "\nCustom dispatch notice")).toBe(previous + "\nCustom dispatch notice");
  });
  it("normalises South African phone numbers and refuses invalid numbers", () => {
    for (const phone of ["082 123 4567", "+27 82 123 4567", "0027 82 123 4567"]) expect(normaliseWhatsAppNumber(phone)).toBe("27821234567");
    expect(normaliseWhatsAppNumber(null)).toBe(null);
    expect(normaliseWhatsAppNumber("012")).toBe(null);
  });
});
