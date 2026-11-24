import { cents } from "../../../convex/fuelPriceFields";
import { validDay } from "../../../convex/rateSheetFields";
export type CustomerAdjustment = { _id: string; sheetId: string; effectiveDate: string; percentage: number | null; rates: { laneId: string; rate: number }[]; reference: string; recordedAt: number };
/** A corrected notice replaces its earlier same-day version; it never compounds twice. */
export function currentCustomerAdjustments(notices: CustomerAdjustment[]): CustomerAdjustment[] {
  const dates = new Map<string, CustomerAdjustment>();
  for (const notice of notices) {
    const old = dates.get(notice.effectiveDate);
    if (!old || notice.recordedAt > old.recordedAt || notice.recordedAt === old.recordedAt && notice._id > old._id) dates.set(notice.effectiveDate, notice);
  }
  return [...dates.values()].sort((a,b) => a.effectiveDate.localeCompare(b.effectiveDate));
}
export function customerRateOnDate(base: number, baseDate: string, day: string, laneId: string, notices: CustomerAdjustment[]): number | null {
  if (!validDay(baseDate) || !validDay(day) || baseDate > day || !Number.isFinite(base) || base < 0) return null;
  let value = cents(base);
  for (const notice of currentCustomerAdjustments(notices)) {
    if (notice.effectiveDate < baseDate || notice.effectiveDate > day) continue;
    if (notice.percentage !== null && notice.effectiveDate > baseDate) value = cents(value * (1 + notice.percentage / 100));
    const exact = notice.rates.find(rate => rate.laneId === laneId);
    if (exact) value = cents(exact.rate);
  }
  return Number.isFinite(value) && value >= 0 && value <= 1e9 ? value : null;
}
export function customerAdjustmentPending(agreementType: string | undefined, latestFuelDate: string | undefined, latestCustomerDate: string | undefined): boolean {
  return agreementType === "customer_notified" && !!latestFuelDate && (!latestCustomerDate || latestCustomerDate.slice(0,7) < latestFuelDate.slice(0,7));
}
