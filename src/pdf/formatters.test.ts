import { describe, expect, it } from "vitest";
import { clampText, formatCurrency, formatDate, formatDescription } from "./formatters";

describe("formatCurrency (strict ZAR: 'R 1 234,56')", () => {
  it("formats thousands with spaces and decimals with a comma", () => {
    expect(formatCurrency(1234.56)).toBe("R 1 234,56");
  });

  it("formats zero", () => {
    expect(formatCurrency(0)).toBe("R 0,00");
  });

  it("formats large numbers with grouped thousands", () => {
    expect(formatCurrency(1000000)).toBe("R 1 000 000,00");
  });

  it("pads single decimal to two places", () => {
    expect(formatCurrency(999.9)).toBe("R 999,90");
  });

  it("handles negatives", () => {
    expect(formatCurrency(-1234.5)).toBe("R -1 234,50");
  });

  it("rounds to two decimals (half away from zero)", () => {
    expect(formatCurrency(1234567.891)).toBe("R 1 234 567,89");
  });
});

describe("formatDate", () => {
  it("normalizes ISO strings to YYYY-MM-DD", () => {
    expect(formatDate("2026-08-03T10:00:00Z")).toBe("2026-08-03");
  });

  it("accepts Date objects", () => {
    expect(formatDate(new Date("2026-01-05T00:00:00Z"))).toBe("2026-01-05");
  });

  it("returns an empty string for falsy input", () => {
    expect(formatDate("")).toBe("");
    expect(formatDate(null as unknown as string)).toBe("");
  });
});

describe("formatDescription", () => {
  it("inserts a line break before ' TO '", () => {
    expect(formatDescription("JHB TO CPT")).toBe("JHB TO \nCPT");
  });

  it("is case-insensitive for ' to ' and normalizes the separator to uppercase", () => {
    expect(formatDescription("cape town to jhb")).toBe("cape town TO \njhb");
  });
});

describe("clampText", () => {
  it("truncates long strings to the max line length", () => {
    expect(clampText("a".repeat(100))).toHaveLength(68);
  });

  it("returns undefined/empty input as empty string", () => {
    expect(clampText(undefined)).toBe("");
  });

  it("leaves short strings untouched", () => {
    expect(clampText("short")).toBe("short");
  });
});
