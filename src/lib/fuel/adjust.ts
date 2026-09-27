/**
 * The join between the diesel price history and a rate sheet.
 *
 * A rate sheet says what its rates are priced against (oldDieselPrice →
 * newDieselPrice), and the fuel history says what a litre actually cost on
 * each day. These helpers read one out of the other and do the arithmetic
 * between them, so the editor can offer "adjust every lane to the newest
 * recorded price" as a preview rather than a silent write.
 *
 * Pure functions only: no React, no Convex, no dates fetched from anywhere.
 * The percent maths is imported from `convex/fuelPriceFields` so both sides of
 * the feature derive a movement the same way and can never disagree.
 */
import { cents, percentChange } from "@/convex/fuelPriceFields";

/** The only fields a fuel price needs here: when it took effect and what a litre cost. */
export type PriceRow = { effectiveDate: string; pricePerLitre: number };

/** What the fuel history says relative to one lane date. Every field is null when it cannot be known. */
export type FuelSnapshot = {
  /** The newest price dated on or before the lane date — the price in effect when the rates are dated. */
  priceOnDate: PriceRow | null;
  /** The newest recorded price, whatever its date. */
  latest: PriceRow | null;
  /** Latest price versus the price on the lane date, as a percentage. Null without a base to compare against. */
  percentSince: number | null;
};

/**
 * The price in effect on `date`: the newest row dated on or before it.
 *
 * String comparison is the whole sort because both sides are YYYY-MM-DD, and
 * that format orders lexicographically exactly as it orders in time. A price
 * dated after the sheet's day is not in effect yet and is skipped, not capped.
 */
export function priceInEffectOn<T extends PriceRow>(rows: T[], date: string): T | null {
  const eligible = rows.filter(r => r.effectiveDate <= date);
  return [...eligible].sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate))[0] ?? null;
}

/** The newest recorded price, or null when nothing is recorded. */
export function newestPrice<T extends PriceRow>(rows: T[]): T | null {
  if (!rows.length) return null;
  return [...rows].sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate))[0] ?? null;
}

/** Everything the editor's diesel card wants to say, worked out in one pass so the lines cannot contradict each other. */
export function fuelSnapshotFor(rows: PriceRow[], laneDate: string | null | undefined): FuelSnapshot {
  const latest = newestPrice([...rows]);
  const priceOnDate = laneDate ? priceInEffectOn([...rows], laneDate) : null;
  const latestPrice = latest?.pricePerLitre;
  const basePrice = priceOnDate?.pricePerLitre;
  return {
    priceOnDate,
    latest,
    percentSince: latestPrice !== undefined && basePrice !== undefined ? percentChange(latestPrice, basePrice) : null,
  };
}

/**
 * The multiplier that re-prices a rate set at `oldPrice` a litre for diesel at `newPrice` a litre, or null when the move cannot be made.
 *
 * A zero or unreadable old price has no ratio — dividing by it is how the old
 * editor once threw mid-save — so the caller is told "no" rather than given a
 * number it must remember to guard against.
 */
export function dieselFactor(oldPrice: number, newPrice: number): number | null {
  if (!Number.isFinite(oldPrice) || oldPrice <= 0) return null;
  if (!Number.isFinite(newPrice) || newPrice <= 0) return null;
  return newPrice / oldPrice;
}

/**
 * Scales a draft of lane rate strings from one diesel price to another.
 *
 * Takes and returns the editor's own strings so the apply step is a straight
 * swap of lane state, not a number round trip that reformats under the user's
 * cursor. A field that is not a readable number is left exactly as it is — it
 * is already flagged as unfinished by the lane checks, and silently zeroing it
 * would hide the problem. A zero rate stays zero: free is free at any fuel
 * price. Rates that do move are rounded to cents, the precision the server
 * stores, so what the preview shows is what the save writes.
 */
export function adjustedRateStrings(rates: string[], oldPrice: number, newPrice: number): string[] | null {
  const factor = dieselFactor(oldPrice, newPrice);
  if (factor === null) return null;
  return rates.map(raw => {
    const value = Number(raw);
    if (!raw.trim() || !Number.isFinite(value)) return raw;
    return String(cents(value * factor));
  });
}
