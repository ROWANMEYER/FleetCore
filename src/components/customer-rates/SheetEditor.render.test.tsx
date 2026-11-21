import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { FunctionReturnType } from "convex/server";
import type { Id } from "@/convex/_generated/dataModel";
import type { api } from "@/convex/_generated/api";
import { SheetEditor } from "./SheetEditor";

const mock = vi.hoisted(() => ({ fuel: [] as { effectiveDate: string; pricePerLitre: number; compositionPercent?: number }[] }));
vi.mock("convex/react", () => ({ useMutation: () => vi.fn(), useQuery: () => mock.fuel }));
type Sheet = NonNullable<FunctionReturnType<typeof api.rateSheets.get>>;
const base: Sheet = { _id: "sheet" as Id<"rateSheets">, _creationTime: 1, customerId: "customer" as Id<"customers">, defaultPricingUnit: "full", effectiveDate: "2026-08-01", notes: "", oldDieselPrice: 0, newDieselPrice: 0, contacts: [], revision: 1, createdAt: 1, updatedAt: 1, updatedBy: "admin" as Id<"users">, updatedByEmail: "admin@example.com", lanes: [{ id: "lane", loadingPoint: "George", destination: "Cape Town", rate: 1000, sortOrder: 0, date: "2026-09-01" }] };
const render = (patch: Partial<Sheet> = {}) => renderToStaticMarkup(<SheetEditor token="synthetic" sheet={{ ...base, ...patch }} customerName="Synthetic customer" onDeleted={vi.fn()} />);
beforeEach(() => { mock.fuel = [{ effectiveDate: "2026-08-01", pricePerLitre: 20, compositionPercent: 50 }, { effectiveDate: "2026-09-01", pricePerLitre: 22, compositionPercent: 50 }]; });
describe("Customer Rates agreement rendering", () => {
  it("shows the new default composition and editable individual date", () => {
    const html = render({ agreementType: "fuel_linked", fuelCompositionPercent: 45 });
    expect(html).toContain("Customer fuel composition (%)");
    expect(html).toContain('value="45"');
    expect(html).toContain('aria-label="Row 1 effective date"');
    expect(html).toContain('value="2026-09-01"');
    expect(html).toContain("R 1 000,00");
    expect(html).not.toContain("R 1 050,00");
  });
  it("retains the legacy calculation and explains the opt-in for lane dates", () => {
    const html = render();
    expect(html).toContain("Recorded fuel composition (existing calculation)");
    expect(html).toContain("activate individual lane dates");
    expect(html).toContain("R 1 050,00");
  });
  it("supports fixed agreements with no fuel records and leaves export available", () => {
    mock.fuel = [];
    const html = render({ agreementType: "fixed" });
    expect(html).toContain("Fixed-rate agreement: no fuel adjustments apply.");
    expect(html).not.toContain("Customer fuel composition (%)");
    expect(html).not.toContain("Record fuel prices");
    expect(html).toMatch(/<button[^>]*>View PDF<\/button>/);
  });
});
