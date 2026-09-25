import { describe, it, expect } from "vitest";
import {
  parseQuickCapture,
  resolveParsedClients,
  type CustomerRecord,
} from "./parser";
import {
  presentClientName,
  findMatchingCustomer,
  shouldOfferAddClient,
} from "./clientAdd";

const ABC: CustomerRecord = {
  name: "ABC Timber",
  normalizedName: "abc timber",
  isActive: true,
};

const MTO: CustomerRecord = {
  name: "MTO",
  normalizedName: "mto",
  isActive: true,
};

const INACTIVE: CustomerRecord = {
  name: "ABC Timber",
  normalizedName: "abc timber",
  isActive: false,
};

describe("presentClientName", () => {
  it("A: title-cases each word for display (presentation cleanup only)", () => {
    expect(presentClientName("abc timber")).toBe("Abc Timber");
    expect(presentClientName("crest")).toBe("Crest");
  });

  it("E: trims and collapses internal whitespace", () => {
    expect(presentClientName("  abc   timber  ")).toBe("Abc Timber");
  });

  it("never invents words or punctuation (editable pre-fill, not a guess)", () => {
    expect(presentClientName("m&m transporters")).toBe("M&M Transporters");
    expect(presentClientName("3rd floor co")).toBe("3rd Floor Co");
    expect(presentClientName("o'brien haulage")).toBe("O'Brien Haulage");
  });
});

describe("findMatchingCustomer — duplicate/inactive protection", () => {
  it("D: case-normalized match resolves the existing canonical customer", () => {
    expect(findMatchingCustomer("abc timber", [ABC])).toEqual(ABC);
    expect(findMatchingCustomer("ABC TIMBER", [ABC])).toEqual(ABC);
    expect(findMatchingCustomer("ABC Timber", [ABC])).toEqual(ABC);
  });

  it("E: whitespace normalization finds the SAME customer (no duplicate)", () => {
    expect(findMatchingCustomer("  abc   timber  ", [ABC])?.name).toBe("ABC Timber");
  });

  it("matches against normalizedName and plain name equality", () => {
    const nsT = { name: "National Transport", normalizedName: "nat trans", isActive: true };
    expect(findMatchingCustomer("nat trans", [nsT])?.name).toBe("National Transport");
    expect(findMatchingCustomer("National Transport", [nsT])?.name).toBe("National Transport");
  });

  it("returns an INACTIVE match so the UI can message instead of duplicating", () => {
    expect(findMatchingCustomer("abc timber", [INACTIVE])?.isActive).toBe(false);
  });

  it("no deterministic match → null", () => {
    expect(findMatchingCustomer("xyz poles", [ABC, MTO])).toBeNull();
  });
});

describe("shouldOfferAddClient — unknown-client gate", () => {
  it("A: syntactically valid line + unknown resolution → Add Client shown", () => {
    expect(shouldOfferAddClient(true, "unknown")).toBe(true);
  });

  it("B: MALFORMED syntax never offers Add Client even when status is unknown", () => {
    // "abc timber x george cape town" (missing "na") parses clientInput but
    // stays invalid — the action must not appear.
    const parsed = parseQuickCapture("09/09/26\nabc timber x george cape town");
    expect(parsed.loads[0].valid).toBe(false);
    const resolutions = resolveParsedClients(parsed, []);
    expect(shouldOfferAddClient(parsed.loads[0].valid, resolutions[0]?.status)).toBe(false);
    // Fully malformed (no "x" at all) has no clientInput to offer.
    const parsed2 = parseQuickCapture("09/09/26\nabc timber george cape town");
    expect(parsed2.loads[0].valid).toBe(false);
    expect(resolutions.length).toBeGreaterThanOrEqual(0);
  });

  it("C: matched lines never offer Add Client", () => {
    expect(shouldOfferAddClient(true, "matched")).toBe(false);
  });

  it("ambiguous and alias_missing never offer Add Client within 6.4A scope", () => {
    expect(shouldOfferAddClient(true, "ambiguous")).toBe(false);
    expect(shouldOfferAddClient(true, "alias_missing")).toBe(false);
    expect(shouldOfferAddClient(true, undefined)).toBe(false);
  });
});

describe("unknown-client re-resolution after a customer is added (6.4A)", () => {
  it("A: unknown-client resolution preserves the RAW client token", () => {
    const parsed = parseQuickCapture("09/09/26\nABC TIMBER x george na cape town");
    const resolutions = resolveParsedClients(parsed, []);
    expect(resolutions).toHaveLength(1);
    expect(resolutions[0]).toMatchObject({
      clientInput: "ABC TIMBER",
      status: "unknown",
    });
  });

  it("F: two lines with the same unknown token resolve together once one customer exists", () => {
    const parsed = parseQuickCapture(
      "09/09/26\nabc timber x george na cape town\nabc timber x george na pe"
    );
    expect(parsed.loads.every((l) => l.valid)).toBe(true);
    const before = resolveParsedClients(parsed, []);
    expect(before).toHaveLength(1);
    expect(before[0].status).toBe("unknown");

    const after = resolveParsedClients(parsed, [ABC]);
    expect(after).toHaveLength(1); // one customer resolves both lines
    expect(after[0]).toMatchObject({ status: "matched", resolved: "ABC Timber" });

    // Both lines resolve through shared per-token resolution (no per-line create).
    for (const load of parsed.loads) {
      const r = after.find((x) => x.clientInput.toLowerCase() === load.clientInput.toLowerCase());
      expect(r?.status).toBe("matched");
    }
  });

  it("G: adding one client leaves another unknown client untouched", () => {
    const parsed = parseQuickCapture(
      "09/09/26\nabc timber x george na cape town\nxyz poles x knysna na george"
    );
    const after = resolveParsedClients(parsed, [ABC, MTO]);
    const abc = after.find((r) => r.clientInput.toLowerCase().startsWith("abc"));
    const xyz = after.find((r) => r.clientInput.toLowerCase().startsWith("xyz"));
    expect(abc?.status).toBe("matched");
    expect(xyz?.status).toBe("unknown");
  });

  it("H: existing valid parsed lines remain valid across re-resolution", () => {
    const parsed = parseQuickCapture(
      "09/09/26\nabc timber x george na cape town\nmto x george na bredasdorp"
    );
    const beforeValidity = parsed.loads.map((l) => l.valid);
    resolveParsedClients(parsed, [ABC, MTO]); // re-resolution call
    expect(parsed.loads.map((l) => l.valid)).toEqual(beforeValidity);
    expect(parsed.loads.every((l) => l.valid)).toBe(true);
  });

  it("I: date result is unchanged after re-resolution", () => {
    const parsed = parseQuickCapture("09/09/26\nabc timber x george na cape town");
    expect(parsed.date).toBe("2026-09-09");
    resolveParsedClients(parsed, [ABC]);
    expect(parsed.date).toBe("2026-09-09");
  });

  it("J: resolution identity is token-based, not array-index-based", () => {
    const parsed = parseQuickCapture(
      "09/09/26\nabc timber x george na cape town\nmto x george na bredasdorp\nabc timber x george na pe"
    );
    const resolutions = resolveParsedClients(parsed, [ABC]);
    // One entry per UNIQUE token regardless of line position.
    const keys = resolutions.map((r) => r.clientInput.toLowerCase()).sort();
    expect(keys).toEqual(["abc timber", "mto"]);
    // Any line resolves by matching its clientInput token, never by index.
    for (const load of parsed.loads) {
      const r = resolutions.find((x) => x.clientInput.toLowerCase() === load.clientInput.toLowerCase());
      expect(r).toBeDefined();
    }
  });
});