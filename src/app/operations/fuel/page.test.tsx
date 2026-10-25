import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import FuelComparisonPage from "./page";
const state = vi.hoisted(() => ({ role: "admin", rows: [
  { _id: "a", effectiveDate: "2026-09-02", pricePerLitre: 31.32, compositionPercent: 55 },
  { _id: "b", effectiveDate: "2026-10-07", pricePerLitre: 32, compositionPercent: 55 },
] }));
vi.mock("convex/react", () => ({ useQuery: () => state.rows }));
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
  it("retains existing admin-only access", () => {
    state.role = "regional";
    expect(renderToStaticMarkup(<FuelComparisonPage />)).toContain("Admin access is required");
    state.role = "admin";
  });
});
