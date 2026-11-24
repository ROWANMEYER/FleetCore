import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Id } from "@/convex/_generated/dataModel";
import type { CeramicDispatchShipment, MobileShipmentFilter } from "@/src/lib/ceramic-tiles/mobileDispatch";
import { CeramicShipmentQueue } from "./CeramicShipmentQueue";
import { CeramicDispatchSteps } from "./CeramicDispatchSteps";

const snapshot = { shipmentNumber: "SH0001", version: 1, totalWeightKg: 1000, totalPallets: 1, transporter: null, plannedLoadingDate: null, plannedDeliveryDate: null, destinations: [], warnings: [] };
const unassigned: CeramicDispatchShipment = { _id: "shipment1" as Id<"ceramicShipments">, region: "transvaal", shipmentNumber: "SH0001", version: 1, snapshot, updatedAt: 100 };
const assigned: CeramicDispatchShipment = { ...unassigned, _id: "shipment2" as Id<"ceramicShipments">, shipmentNumber: "SH0002", driverId: "driver" as Id<"drivers">, truckId: "truck" as Id<"trucks">, routeDate: "2026-12-01", assignedAt: Date.parse("2026-11-23T22:30:00Z") };
function queue(filter: MobileShipmentFilter, search = "", reports = true) {
  return renderToStaticMarkup(<CeramicShipmentQueue rows={[unassigned, assigned]} fleet={{ drivers: [{ id: "driver", name: "Example Driver", phone: null }], trucks: [{ id: "truck", fleetNumber: "113", registration: "TEST123" }] }} filter={filter} search={search} onFilterChange={() => {}} onSearchChange={() => {}} onSelect={() => {}} canViewReports={reports} />);
}
describe("Shared web/mobile Ceramic shipment queue", () => {
  it("keeps an assigned shipment in Assigned even when instructions and planning review are incomplete", () => {
    const html = queue("assigned");
    expect(html).toContain('aria-label="Open shipment SH0002"');
    expect(html).not.toContain('aria-label="Open shipment SH0001"');
    expect(html).toContain("Example Driver");
    expect(html).toContain("113 · TEST123");
    expect(html).toContain("Tuesday, 24 November 2026");
    expect(html).not.toContain("1 December 2026");
    expect(html).toMatch(/<details[^>]*>/);
    expect(html).not.toMatch(/<details[^>]* open/);
    expect(html).not.toContain("To send");
    expect(html).not.toContain("Prepare");
  });
  it("uses the same unassigned filter and case-insensitive search on both surfaces", () => {
    expect(queue("unassigned")).toContain('aria-label="Open shipment SH0001"');
    expect(queue("unassigned")).not.toContain('aria-label="Open shipment SH0002"');
    const html = queue("all", " sh0002 ");
    expect(html).toContain('aria-label="Open shipment SH0002"');
    expect(html).not.toContain('aria-label="Open shipment SH0001"');
    expect(queue("assigned", "missing")).toContain("No matching shipments");
  });
  it("preserves report access without exposing a delete action when none is authorized", () => {
    expect(queue("all", "", false)).not.toContain("Monthly &amp; local-load spreadsheets");
    expect(queue("all")).toContain("Monthly &amp; local-load spreadsheets");
    expect(queue("all")).not.toContain("Delete shipment");
  });
  it("shows the same three steps and preserves the caller's send guard", () => {
    const html = renderToStaticMarkup(<CeramicDispatchSteps step={1} disabled={index => index === 2} onStepChange={() => {}} />);
    expect(html).toContain("Step 2 of 3");
    expect(html).toContain("Assign truck &amp; driver");
    expect(html).toContain("Arrange stops");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>.*?<span>Send<\/span>/);
    expect(html).not.toContain("Review PDF");
  });
});
