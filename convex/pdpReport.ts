import { action } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";
import ExcelJS from "exceljs";

/**
 * PDP High-Fidelity Excel Report Generator
 * 
 * Implements a 5-sheet professional compliance report mirroring the Python/openpyxl design.
 * 1. Executive Summary (KPIs & High-level stats)
 * 2. Active Pipeline (Drivers currently in renewal)
 * 3. Expiry Calendar (Future outlook & risk)
 * 4. Driver History (Audit trail per driver)
 * 5. Contingency Report (Issue tracking)
 */

const COLORS = {
  INK: "1E1B4B",
  CHARCOAL: "1F2937",
  STEEL: "6B7280",
  ACCENT: "6C6FE4",
  DANGER: "EF4444",
  WARN: "F59E0B",
  SUCCESS: "10B981",
  INFO: "3B82F6",
  OFF_WHITE: "F9FAFB",
  WHITE: "FFFFFF",
  STRIPE: "F0F0FF",
};

export const generateReport = action({
  args: {
    fromDate: v.string(),
    toDate: v.string(),
    driverId: v.optional(v.id("drivers")),
  },
  handler: async (ctx, args) => {
    // 1. Fetch data from existing query
    const data: any = await ctx.runQuery(api.pdp.getReportData, {
      fromDate: args.fromDate,
      toDate: args.toDate,
      driverId: args.driverId,
    });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "FleetComply Engine";
    workbook.lastModifiedBy = "FleetComply Engine";
    workbook.created = new Date();

    // Setup helper for styling
    const applyHeaderStyle = (cell: ExcelJS.Cell) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.INK } };
      cell.font = { bold: true, color: { argb: COLORS.WHITE }, size: 11 };
      cell.alignment = { horizontal: "center", vertical: "middle" };
    };

    const applyRowStyle = (row: ExcelJS.Row, isEven: boolean) => {
      row.eachCell((cell) => {
        cell.fill = { 
          type: "pattern", 
          pattern: "solid", 
          fgColor: { argb: isEven ? COLORS.STRIPE : COLORS.WHITE } 
        };
        cell.font = { color: { argb: COLORS.CHARCOAL }, size: 11 };
        cell.border = {
          bottom: { style: "thin", color: { argb: "E5E7EB" } }
        };
      });
    };

    // =========================================================================
    // SHEET 1: EXECUTIVE SUMMARY
    // =========================================================================
    const s1 = workbook.addWorksheet("Executive Summary", { views: [{ showGridLines: false }] });
    s1.getColumn(1).width = 35;
    s1.getColumn(2).width = 20;

    s1.addRow(["PDP APPLICATION COMPLIANCE REPORT"]).getCell(1).font = { bold: true, size: 18, color: { argb: COLORS.INK } };
    s1.addRow([`Period: ${args.fromDate} to ${args.toDate}`]).getCell(1).font = { color: { argb: COLORS.STEEL }, size: 11 };
    s1.addRow([`Generated: ${new Date().toLocaleString()}`]).getCell(1).font = { color: { argb: COLORS.STEEL }, size: 11 };
    s1.addRow([]);

    // KPI Blocks
    const apps = data.applications || [];
    const completedCount = apps.filter((a: any) => (a.status || "").toUpperCase().includes("COMPLETE")).length;
    const inProgressCount = apps.length - completedCount;
    
    const kpis = [
      ["Total Applications", apps.length],
      ["Completed Renewals", completedCount],
      ["In-Progress Pipeline", inProgressCount],
      ["Issues/Contingencies", (data.logs || []).filter((l: any) => l.action?.includes("contingency")).length],
    ];

    const headRow = s1.addRow(["Metric", "Value"]);
    applyHeaderStyle(headRow.getCell(1));
    applyHeaderStyle(headRow.getCell(2));

    kpis.forEach((kpi, i) => {
      const row = s1.addRow(kpi);
      row.getCell(1).font = { bold: true, color: { argb: COLORS.CHARCOAL } };
      row.getCell(2).font = { bold: true, color: { argb: COLORS.ACCENT }, size: 12 };
      applyRowStyle(row, i % 2 !== 0);
    });

    // =========================================================================
    // SHEET 2: ACTIVE PIPELINE
    // =========================================================================
    const s2 = workbook.addWorksheet("Active Pipeline");
    const activeHeaders = ["Driver Name", "Status", "Stage Started", "Days in Stage", "Type"];
    const s2Head = s2.addRow(activeHeaders);
    activeHeaders.forEach((_, i) => applyHeaderStyle(s2Head.getCell(i + 1)));
    s2.columns = [{ width: 25 }, { width: 20 }, { width: 15 }, { width: 15 }, { width: 15 }];

    const activeApps = apps.filter((a: any) => !(a.status || "").toUpperCase().includes("COMPLETE"));
    activeApps.forEach((a: any, i: number) => {
      const row = s2.addRow([
        a.driverName || "Unknown",
        a.status,
        new Date(a.updatedAt).toLocaleDateString(),
        Math.floor((Date.now() - a.updatedAt) / 86400000),
        a.pdpType || "-"
      ]);
      applyRowStyle(row, i % 2 !== 0);
    });

    // =========================================================================
    // SHEET 3: EXPIRY CALENDAR
    // =========================================================================
    const s3 = workbook.addWorksheet("Expiry Calendar");
    const expHeaders = ["Driver Name", "ID", "Expiry Date", "Days Remaining", "Risk Level"];
    const s3Head = s3.addRow(expHeaders);
    expHeaders.forEach((_, i) => applyHeaderStyle(s3Head.getCell(i + 1)));
    s3.columns = [{ width: 25 }, { width: 15 }, { width: 15 }, { width: 15 }, { width: 15 }];

    (data.expiryDrivers || []).forEach((d: any, i: number) => {
      const days = Math.floor((new Date(d.pdpExpiryDate).getTime() - Date.now()) / 86400000);
      const risk = days < 0 ? "EXPIRED" : days < 30 ? "CRITICAL" : days < 60 ? "WARNING" : "OK";
      const row = s3.addRow([d.name, d.driverId, d.pdpExpiryDate, days, risk]);
      applyRowStyle(row, i % 2 !== 0);
      
      // Conditional styling for risk
      const riskCell = row.getCell(5);
      if (risk === "EXPIRED" || risk === "CRITICAL") riskCell.font = { color: { argb: COLORS.DANGER }, bold: true };
      else if (risk === "WARNING") riskCell.font = { color: { argb: COLORS.WARN }, bold: true };
    });

    // =========================================================================
    // SHEET 4: DRIVER HISTORY
    // =========================================================================
    const s4 = workbook.addWorksheet("Driver History");
    const histHeaders = ["Timestamp", "Driver", "Action", "Performed By", "Notes"];
    const s4Head = s4.addRow(histHeaders);
    histHeaders.forEach((_, i) => applyHeaderStyle(s4Head.getCell(i + 1)));
    s4.columns = [{ width: 20 }, { width: 25 }, { width: 20 }, { width: 20 }, { width: 40 }];

    (data.logs || []).forEach((l: any, i: number) => {
      const row = s4.addRow([
        new Date(l.timestamp).toLocaleString(),
        l.driverName || "System",
        l.action,
        l.performedBy,
        l.notes || ""
      ]);
      applyRowStyle(row, i % 2 !== 0);
    });

    // =========================================================================
    // SHEET 5: CONTINGENCY REPORT
    // =========================================================================
    const s5 = workbook.addWorksheet("Contingency Report");
    const contHeaders = ["Driver", "Issue Type", "Resolution Note", "Date Logged"];
    const s5Head = s5.addRow(contHeaders);
    contHeaders.forEach((_, i) => applyHeaderStyle(s5Head.getCell(i + 1)));
    s5.columns = [{ width: 25 }, { width: 25 }, { width: 40 }, { width: 20 }];

    apps.filter((a: any) => a.contingency).forEach((a: any, i: number) => {
      const row = s5.addRow([
        a.driverName || "Unknown",
        a.contingency.reason,
        a.contingency.resolutionNote,
        new Date(a.updatedAt).toLocaleDateString()
      ]);
      applyRowStyle(row, i % 2 !== 0);
    });

    // 2. Export to Base64
    const buffer = await workbook.xlsx.writeBuffer();
    const uint8 = new Uint8Array(buffer as ArrayBuffer);
    let binary = "";
    const chunkSize = 8192;
    for (let i = 0; i < uint8.length; i += chunkSize) {
      binary += String.fromCharCode(...uint8.subarray(i, i + chunkSize));
    }
    return btoa(binary);
  },
});
