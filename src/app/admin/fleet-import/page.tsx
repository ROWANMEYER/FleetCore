"use client";

import { useState} from"react";
import { useQuery, useMutation} from"convex/react";
import { api} from"@/convex/_generated/api";
import * as XLSX from"xlsx";

// ─── Types ──────────────────────────────────────────────────────────────────

interface TruckRow {
 truckFleetNo: string;
 registration: string;
}

interface TrailerRow {
 trailerFleetNo: number;
 type: string;
 trailers: { length: string; registration: string}[];
}

interface DriverRow {
 driverName: string;
 idNumber: string;
 phone: string;
}

type RowStatus ="new" |"update" |"unchanged" |"skipped";

interface PreviewRow<T> {
 id: string;
 status: RowStatus;
 data: T;
 oldData: Record<string, string> | null;
 issues: string[];
 selected: boolean;
}

type Stage ="upload" |"preview" |"committing" |"done";

// ─── Helpers ────────────────────────────────────────────────────────────────

function arraysEqual<T>(a: T[], b: T[]): boolean {
 if (a.length !== b.length) return false;
 return a.every((v, i) => JSON.stringify(v) === JSON.stringify(b[i]));
}

function normalizeStr(val: unknown): string {
 if (val == null || val ==="") return"";
 return String(val).trim();
}

// ─── Smart Column Detection ─────────────────────────────────────────────────

// Keyword maps: field name → array of header keywords to match (case-insensitive)
const TRUCK_KEYWORDS: Record<string, string[]> = {
 truckFleetNo: ["fleet","fleet no","truck","truck no","unit","vehicle","unit no","truck fleet"],
 registration: ["reg","registration","plate","reg no","license","licence","reg number"],
};

const DRIVER_KEYWORDS: Record<string, string[]> = {
 driverName: ["name","driver","full name","driver name","fullname","driver's name"],
 idNumber: ["id","id no","id number","identity","national id","idnum","id num","nid"],
 phone: ["phone","cell","mobile","tel","telephone","contact","phone no","cell no"],
};

const TRAILER_KEYWORDS: Record<string, string[]> = {
 trailerFleetNo: ["fleet","fleet no","trailer","trailer no","unit","unit no"],
 type: ["type","trailer type","kind"],
 trailer6mReg: ["6m","6 m","6 meter","6m reg","6m registration","short","6m trailer"],
 trailer12mReg: ["12m","12 m","12 meter","12m reg","12m registration","long","12m trailer"],
};

/**
 * Detect column indices by matching header strings against keyword maps.
 * Returns a map of field -> column index for all matched fields.
 * Unmatched fields are omitted (caller falls back to default positions).
 */
function detectColumnMap(
 headers: string[],
 keywordMap: Record<string, string[]>
): Record<string, number> {
 const lowerHeaders = headers.map((h) => h.toLowerCase().trim());
 const result: Record<string, number> = {};

 for (const [field, keywords] of Object.entries(keywordMap)) {
 const idx = lowerHeaders.findIndex((h) =>
 keywords.some((kw) => h === kw || h.startsWith(kw) || h.includes(kw))
 );
 if (idx >= 0) result[field] = idx;
 }

 return result;
}

/**
 * Build a human-readable label like "Fleet No → Fleet · Registration → Reg"
 * from a column map and its keyword map.
 */
function describeColumnMap(
 colMap: Record<string, number>,
 keywordMap: Record<string, string[]>,
 allHeaders: string[]
): string[] {
 const descriptions: string[] = [];
 for (const [field, idx] of Object.entries(colMap)) {    const label = field
      .replace(/(\d+)/g, " $1") // insert space before digit groups
      .replace(/([A-Z])/g, " $1") // insert space before uppercase letters
      .replace(/^./, (s) => s.toUpperCase())
      .trim();
 const headerLabel = allHeaders[idx] ?? `Col ${idx + 1}`;
 descriptions.push(`${headerLabel} → ${label}`);
 }
 return descriptions;
}

// ─── Comparison logic ───────────────────────────────────────────────────────

function compareTruck(
 row: TruckRow,
 existing: { truckFleetNo?: string; registration?: string}[]
): { status: RowStatus; oldData: Record<string, string> | null} {
 const match = existing.find(
 (e) => e.truckFleetNo === row.truckFleetNo
);
 if (!match) return { status:"new", oldData: null};

 const changes: Record<string, string> = {};
 if ((match.registration ??"") !== row.registration) {
 changes.registration = match.registration ??"";
}
 if (Object.keys(changes).length === 0) return { status:"unchanged", oldData: null};
 return { status:"update", oldData: changes};
}

function compareTrailer(
 row: TrailerRow,
 existing: { trailerFleetNoStr?: string; type?: string; trailers?: { length: string; registration: string}[]}[]
): { status: RowStatus; oldData: Record<string, string> | null} {
 const match = existing.find(
 (e) => e.trailerFleetNoStr === String(row.trailerFleetNo)
);
 if (!match) return { status:"new", oldData: null};

 const changes: Record<string, string> = {};
 if ((match.type ??"") !== row.type) {
 changes.type = match.type ??"";
}
 if (!arraysEqual(match.trailers ?? [], row.trailers)) {
 changes.trailers = JSON.stringify(match.trailers ?? []);
}
 if (Object.keys(changes).length === 0) return { status:"unchanged", oldData: null};
 return { status:"update", oldData: changes};
}

function compareDriver(
 row: DriverRow,
 existing: { driverId?: string; driverName?: string; phone?: string}[]
): { status: RowStatus; oldData: Record<string, string> | null} {
 const match = existing.find((e) => e.driverId === row.idNumber);
 if (!match) return { status:"new", oldData: null};

 const changes: Record<string, string> = {};
 if ((match.driverName ??"") !== row.driverName) {
 changes.driverName = match.driverName ??"";
}
 if ((match.phone ??"") !== row.phone) {
 changes.phone = match.phone ??"";
}
 if (Object.keys(changes).length === 0) return { status:"unchanged", oldData: null};
 return { status:"update", oldData: changes};
}

// ─── Parse helpers ──────────────────────────────────────────────────────────

function parseTrucksSheet(
 rows: unknown[][],
 colMap?: Record<string, number>
): { data: TruckRow[]; errors: string[]} {
 const data: TruckRow[] = [];
 const errors: string[] = [];
 const seen = new Set<string>();

 const get = (row: any[], field: string, defaultIdx: number): string => {
 const idx = colMap?.[field] ?? defaultIdx;
 return normalizeStr(row[idx]);
};

 // Determine min columns needed: max of default indices vs detected indices
 const defaultCols = [0, 1];
 const neededCols = defaultCols;
 if (colMap) {
 Object.values(colMap).forEach((idx) => {
 if (!neededCols.includes(idx)) neededCols.push(idx);
});
}
 const minCols = Math.max(...neededCols) + 1;

 for (let i = 1; i < rows.length; i++) {
 const r = rows[i] as (string | number | null | undefined)[];
 if (!r || r.length < minCols) continue;

 const fleetNo = get(r, "truckFleetNo", 0);
 const regNo = get(r, "registration", 1);

 if (!fleetNo) {
 errors.push(`Trucks row ${i + 1}: missing Fleet_No`);
 continue;
}
 if (seen.has(fleetNo)) {
 errors.push(`Trucks row ${i + 1}: duplicate Fleet_No"${fleetNo}"`);
 continue;
}
 seen.add(fleetNo);
 data.push({ truckFleetNo: fleetNo, registration: regNo ?`CAW${regNo}` :""});
}
 return { data, errors};
}

function parseTrailersSheet(
 rows: unknown[][],
 colMap?: Record<string, number>
): { data: TrailerRow[]; errors: string[]} {
 const data: TrailerRow[] = [];
 const errors: string[] = [];
 const seen = new Set<string>();

 const get = (row: any[], field: string, defaultIdx: number): string => {
 const idx = colMap?.[field] ?? defaultIdx;
 return normalizeStr(row[idx]);
};

 // Determine min columns: all four fields via colMap or default positions
 const defaultCols = [0, 1, 2, 3];
 const neededCols = [...defaultCols];
 if (colMap) {
 Object.values(colMap).forEach((idx) => {
 if (!neededCols.includes(idx)) neededCols.push(idx);
});
}
 const minCols = Math.max(...neededCols) + 1;

 for (let i = 1; i < rows.length; i++) {
 const r = rows[i] as (string | number | null | undefined)[];
 if (!r || r.length < minCols) continue;

 const fleetNoRaw = get(r, "trailerFleetNo", 0);
 const type = get(r, "type", 1);
 const trailer6m = get(r, "trailer6mReg", 2);
 const trailer12m = get(r, "trailer12mReg", 3);

 if (!fleetNoRaw) {
 errors.push(`Trailers row ${i + 1}: missing Fleet_No`);
 continue;
}
 if (seen.has(fleetNoRaw)) {
 errors.push(`Trailers row ${i + 1}: duplicate Fleet_No"${fleetNoRaw}"`);
 continue;
}
 seen.add(fleetNoRaw);

 const trailers: { length: string; registration: string}[] = [];
 if (trailer6m) trailers.push({ length:"6m", registration:`CAW${trailer6m}`});
 if (trailer12m) trailers.push({ length:"12m", registration:`CAW${trailer12m}`});

 data.push({
 trailerFleetNo: Number(fleetNoRaw),
 type,
 trailers,
});
}
 return { data, errors};
}

function parseDriversSheet(
 rows: unknown[][],
 colMap?: Record<string, number>
): { data: DriverRow[]; errors: string[]} {
 const data: DriverRow[] = [];
 const errors: string[] = [];
 const seen = new Set<string>();

 const get = (row: any[], field: string, defaultIdx: number): string => {
 const idx = colMap?.[field] ?? defaultIdx;
 return normalizeStr(row[idx]);
};

 // Determine min columns
 const defaultCols = [0, 1, 2];
 const neededCols = [...defaultCols];
 if (colMap) {
 Object.values(colMap).forEach((idx) => {
 if (!neededCols.includes(idx)) neededCols.push(idx);
});
}
 const minCols = Math.max(...neededCols) + 1;

 for (let i = 1; i < rows.length; i++) {
 const r = rows[i] as (string | number | null | undefined)[];
 if (!r || r.length < minCols) continue;

 const name = get(r, "driverName", 0);
 const idNum = get(r, "idNumber", 1);
 const phone1 = get(r, "phone", 2);

 if (!name) {
 errors.push(`Drivers row ${i + 1}: missing Full_Name`);
 continue;
}
 if (!idNum) {
 errors.push(`Drivers row ${i + 1}: missing ID_Number`);
 continue;
}
 if (seen.has(idNum)) {
 errors.push(`Drivers row ${i + 1}: duplicate ID_Number"${idNum}"`);
 continue;
}
 seen.add(idNum);
 data.push({ driverName: name, idNumber: idNum, phone: phone1});
}
 return { data, errors};
}

// ─── Status badge component ─────────────────────────────────────────────────

function StatusBadge({ status}: { status: RowStatus}) {
 const map: Record<RowStatus, { label: string; class: string}> = {
 new: { label:"New", class:"bg-green-100 text-green-700 border-green-200"},
 update: { label:"Update", class:"bg-yellow-100 text-yellow-700 border-yellow-200"},
 unchanged: { label:"Unchanged", class:"bg-[var(--card-bg)] text-[var(--nav-text-color)] border-[var(--card-border)]"},
 skipped: { label:"Skipped", class:"bg-red-100 text-red-600 border-red-200"},
};
 const s = map[status];
 return (
 <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold border ${s.class}`}>
 {s.label}
 </span>
);
}

// ─── Section Summary ────────────────────────────────────────────────────────

function SectionSummary({ label, count}: { label: string; count: number}) {
 return (
 <div className="bg-[var(--card-bg)] border border-transparent rounded-lg px-4 py-2 min-w-[100px]">
 <div className="text-[10px] uppercase tracking-wider font-semibold text-[var(--nav-text-color)] mb-0.5">{label}</div>
 <div className="text-xl font-bold text-[var(--foreground)]">{count}</div>
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
 const [detectionMessages, setDetectionMessages] = useState<string[]>([]);

 // Result
 const [result, setResult] = useState<Record<string, { created: number; updated: number; skipped: number}> | null>(null);

 const bulkImport = useMutation(api.fleetImport.bulkImportFleetData);

 const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
 const file = e.target.files?.[0];
 if (!file) return;

 setStage("upload");
 setParseErrors([]);
 setDetectionMessages([]);
 setResult(null);

 try {
 const buffer = await file.arrayBuffer();
 const wb = XLSX.read(new Uint8Array(buffer), { type:"array"});

 const sheetMap: Record<string, string> = {};
 for (const name of wb.SheetNames) {
 sheetMap[name.toLowerCase()] = name;
}

 const allErrors: string[] = [];
 let tRows: PreviewRow<TruckRow>[] = [];
 let trRows: PreviewRow<TrailerRow>[] = [];
 let dRows: PreviewRow<DriverRow>[] = [];

 const detectionMsgs: string[] = [];

 // ── Trucks ──
 const trucksSheetName = sheetMap["trucks"];
 if (trucksSheetName) {
 const sheet = wb.Sheets[trucksSheetName];
 const raw = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval:"", blankrows: false});
 let truckColMap: Record<string, number> | undefined;
 if (raw.length > 0) {
 const headers = (raw[0] as any[]).map((h: any) => String(h ?? ""));
 truckColMap = detectColumnMap(headers, TRUCK_KEYWORDS);
 if (Object.keys(truckColMap).length > 0) {
 detectionMsgs.push("Trucks: " + describeColumnMap(truckColMap, TRUCK_KEYWORDS, headers).join(" · "));
 } else {
 truckColMap = undefined;
 }
 }
 const { data, errors} = parseTrucksSheet(raw, truckColMap);
 allErrors.push(...errors);
 tRows = data.map((row) => {
 const { status, oldData} = compareTruck(row, existingTrucks);
 return {
 id:`truck-${row.truckFleetNo}`,
 status,
 data: row,
 oldData,
 issues: [],
 selected: status !=="unchanged",
};
});
} else {
 allErrors.push("Sheet 'Trucks' not found in workbook");
}

 // ── Trailers ──
 const trailersSheetName = sheetMap["trailers"];
 if (trailersSheetName) {
 const sheet = wb.Sheets[trailersSheetName];
 const raw = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval:"", blankrows: false});
 let trailerColMap: Record<string, number> | undefined;
 if (raw.length > 0) {
 const headers = (raw[0] as any[]).map((h: any) => String(h ?? ""));
 trailerColMap = detectColumnMap(headers, TRAILER_KEYWORDS);
 if (Object.keys(trailerColMap).length > 0) {
 detectionMsgs.push("Trailers: " + describeColumnMap(trailerColMap, TRAILER_KEYWORDS, headers).join(" · "));
 } else {
 trailerColMap = undefined;
 }
 }
 const { data, errors} = parseTrailersSheet(raw, trailerColMap);
 allErrors.push(...errors);
 trRows = data.map((row) => {
 const { status, oldData} = compareTrailer(row, existingTrailers);
 return {
 id:`trailer-${row.trailerFleetNo}`,
 status,
 data: row,
 oldData,
 issues: [],
 selected: status !=="unchanged",
};
});
} else {
 allErrors.push("Sheet 'Trailers' not found in workbook");
}

 // ── Drivers ──
 const driversSheetName = sheetMap["drivers"];
 if (driversSheetName) {
 const sheet = wb.Sheets[driversSheetName];
 const raw = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval:"", blankrows: false});
 let driverColMap: Record<string, number> | undefined;
 if (raw.length > 0) {
 const headers = (raw[0] as any[]).map((h: any) => String(h ?? ""));
 driverColMap = detectColumnMap(headers, DRIVER_KEYWORDS);
 if (Object.keys(driverColMap).length > 0) {
 detectionMsgs.push("Drivers: " + describeColumnMap(driverColMap, DRIVER_KEYWORDS, headers).join(" · "));
 } else {
 driverColMap = undefined;
 }
 }
 const { data, errors} = parseDriversSheet(raw, driverColMap);
 allErrors.push(...errors);
 dRows = data.map((row) => {
 const { status, oldData} = compareDriver(row, existingDrivers);
 return {
 id:`driver-${row.idNumber}`,
 status,
 data: row,
 oldData,
 issues: [],
 selected: status !=="unchanged",
};
});
} else {
 allErrors.push("Sheet 'Drivers' not found in workbook");
}

 setTruckRows(tRows);
 setTrailerRows(trRows);
 setDriverRows(dRows);
 setParseErrors(allErrors);
 setDetectionMessages(detectionMsgs);
 setStage("preview");
} catch (err) {
 setParseErrors([`Failed to parse file: ${err instanceof Error ? err.message : String(err)}`]);
}
};

 const toggleRow = (entity:"trucks" |"trailers" |"drivers", id: string) => {
 const setter = entity ==="trucks" ? setTruckRows : entity ==="trailers" ? setTrailerRows : setDriverRows;
 setter((prev: PreviewRow<any>[]) => prev.map((r) => (r.id === id ? { ...r, selected: !r.selected} : r)));
};

 const selectAll = (entity:"trucks" |"trailers" |"drivers", checked: boolean) => {
 const setter = entity ==="trucks" ? setTruckRows : entity ==="trailers" ? setTrailerRows : setDriverRows;
 setter((prev: PreviewRow<any>[]) => prev.map((r) => (r.status !=="unchanged" && r.status !=="skipped" ? { ...r, selected: checked} : r)));
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
 setDetectionMessages([]);
 setResult(null);
};

 // ── Derived counts ──
 const truckNew = truckRows.filter((r) => r.status ==="new").length;
 const truckUpd = truckRows.filter((r) => r.status ==="update").length;
 const truckUnch = truckRows.filter((r) => r.status ==="unchanged").length;

 const trailerNew = trailerRows.filter((r) => r.status ==="new").length;
 const trailerUpd = trailerRows.filter((r) => r.status ==="update").length;
 const trailerUnch = trailerRows.filter((r) => r.status ==="unchanged").length;

 const driverNew = driverRows.filter((r) => r.status ==="new").length;
 const driverUpd = driverRows.filter((r) => r.status ==="update").length;
 const driverUnch = driverRows.filter((r) => r.status ==="unchanged").length;

 // ── Render entity table ──
 const renderTable = <T extends Record<string, any>>(
 title: string,
 rows: PreviewRow<T>[],
 entity:"trucks" |"trailers" |"drivers",
 columns: { key: string; label: string; render: (row: T) => string}[]
) => {
 if (rows.length === 0 && parseErrors.length > 0) return null;
 if (rows.length === 0) return null;

 const allSelected = rows.filter((r) => r.status !=="unchanged" && r.status !=="skipped").every((r) => r.selected);

 return (
 <div className="bg-[var(--card-bg)]/60 rounded-lg border border-[var(--card-border)] shadow-sm overflow-hidden">
 <div className="px-4 py-3 border-b border-[var(--card-border)] flex items-center justify-between">
 <h3 className="text-sm font-semibold text-[var(--foreground)]">{title}</h3>
 <div className="flex gap-2 text-xs">
 <span className="text-green-600 font-medium">{truckNew + trailerNew + driverNew > 0 ?`+${entity ==="trucks" ? truckNew : entity ==="trailers" ? trailerNew : driverNew} new` :""}</span>
 <span className="text-yellow-600 font-medium">{truckUpd + trailerUpd + driverUpd > 0 ?`${entity ==="trucks" ? truckUpd : entity ==="trailers" ? trailerUpd : driverUpd} update` :""}</span>
 <span className="text-[var(--nav-text-color)]">{truckUnch + trailerUnch + driverUnch > 0 ?`${entity ==="trucks" ? truckUnch : entity ==="trailers" ? trailerUnch : driverUnch} unchanged` :""}</span>
 </div>
 </div>

 {rows.some((r) => r.status !=="unchanged" && r.status !=="skipped") && (
 <div className="px-4 py-2 border-b border-[var(--card-border)] bg-[var(--card-bg)]">
 <label className="flex items-center gap-2 text-xs text-[var(--nav-text-color)]">
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
 <table className="min-w-full divide-y divide-[var(--card-border)] text-xs">
 <thead className="bg-[var(--card-bg)]/40">
 <tr>
 <th className="px-3 py-2 text-left w-8"></th>
 {columns.map((col) => (
 <th key={col.key} className="px-3 py-2 text-left font-semibold text-[var(--nav-text-color)] uppercase tracking-wider">
 {col.label}
 </th>
))}
 <th className="px-3 py-2 text-left font-semibold text-[var(--nav-text-color)] uppercase tracking-wider">Status</th>
 <th className="px-3 py-2 text-left font-semibold text-[var(--nav-text-color)] uppercase tracking-wider">Changes</th>
 </tr>
 </thead>
 <tbody className="divide-y divide-[var(--card-border)]">
 {rows.map((row) => (
 <tr key={row.id} className={`hover:bg-[var(--card-bg)] transition-colors ${row.status ==="unchanged" ?"opacity-60" :""}`}>
 <td className="px-3 py-2">
 {(row.status ==="new" || row.status ==="update") && (
 <input
 type="checkbox"
 checked={row.selected}
 onChange={() => toggleRow(entity, row.id)}
 />
)}
 </td>
 {columns.map((col) => (
 <td key={col.key} className="px-3 py-2 text-[var(--foreground)] whitespace-nowrap">
 {col.render(row.data)}
 </td>
))}
 <td className="px-3 py-2">
 <StatusBadge status={row.status} />
 </td>
 <td className="px-3 py-2 text-[var(--nav-text-color)] max-w-[200px] truncate">
 {row.status ==="update" && row.oldData ? (
 <span className="text-yellow-700 dark:text-yellow-400" title={JSON.stringify(row.oldData, null, 2)}>
 {Object.entries(row.oldData)
 .map(([key, old]) =>`${key}:"${old}" →"${row.data[key]}"`)
 .join(";")}
 </span>
) : row.status ==="skipped" ? (
 <span className="text-red-500">Skipped</span>
) : (
 <span className="text-[var(--nav-text-color)]">—</span>
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
 <div className="w-full h-full p-4 sm:p-6 space-y-6 overflow-y-auto" style={{color:"var(--foreground)"}}>
 <div>
 <h1 className="text-xl font-bold tracking-tight" style={{color:"var(--foreground)"}}>Admin — Fleet Import</h1>
 <p className="text-xs mt-0.5" style={{color:"var(--nav-text-color)"}}>Upload a Fleet Master Data workbook to bulk-import Trucks, Trailers, and Drivers.</p>
 </div>

 {/* Stage: Upload */}
 {stage ==="upload" && (
 <div className="glass-card-premium p-6">
 <h2 className="text-sm font-semibold mb-4" style={{color:"var(--foreground)"}}>Select Workbook</h2>
 <input
 type="file"
 accept=".xlsx"
 onChange={handleFile}
 className="block w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-gradient-to-br file:from-[#06B6D4] file:to-[#0891B2] file:text-white hover:file:opacity-90"
 style={{color:"var(--nav-text-color)"}}
 />
 <p className="text-xs mt-2" style={{color:"var(--nav-text-color)"}}>Accepts .xlsx files with sheets named: Trucks, Trailers, Drivers</p>
 </div>
)}

 {/* Stage: Preview */}
 {stage ==="preview" && (
 <>
 {/* KPI cards */}
 <div className="grid grid-cols-3 gap-2 max-w-sm">
 <div className="bg-[var(--card-bg)] border border-transparent rounded-lg px-3 py-2">
 <div className="text-[10px] uppercase tracking-wider font-semibold text-[var(--nav-text-color)] mb-0.5 truncate">Trucks</div>
 <div className="text-xl font-bold text-[var(--foreground)]">{truckRows.length}</div>
 <div className="text-[10px] text-[var(--nav-text-color)] truncate">{selectedCount(truckRows)} selected</div>
 </div>
 <div className="bg-[var(--card-bg)] border border-transparent rounded-lg px-3 py-2">
 <div className="text-[10px] uppercase tracking-wider font-semibold text-[var(--nav-text-color)] mb-0.5 truncate">Trailers</div>
 <div className="text-xl font-bold text-[var(--foreground)]">{trailerRows.length}</div>
 <div className="text-[10px] text-[var(--nav-text-color)] truncate">{selectedCount(trailerRows)} selected</div>
 </div>
 <div className="bg-[var(--card-bg)] border border-transparent rounded-lg px-3 py-2">
 <div className="text-[10px] uppercase tracking-wider font-semibold text-[var(--nav-text-color)] mb-0.5 truncate">Drivers</div>
 <div className="text-xl font-bold text-[var(--foreground)]">{driverRows.length}</div>
 <div className="text-[10px] text-[var(--nav-text-color)] truncate">{selectedCount(driverRows)} selected</div>
 </div>
 </div>

 {/* Detection feedback banner */}
 {detectionMessages.length > 0 && (
 <div className="bg-violet-50 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-800/40 text-violet-800 dark:text-violet-200 rounded-lg px-4 py-3 text-xs space-y-1">
 <div className="flex items-center gap-2 font-semibold mb-1">
 <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 shrink-0">
 <path d="M9 18l6-6-6-6" />
 </svg>
 <span>Auto-detected column mapping:</span>
 </div>
 {detectionMessages.map((msg, i) => (
 <p key={i} className="pl-6">{msg}</p>
 ))}
 </div>
)}

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
 { key:"fleetNo", label:"Fleet No", render: (r) => r.truckFleetNo},
 { key:"reg", label:"Registration", render: (r) => r.registration},
]
)}

 {renderTable(
"Trailers",
 trailerRows,
"trailers",
 [
 { key:"fleetNo", label:"Fleet No", render: (r) => String(r.trailerFleetNo)},
 { key:"type", label:"Type", render: (r) => r.type},
 { key:"6m", label:"6m Reg", render: (r) => r.trailers.find((t) => t.length ==="6m")?.registration ??""},
 { key:"12m", label:"12m Reg", render: (r) => r.trailers.find((t) => t.length ==="12m")?.registration ??""},
]
)}

 {renderTable(
"Drivers",
 driverRows,
"drivers",
 [
 { key:"name", label:"Full Name", render: (r) => r.driverName},
 { key:"id", label:"ID Number", render: (r) => r.idNumber},
 { key:"phone", label:"Phone", render: (r) => r.phone},
]
)}
 </div>

 {/* Action bar */}
 <div className="flex items-center justify-end gap-3 pt-4 border-t border-[var(--card-border)]">
 <button
 onClick={handleReset}
 className="px-4 py-2 rounded-md text-sm font-medium text-[var(--foreground)] bg-[var(--card-bg)] border border-[var(--card-border)] hover:bg-[var(--card-bg)]"
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
 {stage ==="committing" && (
 <div className="flex items-center justify-center py-12">
 <div className="text-center">
 <div className="animate-spin inline-block w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full mb-4"></div>
 <p className="text-sm text-[var(--nav-text-color)]">Importing fleet data...</p>
 </div>
 </div>
)}

 {/* Stage: Done */}
 {stage ==="done" && result && (
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
