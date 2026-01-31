import { SheetExportRow } from "@/src/types/sheetExport";
import { downloadFile } from "./utils";

export function exportCSV(rows: SheetExportRow[]) {
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]).join(",");
  const csv = [
    headers,
    ...rows.map((row) =>
      Object.values(row)
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(",")
    ),
  ].join("\n");
  downloadFile(csv, "fleetcore-sheets.csv", "text/csv");
}
