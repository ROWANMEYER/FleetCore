import { describe, expect, it } from "vitest";
import { calculateLoadAmount } from "./utils";

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
