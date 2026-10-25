import { describe, expect, it } from "vitest";
import { compareFuelDates, defaultFuelDates } from "./compareDates";
import { compositionValue, estimatedRateImpact } from "./compare";

const rows = [
  { _id: "early", effectiveDate: "2026-03-04", pricePerLitre: 20 },
  { _id: "middle", effectiveDate: "2026-03-12", pricePerLitre: 25 },
  { _id: "late", effectiveDate: "2026-03-24", pricePerLitre: 30 },
];
describe("exact fuel date comparison", () => {
  it("compares the requested dates within a month rather than substituting month end", () => {
    const result = compareFuelDates(rows, "early", "middle");
    expect(result.baseline?.effectiveDate).toBe("2026-03-04");
    expect(result.comparison?.effectiveDate).toBe("2026-03-12");
    expect(result.randDifference).toBe(5);
    expect(result.dieselPercentChange).toBe(25);
  });
  it("recalculates percentages against the new baseline when swapped", () => {
    expect(compareFuelDates(rows, "middle", "early").dieselPercentChange).toBe(-20);
  });
  it("allows comparing the same record with itself", () => {
    expect(compareFuelDates(rows, "middle", "middle").dieselPercentChange).toBe(0);
  });
  it("does not substitute a record when the selected record was removed", () => {
    const result = compareFuelDates(rows, "missing", "late");
    expect(result.baseline).toBeNull();
    expect(result.randDifference).toBeNull();
    expect(result.dieselPercentChange).toBeNull();
  });
  it("does not divide by invalid stored prices", () => {
    for (const pricePerLitre of [0, -1, NaN, Infinity]) expect(compareFuelDates([{ ...rows[0], pricePerLitre }, rows[1]], "early", "middle").dieselPercentChange).toBeNull();
  });
  it("defaults to the latest two dates even within one month and without mutating order", () => {
    const reversed = [...rows].reverse();
    expect(defaultFuelDates(reversed)).toEqual({ from: "middle", to: "late" });
    expect(reversed[0]._id).toBe("late");
    expect(defaultFuelDates([rows[0]])).toEqual({ from: "early", to: "early" });
    expect(defaultFuelDates([])).toEqual({ from: "", to: "" });
  });
  it("calculates the example impact at full precision, with zero and invalid composition distinguished", () => {
    const prices = [{ ...rows[0], pricePerLitre: 31.32 }, { ...rows[1], pricePerLitre: 32 }];
    const delta = compareFuelDates(prices, "early", "middle").dieselPercentChange;
    expect(estimatedRateImpact(delta, 55)).toBeCloseTo(1.19412516);
    expect(estimatedRateImpact(delta, 0)).toBe(0);
    expect(compositionValue("55,5")).toBe(55.5);
    expect(compositionValue("101")).toBeNull();
    expect(compositionValue("")).toBeNull();
  });
});
