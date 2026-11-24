import { validCeramicDate } from "./planning";
export function ceramicBillingPeriod(month: string, startDay = 25): { start: string; end: string } {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || !Number.isInteger(startDay) || startDay < 1 || startDay > 31) throw new Error("Choose a valid billing month and start day (1 to 31).");
  const [year, m] = month.split("-").map(Number);
  const boundary = (offset: number) => { const first = new Date(Date.UTC(year, m - 1 + offset, 1)); return new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(startDay, new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate()))); };
  const start = boundary(startDay === 1 ? 0 : -1), end = boundary(startDay === 1 ? 1 : 0); end.setUTCDate(end.getUTCDate() - 1);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}
export function ceramicReportMonth(day: string, startDay = 25): string {
  if (!validCeramicDate(day)) throw new Error("Choose a valid planning date.");
  const month = day.slice(0, 7), period = ceramicBillingPeriod(month, startDay);
  if (day <= period.end) return month;
  const date = new Date(`${day}T00:00:00Z`); return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1)).toISOString().slice(0, 7);
}
export function ceramicReportRange(month: string, start?: string, end?: string, startDay = 25) {
  const defaults = ceramicBillingPeriod(month, startDay), range = { start: start ?? defaults.start, end: end ?? defaults.end };
  if (!validCeramicDate(range.start) || !validCeramicDate(range.end) || range.start > range.end) throw new Error("Choose a valid billing date range.");
  if ((Date.parse(range.end) - Date.parse(range.start)) / 86400000 > 366) throw new Error("Choose a report period of at most 367 days.");
  return range;
}
