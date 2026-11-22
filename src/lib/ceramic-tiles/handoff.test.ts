import { describe, expect, it } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";
import type { CeramicDispatchShipment } from "./mobileDispatch";
import { ceramicSavedHandoff } from "./handoff";
import { whatsAppDraftHref } from "./whatsAppRecipient";

const shipment: CeramicDispatchShipment = {
  _id: "shipment" as Id<"ceramicShipments">, region: "garden_route", shipmentNumber: "SH00990002",
  version: 1, plannerVersion: 1, driverId: "driver" as Id<"drivers">,
  truckId: "truck" as Id<"trucks">, routeDate: "2026-11-22", updatedAt: 100,
  snapshot: { shipmentNumber: "SH00990002", version: 1, totalWeightKg: 34000, totalPallets: 30,
    transporter: "Synthetic", plannedLoadingDate: "2026-11-22", plannedDeliveryDate: "2026-11-23", warnings: [],
    destinations: [{ name: "A01-First store", addressLines: ["George"], orders: [{ deliveryNumber: "001", orderNumber: "A", weightKg: 17000, palletsEstimate: 15, collectFrom: "Betta Krugersdorp" }] },
      { name: "B02-Second store", addressLines: ["Knysna"], orders: [{ deliveryNumber: "002", orderNumber: "B", weightKg: 17000, palletsEstimate: 15, collectFrom: "Betta Krugersdorp" }] }] },
  driverInstructions: { reviewedVersion: 1, safetyNotes: "Saved safety notice", additionalNotes: "Call dispatch on arrival.",
    stopOrder: { pickupTowns: ["KRUGERSDORP"], pickupWarehouses: [JSON.stringify(["KRUGERSDORP", "BETTA"])], offloads: [JSON.stringify(["002"]), JSON.stringify(["001"])] }, updatedAt: 100, updatedBy: "synthetic" },
};
const fleet = { drivers: [{ id: "driver", name: "Test driver", phone: null as string | null }],
  trucks: [{ id: "truck", fleetNumber: "TEST-100", registration: "SYNTHETIC" }] };

describe("Saved Ceramic WhatsApp handoff", () => {
  it("uses the saved notes and delivery order without editing the shipment", () => {
    const before = JSON.stringify(shipment);
    const result = ceramicSavedHandoff(shipment, fleet);
    expect(result.ready).toBe(true);
    if (!result.ready) throw new Error(result.reason);
    expect(result.message).toContain("Saved safety notice");
    expect(result.message).toContain("Call dispatch on arrival.");
    expect(result.message).toContain("1. SECOND STORE\n2. FIRST STORE");
    expect(result.message).toContain("TEST DRIVER\nSYNTHETIC\nTEST-100");
    expect(JSON.stringify(shipment)).toBe(before);
  });
  it("allows a contact chooser without a driver phone and a different per-message number", () => {
    const result = ceramicSavedHandoff(shipment, fleet);
    if (!result.ready) throw new Error(result.reason);
    expect(result.driverPhone).toBeNull();
    const chooser = new URL(whatsAppDraftHref(result.message, "manual", result.driverPhone) as string);
    expect(chooser.pathname).toBe("/");
    expect(chooser.searchParams.get("text")).toBe(result.message);
    const manual = new URL(whatsAppDraftHref(result.message, "manual", null, "082 123 4567") as string);
    expect(manual.pathname).toBe("/27821234567");
    expect(manual.searchParams.get("text")).toBe(result.message);
  });
  it("requires the current assignment and PDF review before offering a message", () => {
    for (const update of [{ routeDate: undefined }, { plannerVersion: undefined }, { version: 2 }]) {
      expect(ceramicSavedHandoff({ ...shipment, ...update }, fleet)).toMatchObject({ ready: false, action: "assignment" });
    }
    for (const update of [{ driverInstructions: undefined }, { updatedAt: 101 },
      { driverInstructions: { ...shipment.driverInstructions!, reviewedVersion: undefined } }]) {
      expect(ceramicSavedHandoff({ ...shipment, ...update }, fleet)).toMatchObject({ ready: false, action: "instructions" });
    }
  });
  it("explains missing fleet records and directs the user to repair the assignment", () => {
    for (const choices of [{ ...fleet, drivers: [] }, { ...fleet, trucks: [] }]) {
      expect(ceramicSavedHandoff(shipment, choices)).toMatchObject({ ready: false, action: "assignment", reason: expect.stringContaining("unavailable") });
    }
  });
});
