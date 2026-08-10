import { describe, expect, it } from "vitest";
import type { jsPDF } from "jspdf";
import { buildDashboardDoc } from "./exportPDF";
import type { SheetExportRow } from "@/src/types/sheetExport";

const baseRows: SheetExportRow[] = [
  {
    date: "2026-08-03",
    truck: "TRK-01",
    trailer: "TRL-01",
    driver: "J. van Wyk",
    client: "Acme Logistics",
    from: "JHB",
    to: "CPT",
    routeKm: 250,
    amount: 7500,
    ratePerKm: 30,
    status: "Completed",
  },
  {
    date: "2026-08-03",
    truck: "TRK-02",
    trailer: "TRL-02",
    driver: "P. Nkosi",
    client: "Meridian Freight",
    from: "CPT",
    to: "PE",
    routeKm: 300,
    amount: 5000,
    ratePerKm: 16.67,
    status: "Planned",
  },
];

/** Raw PDF content stream of page 1 (text strings appear literally). */
function stream(doc: jsPDF): string {
  return (doc.internal.pages[1] as unknown as string[]).join("");
}

const zar = (v: number) => v.toLocaleString("en-ZA", { maximumFractionDigits: 0 });

describe("buildDashboardDoc (1-page landscape dashboard)", () => {
  it("returns null when there are no rows", () => {
    expect(buildDashboardDoc([])).toBeNull();
  });

  it("emits exactly one A4 landscape page (297 x 210 mm)", () => {
    const doc = buildDashboardDoc(baseRows, { dateRange: "Aug 2026", generatedAt: "10 Aug 2026" });
    expect(doc).not.toBeNull();
    const d = doc!;
    expect(d.getNumberOfPages()).toBe(1);
    expect(d.internal.pageSize.getWidth()).toBeCloseTo(297, 0);
    expect(d.internal.pageSize.getHeight()).toBeCloseTo(210, 0);
  });

  it("renders the dashboard chrome (brand, panels, footer)", () => {
    const d = buildDashboardDoc(baseRows, { dateRange: "Aug 2026", generatedAt: "10 Aug 2026" })!;
    const s = stream(d);
    expect(s).toContain("FLEETCORE");
    expect(s).toContain("Operations Dashboard");
    expect(s).toContain("REVENUE BY CLIENT");
    expect(s).toContain("STATUS MIX");
    expect(s).toContain("SNAPSHOT");
    expect(s).toContain("Page 1 of 1");
  });

  it("renders the aggregated KPI values", () => {
    const d = buildDashboardDoc(baseRows, { dateRange: "Aug 2026", generatedAt: "10 Aug 2026" })!;
    const s = stream(d);
    // Total revenue R12 500, completion 50% (1 of 2), both clients + statuses
    expect(s).toContain(`R${zar(12500)}`);
    expect(s).toContain("50%");
    expect(s).toContain("1 of 2 done");
    expect(s).toContain("Acme Logistics");
    expect(s).toContain("Meridian Freight");
    expect(s).toContain("Completed");
    expect(s).toContain("Planned");
    expect(s).toContain("Aug 2026");
    expect(s).toContain("Top 2 of 2 clients by revenue");
  });

  it("stays a single page with many routes (no auto page breaks)", () => {
    const many: SheetExportRow[] = [];
    for (let i = 0; i < 25; i += 1) {
      many.push({
        ...baseRows[i % 2],
        client: `Client ${(i % 5) + 1}`,
        truck: `TRK-${i}`,
        amount: 1000 * (i + 1),
        routeKm: 100 + i,
        status: i % 4 === 0 ? "Completed" : i % 4 === 1 ? "Locked" : i % 4 === 2 ? "Planned" : "Canceled",
      });
    }
    const d = buildDashboardDoc(many, { dateRange: "Aug 2026", generatedAt: "10 Aug 2026" })!;
    expect(d.getNumberOfPages()).toBe(1);
    const s = stream(d);
    expect(s).toContain("Page 1 of 1");
    // 4 distinct statuses are capped to top 3 + an "Other" legend bucket
    expect(s).toContain("Other");
  });
});
