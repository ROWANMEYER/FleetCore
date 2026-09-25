import { describe, it, expect } from "vitest";
import {
  parseQuickCapture,
  resolveParsedClients,
  type CustomerRecord,
} from "./parser";
import { buildAddLoadsPayload } from "./addLoadsPayload";

const TEST_TIMBER: CustomerRecord = {
  name: "Test Timber 999",
  normalizedName: "test timber 999",
  isActive: true,
};

describe("buildAddLoadsPayload — Section 12 regression: unknown → matched transition", () => {
  const CAPTURE = "28/09/26\ntest timber 999 x george na cape town";

  it("always uses the CURRENT matched resolution, not the parse-time token", () => {
    const parsed = parseQuickCapture(CAPTURE);
    // Simulate the 6.4A flow: unknown immediately after Parse, then the
    // customer is created and the customers query updates → reactively matched.
    const unresolved = resolveParsedClients(parsed, []);
    expect(unresolved[0].status).toBe("unknown");

    // State 1: still unknown (customer not added yet) — payload falls back to raw token.
    const payloadUnknown = buildAddLoadsPayload(parsed, unresolved, "2026-09-24");
    expect(payloadUnknown[0].client).toBe("test timber 999");

    // State 2: customer created → reactive resolution now matched with canonical name.
    const resolved = resolveParsedClients(parsed, [TEST_TIMBER]);
    expect(resolved[0]).toMatchObject({
      status: "matched",
      resolved: "Test Timber 999",
    });

    const payload = buildAddLoadsPayload(parsed, resolved, "2026-09-24");
    // Section 5 contract: payload client MUST be the canonical customer name,
    // never the stale as-typed token.
    expect(payload[0].client).toBe("Test Timber 999");
  });

  it("keeps the parsed loadDate over the board date (28 Sep wins over 24 Sep)", () => {
    const parsed = parseQuickCapture(CAPTURE);
    const resolved = resolveParsedClients(parsed, [TEST_TIMBER]);
    const payload = buildAddLoadsPayload(parsed, resolved, "2026-09-24");
    expect(payload[0].loadDate).toBe("2026-09-28");
  });

  it("passes from/to locations through unchanged", () => {
    const parsed = parseQuickCapture(CAPTURE);
    const resolved = resolveParsedClients(parsed, [TEST_TIMBER]);
    const payload = buildAddLoadsPayload(parsed, resolved, "2026-09-24");
    expect(payload[0].fromLocations).toEqual(["George"]);
    expect(payload[0].toLocations).toEqual(["Cape Town"]);
  });

  it("resolves EVERY line through shared per-token resolution (token, not index)", () => {
    const parsed = parseQuickCapture(
      "28/09/26\ntest timber 999 x george na cape town\ntest timber 999 x george na knysna"
    );
    const resolved = resolveParsedClients(parsed, [TEST_TIMBER]);
    const payload = buildAddLoadsPayload(parsed, resolved, "2026-09-24");
    expect(payload).toHaveLength(2);
    expect(payload[0].client).toBe("Test Timber 999");
    expect(payload[1].client).toBe("Test Timber 999");
  });

  it("existing matched customers also use the canonical name (consistent rule)", () => {
    const shaveco: CustomerRecord = {
      name: "Shaveco",
      normalizedName: "shaveco",
      isActive: true,
    };
    const parsed = parseQuickCapture("28/09/26\nshaveco x george na kaap");
    const resolved = resolveParsedClients(parsed, [shaveco]);
    const payload = buildAddLoadsPayload(parsed, resolved, "2026-09-24");
    expect(payload[0].client).toBe("Shaveco");
  });

  it("matched resolution with trimmed canonical name trims whitespace", () => {
    const parsed = parseQuickCapture(CAPTURE);
    const resolved = resolveParsedClients(parsed, [TEST_TIMBER]);
    resolved[0] = { ...resolved[0], resolved: "  Test Timber 999  " };
    const payload = buildAddLoadsPayload(parsed, resolved, "2026-09-24");
    expect(payload[0].client).toBe("Test Timber 999");
  });

  it("falls back to the raw token only when not matched", () => {
    const parsed = parseQuickCapture(CAPTURE);
    const payload = buildAddLoadsPayload(
      parsed,
      [{ clientInput: "test timber 999", status: "unknown" }],
      "2026-09-24"
    );
    expect(payload[0].client).toBe("test timber 999");
  });
});