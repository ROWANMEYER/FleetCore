"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import * as XLSX from "xlsx";

// ─── Types ──────────────────────────────────────────────────────────────────

interface TruckRow {
  truckFleetNo: string;
  registration: string;
}

interface TrailerRow {
  trailerFleetNo: number;
  type: string;
  trailers: { length: string; registration: string }[];
}

interface DriverRow {
  driverName: string;
  idNumber: string;
  phone: string;
}

type RowStatus = "new" | "update" | "unchanged" | "skipped";

interface PreviewRow<T> {
  id: string;
  status: RowStatus;
  data: T;
  oldData: Record<string, string> | null;
  issues: string[];
  selected: boolean;
}

type Stage = "upload" | "preview" | "committing" | "done";

// ─── Helpers ────────────────────────────────────────────────────────────────

function arraysEqual<T>(a: T[], b: T[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((v, i) => JSON.stringify(v) === JSON.stringify(b[i]));
}

function normalizeStr(val: unknown): string {
  if (val == null || val === "") return "";
  return String(val).trim();
}

// ─── Comparison logic ───────────────────────────────────────────────────────

function compareTruck(
  row: TruckRow,
  existing: { truckFleetNo?: string; registration?: string }[]
): { status: RowStatus; oldData: Record<string, string> | null } {
  const match = existing.find(
    (e) => e.truckFleetNo === row.truckFleetNo
  );
  if (!match) return { status: "new", oldData: null };

  const changes: Record<string, string> = {};
  if ((match.registration ?? "") !== row.registration) {
    changes.registration = match.registration ?? "";
  }
  if (Object.keys(changes).length === 0) return { status: "unchanged", oldData: null };
  return { status: "update", oldData: changes };
}

function compareTrailer(
  row: TrailerRow,
  existing: { trailerFleetNoStr?: string; type?: string; trailers?: { length: string; registration: string }[] }[]
): { status: RowStatus; oldData: Record<string, string> | null } {
  const match = existing.find(
    (e) => e.trailerFleetNoStr === String(row.trailerFleetNo)
  );
  if (!match) return { status: "new", oldData: null };

  const changes: Record<string, string> = {};
  if ((match.type ?? "") !== row.type) {
    changes.type = match.type ?? "";
  }
  if (!arraysEqual(match.trailers ?? [], row.trailers)) {
    changes.trailers = JSON.stringify(match.trailers ?? []);
  }
  if (Object.keys(changes).length === 0) return { status: "unchanged", oldData: null };
  return { status: "update", oldData: changes };
}

function compareDriver(
  row: DriverRow,
  existing: { driverId?: string; driverName?: string; phone?: string }[]
): { status: RowStatus; oldData: Record<string, string> | null } {
  const match = existing.find((e) => e.driverId === row.idNumber);
  if (!match) return { status: "new", oldData: null };

  const changes: Record<string, string> = {};
  if ((match.driverName ?? "") !== row.driverName) {
    changes.driverName = match.driverName ?? "";
  }
  if ((match.phone ?? "") !== row.phone) {
    changes.phone = match.phone ?? "";
  }
  if (Object.keys(changes).length === 0) return { status: "unchanged", oldData: null };
  return { status: "update", oldData: changes };
}

// ─── Parse helpers ──────────────────────────────────────────────────────────

function parseTrucksSheet(rows: unknown[][]): { data: TruckRow[]; errors: string[] } {
  const data: TruckRow[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i] as (string | number | null | undefined)[];
    if (!r || r.length < 2) continue;

    const fleetNo = normalizeStr(r[0]);
    const regNo = normalizeStr(r[1]);

    if (!fleetNo) {
      errors.push(`Trucks row ${i + 1}: missing Fleet_No`);
      continue;
    }
    if (seen.has(fleetNo)) {
      errors.push(`Trucks row ${i + 1}: duplicate Fleet_No "${fleetNo}"`);
      continue;
    }
    seen.add(fleetNo);
    data.push({ truckFleetNo: fleetNo, registration: regNo ? `CAW${regNo}` : "" });
  }
  return { data, errors };
}

function parseTrailersSheet(rows: unknown[][]): { data: TrailerRow[]; errors: string[] } {
  const data: TrailerRow[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i] as (string | number | null | undefined)[];
    if (!r || r.length < 2) continue;

    const fleetNoRaw = normalizeStr(r[0]);
    const type = normalizeStr(r[1]);
    const trailer6m = normalizeStr(r[2]);
    const trailer12m = normalizeStr(r[3]);

    if (!fleetNoRaw) {
      errors.push(`Trailers row ${i + 1}: missing Fleet_No`);
      continue;
    }
    if (seen.has(fleetNoRaw)) {
      errors.push(`Trailers row ${i + 1}: duplicate Fleet_No "${fleetNoRaw}"`);
      continue;
    }
    seen.add(fleetNoRaw);

    const trailers: { length: string; registration: string }[] = [];
    if (trailer6m) trailers.push({ length: "6m", registration: `CAW${trailer6m}` });
    if (trailer12m) trailers.push({ length: "12m", registration: `CAW${trailer12m}` });

    data.push({
      trailerFleetNo: Number(fleetNoRaw),
      type,
      trailers,
    });
  }
  return { data, errors };
}

function parseDriversSheet(rows: unknown[][]): { data: DriverRow[]; errors: string[] } {
  const data: DriverRow[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i] as (string | number | null | undefined)[];
    if (!r || r.length < 3) continue;

    const name = normalizeStr(r[0]);
    const idNum = normalizeStr(r[1]);
    const phone1 = normalizeStr(r[2]);

    if (!name) {
      errors.push(`Drivers row ${i + 1}: missing Full_Name`);
      continue;
    }
    if (!idNum) {
      errors.push(`Drivers row ${i + 1}: missing ID_Number`);
      continue;
    }
    if (seen.has(idNum)) {
      errors.push(`Drivers row ${i + 1}: duplicate ID_Number "${idNum}"`);
      continue;
    }
    seen.add(idNum);
    data.push({ driverName: name, idNumber: idNum, phone: phone1 });
  }
  return { data, errors };
}

// ─── Status badge component ─────────────────────────────────────────────────

function StatusBadge({ status }: { status: RowStatus }) {
  const map: Record<RowStatus, { label: string; class: string }> = {
    new: { label: "New", class: "bg-green-100 text-green-700 border-green-200" },
    update: { label: "Update", class: "bg-yellow-100 text-yellow-700 border-yellow-200" },
    unchanged: { label: "Unchanged", class: "bg-gray-100 text-gray-500 border-gray-200" },
    skipped: { label: "Skipped", class: "bg-red-100 text-red-600 border-red-200" },
  };
  const s = map[status];
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold border ${s.class}`}>
      {s.label}
    </span>
  );
}

// ─── Section Summary ────────────────────────────────────────────────────────

function SectionSummary({ label, count }: { label: string; count: number }) {
  return (
    <div className="bg-slate-50 dark:bg-slate-950/40 border border-transparent dark:border-slate-800 rounded-lg px-4 py-2 min-w-[100px]">
      <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 mb-0.5">{label}</div>
      <div className="text-xl font-bold text-slate-700 dark:text-slate-100">{count}</div>
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function FleetImportPage() {
  const [stage, setStage] = useState<Stage>("upload");

  // Existing data for comparison
  const existingTrucks = useQuery(api.trucks.list) || [];
  const existingTrailers = useQuery(api.trailers.list) || [];
  const existingDrivers = useQuery(api.drivers.list) || [];

  // Parsed data
  const [truckRows, setTruckRows] = useState<PreviewRow<TruckRow>[]>([]);
  const [trailerRows, setTrailerRows] = useState<PreviewRow<TrailerRow>[]>([]);
  const [driverRows, setDriverRows] = useState<PreviewRow<DriverRow>[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);

  // Result
  const [result, setResult] = useState<Record<string, { created: number; updated: number; skipped: number }> | null>(null);

  const bulkImport = useMutation(api.fleetImport.bulkImportFleetData);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setStage("upload");
    setParseErrors([]);
    setResult(null);

    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(new Uint8Array(buffer), { type: "array" });

      const sheetMap: Record<string, string> = {};
      for (const name of wb.SheetNames) {
        sheetMap[name.toLowerCase()] = name;
      }

      const allErrors: string[] = [];
      let tRows: PreviewRow<TruckRow>[] = [];
      let trRows: PreviewRow<TrailerRow>[] = [];
      let dRows: PreviewRow<DriverRow>[] = [];

      // ── Trucks ──
      const trucksSheetName = sheetMap["trucks"];
      if (trucksSheetName) {
        const sheet = wb.Sheets[trucksSheetName];
        const raw = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", blankrows: false });
        const { data, errors } = parseTrucksSheet(raw);
        allErrors.push(...errors);
        tRows = data.map((row) => {
          const { status, oldData } = compareTruck(row, existingTrucks);
          return {
            id: `truck-${row.truckFleetNo}`,
            status,
            data: row,
            oldData,
            issues: [],
            selected: status !== "unchanged",
          };
        });
      } else {
        allErrors.push("Sheet 'Trucks' not found in workbook");
      }

      // ── Trailers ──
      const trailersSheetName = sheetMap["trailers"];
      if (trailersSheetName) {
        const sheet = wb.Sheets[trailersSheetName];
        const raw = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", blankrows: false });
        const { data, errors } = parseTrailersSheet(raw);
        allErrors.push(...errors);
        trRows = data.map((row) => {
          const { status, oldData } = compareTrailer(row, existingTrailers);
          return {
            id: `trailer-${row.trailerFleetNo}`,
            status,
            data: row,
            oldData,
            issues: [],
            selected: status !== "unchanged",
          };
        });
      } else {
        allErrors.push("Sheet 'Trailers' not found in workbook");
      }

      // ── Drivers ──
      const driversSheetName = sheetMap["drivers"];
      if (driversSheetName) {
        const sheet = wb.Sheets[driversSheetName];
        const raw = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", blankrows: false });
        const { data, errors } = parseDriversSheet(raw);
        allErrors.push(...errors);
        dRows = data.map((row) => {
          const { status, oldData } = compareDriver(row, existingDrivers);
          return {
            id: `driver-${row.idNumber}`,
            status,
            data: row,
            oldData,
            issues: [],
            selected: status !== "unchanged",
          };
        });
      } else {
        allErrors.push("Sheet 'Drivers' not found in workbook");
      }

      setTruckRows(tRows);
      setTrailerRows(trRows);
      setDriverRows(dRows);
      setParseErrors(allErrors);
      setStage("preview");
    } catch (err) {
      setParseErrors([`Failed to parse file: ${err instanceof Error ? err.message : String(err)}`]);
    }
  };

  const toggleRow = (entity: "trucks" | "trailers" | "drivers", id: string) => {
    const setter = entity === "trucks" ? setTruckRows : entity === "trailers" ? setTrailerRows : setDriverRows;
    setter((prev) => prev.map((r) => (r.id === id ? { ...r, selected: !r.selected } : r)));
  };

  const selectAll = (entity: "trucks" | "trailers" | "drivers", checked: boolean) => {
    const setter = entity === "trucks" ? setTruckRows : entity === "trailers" ? setTrailerRows : setDriverRows;
    setter((prev) => prev.map((r) => (r.status !== "unchanged" && r.status !== "skipped" ? { ...r, selected: checked } : r)));
  };

  const selectedCount = (rows: PreviewRow<any>[]) =>
    rows.filter((r) => r.selected).length;

  const handleCommit = async () => {
    setStage("committing");

    const selectedTrucks = truckRows.filter((r) => r.selected).map((r) => r.data);
    const selectedTrailers = trailerRows.filter((r) => r.selected).map((r) => r.data);
    const selectedDrivers = driverRows.filter((r) => r.selected).map((r) => r.data);

    try {
      const res = await bulkImport({
        trucks: selectedTrucks,
        trailers: selectedTrailers,
        drivers: selectedDrivers,
      });
      setResult(res);
      setStage("done");
    } catch (err) {
      setParseErrors([`Import failed: ${err instanceof Error ? err.message : String(err)}`]);
      setStage("preview");
    }
  };

  const handleReset = () => {
    setStage("upload");
    setTruckRows([]);
    setTrailerRows([]);
    setDriverRows([]);
    setParseErrors([]);
    setResult(null);
  };

  // ── Derived counts ──
  const truckNew = truckRows.filter((r) => r.status === "new").length;
  const truckUpd = truckRows.filter((r) => r.status === "update").length;
  const truckUnch = truckRows.filter((r) => r.status === "unchanged").length;

  const trailerNew = trailerRows.filter((r) => r.status === "new").length;
  const trailerUpd = trailerRows.filter((r) => r.status === "update").length;
  const trailerUnch = trailerRows.filter((r) => r.status === "unchanged").length;

  const driverNew = driverRows.filter((r) => r.status === "new").length;
  const driverUpd = driverRows.filter((r) => r.status === "update").length;
  const driverUnch = driverRows.filter((r) => r.status === "unchanged").length;

  // ── Render entity table ──
  const renderTable = <T extends Record<string, any>>(
    title: string,
    rows: PreviewRow<T>[],
    entity: "trucks" | "trailers" | "drivers",
    columns: { key: string; label: string; render: (row: T) => string }[]
  ) => {
    if (rows.length === 0 && parseErrors.length > 0) return null;
    if (rows.length === 0) return null;

    const allSelected = rows.filter((r) => r.status !== "unchanged" && r.status !== "skipped").every((r) => r.selected);

    return (
      <div className="bg-white dark:bg-slate-900/60 rounded-lg border border-gray-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 dark:border-slate-800 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
          <div className="flex gap-2 text-xs">
            <span className="text-green-600 font-medium">{truckNew + trailerNew + driverNew > 0 ? `+${entity === "trucks" ? truckNew : entity === "trailers" ? trailerNew : driverNew} new` : ""}</span>
            <span className="text-yellow-600 font-medium">{truckUpd + trailerUpd + driverUpd > 0 ? `${entity === "trucks" ? truckUpd : entity === "trailers" ? trailerUpd : driverUpd} update` : ""}</span>
            <span className="text-gray-400">{truckUnch + trailerUnch + driverUnch > 0 ? `${entity === "trucks" ? truckUnch : entity === "trailers" ? trailerUnch : driverUnch} unchanged` : ""}</span>
          </div>
        </div>

        {rows.some((r) => r.status !== "unchanged" || r.status !== "skipped") && (
          <div className="px-4 py-2 border-b border-gray-100 dark:border-slate-800 bg-gray-50/50 dark:bg-slate-950/20">
            <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={(e) => selectAll(entity, e.target.checked)}
              />
              Select all {entity}
            </label>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-slate-800 text-xs">
            <thead className="bg-gray-50 dark:bg-slate-950/40">
              <tr>
                <th className="px-3 py-2 text-left w-8"></th>
                {columns.map((col) => (
                  <th key={col.key} className="px-3 py-2 text-left font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">
                    {col.label}
                  </th>
                ))}
                <th className="px-3 py-2 text-left font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Status</th>
                <th className="px-3 py-2 text-left font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Changes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-slate-800">
              {rows.map((row) => (
                <tr key={row.id} className={`hover:bg-gray-50 dark:hover:bg-slate-900/40 transition-colors ${row.status === "unchanged" ? "opacity-60" : ""}`}>
                  <td className="px-3 py-2">
                    {(row.status === "new" || row.status === "update") && (
                      <input
                        type="checkbox"
                        checked={row.selected}
                        onChange={() => toggleRow(entity, row.id)}
                      />
                    )}
                  </td>
                  {columns.map((col) => (
                    <td key={col.key} className="px-3 py-2 text-gray-900 dark:text-gray-100 whitespace-nowrap">
                      {col.render(row.data)}
                    </td>
                  ))}
                  <td className="px-3 py-2">
                    <StatusBadge status={row.status} />
                  </td>
                  <td className="px-3 py-2 text-gray-500 dark:text-gray-400 max-w-[200px] truncate">
                    {row.status === "update" && row.oldData ? (
                      <span className="text-yellow-700 dark:text-yellow-400" title={JSON.stringify(row.oldData, null, 2)}>
                        {Object.entries(row.oldData)
                          .map(([key, old]) => `${key}: "${old}" → "${row.data[key]}"`)
                          .join("; ")}
                      </span>
                    ) : row.status === "skipped" ? (
                      <span className="text-red-500">Skipped</span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  // ── Render ──
  return (
    <div className="w-full h-full p-6 space-y-6 overflow-y-auto text-gray-900 dark:text-slate-100">
      <div>
        <h1 className="text-xl font-bold">Admin — Fleet Import</h1>
        <p className="text-xs text-gray-500 dark:text-slate-400">Upload a Fleet Master Data workbook to bulk-import Trucks, Trailers, and Drivers.</p>
      </div>

      {/* Stage: Upload */}
      {stage === "upload" && (
        <div className="bg-white dark:bg-slate-900/60 rounded-lg border border-gray-200 dark:border-slate-800 shadow-sm p-6">
          <h2 className="text-sm font-semibold mb-4">Select Workbook</h2>
          <input
            type="file"
            accept=".xlsx"
            onChange={handleFile}
            className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 dark:file:bg-blue-950 dark:file:text-blue-300"
          />
          <p className="text-xs text-gray-400 mt-2">Accepts .xlsx files with sheets named: Trucks, Trailers, Drivers</p>
        </div>
      )}

      {/* Stage: Preview */}
      {stage === "preview" && (
        <>
          {/* KPI cards */}
          <div className="flex flex-wrap gap-4">
            <div className="bg-slate-50 dark:bg-slate-950/40 border border-transparent dark:border-slate-800 rounded-lg px-4 py-2 min-w-[120px]">
              <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 mb-0.5">Trucks</div>
              <div className="text-2xl font-bold text-slate-600 dark:text-slate-100">{truckRows.length}</div>
              <div className="text-[10px] text-gray-400">{selectedCount(truckRows)} selected</div>
            </div>
            <div className="bg-slate-50 dark:bg-slate-950/40 border border-transparent dark:border-slate-800 rounded-lg px-4 py-2 min-w-[120px]">
              <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 mb-0.5">Trailers</div>
              <div className="text-2xl font-bold text-slate-600 dark:text-slate-100">{trailerRows.length}</div>
              <div className="text-[10px] text-gray-400">{selectedCount(trailerRows)} selected</div>
            </div>
            <div className="bg-slate-50 dark:bg-slate-950/40 border border-transparent dark:border-slate-800 rounded-lg px-4 py-2 min-w-[120px]">
              <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 mb-0.5">Drivers</div>
              <div className="text-2xl font-bold text-slate-600 dark:text-slate-100">{driverRows.length}</div>
              <div className="text-[10px] text-gray-400">{selectedCount(driverRows)} selected</div>
            </div>
          </div>

          {/* Parse errors */}
          {parseErrors.length > 0 && (
            <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2 dark:bg-red-950/30 dark:border-red-900/40 dark:text-red-200">
              <span className="font-semibold">{parseErrors.length} issue(s) found:</span>
              <ul className="list-disc pl-4 mt-1 space-y-0.5">
                {parseErrors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Tables */}
          <div className="space-y-6">
            {renderTable(
              "Trucks",
              truckRows,
              "trucks",
              [
                { key: "fleetNo", label: "Fleet No", render: (r) => r.truckFleetNo },
                { key: "reg", label: "Registration", render: (r) => r.registration },
              ]
            )}

            {renderTable(
              "Trailers",
              trailerRows,
              "trailers",
              [
                { key: "fleetNo", label: "Fleet No", render: (r) => String(r.trailerFleetNo) },
                { key: "type", label: "Type", render: (r) => r.type },
                { key: "6m", label: "6m Reg", render: (r) => r.trailers.find((t) => t.length === "6m")?.registration ?? "" },
                { key: "12m", label: "12m Reg", render: (r) => r.trailers.find((t) => t.length === "12m")?.registration ?? "" },
              ]
            )}

            {renderTable(
              "Drivers",
              driverRows,
              "drivers",
              [
                { key: "name", label: "Full Name", render: (r) => r.driverName },
                { key: "id", label: "ID Number", render: (r) => r.idNumber },
                { key: "phone", label: "Phone", render: (r) => r.phone },
              ]
            )}
          </div>

          {/* Action bar */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200 dark:border-slate-800">
            <button
              onClick={handleReset}
              className="px-4 py-2 rounded-md text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              onClick={handleCommit}
              className="px-6 py-2 rounded-md text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
              disabled={selectedCount(truckRows) + selectedCount(trailerRows) + selectedCount(driverRows) === 0}
            >
              Import {selectedCount(truckRows) + selectedCount(trailerRows) + selectedCount(driverRows)} Selected
            </button>
          </div>
        </>
      )}

      {/* Stage: Committing */}
      {stage === "committing" && (
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="animate-spin inline-block w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full mb-4"></div>
            <p className="text-sm text-gray-500 dark:text-gray-400">Importing fleet data...</p>
          </div>
        </div>
      )}

      {/* Stage: Done */}
      {stage === "done" && result && (
        <div className="space-y-6">
          <div className="bg-green-50 dark:bg-emerald-950/30 border border-green-200 dark:border-emerald-900/40 rounded-lg p-4">
            <h2 className="text-sm font-semibold text-green-800 dark:text-emerald-200 mb-2">Import Complete</h2>

            <div className="flex flex-wrap gap-4 mt-3">
              <SectionSummary label="Trucks Created" count={result.trucks.created} />
              <SectionSummary label="Trucks Updated" count={result.trucks.updated} />
              {result.trucks.skipped > 0 && <SectionSummary label="Trucks Skipped" count={result.trucks.skipped} />}
            </div>
            <div className="flex flex-wrap gap-4 mt-2">
              <SectionSummary label="Trailers Created" count={result.trailers.created} />
              <SectionSummary label="Trailers Updated" count={result.trailers.updated} />
              {result.trailers.skipped > 0 && <SectionSummary label="Trailers Skipped" count={result.trailers.skipped} />}
            </div>
            <div className="flex flex-wrap gap-4 mt-2">
              <SectionSummary label="Drivers Created" count={result.drivers.created} />
              <SectionSummary label="Drivers Updated" count={result.drivers.updated} />
              {result.drivers.skipped > 0 && <SectionSummary label="Drivers Skipped" count={result.drivers.skipped} />}
            </div>
          </div>

          <div className="flex justify-end">
            <button
              onClick={handleReset}
              className="px-6 py-2 rounded-md text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 shadow-sm"
            >
              Import Another
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
