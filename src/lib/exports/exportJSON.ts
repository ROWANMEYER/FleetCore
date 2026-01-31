import { SheetExportRow } from "@/src/types/sheetExport";
import { downloadFile } from "./utils";

export function exportJSON(rows: SheetExportRow[]) {
  const json = JSON.stringify(rows, null, 2);
  downloadFile(json, "fleetcore-sheets.json", "application/json");
}
