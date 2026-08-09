import { describe, expect, it } from "vitest";
import { calculateLoadAmount, loadFingerprint } from "./utils";

describe("calculateLoadAmount", () => {
  it("returns the flat rate for flat-rate loads regardless of quantity", () => {
    expect(calculateLoadAmount(5, 1000, "flat")).toBe(1000);
    expect(calculateLoadAmount(0, 1000, "flat")).toBe(1000);
  });

  it("treats 'full' as a flat rate", () => {
    expect(calculateLoadAmount(5, 2500, "full")).toBe(2500);
  });

  it("multiplies quantity by rate for per-unit loads", () => {
    expect(calculateLoadAmount(5, 100, "per_unit")).toBe(500);
  });

  it("returns zero revenue when quantity is zero", () => {
    expect(calculateLoadAmount(0, 100, "per_unit")).toBe(0);
  });

  it("defaults unknown rate types to per-unit", () => {
    expect(calculateLoadAmount(5, 100, "weird")).toBe(500);
  });
});

describe("loadFingerprint", () => {
  it("matches identical loads", () => {
    expect(
      loadFingerprint("2026-08-09", "154", "201", "ACME", "18500.00")
    ).toBe(loadFingerprint("2026-08-09", "154", "201", "ACME", "18500.00"));
  });

  it("normalizes the amount (R prefix, thousands spaces, comma decimals)", () => {
    expect(loadFingerprint("2026-08-09", "154", "201", "ACME", "R18 500,00")).toBe(
      loadFingerprint("2026-08-09", "154", "201", "ACME", "18500.00")
    );
  });

  it("is case-insensitive for client and whitespace-insensitive for truck/trailer", () => {
    expect(loadFingerprint("2026-08-09", " 154 ", "201", "acme corp", "18500")).toBe(
      loadFingerprint("2026-08-09", "154", "201", "ACME CORP", "18500.00")
    );
  });

  it("distinguishes different dates, trucks, trailers, clients and amounts", () => {
    const base = ["2026-08-09", "154", "201", "ACME", "18500.00"] as const;
    const variants = [
      ["2026-08-10", "154", "201", "ACME", "18500.00"],
      ["2026-08-09", "155", "201", "ACME", "18500.00"],
      ["2026-08-09", "154", "202", "ACME", "18500.00"],
      ["2026-08-09", "154", "201", "OTHER", "18500.00"],
      ["2026-08-09", "154", "201", "ACME", "19000.00"],
    ];
    const baseKey = loadFingerprint(...base);
    for (const v of variants) {
      expect(loadFingerprint(...(v as [string, string, string, string, string]))).not.toBe(baseKey);
    }
  });
});
