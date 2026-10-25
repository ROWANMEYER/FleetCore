export type DatedFuelPrice = { _id: string; effectiveDate: string; pricePerLitre: number; compositionPercent?: number };

/** Exact records, including different dates in the same month. Never resolves a month-end price. */
export function compareFuelDates<T extends DatedFuelPrice>(rows: T[], fromId: string, toId: string) {
  const baseline = rows.find((row) => row._id === fromId) ?? null;
  const comparison = rows.find((row) => row._id === toId) ?? null;
  const valid = baseline && comparison && Number.isFinite(baseline.pricePerLitre) && Number.isFinite(comparison.pricePerLitre) && baseline.pricePerLitre > 0 && comparison.pricePerLitre > 0;
  const randDifference = valid ? comparison.pricePerLitre - baseline.pricePerLitre : null;
  const dieselPercentChange = randDifference !== null && baseline ? randDifference / baseline.pricePerLitre * 100 : null;
  return { baseline, comparison, randDifference, dieselPercentChange };
}
export function defaultFuelDates<T extends DatedFuelPrice>(rows: T[]) {
  const ordered = [...rows].sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate));
  return { from: ordered.at(-2)?._id ?? ordered.at(-1)?._id ?? "", to: ordered.at(-1)?._id ?? "" };
}
