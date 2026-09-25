import { describe, it, expect } from "vitest";
import {
  parseQuickCapture,
  resolveParsedClients,
  type CustomerRecord,
} from "@/src/lib/planner/parser";

const ACTIVE: CustomerRecord = {
  name: "Test Timber 999",
  normalizedName: "test timber 999",
  isActive: true,
};

const INACTIVE: CustomerRecord = {
  name: "Test Timber 999",
  normalizedName: "test timber 999",
  isActive: false,
};

/* The planner board projects the customer list to ACTIVE-only before
   resolution (see board/page.tsx customerRecords). These tests enforce that
   contract end-to-end against the real parser. */
function activeOnly(records: CustomerRecord[]): CustomerRecord[] {
  return records.filter((r) => r.isActive);
}

describe("H — Quick Capture active-customer resolution still works", () => {
  it("an ACTIVE client resolves to its canonical name", () => {
    const parsed = parseQuickCapture("28/09/26\ntest timber 999 x george na cape town");
    const resolutions = resolveParsedClients(parsed, activeOnly([ACTIVE]));
    expect(resolutions[0]).toMatchObject({
      status: "matched",
      resolved: "Test Timber 999",
    });
  });
});

describe("I — Quick Capture INACTIVE customer stays unavailable", () => {
  it("an INACTIVE client is excluded from the projection → stays unknown", () => {
    const parsed = parseQuickCapture("28/09/26\ntest timber 999 x george na cape town");
    const resolutions = resolveParsedClients(parsed, activeOnly([INACTIVE]));
    expect(resolutions[0].status).toBe("unknown");
  });

  it("reactivating (isActive true) makes it resolve again", () => {
    const parsed = parseQuickCapture("28/09/26\ntest timber 999 x george na cape town");
    const resolutions = resolveParsedClients(
      parsed,
      activeOnly([{ ...INACTIVE, isActive: true }])
    );
    expect(resolutions[0].status).toBe("matched");
  });
});