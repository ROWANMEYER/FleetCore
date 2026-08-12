import { describe, expect, it } from "vitest";
import { renderTransportReport } from "./TransportReport";

const baseProps = {
  startDate: "2026-08-01",
  endDate: "2026-08-02",
  activeColumns: ["date", "truck", "driver", "client", "rate"],
  columnNotes: [],
};

function render(driverName: string, driverPhotoUrl?: string) {
  return renderTransportReport({
    ...baseProps,
    data: {
      loads: [
        {
          routeDate: "2026-08-01",
          truckFleetNo: "T1",
          driverName,
          driverPhotoUrl: driverPhotoUrl ?? "",
          clientName: "Client",
          rate: 100,
        },
      ],
      summary: { totalLoads: 1, totalKm: 10, totalRevenue: 100 },
    },
  });
}

describe("TransportReport driver column", () => {
  it("embeds a round photo img before the driver name when a photo exists", () => {
    const html = render("JOHN DOE", "https://x.convex.cloud/api/storage/abc");
    expect(html).toContain(
      '<img src="https://x.convex.cloud/api/storage/abc"'
    );
    expect(html).toContain("border-radius:50%");
    expect(html).toContain("JOHN DOE");
  });

  it("renders only the name when there is no photo", () => {
    const html = render("JANE SMITH");
    expect(html).not.toContain("<img");
    expect(html).toContain("JANE SMITH");
  });

  it("keeps query strings in storage URLs intact (escapes &, never strips it)", () => {
    const html = render(
      "JOHN DOE",
      "https://x.convex.cloud/api/storage/abc?token=one&expiry=two"
    );
    expect(html).toContain("token=one&amp;expiry=two");
    expect(html).not.toContain("token=oneexpiry=two");
  });

  it("keeps ampersands in driver names (escaped, never stripped)", () => {
    const html = render("J&J TRANSPORT");
    expect(html).toContain("J&amp;J TRANSPORT");
    expect(html).not.toContain("JJ TRANSPORT");
  });

  it("strips characters that could break out of the img tag", () => {
    const html = render(
      "JOHN DOE",
      'https://evil.example/img" onerror="alert(1)'
    );
    // The quotes are removed, so the attribute cannot be escaped.
    expect(html).not.toContain('onerror="');
    expect(html).toContain('<img src="https://evil.example/img onerror=alert(1)');
  });
});
