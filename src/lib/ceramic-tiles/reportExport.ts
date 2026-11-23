import { CERAMIC_LOCAL_TOWN } from "./planning";
import type { Infer } from "convex/values";
import type { ceramicReportRow } from "@/convex/ceramicTilesFields";

export type CeramicReportRow = Infer<typeof ceramicReportRow>;
type Cell = string | number | null;
export function ceramicReportSheets(rows: CeramicReportRow[]): { name: string; rows: Cell[][] }[] {
  return [
    { name: "Monthly Ceramic", rows: [
      ["Planning date", "Shipment", "PDF version", "Driver", "Truck", "Collection points", "Deliveries", "Delivery references", "Actual weight (kg)", "Actual tonnes", "Pallets", "Local stops", "Review"],
      ...rows.map(row => [row.routeDate, row.shipmentNumber, row.version, row.driverName, row.truckFleetNo,
        row.fromLocations.join("; "), row.toLocations.join("; "), row.deliveryNumbers.join("; "), row.weightKg,
        row.weightKg === null ? null : row.weightKg / 1000, row.pallets, row.locals.length, row.needsReview ? "Review shipment / Planner changes" : ""]),
    ] },
    { name: "Local Loads", rows: [
      ["Planning date", "Shipment", "PDF version", "Driver", "Truck", "From", "To", "Type", "Local stop", "Address", "Delivery references", "Weight (kg)", "Pallets", "Review"],
      ...rows.flatMap(row => row.locals.map(leg => [row.routeDate, row.shipmentNumber, row.version, row.driverName,
        row.truckFleetNo, CERAMIC_LOCAL_TOWN, CERAMIC_LOCAL_TOWN, leg.kind, leg.name, leg.address, leg.deliveryNumbers.join("; "), leg.weightKg, leg.pallets,
        row.needsReview ? "Review shipment / Planner changes" : ""])),
    ] },
  ];
}
export async function downloadCeramicReports(rows: CeramicReportRow[], month: string, region: string) {
  const { buildCeramicTemplateSheets } = await import("./templateWorkbook");
  const { ceramicTemplateExcel } = await import("./templateExport");
  for (const row of rows) {
    if (row.needsReview || row.unmappedWarehouses?.length) throw new Error(`${row.shipmentNumber}: review the shipment and collection warehouse codes before exporting.`);
    if (!row.billing || row.billingSourceVersion !== row.version || [row.billing.ratePerTon, row.billing.stops, row.billing.drops].some(value => value === null)) throw new Error(`${row.shipmentNumber}: save rate per ton and the stops charge before exporting. Stop charging rules are awaiting confirmation; enter an amount only when confirmed.`);
    if (row.locals.some(leg => { const input = row.billing?.locals.find(item => item.key === leg.key); return !input || input.price === null || !input.from.trim() || !input.to.trim(); })) throw new Error(`${row.shipmentNumber}: open the Local loads report to save each local price and its Van/Na locations before exporting.`);
  }
  const bytes = await ceramicTemplateExcel(buildCeramicTemplateSheets(rows, month));
  const { downloadFile } = await import("@/src/lib/exports/utils");
  downloadFile(new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `Ceramic-${region}-${month}.xlsx`, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
}
