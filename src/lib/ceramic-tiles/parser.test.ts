import { describe, expect, it } from "vitest";
import { parseCeramicShipmentText } from "./parser";

/** Redacted representative SAP plan layout; no customer shipment PDFs in Git. */
const base = `
Page 1 of 2 Pages
LOADING / SHIPMENT PLAN
SHIPMENT SH00123456 1250.50 KG
                    2.75 PAL
Version: 5
Transporter: Example Carrier
DELIVER TO: SHOP01-EXAMPLE STORE
  1 SAMPLE ROAD
  EXAMPLE CITY
__________________________________________________________________
Delivery : 281400001   Order No. : ABC123 re    250.50 KG
Collect @ 1500-Example Warehouse
 Sample Industrial Area
 SKU123                10.00 PC       1.0 PAL
  SAMPLE PRODUCT
__________________________________________________________________
Page 2 of 2 Pages
LOADING / SHIPMENT PLAN
SHIPMENT SH00123456 1250.50 KG
                    2.75 PAL
Version: 5
Delivery : 281400002   Order No. : 4502512345   1000.00 KG
Collect @ 1700-Another Site
 SKU789                10.00 PC       1.5 PAL
  SECOND PRODUCT
__________________________________________________________________
Planned Loading date : 20.11.2026 Time : 00:00:00
Planned Delivery date : 24.11.2026 Time : 00:00:00
`;

describe("Ceramic Tiles shipment parser", () => {
  it("extracts version, dates, destinations and continuation-page orders", () => {
    const result = parseCeramicShipmentText(base);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.shipment.shipmentNumber).toBe("SH00123456");
    expect(result.shipment.version).toBe(5);
    expect(result.shipment.totalWeightKg).toBe(1250.5);
    expect(result.shipment.totalPallets).toBe(2.75);
    expect(result.shipment.plannedLoadingDate).toBe("2026-11-20");
    expect(result.shipment.plannedDeliveryDate).toBe("2026-11-24");
    expect(result.shipment.destinations).toHaveLength(1);
    expect(result.shipment.destinations[0].orders).toHaveLength(2);
    expect(result.shipment.destinations[0].orders[0].orderNumber).toBe("ABC123 re");
    expect(result.shipment.destinations[0].orders[0].collectFrom).toBe("1500-Example Warehouse, Sample Industrial Area");
    expect(result.shipment.destinations[0].orders[0].palletsEstimate).toBe(1);
    expect(result.shipment.destinations[0].orders[1].palletsEstimate).toBe(1.5);
  });

  it("rejects documents without a shipment number or version", () => {
    expect(parseCeramicShipmentText("a blank PDF").ok).toBe(false);
    expect(parseCeramicShipmentText("SHIPMENT SH00123456 1250.50 KG").ok).toBe(false);
  });

  it("rejects documents with no delivery orders", () => {
    expect(parseCeramicShipmentText("SHIPMENT SH00123456 1250.50 KG\nVersion: 5").ok).toBe(false);
  });

  it("retains separate delivery address sections", () => {
    const input = base.replace("Planned Loading date :", "DELIVER TO: SHOP02-SECOND STORE\n  2 OTHER ROAD\nDelivery : 281400003 Order No. : 456 12.0 KG\nCollect @ 1100-Other\nPlanned Loading date :");
    const result = parseCeramicShipmentText(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.shipment.destinations).toHaveLength(2);
    expect(result.shipment.destinations[1].orders[0].deliveryNumber).toBe("281400003");
  });

  it("rejects a PDF that accidentally combines two different shipments", () => {
    const mixed = base.replace(
      "Delivery : 281400002",
      "SHIPMENT SH00999999 1000.00 KG\nDelivery : 281400002",
    );
    const result = parseCeramicShipmentText(mixed);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(" ")).toContain("multiple shipment numbers");
  });

  it("rejects inconsistent revisions across pages", () => {
    const mixed = base.replace(
      "Delivery : 281400002",
      "Version: 6\nDelivery : 281400002",
    );
    const result = parseCeramicShipmentText(mixed);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(" ")).toContain("inconsistent shipment versions");
  });

  it("flags mismatched order weights but leaves the shipment reviewable", () => {
    const result = parseCeramicShipmentText(base.replace("Order No. : ABC123 re    250.50 KG", "Order No. : ABC123 re    251.50 KG"));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.shipment.warnings.some((warning) => warning.includes("Shipment weight") && warning.includes("delivery order total"))).toBe(true);
  });

  it("flags repeated delivery numbers without silently hiding them", () => {
    const result = parseCeramicShipmentText(base.replace("281400002", "281400001"));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.shipment.warnings.some((w) => w.includes("Repeated delivery"))).toBe(true);
  });
});
