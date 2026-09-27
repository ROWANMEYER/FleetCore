import { describe, expect, it } from "vitest";
import { adjustedRateStrings, dieselFactor, fuelSnapshotFor, newestPrice, priceInEffectOn } from "./adjust";

const row = (effectiveDate: string, pricePerLitre: number) => ({ effectiveDate, pricePerLitre });
const HISTORY = [row("2022-06-01", 24.5), row("2022-07-06", 26.8), row("2022-08-03", 25.92), row("2026-09-02", 31.32)];

describe("priceInEffectOn", () => {
  it("picks the newest price dated on or before the day", () => {
    expect(priceInEffectOn(HISTORY, "2026-09-27")).toEqual(row("2026-09-02", 31.32));
    expect(priceInEffectOn(HISTORY, "2022-07-31")).toEqual(row("2022-07-06", 26.8));
  });
  it("returns the row dated exactly on the day", () => {
    expect(priceInEffectOn(HISTORY, "2022-08-03")).toEqual(row("2022-08-03", 25.92));
  });
  it("returns null before the first price", () => {
    expect(priceInEffectOn(HISTORY, "2022-05-31")).toBeNull();
  });
  it("ignores a price dated after the day, however new it is", () => {
    // 2026-09-27 is the latest day here; a row typed for tomorrow must not leak backwards.
    expect(priceInEffectOn(HISTORY, "2022-06-15")).toEqual(row("2022-06-01", 24.5));
  });
  it("survives an unsorted history", () => {
    expect(priceInEffectOn([...HISTORY].reverse(), "2026-09-27")).toEqual(row("2026-09-02", 31.32));
  });
  it("returns null from an empty history", () => {
    expect(priceInEffectOn([], "2026-09-27")).toBeNull();
  });
});

describe("newestPrice", () => {
  it("picks the latest dated row", () => {
    expect(newestPrice(HISTORY)).toEqual(row("2026-09-02", 31.32));
  });
  it("is null when nothing is recorded", () => {
    expect(newestPrice([])).toBeNull();
  });
  it("does not mutate the caller's array while choosing the newest price", () => {
    const rows = [...HISTORY].reverse();
    const before = JSON.stringify(rows);
    expect(newestPrice(rows)).toEqual(row("2026-09-02", 31.32));
    expect(JSON.stringify(rows)).toBe(before);
  });
});

describe("array purity", () => {
  it("does not mutate the caller's history when finding the active price for a date", () => {
    const rows = [...HISTORY].reverse();
    const before = JSON.stringify(rows);
    expect(priceInEffectOn(rows, "2026-09-27")).toEqual(row("2026-09-02", 31.32));
    expect(JSON.stringify(rows)).toBe(before);
  });
});

describe("fuelSnapshotFor", () => {
  it("compares the newest price with the one in effect on the lane date", () => {
    const snap = fuelSnapshotFor(HISTORY, "2022-07-06");
    expect(snap.latest).toEqual(row("2026-09-02", 31.32));
    expect(snap.priceOnDate).toEqual(row("2022-07-06", 26.8));
    expect(snap.percentSince).not.toBeNull();
  });
  it("has no base when the lane date precedes every price", () => {
    const snap = fuelSnapshotFor(HISTORY, "2022-01-01");
    expect(snap.priceOnDate).toBeNull();
    expect(snap.latest).toEqual(row("2026-09-02", 31.32));
    expect(snap.percentSince).toBeNull();
  });
  it("says nothing when nothing is recorded", () => {
    const snap = fuelSnapshotFor([], "2026-09-27");
    expect(snap.latest).toBeNull();
    expect(snap.priceOnDate).toBeNull();
    expect(snap.percentSince).toBeNull();
  });
  it("says nothing without a lane date", () => {
    const snap = fuelSnapshotFor(HISTORY, null);
    expect(snap.priceOnDate).toBeNull();
    expect(snap.percentSince).toBeNull();
  });
  it("is zero when the newest price is the one in effect on the lane date", () => {
    expect(fuelSnapshotFor(HISTORY, "2026-09-27").percentSince).toBe(0);
  });
});

describe("dieselFactor", () => {
  it("scales a rate by the ratio of the prices", () => {
    expect(dieselFactor(20, 23.15)).toBeCloseTo(1.1575);
  });
  it("refuses an unusable old price instead of dividing by zero", () => {
    expect(dieselFactor(0, 23.15)).toBeNull();
    expect(dieselFactor(-1, 23.15)).toBeNull();
    expect(dieselFactor(Number.NaN, 23.15)).toBeNull();
  });
  it("refuses an unusable new price", () => {
    expect(dieselFactor(20, 0)).toBeNull();
    expect(dieselFactor(20, Number.NaN)).toBeNull();
  });
});

describe("adjustedRateStrings", () => {
  it("scales every readable rate to cents", () => {
    expect(adjustedRateStrings(["1500", "2000.00", "0"], 20, 23.15)).toEqual(["1736.25", "2315", "0"]);
  });
  it("leaves a rate that is not a readable number exactly as it is", () => {
    expect(adjustedRateStrings(["", "  ", "abc"], 20, 23.15)).toEqual(["", "  ", "abc"]);
  });
  it("returns null when the old price cannot be divided by", () => {
    expect(adjustedRateStrings(["1500"], 0, 23.15)).toBeNull();
  });
  it("returns null when the new price cannot be used", () => {
    expect(adjustedRateStrings(["1500"], 20, 0)).toBeNull();
  });
  it("rounds the way the server stores, so the preview is what the save writes", () => {
    expect(adjustedRateStrings(["1000"], 31, 31.01)).toEqual(["1000.32"]);
  });
});
