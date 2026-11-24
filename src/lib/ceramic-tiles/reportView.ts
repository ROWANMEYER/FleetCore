import type { CeramicReportRow } from "./reportExport";
import { ceramicMonthlyAmounts } from "./monthlyReport";
export type CeramicReportKind = "monthly" | "local";
export type CeramicReportFilter = "all" | "review" | "missing";
export type CeramicReportSort = "date" | "shipment" | "driver" | "amount";
export type CeramicReportItem = { key: string; row: CeramicReportRow; local?: CeramicReportRow["locals"][number] };
export function ceramicReportMissing(row: CeramicReportRow): boolean {
  const b = row.billing;
  return !b || row.billingSourceVersion !== row.version || [b.ratePerTon, b.stops, b.drops].some(n => n === null) ||
    row.locals.some(leg => b.locals.find(saved => saved.key === leg.key)?.price == null);
}
export function ceramicReportNeedsReview(row: CeramicReportRow): boolean {
  return row.needsReview || !!row.unmappedWarehouses?.length || row.billing?.automation?.status === "needs_review";
}
export function ceramicReportStatus(row: CeramicReportRow): string {
  return ceramicReportNeedsReview(row) ? "Needs review" : ceramicReportMissing(row) ? "Missing amounts" : "Ready";
}
export function ceramicReportLocalPrice(item: CeramicReportItem): number | null {
  return item.local ? item.row.billing?.locals.find(saved => saved.key === item.local!.key)?.price ?? null :
    !item.row.billing || item.row.locals.some(leg => item.row.billing!.locals.find(saved => saved.key === leg.key)?.price == null) ? null :
      item.row.locals.reduce((sum, leg) => sum + (item.row.billing!.locals.find(saved => saved.key === leg.key)?.price ?? 0), 0);
}
/** Sort/filter the screen only. Original rows and complete-period Excel exports stay intact. */
export function ceramicReportItems(rows: CeramicReportRow[], kind: CeramicReportKind, search: string, filter: CeramicReportFilter, sort: CeramicReportSort, descending: boolean): CeramicReportItem[] {
  const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const items: CeramicReportItem[] = rows.flatMap<CeramicReportItem>(row => kind === "monthly" ? [{ key: row.shipmentId, row }] : row.locals.map(local => ({ key: `${row.shipmentId}:${local.key}`, row, local })));
  const filtered = items.filter(item => {
    const row = item.row;
    if (filter === "review" && !ceramicReportNeedsReview(row) || filter === "missing" && !ceramicReportMissing(row)) return false;
    const haystack = [row.shipmentNumber, row.driverName, row.truckFleetNo, row.truckRegistration, row.routeDate, ...row.fromLocations, ...(item.local ? [] : row.toLocations), ...(item.local?.deliveryNumbers ?? row.deliveryNumbers), item.local?.name, item.local?.address].join(" ").toLowerCase();
    return words.every(word => haystack.includes(word));
  });
  const amount = (item: CeramicReportItem) => kind === "local" ? ceramicReportLocalPrice(item) : ceramicMonthlyAmounts(item.row.warehouseWeights ?? [], item.row.billing).total;
  return filtered.sort((a, b) => {
    let compare: number;
    if (sort === "amount") {
      const x = amount(a), y = amount(b);
      if (x === null || y === null) return x === y ? a.key.localeCompare(b.key) : x === null ? 1 : -1;
      compare = x - y;
    } else {
      const field = sort === "date" ? "routeDate" : sort === "shipment" ? "shipmentNumber" : "driverName";
      compare = a.row[field].localeCompare(b.row[field], undefined, { numeric: true });
    }
    return (descending ? -compare : compare) || a.key.localeCompare(b.key);
  });
}
