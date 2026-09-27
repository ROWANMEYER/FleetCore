/**
 * Comparing two months of diesel prices.
 *
 * Pure functions, deliberately, because the arithmetic here is easy to get
 * quietly wrong: months are keyed by year *and* month so a December can never
 * be lined up against a January from the wrong year, and every result carries
 * the record it came from so the screen can name the date it actually used.
 *
 * Nothing here writes. The composition a user types into the comparison panel is
 * a what-if for that panel alone, and is never pushed back over a saved price.
 */

export type MonthKey = string;

/** What the panel needs off a price record. */
export type FuelRowLike = {
  _id: string;
  effectiveDate: string;
  pricePerLitre: number;
  compositionPercent?: number;
  change: number | null;
  percentChange: number | null;
  carriedPercent: number | null;
};

/** One month resolved down to the single price being compared. */
export type ResolvedMonth<T extends FuelRowLike> = {
  key: MonthKey;
  label: string;
  row: T;
  price: number;
};

export type MonthComparison<T extends FuelRowLike> = {
  fromKey: MonthKey;
  toKey: MonthKey;
  /** Null when that month has nothing recorded against it. */
  baseline: ResolvedMonth<T> | null;
  comparison: ResolvedMonth<T> | null;
  /** comparison price − baseline price, or null if either is missing. */
  randDifference: number | null;
  /**
   * The move as a percentage of the baseline, at full precision.
   * Null when it cannot be worked out at all, which is a different answer from
   * a move of zero: a missing month and a baseline of zero both land here.
   */
  dieselPercentChange: number | null;
};

/**
 * The year and month a date belongs to, as "2026-09".
 *
 * Carrying the year in the key is the whole point: matching on a month number
 * alone would let September 2025 sit beside September 2026 as though nothing
 * separated them.
 */
export function monthKeyOf(effectiveDate: string): MonthKey | null {
  const match = /^(\d{4})-(\d{2})-\d{2}$/.exec(effectiveDate.trim());
  if (!match) return null;
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  return `${match[1]}-${match[2]}`;
}

/** "2026-09" reads as "Sept 2026", using the same date style as the rest of the app. */
export function monthLabel(key: MonthKey): string {
  const [year, month] = key.split("-");
  if (!year || !month) return key;
  const parsed = Number(month);
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 12) return key;
  return `${new Date(Number(year), parsed - 1, 1).toLocaleDateString("en-ZA", { month: "short" })} ${year}`;
}

/** The months that have at least one price recorded, oldest first. */
export function availableMonths<T extends FuelRowLike>(rows: T[]): MonthKey[] {
  const keys = new Set<MonthKey>();
  for (const row of rows) {
    const key = monthKeyOf(row.effectiveDate);
    if (key) keys.add(key);
  }
  return [...keys].sort();
}

/**
 * The last price recorded within a month, by date.
 *
 * A month can hold several prices, and only the final one of them is the price
 * that month ended on, which is the one worth comparing. Sorted here rather
 * than assumed, because the table may be showing them newest first.
 */
export function lastPriceInMonth<T extends FuelRowLike>(rows: T[], key: MonthKey): T | null {
  let latest: T | null = null;
  for (const row of rows) {
    if (monthKeyOf(row.effectiveDate) !== key) continue;
    if (!latest || row.effectiveDate > latest.effectiveDate) latest = row;
  }
  return latest;
}

/**
 * The two most recent months, oldest first.
 *
 * With only one month on record both ends land on it, which is a comparison of
 * a month with itself and correctly shows no change, rather than leaving the
 * baseline half chosen.
 */
export function defaultPair<T extends FuelRowLike>(rows: T[]): { from: MonthKey | null; to: MonthKey | null } {
  const months = availableMonths(rows);
  if (!months.length) return { from: null, to: null };
  if (months.length === 1) return { from: months[0], to: months[0] };
  return { from: months[months.length - 2], to: months[months.length - 1] };
}

/** Exchanges the two selections, so a comparison can be read the other way round. */
export function swapPair(pair: { from: MonthKey | null; to: MonthKey | null }): { from: MonthKey | null; to: MonthKey | null } {
  return { from: pair.to, to: pair.from };
}

/**
 * Lines two months up against each other.
 *
 * Both directions are allowed: asking for a later month against an earlier one
 * is a legitimate way to phrase a fall, and the sign of the result follows the
 * months rather than being forced to read as a rise. Comparing a month with
 * itself gives a genuine zero rather than being refused.
 */
export function compareMonths<T extends FuelRowLike>(rows: T[], fromKey: MonthKey, toKey: MonthKey): MonthComparison<T> {
  const baselineRow = lastPriceInMonth(rows, fromKey);
  const comparisonRow = lastPriceInMonth(rows, toKey);
  const baseline = baselineRow
    ? { key: fromKey, label: monthLabel(fromKey), row: baselineRow, price: baselineRow.pricePerLitre }
    : null;
  const comparison = comparisonRow
    ? { key: toKey, label: monthLabel(toKey), row: comparisonRow, price: comparisonRow.pricePerLitre }
    : null;

  const randDifference = baseline && comparison ? comparison.price - baseline.price : null;
  // A percentage of nothing is not zero, it is unknown. A baseline price of
  // zero cannot happen through the recording form, but a hand edited record
  // should not turn into Infinity on screen either.
  const dieselPercentChange = randDifference === null || !baseline || baseline.price === 0
    ? null
    : (randDifference / baseline.price) * 100;

  return { fromKey, toKey, baseline, comparison, randDifference, dieselPercentChange };
}

/**
 * What the move would mean for a rate, at the composition the user is assuming.
 *
 * This is the endpoint move scaled by the fuel share, not a running total of
 * the carried figures recorded along the way.
 */
export function estimatedRateImpact(dieselPercentChange: number | null, compositionPercent: number): number | null {
  if (dieselPercentChange === null || !Number.isFinite(compositionPercent)) return null;
  return dieselPercentChange * (compositionPercent / 100);
}

/**
 * Reads a typed percentage.
 *
 * Both a point and a comma are taken as the decimal mark. The app writes every
 * figure with a comma, so "40,5" is what a user is likely to type, and in a
 * browser locale that uses commas the number field hands it over as the value.
 * Returns null for anything that is not one number, so a stray percent sign or
 * a doubled point is refused rather than quietly read as zero.
 */
function parseDecimal(raw: string): number | null {
  const text = raw.trim().replace(",", ".");
  if (!/^[+-]?\d*\.?\d+$/.test(text)) return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

/** Why a typed composition cannot be used, or null when it is fine. */
export function compositionProblem(raw: string): string | null {
  const text = raw.trim();
  // A blank is not a zero. The panel needs a real figure before it can say what
  // the move costs, and the saved composition is only ever a starting point.
  if (!text) return "Enter a composition between 0 and 100%.";
  const value = parseDecimal(text);
  if (value === null) return "Enter a number, such as 40 or 40,5.";
  if (value < 0) return "A composition cannot be below 0%.";
  if (value > 100) return "A composition cannot be above 100%.";
  return null;
}

/** A typed composition as a number, or null while it is unusable. */
export function compositionValue(raw: string): number | null {
  const value = parseDecimal(raw);
  return value !== null && compositionProblem(raw) === null ? value : null;
}
