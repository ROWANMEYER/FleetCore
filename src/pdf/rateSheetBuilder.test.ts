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
    for (let i = 1; i <= 24; i++) expect(output).toContain(`(Destination ${i})`);
    expect(output.match(/Sep 2026/g)).toHaveLength(2);
    expect(output).toContain("Increase");
  });
  it("prints complete mixed-origin destinations and separate SP labels", () => {
    const lanes = [
      { loadingPoint: "KRUGERSDORP + VEREENIGING", destination: "KNYSNA / PLETT (SP)", rate: 1078.20, sortOrder: 0 },
      { loadingPoint: "BABELEGI + KRUGERSDORP + VEREENIGING", destination: "GRASKOP / DWAARS / ACORN / BUSHBUCK / LYDEN / THULAMAHASHE / CASTEEL", rate: 636.55, sortOrder: 1 },
    ];
    const output = generateRateSheetPDF(buildRateSheetData({ ...sheet, lanes }, { name: "Ceramic Tile Marketing" }, fuel)).output();
    expect(output).toContain("KNYSNA / PLETT");
    expect(output).toContain("SP");
    expect(output.match(/\(KRUGERSDORP \+ VEREENIGING\)/g)).toHaveLength(1);
    expect(output.match(/\(BABALEGI \+ KRUGERSDORP \+ VEREENIGING\)/g)).toHaveLength(1);
    expect(output).toContain("THULAMAHASHE");
    expect(output).toContain("CASTEEL");
  });
  it("paginates wrapped rows without losing lanes or repeating their rates", () => {
    const lanes = Array.from({ length: 52 }, (_, i) => ({
      loadingPoint: i % 2 ? "BABELEGI + KRUGERSDORP + VEREENIGING" : "KRUGERSDORP + VEREENIGING",
      destination: `GRASKOP / DWAARS / ACORN / BUSHBUCK / LYDEN / THULAMAHASHE / CASTEEL END${String(i).padStart(3, "0")}`,
      rate: 1000 + i, sortOrder: i,
    }));
    const doc = generateRateSheetPDF(buildRateSheetData({ ...sheet, lanes }, undefined, fuel));
    const output = doc.output();
    expect(doc.getNumberOfPages()).toBeGreaterThan(3);
    for (let i = 0; i < lanes.length; i++) expect(output.match(new RegExp(`END${String(i).padStart(3, "0")}`, "g"))).toHaveLength(1);
    expect(output.match(/Sep 2026/g)).toHaveLength(doc.getNumberOfPages());
    expect(output).toContain(`Page ${doc.getNumberOfPages()} of ${doc.getNumberOfPages()}`);
  });
  it("groups destinations by origin and repeats section headings on continuation pages", () => {
    const lanes = Array.from({ length: 44 }, (_, i) => ({
      loadingPoint: i % 2 ? "BABELEGI + KRUGERSDORP + VEREENIGING" : "KRUGERSDORP + VEREENIGING",
      destination: `Stop ${String(i).padStart(3, "0")}`, rate: 1000 + i, sortOrder: i,
    }));
    const doc = generateRateSheetPDF(buildRateSheetData({ ...sheet, lanes }, undefined, fuel));
    const output = doc.output();
    expect(output.match(/\(KRUGERSDORP \+ VEREENIGING\)/g)?.length).toBeGreaterThan(1);
    expect(output.match(/\(BABALEGI \+ KRUGERSDORP \+ VEREENIGING\)/g)?.length).toBeGreaterThan(1);
    for (let i = 0; i < lanes.length; i++) expect(output.match(new RegExp(`Stop ${String(i).padStart(3, "0")}`, "g"))).toHaveLength(1);
    expect(output.indexOf("Stop 042")).toBeLessThan(output.indexOf("Stop 001"));
    expect(output.match(/Destination/g)).toHaveLength(doc.getNumberOfPages());
  });
  it("labels a decrease honestly", () => {
    const doc = generateRateSheetPDF(buildRateSheetData(sheet, undefined, [fuel[0], { ...fuel[1], pricePerLitre: 18 }]));
    expect(doc.output()).toContain("Decrease");
  });
});

describe("agreement-aware rate sheet PDF data", () => {
  it("shares the 45% default and individual dates with the screen calculation", () => {
    const data = buildRateSheetData({ ...sheet, agreementType: "fuel_linked", lanes: [
      { loadingPoint: "George", destination: "Cape Town", rate: 1000, sortOrder: 0 },
      { loadingPoint: "George", destination: "Durban", rate: 2000, date: "2026-09-02", sortOrder: 1 },
    ] }, undefined, fuel);
    expect(data.lanes.map(lane => lane.rates)).toEqual([[null, 1000, 1045], [null, null, 2000]]);
    expect(data.calculationProblem).toBeUndefined();
  });
  it("prints fixed rates without requiring a fuel price", () => {
    const data = buildRateSheetData({ ...sheet, agreementType: "fixed", lanes: [{ loadingPoint: "George", destination: "Cape Town", rate: 1000, sortOrder: 0 }] });
    expect(data.lanes[0].rates).toEqual([null, null, 1000]);
    expect(() => generateRateSheetPDF(data)).not.toThrow();
  });
  it("uses the customer composition rather than the fuel record composition", () => {
    const data = buildRateSheetData({ ...sheet, agreementType: "fuel_linked", fuelCompositionPercent: 20, lanes: [{ loadingPoint: "George", destination: "Cape Town", rate: 1000, sortOrder: 0 }] }, undefined, fuel);
    expect(data.lanes[0].rates).toEqual([null, 1000, 1020]);
  });
});

it("prints exact customer-notified prices without applying fuel movements", () => {
  const data = buildRateSheetData({agreementType:"customer_notified",sheetId:"special",customerAdjustments:[{_id:"notice",sheetId:"special",effectiveDate:"2026-11-04",percentage:5,rates:[{laneId:"lane",rate:1219.11}],reference:"Customer-approved November sheet",recordedAt:1}],effectiveDate:"2026-08-05",notes:"",oldDieselPrice:0,newDieselPrice:0,lanes:[{id:"lane",loadingPoint:"KRUGERSDORP + VEREENIGING",destination:"KNYSNA / PLETT",rate:1113.47,sortOrder:0}]},undefined,[{effectiveDate:"2026-08-05",pricePerLitre:20,compositionPercent:45},{effectiveDate:"2026-11-04",pricePerLitre:40,compositionPercent:90}]);
  expect(data.lanes[0].rates).toEqual([1113.47,1113.47,1219.11]);expect(data.calculationProblem).toBeUndefined();
});
