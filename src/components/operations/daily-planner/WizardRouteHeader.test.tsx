import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { WizardRouteHeader } from "./WizardRouteHeader";

vi.mock("convex/react", () => ({ useQuery: () => [] }));
vi.mock("@/src/components/auth/AuthProvider", () => ({
  useAuth: () => ({ token: null, user: { role: "admin" } }),
  useRegionArg: () => undefined,
}));

const noop = () => {};
const props = {
  date: "2026-10-25", setDate: noop,
  truckFleetNo: "CA 123-456", setTruckFleetNo: noop,
  trailerFleetNo: "", setTrailerFleetNo: noop,
  driverName: "External Driver", setDriverName: noop,
  routeKilometers: "", setRouteKilometers: noop,
  notes: "", setNotes: noop, region: "garden_route", setRegion: noop,
  trucks: [{ _id: "truck1", truckFleetNo: "OWN-01", registration: "OWN REG" }],
  trailers: [{ _id: "trailer1", trailerFleetNo: 99 }],
  drivers: [{ _id: "driver1", driverName: "Own Driver" }],
  subcontractors: [{ _id: "sub1", companyName: "External Transport" }],
  isFleetMode: false, selectedSubId: "sub1", onFleetModeChange: noop, onSubIdChange: noop,
  isEditable: true, isEditMode: false, onComplete: noop, onEdit: noop,
  collapsed: false, onToggleCollapse: noop,
};

describe("subcontractor route fields", () => {
  it("renders entered registration and driver without owned-fleet choices or trailer", () => {
    const html = renderToStaticMarkup(<WizardRouteHeader {...props} />);
    expect(html).toContain('aria-label="Truck registration"');
    expect(html).toContain('value="CA 123-456"');
    expect(html).toContain('aria-label="Driver name"');
    expect(html).toContain('value="External Driver"');
    expect(html).not.toContain("Select Trailer");
    expect(html).not.toContain("OWN-01");
    expect(html).not.toContain("Own Driver");
    expect(html).not.toContain("Missing Trailer");
  });

  it("retains fleet selectors for owned-fleet trips", () => {
    const html = renderToStaticMarkup(<WizardRouteHeader {...props} isFleetMode />);
    expect(html).toContain("Select Truck");
    expect(html).toContain("Select Trailer");
    expect(html).toContain("Own Driver");
    expect(html).not.toContain('aria-label="Truck registration"');
  });
});
