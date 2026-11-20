import { describe, expect, it } from "vitest";
import { ceramicAssignmentComplete, ceramicPalletLabel, ceramicVersionNeedsReview, mobileCeramicShipments } from "./mobileDispatch";
const rows = [
  { shipmentNumber: "SH00000001", version: 1, updatedAt: 10 },
  { shipmentNumber: "SH00000002", version: 2, updatedAt: 30, driverId: "driver", truckId: "truck" },
  { shipmentNumber: "SH00000003", version: 3, updatedAt: 20, driverId: "driver" },
];
describe("mobile Ceramic Tiles dispatch", () => {
  it("shows incomplete assignments first and preserves partially assigned shipments", () => {
    expect(mobileCeramicShipments(rows, "unassigned").map(row => row.shipmentNumber)).toEqual(["SH00000003", "SH00000001"]);
    expect(mobileCeramicShipments(rows, "assigned").map(row => row.shipmentNumber)).toEqual(["SH00000002"]);
    expect(mobileCeramicShipments(rows, "all").map(row => row.shipmentNumber)).toEqual(["SH00000003", "SH00000001", "SH00000002"]);
    expect(ceramicAssignmentComplete(rows[2])).toBe(false);
  });
  it("searches shipment numbers without changing source records", () => {
    expect(mobileCeramicShipments(rows, "all", " sh00000002 ")).toEqual([rows[1]]);
    expect(rows[0].shipmentNumber).toBe("SH00000001");
  });
  it("flags a newer version until that exact version has been reviewed", () => {
    expect(ceramicVersionNeedsReview(rows[0])).toBe(false);
    expect(ceramicVersionNeedsReview(rows[1])).toBe(true);
    expect(ceramicVersionNeedsReview({ ...rows[1], driverInstructions: { reviewedVersion: 2 } })).toBe(false);
    expect(ceramicVersionNeedsReview({ ...rows[1], version: 3, driverInstructions: { reviewedVersion: 2 } })).toBe(true);
  });
  it("uses actual pallet quantities without inventing missing values", () => {
    expect(ceramicPalletLabel({ totalPallets: 27.731 })).toBe("27.731 pallets");
    expect(ceramicPalletLabel({ totalPallets: null })).toBe("Pallets not specified");
  });
});
