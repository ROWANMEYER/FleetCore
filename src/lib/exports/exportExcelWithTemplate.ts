/**
 * IMPORTANT:
 * This exporter assumes the Excel template already contains:
 * - All sheets (Sheets, Client Summary, Driver Summary, etc.)
 * - All formulas
 * - All charts
 * 
 * This file MUST NOT:
 * - Create workbooks (XLSX.utils.book_new)
 * - Append sheets (XLSX.utils.book_append_sheet)
 * - Recalculate summaries
 * - Add formatting logic (presentation belongs in the template)
 */
import * as XLSX from "xlsx";
import { SheetExportRow } from "@/src/types/sheetExport";
import { downloadFile } from "./utils";

export async function exportExcelWithTemplate(
  rows: SheetExportRow[],
  metadata?: { dateRange: string; generatedAt: string }
) {
  try {
    // 1. Fetch the template
    const response = await fetch("/templates/fleetcore-sheets-template-extended.xlsx");
    if (!response.ok) {
      throw new Error(`Failed to load template: ${response.statusText}`);
    }
    const arrayBuffer = await response.arrayBuffer();

    // 2. Load the workbook
    const workbook = XLSX.read(arrayBuffer, { type: "array" });

    // 3. Target "Sheets" worksheet
    const sheetName = "Sheets";
    const worksheet = workbook.Sheets[sheetName];
    if (!worksheet) {
      throw new Error(`Template missing "${sheetName}" worksheet`);
    }

    // 4. Inject Metadata (if provided)
    if (metadata) {
      // Helper to safely write to cell
      const writeCell = (cell: string, value: string) => {
        if (!worksheet[cell]) worksheet[cell] = { t: 's', v: '' };
        worksheet[cell].v = value;
      };

      // Write Date Range to B2 (assuming template has label in A2)
      writeCell("B2", metadata.dateRange);
      
      // Write Timestamp to E2 (assuming template has label in D2)
      writeCell("E2", metadata.generatedAt);
    }

    // 5. Insert data starting at row A10 (below headers at A9)
    // We use explicit Array of Arrays (AOA) to guarantee column order matching the template.
    // Template Order: Date(A), Truck(B), Trailer(C), Driver(D), Client(E), From(F), To(G), KM(H), Amount(I), R/KM(J), Status(K)
    const dataRows = rows.map(row => ([
      row.date,
      row.truck,
      row.trailer,
      row.driver,
      row.client,
      row.from,
      row.to,
      row.routeKm,
      row.amount,
      row.ratePerKm,
      row.status,
    ]));

    XLSX.utils.sheet_add_aoa(worksheet, dataRows, {
      origin: "A10",
    });

    // 6. Export
    const outBuffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
    const blob = new Blob([outBuffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    downloadFile(blob, "fleetcore-sheets.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");

  } catch (error) {
    console.error("Excel export failed:", error);
    alert("Failed to export Excel file. See console for details.");
    throw error; // Re-throw for caller handling if needed
  }
}
