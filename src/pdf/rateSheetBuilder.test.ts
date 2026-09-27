import { describe, expect, it } from "vitest";
import { buildRateSheetData } from "./rateSheetBuilder";
import { generateRateSheetPDF } from "./rateSheetTemplate";
const fuel = [
  { effectiveDate: "2026-08-05", pricePerLitre: 20, compositionPercent: 50 },
  { effectiveDate: "2026-09-02", pricePerLitre: 22, compositionPercent: 50 },
];
const sheet = { effectiveDate: "2026-08-05", notes: "VAT excluded", oldDieselPrice: 999, newDieselPrice: 999, defaultPricingUnit: "full", lanes: [
  { loadingPoint: "George", destination: "Cape Town", rate: 1000, sortOrder: 1, date: "2026-07-01", rates: [888] },
  { loadingPoint: "George", destination: "Durban", rate: 0, sortOrder: 0 },
] };
describe("monthly rate sheet PDF", () => {
  it("uses the sheet baseline and fuel history, not stale lane dates or supplied totals", () => {
    const result = buildRateSheetData(sheet, { name: "Geelhoutvlei", email: "example@example.com" }, fuel);
    expect(result.rateLabels).toEqual(["Jul 2026", "Aug 2026", "Sep 2026"]);
    expect(result.lanes.map(l => l.rates)).toEqual([[null, 0, 0], [null, 1000, 1050]]);
    expect(result.lanes[1].pricingUnit).toBe("full");
    expect(result.customer.name).toBe("Geelhoutvlei");
    expect(result.diesel).toEqual({ oldPrice: 20, newPrice: 22, change: 2 });
  });
  it("a September sheet prints only the final column", () => {
    const result = buildRateSheetData({ ...sheet, effectiveDate: "2026-09-02" }, undefined, fuel);
    expect(result.lanes[1].rates).toEqual([null, null, 1000]);
    expect(result.customer.name).toBe("");
  });
  it("refuses to export incomplete fuel calculations", () => {
    const data = buildRateSheetData(sheet, undefined, [{ ...fuel[1], compositionPercent: undefined }]);
    expect(() => generateRateSheetPDF(data)).toThrow("Cannot calculate");
  });
  it("keeps every lane over multiple pages with three headers per page", () => {
    const data = buildRateSheetData({ ...sheet, lanes: Array.from({ length: 24 }, (_, i) => ({ loadingPoint: "Karatara", destination: `Destination ${i + 1}`, rate: 1000, sortOrder: i })) }, { name: "Geelhoutvlei" }, fuel);
    const doc = generateRateSheetPDF(data);
    expect(doc.getNumberOfPages()).toBe(2);
    const output = doc.output();
    expect(output).toContain("Destination 24");
    expect(output.match(/Sep 2026/g)).toHaveLength(2);
    expect(output).toContain("Increase");
  });
  it("labels a decrease honestly", () => {
    const doc = generateRateSheetPDF(buildRateSheetData(sheet, undefined, [fuel[0], { ...fuel[1], pricePerLitre: 18 }]));
    expect(doc.output()).toContain("Decrease");
  });
});
