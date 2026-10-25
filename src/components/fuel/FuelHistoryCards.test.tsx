import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Id } from "@/convex/_generated/dataModel";
import { FuelHistoryCards } from "./FuelHistoryCards";

const rows = [
  { _id: "price-new" as Id<"fuelPrices">, effectiveDate: "2026-10-07", pricePerLitre: 32, notes: "October price", change: 0.68, percentChange: 2.17, carriedPercent: 1.19, compositionPercent: 55 },
  { _id: "price-old" as Id<"fuelPrices">, effectiveDate: "2026-09-02", pricePerLitre: 31.32, notes: "", change: null, percentChange: null, carriedPercent: null },
];

describe("phone fuel history", () => {
  it("keeps every price detail and its removal action reachable in each expandable record", () => {
    const html = renderToStaticMarkup(<FuelHistoryCards rows={rows} latestId="price-new" onRemove={vi.fn()} />);
    expect(html).toContain("October price");
    for (const label of ["Rand difference", "Diesel change", "Fuel composition", "Carried rate impact", "Remove price"]) expect(html).toContain(label);
    expect(html).toContain('data-latest="true"');
    expect(html).toContain("Latest");
    expect(html).toContain("Remove the price for");
    expect(html).toContain("No notes recorded.");
  });
  it("honours the supplied sort order without changing the original records", () => {
    const html = renderToStaticMarkup(<FuelHistoryCards rows={[...rows].reverse()} latestId="price-new" onRemove={vi.fn()} />);
    expect(html.indexOf("02 Sept 2026")).toBeLessThan(html.indexOf("07 Oct 2026"));
    expect(rows[0].effectiveDate).toBe("2026-10-07");
  });
  it("shows recorded zero composition and impact instead of treating them as missing", () => {
    const html = renderToStaticMarkup(<FuelHistoryCards rows={[{ ...rows[0], compositionPercent: 0, carriedPercent: 0 }]} onRemove={vi.fn()} />);
    expect(html).toContain("0,00%");
    expect(html).not.toContain("NaN");
  });
});
