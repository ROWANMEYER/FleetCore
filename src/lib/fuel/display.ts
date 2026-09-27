/**
 * How a diesel price record is dressed for the screen.
 *
 * These are deliberately dumb, pure functions rather than inline JSX so the
 * numbers a user reads can be asserted in a test. The one rule that matters
 * most: a percentage is never passed through the currency formatter, because
 * "-R 3,48%" is worse than no number at all.
 *
 * Money is formatted by the shared PDF formatter, which is hand written
 * rather than locale driven (see src/pdf/README.md). Dates are formatted the
 * same way the rest of the app formats them, "02 Sept 2026", but off a local
 * date built from the parts: a bare new Date("2026-09-02") is UTC midnight,
 * which prints as the day before anywhere west of Greenwich.
 */
import { formatCurrency } from "@/src/pdf/formatters";

/** Where a figure sits, which drives both the colour and the arrow. */
export type Movement = "up" | "down" | "flat";

/** A dash rather than a fake zero, for the first price in a history. */
export const DASH = "—";

/** The fields the table needs off a record, so the ordering can be tested without a database. */
export type OrderableRow = {
  effectiveDate: string;
  change: number | null;
  percentChange: number | null;
  carriedPercent: number | null;
};

/**
 * Orders rows for the table, oldest first by default, without touching what
 * each row says.
 *
 * The sort is by date rather than by array position, so a row can never be
 * drawn next to a figure that belongs to a different date. The movement on
 * each row travels with that row, which is the point: reversing the table is a
 * reading convenience, never a recalculation, so no display order can invent a
 * movement that did not happen. The input array is left alone.
 */
export function orderForDisplay<T extends OrderableRow>(rows: T[], newestFirst: boolean): T[] {
  const chronological = [...rows].sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate));
  return newestFirst ? chronological.reverse() : chronological;
}

/** Formats an amount of money the way the rest of the app does: "R 31,32". */
export function formatRand(value: number): string {
  return formatCurrency(value);
}

/**
 * Formats a percentage without any currency marker: "10,01%".
 *
 * Kept separate from formatRand on purpose. A percent and an amount are
 * different things, and routing a percent through the money formatter is how
 * "-R 3,48%" happens.
 */
export function formatPercent(value: number, decimals = 2): string {
  const [whole, fraction] = Math.abs(value).toFixed(decimals).split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  // toFixed(0) gives "6" with nothing after the point, so there is no comma to add.
  return `${value < 0 ? "-" : ""}${grouped}${fraction === undefined ? "" : `,${fraction}`}%`;
}

/** As formatPercent, but always carries an explicit sign so rises and falls read apart at a glance. */
export function formatSignedPercent(value: number, decimals = 2): string {
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}${formatPercent(Math.abs(value), decimals)}`;
}

/** As formatRand, with the same explicit sign. */
export function formatSignedRand(value: number): string {
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}${formatCurrency(Math.abs(value))}`;
}

/** Splits an ISO date into a local date, or null if the text is not one. */
function localDate(iso: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;
  const [, year, month, day] = match.map(Number);
  const built = new Date(year, month - 1, day);
  // Guards a rolled over date such as 2026-13-01, which JS would happily accept.
  return built.getFullYear() === year && built.getMonth() === month - 1 && built.getDate() === day ? built : null;
}

/** "2026-09-02" reads as "02 Sept 2026", matching the rest of the app. */
export function formatDay(iso: string): string {
  const date = localDate(iso);
  return date ? date.toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" }) : iso;
}

/** "2026-09-02" reads as "2 September 2026", for the places that have room. */
export function formatLongDay(iso: string): string {
  const date = localDate(iso);
  return date ? date.toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" }) : iso;
}

/** A null is the first record's movement: no previous price to compare against. */
export function movementOf(value: number | null | undefined): Movement | null {
  if (value === null || value === undefined) return null;
  if (value > 0) return "up";
  if (value < 0) return "down";
  return "flat";
}

/**
 * The colour for a movement, using Tailwind's own palette so the page needs no
 * extra global tokens. A rise is a cost, so it reads as a muted coral; a fall
 * is a saving, so it reads as teal, which is already the app's accent family.
 * Both are paired with an arrow so the colour is never the only signal.
 */
export function movementText(value: number | null | undefined): string {
  const movement = movementOf(value);
  if (movement === "up") return "text-orange-600 dark:text-orange-300";
  if (movement === "down") return "text-teal-600 dark:text-teal-300";
  return "text-[var(--nav-text-color)]";
}

/** A short arrow for a movement. */
export function movementArrow(value: number | null | undefined): string {
  const movement = movementOf(value);
  if (movement === "up") return "▲";
  if (movement === "down") return "▼";
  if (movement === "flat") return "•";
  return "";
}

/** The same arrow, spelled out for a screen reader. */
export function movementWord(value: number | null | undefined): string {
  const movement = movementOf(value);
  if (movement === "up") return "up";
  if (movement === "down") return "down";
  if (movement === "flat") return "unchanged";
  return "";
}
