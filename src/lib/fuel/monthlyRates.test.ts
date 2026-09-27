import { describe, expect, it } from "vitest";
import { monthlyRates, rateMonths, type FuelPeriod } from "./monthlyRates";

const fuel: FuelPeriod[] = [
  { effectiveDate: "2026-07-01", pricePerLitre: 18, compositionPercent: 50 },
  { effectiveDate: "2026-08-05", pricePerLitre: 20, compositionPercent: 50 },
  { effectiveDate: "2026-09-02", pricePerLitre: 22, compositionPercent: 50 },
];
const october = [...fuel, { effectiveDate: "2026-10-07", pricePerLitre: 19.8, compositionPercent: 50 }];
describe("automatic monthly rates", () => {
  it("leaves July blank, retains the August base and applies only September", () => {
    expect(monthlyRates([1000], "2026-08-05", fuel)).toEqual({ months: ["2026-07", "2026-08", "2026-09"], rates: [[null, 1000, 1050]], problem: null });
  });
  it("does not apply September twice to a September sheet", () => {
    expect(monthlyRates([1000], "2026-09-02", fuel).rates).toEqual([[null, null, 1000]]);
  });
  it("rolls to Aug/Sep/Oct, leaves Aug blank and decreases the September base", () => {
    expect(monthlyRates([1000], "2026-09-02", october)).toEqual({ months: ["2026-08", "2026-09", "2026-10"], rates: [[null, 1000, 950]], problem: null });
  });
  it("compounds increases and decreases chronologically", () => {
    expect(monthlyRates([1000], "2026-08-05", october).rates).toEqual([[1000, 1050, 997.5]]);
  });
  it("includes changes older than the three visible months", () => {
    const history = [1, 2, 3, 4, 5].map((m, i) => ({ effectiveDate: `2026-0${m}-01`, pricePerLitre: 10 * 2 ** i, compositionPercent: 10 }));
    expect(monthlyRates([1000], "2026-01-01", history).rates).toEqual([[1210, 1331, 1464.1]]);
  });
  it("recomputes amended fuel without changing the stored base or applying it twice", () => {
    const base = [1000];
    const corrected = fuel.map(r => r.effectiveDate === "2026-09-02" ? { ...r, compositionPercent: 25 } : r);
    expect(monthlyRates(base, "2026-08-05", corrected).rates).toEqual([[null, 1000, 1025]]);
    expect(monthlyRates(base, "2026-08-05", corrected).rates).toEqual([[null, 1000, 1025]]);
    expect(base).toEqual([1000]);
  });
  it("accepts unsorted history and rounds each move to cents", () => {
    expect(monthlyRates([0.1], "2026-08-05", [...october].reverse()).rates).toEqual([[0.1, 0.11, 0.1]]);
  });
  it("keeps a zero composition unchanged and zero customer rates at zero", () => {
    expect(monthlyRates([0, 1000], "2026-08-05", fuel.map(r => ({ ...r, compositionPercent: 0 }))).rates).toEqual([[null, 0, 0], [null, 1000, 1000]]);
  });
  it("blocks unknown adjustments rather than treating missing composition as zero", () => {
    const result = monthlyRates([1000], "2026-08-05", fuel.map(r => r.effectiveDate === "2026-09-02" ? { ...r, compositionPercent: undefined } : r));
    expect(result.rates).toEqual([[null, 1000, null]]);
    expect(result.problem).toContain("2026-09-02");
  });
  it("blocks a missing previous price needed for an adjustment", () => {
    expect(monthlyRates([1000], "2026-08-05", [fuel[2]]).problem).toContain("preceding fuel price");
  });
  it("handles a second change within a month", () => {
    expect(monthlyRates([1000], "2026-09-02", [...fuel, { effectiveDate: "2026-09-20", pricePerLitre: 24.2, compositionPercent: 50 }]).rates).toEqual([[null, null, 1050]]);
  });
  it("carries a rate into a month with no fuel change", () => {
    expect(monthlyRates([1000], "2026-08-05", [fuel[1], october[3]]).rates).toEqual([[1000, 1000, 995]]);
  });
  it("handles year rollover", () => { expect(rateMonths("2027-01-06")).toEqual(["2026-11", "2026-12", "2027-01"]); });
  it("rejects invalid dates, missing fuel and invalid rates", () => {
    expect(monthlyRates([1000], "2026-02-31", fuel).problem).toBeTruthy();
    expect(monthlyRates([1000], "2026-08-05", []).problem).toBeTruthy();
    expect(monthlyRates([NaN], "2026-08-05", fuel).problem).toBeTruthy();
  });
  it("accepts a starting date later within the current fuel month", () => {
    expect(monthlyRates([1000], "2026-09-15", fuel)).toEqual({ months: ["2026-07", "2026-08", "2026-09"], rates: [[null, null, 1000]], problem: null });
  });
  it("does not backfill a future sheet into past columns", () => {
    expect(monthlyRates([1000], "2026-10-07", fuel).rates).toEqual([[null, null, null]]);
  });
});
