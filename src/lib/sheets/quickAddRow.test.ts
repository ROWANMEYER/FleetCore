import { describe, expect, it } from "vitest";
import {
  amountToRate,
  buildQuickAddPayload,
  emptyQuickAddDraft,
  quickAddAmount,
  quickAddMissingFields,
  quickAddRPerKm,
  type QuickAddDraft,
} from "./quickAddRow";

/**
 * Manual sheet entry: one typed row becomes one daily route with one load.
 * These cover the two things that silently corrupt a typed row — the Amount
 * cell (which back-solves the rate) and the payload the mutation receives.
 */

const draft = (overrides: Partial<QuickAddDraft> = {}): QuickAddDraft => ({
  ...emptyQuickAddDraft("2026-09-28"),
  ...overrides,
});

describe("emptyQuickAddDraft", () => {
  it("keeps the supplied date and starts empty", () => {
    const d = emptyQuickAddDraft("2026-09-28");
    expect(d.date).toBe("2026-09-28");
    expect(d.truck).toBe("");
    expect(d.client).toBe("");
    expect(d.rate).toBe("");
  });
});

describe("quickAddAmount", () => {
  it("multiplies quantity by rate for per-unit rows", () => {
    expect(quickAddAmount(draft({ qty: "25", rate: "500", rateType: "per_unit" }))).toBe(12500);
  });

  it("uses the rate as the total for flat rows", () => {
    expect(quickAddAmount(draft({ qty: "25", rate: "12500", rateType: "flat" }))).toBe(12500);
  });

  it("accepts ZAR-formatted input", () => {
    expect(quickAddAmount(draft({ qty: "1", rate: "R 18 500,50" }))).toBe(18500.5);
  });

  it("is 0 when nothing is typed", () => {
    expect(quickAddAmount(draft())).toBe(0);
  });
});

describe("amountToRate", () => {
  it("divides the typed total by the quantity on per-unit rows", () => {
    expect(amountToRate("12500", draft({ qty: "25" }))).toBe("500");
  });

  it("stores the total as the rate on flat rows", () => {
    expect(amountToRate("12500", draft({ qty: "25", rateType: "flat" }))).toBe("12500");
  });

  it("keeps the typed value when there is no quantity", () => {
    expect(amountToRate("12500", draft({ qty: "0" }))).toBe("12500");
  });

  it("round-trips through the amount column", () => {
    const typed = draft({ qty: "12", rate: "" });
    const withRate = { ...typed, rate: amountToRate("9600", typed) };
    expect(quickAddAmount(withRate)).toBe(9600);
  });
});

describe("quickAddRPerKm", () => {
  it("divides the amount by the distance", () => {
    expect(quickAddRPerKm(draft({ qty: "1", rate: "5000", km: "500" }))).toBe(10);
  });

  it("is 0 without a distance", () => {
    expect(quickAddRPerKm(draft({ rate: "5000" }))).toBe(0);
  });
});

describe("quickAddMissingFields", () => {
  it("reports nothing for a complete row", () => {
    expect(quickAddMissingFields(draft({ truck: "154", client: "MTO Forestry" }))).toEqual([]);
  });

  it("reports the missing fields in the order they appear on the row", () => {
    expect(quickAddMissingFields(draft())).toEqual(["truck", "client"]);
  });

  it("reports a missing date", () => {
    expect(quickAddMissingFields(draft({ date: "", truck: "154", client: "MTO" }))).toEqual([
      "date",
    ]);
  });

  it("treats whitespace as missing", () => {
    expect(quickAddMissingFields(draft({ truck: "  ", client: "MTO" }))).toEqual(["truck"]);
  });
});

describe("buildQuickAddPayload", () => {
  it("maps a typed row onto createDailyRoute args", () => {
    const payload = buildQuickAddPayload(
      draft({
        truck: " 154 ",
        trailer: " 221 ",
        driver: " Jonas ",
        origin: " George ",
        destination: " Knysna ",
        client: " MTO Forestry ",
        qty: "25",
        rate: "500",
        rateType: "per_unit",
        km: "512",
        notes: " SHIP 9911 ",
      })
    );

    expect(payload).toEqual({
      routeDate: "2026-09-28",
      driverName: "Jonas",
      truckFleetNo: "154",
      truckFleetNoStr: "154",
      trailerFleetNoStr: "221",
      kilometers: 512,
      routeKilometers: 512,
      notes: "SHIP 9911",
      loads: [
        {
          client: "MTO Forestry",
          quantity: "25",
          quantityType: "tons",
          rate: "500",
          rateType: "per_unit",
          fromLocations: ["George"],
          toLocations: ["Knysna"],
        },
      ],
    });
  });

  it("omits empty locations so the backend flags the route as incomplete", () => {
    const payload = buildQuickAddPayload(draft({ truck: "154", client: "MTO" }));
    expect(payload.loads[0].fromLocations).toEqual([]);
    expect(payload.loads[0].toLocations).toEqual([]);
  });

  it("omits an empty trailer", () => {
    expect(buildQuickAddPayload(draft({ truck: "154", client: "MTO" })).trailerFleetNoStr).toBeUndefined();
  });

  it("keeps a zero distance rather than leaving it undefined", () => {
    const payload = buildQuickAddPayload(draft({ truck: "154", client: "MTO" }));
    expect(payload.kilometers).toBe(0);
    expect(payload.routeKilometers).toBe(0);
  });

  it("keeps the unit and rate type as typed", () => {
    const payload = buildQuickAddPayload(
      draft({ truck: "154", client: "MTO", unit: "bales", rateType: "flat", qty: "490", rate: "9000" })
    );
    expect(payload.loads[0].quantityType).toBe("bales");
    expect(payload.loads[0].rateType).toBe("flat");
  });
});
