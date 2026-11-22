import { describe, expect, it } from "vitest";
import { ceramicDeliveryStops, ceramicMainBilling } from "./reportEditing";
import { ceramicStopsCharge, emptyCeramicBilling } from "./monthlyReport";
import { ceramicMainLoad } from "./planning";
import type { CeramicShipment } from "./parser";

const original = {
  ...emptyCeramicBilling(), ratePerTon: 1000, stops: 200, drops: 1500,
  crossBorder: "Historical note", load: "Main load",
  locals: [{ key: "local-1", from: "GEO", to: "GEO", price: 2700 }],
};

describe("Ceramic report editor separation", () => {
  it("counts delivery locations from the PDF snapshot, not collection warehouses or orders", () => {
    const snapshot: CeramicShipment = {
      shipmentNumber: "SH00990001", version: 1, totalWeightKg: 3000, totalPallets: null,
      transporter: null, plannedLoadingDate: null, plannedDeliveryDate: null, warnings: [],
      destinations: [{ name: "CASHBUILD GEORGE", addressLines: ["1 Main Road", "George"], orders: [
        { deliveryNumber: "D1", orderNumber: "O1", collectFrom: "1100-Betta", weightKg: 1000, palletsEstimate: null },
        { deliveryNumber: "D2", orderNumber: "O2", collectFrom: "1600-Vitro", weightKg: 2000, palletsEstimate: null },
      ] }],
    };
    const load = ceramicMainLoad(snapshot, "shipment");
    expect(load.fromLocations).toHaveLength(2);
    expect(ceramicDeliveryStops(load.toLocations)).toEqual(["CASHBUILD GEORGE, 1 Main Road, George"]);
  });
  it("deduplicates repeated destinations while preserving different delivery addresses", () => {
    expect(ceramicDeliveryStops([" Cashbuild, Address A ", "CASHBUILD,  Address A", "Cashbuild, Address B", " "])).toEqual(["Cashbuild, Address A", "Cashbuild, Address B"]);
  });
  it("preserves saved local amounts and historical notes when main amounts change", () => {
    const billing = ceramicMainBilling(original, { ratePerTon: 1100, stopCharge: 1800, stopChargeChanged: true, load: "Updated" }, ["local-1"]);
    expect(billing).toEqual({ ...original, ratePerTon: 1100, stops: 1800, drops: 0, load: "Updated" });
    expect(original.stops).toBe(200); expect(original.drops).toBe(1500);
    expect(ceramicStopsCharge(billing)).toBe(1800);
  });
  it("keeps unknown stop charges pending instead of defaulting them to zero", () => {
    const pending = { ...original, stops: null };
    expect(ceramicStopsCharge(pending)).toBeNull();
    expect(ceramicMainBilling(pending, { ratePerTon: 1100, stopCharge: null, stopChargeChanged: false, load: "" }, ["local-1"])).toMatchObject({ stops: null, drops: 1500, locals: original.locals });
    expect(ceramicMainBilling(original, { ratePerTon: 1100, stopCharge: null, stopChargeChanged: true, load: "" }, ["local-1"])).toMatchObject({ stops: null, drops: null });
    expect(ceramicMainBilling(original, { ratePerTon: 1100, stopCharge: 0, stopChargeChanged: true, load: "" }, ["local-1"])).toMatchObject({ stops: 0, drops: 0 });
  });
});
