import { cents, compositionEffect, percentChange } from "@/convex/fuelPriceFields";
import { compositionProblem, DEFAULT_FUEL_COMPOSITION, type AgreementType, validDay } from "@/convex/rateSheetFields";

export type FuelPeriod = { effectiveDate: string; pricePerLitre: number; compositionPercent?: number };
export type MonthlyRates = { months: string[]; rates: (number | null)[][]; problem: string | null };

/** Three calendar months ending at the latest recorded fuel month, never today's date. */
export function rateMonths(latestDate: string): string[] {
  if (!validDay(latestDate)) return ["", "", ""];
  const [year, month] = latestDate.split("-").map(Number);
  return [-2, -1, 0].map(offset => {
    const date = new Date(Date.UTC(year, month - 1 + offset, 1));
    return date.toISOString().slice(0, 7);
  });
}

/**
 * Stored rates belong to the sheet's date. Apply only subsequent changes, in
 * order, rounding each composition adjustment to cents. Recompute from the
 * baseline on every read: a fuel edit, removal or repeated render cannot apply
 * a move twice. Keep the full history even when only three months are shown.
 */
export type RateAgreement = { agreementType?: AgreementType; fuelCompositionPercent?: number };
export function monthlyRates(baseRates: number[], baseDate: string, history: FuelPeriod[], agreement: RateAgreement = {}, displayDate?: string): MonthlyRates {
  const rows = [...history].sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate));
  const latest = rows.at(-1);
  const months = rateMonths(displayDate ?? latest?.effectiveDate ?? baseDate);
  const empty = (): (number | null)[][] => baseRates.map(() => [null, null, null]);
  if (!validDay(baseDate)) return { months, rates: empty(), problem: "Set a valid starting date for these rates." };
  if (agreement.agreementType === "fixed") {
    if (baseRates.some(rate => !Number.isFinite(rate) || rate < 0)) return { months, rates: empty(), problem: "Finish every starting rate first." };
    return { months, rates: baseRates.map(rate => months.map(month => month >= baseDate.slice(0, 7) ? cents(rate) : null)), problem: null };
  }
  const composition = agreement.fuelCompositionPercent ?? DEFAULT_FUEL_COMPOSITION;
  if (agreement.agreementType === "fuel_linked" && compositionProblem(composition)) return { months, rates: empty(), problem: compositionProblem(composition) };
  if (!latest) return { months, rates: empty(), problem: "Record fuel prices in Fuel Compositions first." };
  if (baseRates.some(rate => !Number.isFinite(rate) || rate < 0)) return { months, rates: empty(), problem: "Finish every starting rate first." };
  let problem: string | null = null;
  let values: (number | null)[] = baseRates.map(cents);
  let cursor = 0;
  const rates = empty();
  months.forEach((month, column) => {
    while (cursor < rows.length && rows[cursor].effectiveDate.slice(0, 7) <= month) {
      const row = rows[cursor];
      if (row.effectiveDate > baseDate) {
        const previous = rows[cursor - 1];
        const effect = compositionEffect(percentChange(row.pricePerLitre, previous?.pricePerLitre ?? null), agreement.agreementType === "fuel_linked" ? composition : row.compositionPercent);
        if (effect === null || !Number.isFinite(effect)) {
          problem ??= `Cannot calculate rates from ${row.effectiveDate}: record its composition and the preceding fuel price.`;
          values = values.map(() => null);
        } else {
          values = values.map(value => value === null ? null : cents(value * (1 + effect / 100)));
        }
      }
      cursor++;
    }
    if (month >= baseDate.slice(0, 7)) values.forEach((value, lane) => { rates[lane][column] = value; });
  });
  if (baseDate.slice(0, 7) > latest.effectiveDate.slice(0, 7)) problem ??= "The starting date is later than the latest recorded fuel date. These are starting rates; no later fuel changes have been applied.";
  return { months, rates, problem };
}

/** Screen and PDF share lane dates; unconfigured legacy sheets keep their original sheet baseline. */
export function customerMonthlyRates(lanes: { rate: number; date?: string }[], baseDate: string, history: FuelPeriod[], agreement: RateAgreement = {}): MonthlyRates {
  if (!agreement.agreementType) return monthlyRates(lanes.map(lane => lane.rate), baseDate, history);
  const displayDate = [...history].sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate)).at(-1)?.effectiveDate ?? baseDate;
  const timelines = lanes.map(lane => monthlyRates([lane.rate], lane.date || baseDate, history, agreement, displayDate));
  const fallback = monthlyRates([], baseDate, history, agreement);
  return { months: timelines[0]?.months ?? fallback.months, rates: timelines.map(timeline => timeline.rates[0]), problem: timelines.find(timeline => timeline.problem)?.problem ?? (lanes.length ? null : fallback.problem) };
}
