import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import FuelComparisonPage from "./page";
const state = vi.hoisted(() => ({ role: "admin", mobile: true, rows: [
  { _id: "a", effectiveDate: "2026-09-02", pricePerLitre: 31.32, compositionPercent: 55, notes: "", change: null, percentChange: null, carriedPercent: null },
  { _id: "b", effectiveDate: "2026-10-07", pricePerLitre: 32, compositionPercent: 55, notes: "", change: 0.68, percentChange: 2.17, carriedPercent: 1.19 },
] }));
vi.mock("@/src/hooks/useIsMobile", () => ({ useIsMobile: () => state.mobile }));
vi.mock("convex/react", () => ({ useQuery: () => state.rows, useMutation: () => vi.fn() }));
vi.mock("@/src/components/auth/AuthProvider", () => ({ useAuth: () => ({ user: { role: state.role }, token: "test" }) }));
describe("date-focused fuel screen", () => {
  it("shows recorded-date selectors and calculated results without chart/history controls", () => {
    const html = renderToStaticMarkup(<FuelComparisonPage />);
    expect(html).toContain('id="fuel-from"');
    expect(html).toContain('id="fuel-to"');
    expect(html).toContain("Swap selected fuel dates");
    expect(html).toContain("+1,19%");
    expect(html).toContain("Compares the two selected prices only.");
    expect(html).not.toContain("Diesel price trend");
    expect(html).not.toContain("Price history");
    expect(html).toContain('/operations/fuel/manage');
  });
  it("allows regional and guest users to view the public comparison", () => {
    state.role = "regional";
    expect(renderToStaticMarkup(<FuelComparisonPage />)).toContain("Fuel comparison");
    state.role = "admin";
  });
  it("restores the desktop fuel overview, chart and history on the Fuel tab", () => {
    state.mobile = false;
    const html = renderToStaticMarkup(<FuelComparisonPage />);
    expect(html).toContain("Fuel composition");
    expect(html).toContain("Diesel price trend");
    expect(html).toContain("Price history");
    expect(html).toContain("Compare months");
    expect(html).not.toContain('id="fuel-from"');
    state.mobile = true;
  });
  it("preserves desktop fuel management's existing admin requirement", () => {
    state.mobile = false;
    state.role = "regional";
    expect(renderToStaticMarkup(<FuelComparisonPage />)).toContain("Admin access is required");
    state.mobile = true;
    state.role = "admin";
  });
});
