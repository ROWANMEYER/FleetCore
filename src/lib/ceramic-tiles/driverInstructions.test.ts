import { describe, expect, it } from "vitest";
import {
  buildCeramicDriverMessage,
  normaliseWhatsAppNumber,
  DEFAULT_CERAMIC_SAFETY_NOTES,
} from "./driverInstructions";
import type { CeramicShipment } from "./parser";

const shipment: CeramicShipment = {
  shipmentNumber: "SH00130526",
  version: 1,
  totalWeightKg: 258.9,
  totalPallets: 2.3,
  transporter: "Example Carrier",
  plannedLoadingDate: "2026-11-20",
  plannedDeliveryDate: "2026-11-24",
  warnings: [],
  destinations: [{
    name: "CTM George",
    addressLines: ["Knysna Road", "George"],
    orders: [
      { deliveryNumber: "281413185", orderNumber: "4502520296", weightKg: 201.5, palletsEstimate: 1.8, collectFrom: "1500-Betta Baths Krugersdorp" },
      { deliveryNumber: "281415286", orderNumber: "Replacement", weightKg: 57.4, palletsEstimate: 0.5, collectFrom: "1500-Betta Baths Krugersdorp" },
    ],
  }],
};

describe("Ceramic Tiles driver WhatsApp instructions", () => {
  it("includes shipment references, stops and grouped collection points", () => {
    const draft = buildCeramicDriverMessage({
      shipment,
      driverName: "Example Driver",
      truckNumber: "110",
      safetyNotes: DEFAULT_CERAMIC_SAFETY_NOTES,
      additionalNotes: "Call the warehouse before collection.",
    });
    expect(draft).toContain("SH00130526 (Version 1)");
    expect(draft).toContain("Driver: Example Driver");
    expect(draft).toContain("Truck: 110");
    expect(draft).toContain("20/11/2026");
    expect(draft).toContain("24/11/2026");
    expect(draft).toContain("258.9 kg");
    expect(draft).toContain("2.3");
    expect(draft).toContain("281413185, 281415286");
    expect(draft).toContain("CTM George");
    expect(draft).toContain("Order 4502520296");
    expect(draft).toContain("Call the warehouse before collection.");
    expect(draft).toContain("Inspect freight");
  });

  it("generates a draft even when some fields have not been supplied", () => {
    const draft = buildCeramicDriverMessage({
      shipment: { ...shipment, totalWeightKg: null, plannedLoadingDate: null, destinations: [{ name: "Review destination", addressLines: [], orders: [{ ...shipment.destinations[0].orders[0], collectFrom: "" }] }] },
      driverName: "",
      truckNumber: "",
      safetyNotes: "",
      additionalNotes: "",
    });
    expect(draft).toContain("Driver: Unassigned");
    expect(draft).toContain("To be confirmed");
    expect(draft).toContain("Collection point to be confirmed");
    expect(draft).not.toContain("*SAFETY & DELIVERY PROCEDURES*");
  });

  it("normalises South African phone numbers and refuses invalid numbers", () => {
    expect(normaliseWhatsAppNumber("082 123 4567")).toBe("27821234567");
    expect(normaliseWhatsAppNumber("+27 82 123 4567")).toBe("27821234567");
    expect(normaliseWhatsAppNumber("0027 82 123 4567")).toBe("27821234567");
    expect(normaliseWhatsAppNumber(null)).toBe(null);
    expect(normaliseWhatsAppNumber("012")).toBe(null);
  });
});
