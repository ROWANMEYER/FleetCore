"use client";

import { useState, useMemo} from"react";
import { useQuery, useMutation} from"convex/react";
import { api} from"@/convex/_generated/api";
import { useEscapeToClose} from"@/src/components/common/useKeyboardShortcut";
import { useToast } from"@/src/components/common/Toast";
import { useAuth, useRegionArg} from"@/src/components/auth/AuthProvider";
import { loadFingerprint } from"@/convex/utils";
import { X, Lightbulb, AlertTriangle, CopyX} from"lucide-react";

interface ImportLoadsModalProps {
 onClose: () => void;
 onSuccess: () => void;
}

type ImportStep ="paste" |"map" |"confirm";

interface ParsedRow {
 id: string;
 originalValues: string[];
 mappedValues: Record<string, string | string[]>;
 isValid: boolean;
 errors: string[];
 isSplit: boolean; // If split from a single row
}

const COLUMNS = [
 { id:"ignore", label:"Ignore"},
 { id:"routeDate", label:"Date"},
 { id:"truckFleetNo", label:"Truck"},
 { id:"trailerFleetNoStr", label:"Trailer"},
 { id:"driverName", label:"Driver"},
 { id:"fromLocation", label:"From"},
 { id:"toLocation", label:"To"},
 { id:"client", label:"Client"},
 { id:"rate", label:"Amount"},
 { id:"notes", label:"Notes"},
];

const REQUIRED_FIELDS = ["routeDate","truckFleetNo","rate"];

// ── LocalStorage keys for column mapping persistence ───────────────
const MAPPING_STORAGE_PREFIX = "importMapping_";

function loadSavedMapping(numCols: number): string[] | null {
  try {
    const raw = localStorage.getItem(`${MAPPING_STORAGE_PREFIX}${numCols}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length === numCols) return parsed;
    return null;
  } catch { return null; }
}

function saveMapping(mapping: string[], numCols: number) {
  try {
    localStorage.setItem(`${MAPPING_STORAGE_PREFIX}${numCols}`, JSON.stringify(mapping));
  } catch { /* localStorage may be full or unavailable */ }
}

export default function ImportLoadsModal({ onClose, onSuccess}: ImportLoadsModalProps) {
 const { user, token } = useAuth();
 // The region the import should land in. useRegionArg returns the admin's
 // currently selected region (undefined when "All Regions" is chosen, or for
 // regional users whose region the server always forces).
 const regionArg = useRegionArg();
 const importBlocked = user?.role === "admin" && !regionArg;
 const importRegion: "garden_route" | "eastern_cape" | null =
   regionArg ?? (user?.role === "regional" ? user.region : null) ?? null;
 const regionLabel =
   importRegion === "garden_route"
     ? "Garden Route"
     : importRegion === "eastern_cape"
       ? "Eastern Cape"
       : null;
 const [step, setStep] = useState<ImportStep>("paste");
 const [pasteContent, setPasteContent] = useState("");
 const [columnMapping, setColumnMapping] = useState<string[]>([]);
 const { addToast } = useToast();
 const [detectionMessage, setDetectionMessage] = useState<string | null>(null);
 const [restoredMessage, setRestoredMessage] = useState<string | null>(null);
 const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
 const [isSubmitting, setIsSubmitting] = useState(false);
 const [savedMappingExists, setSavedMappingExists] = useState(false);

 const createBulkDailyRoutes = useMutation(api.dailyRoutes.createBulkDailyRoutes);

 // ── Duplicate detection (confirm preview) ─────────────────────────────
 // Fetch the routes already saved for the dates being imported so rows that
 // exactly match an existing load (date + truck + trailer + client + amount)
 // can be flagged before import. Only needed on the confirm step, so the
 // query is skipped everywhere else.
 const previewDateRange = useMemo(() => {
   if (step !== "confirm") return null;
   // Only well-formed YYYY-MM-DD keys make a valid query range; a malformed
   // date would put start after end and silently disable preview flagging.
   const dates = parsedRows
     .map((r) => r.mappedValues.routeDate as string)
     .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
     .sort();
   if (dates.length === 0) return null;
   return { start: dates[0], end: dates[dates.length - 1] };
 }, [step, parsedRows]);

 const existingRoutes = useQuery(
   api.dailyRoutes.getForSheets,
   previewDateRange && !importBlocked
     ? { startDate: previewDateRange.start, endDate: previewDateRange.end, token, region: importRegion ?? undefined }
     : "skip"
 );

 // ids of rows that are exact duplicates of an already-saved load (or of an
 // earlier row in the same paste). Computed so the preview badge + import
 // always agree with the backend's authoritative skip.
 const duplicateRowIds = useMemo(() => {
   if (step !== "confirm" || !existingRoutes) return new Set<string>();
   const seen = new Set<string>();
   for (const route of existingRoutes) {
     for (const load of route.loads ?? []) {
       seen.add(
         loadFingerprint(route.routeDate, route.truckFleetNoStr, route.trailerFleetNoStr, load.client, load.rate)
       );
     }
   }
   const dupIds = new Set<string>();
   for (const row of parsedRows) {
     const fp = loadFingerprint(
       row.mappedValues.routeDate,
       row.mappedValues.truckFleetNo,
       row.mappedValues.trailerFleetNoStr,
       row.mappedValues.client,
       row.mappedValues.rate
     );
     if (seen.has(fp)) dupIds.add(row.id);
     else seen.add(fp);
   }
   return dupIds;
 }, [step, parsedRows, existingRoutes]);

 useEscapeToClose(onClose, true);

 // ── Smart column type detection ──────────────────────────────────
 // Analyzes actual cell values to guess column types when no header
 // row is detected. Uses pattern matching on the first 10 data rows.
 function guessColumnTypes(allLines: string[], numCols: number): string[] {
   const samples = allLines.slice(0, 10).map(l => l.split("\t"));
   const mapping = Array(numCols).fill("ignore");
   const usedFields = new Set<string>();

   // First pass: strong-signal columns (Date, Amount)
   for (let col = 0; col < numCols; col++) {
     const values = samples.map(row => row[col]?.trim() || "").filter(Boolean);
     if (values.length === 0) continue;

     // Date: check if most values match a date pattern
     const dateCount = values.filter(v =>
       /^\d{1,2}[\s\/.-]\d{1,2}[\s\/.-]\d{4}$/.test(v) ||
       /^\d{4}[\s\/.-]\d{1,2}[\s\/.-]\d{1,2}$/.test(v)
     ).length;
     if (dateCount / values.length >= 0.5 && !usedFields.has("routeDate")) {
       mapping[col] = "routeDate";
       usedFields.add("routeDate");
       continue;
     }

     // Amount: starts with R, has comma decimal, or ends with ,XX
     const amountCount = values.filter(v =>
       /^R/i.test(v) || /,\d{2}\s*$/.test(v.replace(/\s/g, ''))
     ).length;
     if (amountCount / values.length >= 0.5 && !usedFields.has("rate")) {
       mapping[col] = "rate";
       usedFields.add("rate");
       continue;
     }

     // Multi-word client name (e.g. "GEELHOUTVLEI TIMBERS", "THE SUNSHADERS")
     // Only count if at least one word is ≥ 8 chars, to avoid false-matching
     // multi-word locations like "CAPE TOWN" or "PORT ELIZABETH"
     const multiWordCount = values.filter(v => {
       if (!/^[A-Z][A-Z\s]+$/.test(v)) return false;
       if (!v.includes(" ")) return false;
       // Check if any word is 8+ characters (company name heuristic)
       return v.split(/\s+/).some(word => word.length >= 8);
     }).length;
     if (multiWordCount / values.length >= 0.3 && !usedFields.has("client")) {
       mapping[col] = "client";
       usedFields.add("client");
       continue;
     }
   }

   // Second pass: numeric columns (Truck / Trailer) — detect by position
   const numericCols: number[] = [];
   for (let col = 0; col < numCols; col++) {
     if (mapping[col] !== "ignore") continue;
     const values = samples.map(row => row[col]?.trim() || "").filter(Boolean);
     if (values.length === 0) continue;

     const numericCount = values.filter(v => {
       const clean = v.replace(/[R\s,]/g, '').replace(/,/g, '.');
       const num = parseFloat(clean);
       return !isNaN(num) && /^\d+$/.test(clean) && Number.isInteger(num) && num > 0 && num < 10000;
     }).length;

     if (numericCount / values.length >= 0.5) {
       numericCols.push(col);
     }
   }

   // Assign first two numeric columns to Truck and Trailer
   if (numericCols.length >= 1 && !usedFields.has("truckFleetNo")) {
     mapping[numericCols[0]] = "truckFleetNo";
     usedFields.add("truckFleetNo");
   }
   if (numericCols.length >= 2 && !usedFields.has("trailerFleetNoStr")) {
     mapping[numericCols[1]] = "trailerFleetNoStr";
     usedFields.add("trailerFleetNoStr");
   }

   // Third pass: remaining text columns assign by expected position
   const textFields = ["driverName", "fromLocation", "toLocation", "client", "notes"];
   let textIdx = 0;
   for (let col = 0; col < numCols; col++) {
     if (mapping[col] !== "ignore") continue;

     // Skip fields already assigned (e.g. client may have been matched via multi-word)
     while (textIdx < textFields.length && usedFields.has(textFields[textIdx])) {
       textIdx++;
     }

     if (textIdx < textFields.length) {
       mapping[col] = textFields[textIdx];
       usedFields.add(textFields[textIdx]);
       textIdx++;
     }
   }

   return mapping;
 }

 // Parse raw paste into rows
 const handleParse = () => {
 if (!pasteContent.trim()) return;

 const lines = pasteContent.split(/\r?\n/).filter(line => line.trim());
 if (lines.length === 0) return;

 // Detect columns from first line
 const firstLineCols = lines[0].split("\t");
 const initialMapping = Array(firstLineCols.length).fill("ignore");
 
 // Auto-guess mapping based on headers if present (simple heuristic)
 firstLineCols.forEach((col, index) => {
 const lower = col.toLowerCase();
 if (lower.includes("datum") || lower.includes("date")) initialMapping[index] ="routeDate";
 else if (lower.includes("vloot") || lower.includes("truck")) initialMapping[index] ="truckFleetNo";
 else if (lower.includes("trailer")) initialMapping[index] ="trailerFleetNoStr";
 else if (lower.includes("drywer") || lower.includes("driver")) initialMapping[index] ="driverName";
 else if (lower.includes("van") || lower.includes("from")) initialMapping[index] ="fromLocation";
 else if (lower.includes("na") || lower.includes("to")) initialMapping[index] ="toLocation";
 else if (lower.includes("klient") || lower.includes("client")) initialMapping[index] ="client";
 else if (lower.includes("tarief") || lower.includes("amount") || lower.includes("rate")) initialMapping[index] ="rate";
 else if (lower.includes("opmerking") || lower.includes("note")) initialMapping[index] ="notes";
});

 const numCols = firstLineCols.length;

 // Check for a saved mapping before deciding which detection to use
 const savedMapping = loadSavedMapping(numCols);
 setSavedMappingExists(!!savedMapping);

 let finalMapping: string[];

 if (savedMapping && initialMapping.every(m => m === "ignore")) {
   // Saved mapping exists AND no headers detected — restore it
   finalMapping = savedMapping;
   setRestoredMessage("Saved mapping applied from last import");
   setDetectionMessage(null);
 } else if (initialMapping.every(m => m === "ignore")) {
   // No headers, no saved mapping — run smart detection
   const dataLines = lines.slice(0, 100);
   finalMapping = guessColumnTypes(dataLines, numCols);

   const fieldLabels: Record<string, string> = {
     routeDate: "Date", truckFleetNo: "Truck", trailerFleetNoStr: "Trailer",
     driverName: "Driver", fromLocation: "From", toLocation: "To",
     client: "Client", rate: "Amount", notes: "Notes",
   };
   const detected = finalMapping
     .map((field, idx) => field !== "ignore" ? `Col ${idx + 1} → ${fieldLabels[field] || field}` : null)
     .filter(Boolean)
     .join(" · ");
   setDetectionMessage(detected);
   setRestoredMessage(null);
 } else {
   // Headers detected — use those
   finalMapping = initialMapping;
   setDetectionMessage(null);
   setRestoredMessage(null);
 }

 setColumnMapping(finalMapping);
 setStep("map");
};

 // Process rows based on mapping
 const processRows = () => {
 const lines = pasteContent.split(/\r?\n/).filter(line => line.trim());
 const newParsedRows: ParsedRow[] = [];

 lines.forEach((line, lineIndex) => {
 // Skip"Total" rows
 if (line.toLowerCase().startsWith("total")) return;

 const values = line.split("\t");
 const mapped: Record<string, string | string[]> = {};
 const errors: string[] = [];
 let isSplit = false;

 // Extract values based on mapping
 columnMapping.forEach((fieldId, colIndex) => {
 if (fieldId ==="ignore") return;
 const value = values[colIndex]?.trim() ||"";
 
 // Clean up South African Currency
 if (fieldId ==="rate") {
 // Remove 'R', spaces, convert ',' to '.'
 //"R18 500,00" ->"18500.00"
 const clean = value.replace(/R/g,"").replace(/\s/g,"").replace(/,/g,".");
 mapped[fieldId] = clean; // Keep as string for now, parse later
} else if (fieldId ==="routeDate") {
 // Try to parse date if needed, but keeping as string is safer for now if input matches
 // Assuming input is YYYY-MM-DD or similar. 
 // If input is"19 09 2025" (DD MM YYYY) -> Convert to YYYY-MM-DD
 if (value.match(/^\d{1,2}[\s\/.-]\d{1,2}[\s\/.-]\d{4}$/)) {
 // Match any common date separator: space, /, -, or .
 // Split by the separator used (whitespace or punctuation)
 const parts = value.split(/[\s\/.-]+/);
 // parts[0] = DD, parts[1] = MM, parts[2] = YYYY
 mapped[fieldId] =`${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
} else {
 mapped[fieldId] = value;
}
} else {
 mapped[fieldId] = value;
}
});

 // Split Logic for"To" location
 if (mapped.toLocation && (mapped.toLocation as string).includes("+")) {
 const destinations = (mapped.toLocation as string).split("+").map((d: string) => d.trim());
 isSplit = true;
 // We create one row, but mark it as split. The mutation will handle array of locations.
 // Wait, the mutation expects`toLocations: string[]`.
 mapped.toLocations = destinations;
} else {
 mapped.toLocations = mapped.toLocation ? [mapped.toLocation as string] : [];
}
 
 // Also handle"From" as array
 mapped.fromLocations = mapped.fromLocation ? [mapped.fromLocation as string] : [];

 // Validation
 REQUIRED_FIELDS.forEach(field => {
 if (!mapped[field]) errors.push(`Missing ${field}`);
});
 
 // Validate Amount
 if (mapped.rate) {
 const rateNum = parseFloat(mapped.rate as string);
 if (isNaN(rateNum)) errors.push("Invalid Amount");
}

 newParsedRows.push({
 id:`row-${lineIndex}`,
 originalValues: values,
 mappedValues: mapped,
 isValid: errors.length === 0,
 errors,
 isSplit
});
});

 setParsedRows(newParsedRows);
 setStep("confirm");
};

 const handleImport = async () => {
 // Never import while "All Regions" is selected — we don't know which
 // region the loads belong to, and the backend would default to Garden Route.
 if (importBlocked) {
   addToast("Select a region (Garden Route or Eastern Cape) before importing.", "error");
   setIsSubmitting(false);
   return;
 }
 setIsSubmitting(true);
 try {
 // Rows that exactly match an already-saved load (or a duplicate row in
 // the same paste) are excluded up front; the backend skips any that slip
 // through (e.g. a concurrent import) and reports the true skipped count.
 const validRows = parsedRows.filter(r => r.isValid && !duplicateRowIds.has(r.id));
 
 const routes = validRows.map(row => {
 const { mappedValues} = row;
 return {
 routeDate: mappedValues.routeDate as string,
 driverName: (mappedValues.driverName as string) ||"",
 kilometers: 0, // Will be calculated or default
 truckFleetNo: mappedValues.truckFleetNo as string,
 truckFleetNoStr: mappedValues.truckFleetNo as string,
 trailerFleetNoStr: mappedValues.trailerFleetNoStr as string,
 notes: mappedValues.notes as string,
 isSplit: row.isSplit,
 loads: [{
 client: (mappedValues.client as string) ||"Unknown",
 quantity:"1", // Default quantity
 quantityType:"load",
 rate: mappedValues.rate as string,
 rateType:"flat", // Assuming flat rate for imported loads
 fromLocations: mappedValues.fromLocations as string[],
 toLocations: mappedValues.toLocations as string[],
}]
};
});

 const result = await createBulkDailyRoutes({ routes, region: regionArg, token});
 // Auto-save the mapping on successful import
 saveMapping(columnMapping, columnMapping.length);
 setSavedMappingExists(true);
 const created = result?.created ?? validRows.length;
 // Rows flagged as duplicates in the preview were excluded client-side, so
 // the backend may report skipped=0 even though we held some back. Report the
 // true count: valid rows in the paste minus rows actually created.
 const validRowCount = parsedRows.filter(r => r.isValid).length;
 const skipped = Math.max(result?.skipped ?? 0, validRowCount - created);
 if (skipped > 0) {
   addToast(
     `Imported ${created} load${created === 1 ? "" : "s"}, skipped ${skipped} duplicate${skipped === 1 ? "" : "s"}.`,
     "success"
   );
 } else {
   addToast(`Imported ${created} load${created === 1 ? "" : "s"} to ${regionLabel ?? "your region"}.`, "success");
 }
 onSuccess();
 onClose();
} catch (error) {
 console.error("Import failed:", error);
 addToast("Failed to import loads.", "error");
} finally {
 setIsSubmitting(false);
}
};

 // Duplicates are valid but already exist (exact load match) — they are shown
 // as a separate count and excluded from the importable "valid" set.
 const duplicateCount = parsedRows.filter(r => r.isValid && duplicateRowIds.has(r.id)).length;
 const validCount = parsedRows.filter(r => r.isValid && !duplicateRowIds.has(r.id)).length;
 const invalidCount = parsedRows.length - validCount - duplicateCount;
 const totalRevenue = parsedRows
 .filter(r => r.isValid && !duplicateRowIds.has(r.id))
 .reduce((sum, r) => sum + (parseFloat(r.mappedValues.rate as string) || 0), 0);

 return (
 <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
 <div className="bg-[var(--background)] rounded-lg shadow-xl w-full max-w-4xl h-[80vh] flex flex-col">
 {/* Header */}
 <div className="px-6 py-4 border-b flex justify-between items-center gap-3">
 <div>
 <h2 className="text-xl font-bold text-[var(--foreground)]">Import Loads</h2>
 <p className="text-sm text-[var(--nav-text-color)]">Paste Excel data to bulk create routes</p>
 </div>
 <div className="flex items-center gap-3 shrink-0">
 {regionLabel && !importBlocked && (
 <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-3 py-1 text-xs font-semibold text-emerald-700">
 <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
 Importing to: {regionLabel}
 </span>
 )}
 <button onClick={onClose} className="text-[var(--nav-text-color)] hover:text-[var(--foreground)]">
 <X className="w-5 h-5" />
 </button>
 </div>
 </div>

 {/* Content */}
 <div className="flex-1 overflow-auto p-6">
 {importBlocked ? (
 <div className="mb-4 flex items-start gap-3 bg-amber-50 border border-amber-200 p-4 rounded-md text-sm text-amber-800">
 <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-amber-500" />
 <div>
 <p className="font-semibold">Import disabled — &ldquo;All Regions&rdquo; is selected.</p>
 <p className="mt-0.5 text-amber-700">
 Choose <span className="font-medium">Garden Route</span> or <span className="font-medium">Eastern Cape</span> in the region switcher (top right of the screen), then reopen this import. This stops loads from being saved to the wrong region.
 </p>
 </div>
 </div>
 ) : regionLabel ? (
 <div className="mb-4 flex items-center gap-2 bg-emerald-50 border border-emerald-200 px-4 py-2.5 rounded-md text-sm text-emerald-800">
 <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
 Loads will be imported to <span className="font-semibold">{regionLabel}</span>.
 </div>
 ) : null}
 {step ==="paste" && (
 <div className="h-full flex flex-col">
 <label className="block text-sm font-medium text-[var(--foreground)] mb-2">
 Paste Excel Data (Tab-separated)
 </label>
 <textarea
 className="flex-1 w-full border border-[var(--card-border)] rounded-md p-4 font-mono text-xs focus:ring-2 focus:ring-[#06B6D4] focus:border-[#06B6D4]"
 placeholder={`VLOOT\tTRAILER\tDATUM\t...\n154\t154\t19 09 2025\t...`}
 value={pasteContent}
 onChange={(e) => setPasteContent(e.target.value)}
 />
 </div>
)}

 {step ==="map" && (
 <div>
 {restoredMessage && (
 <div className="mb-4 bg-violet-50 border border-violet-200 p-4 rounded-md text-sm text-violet-800 flex items-center justify-between">
 <span>
 <Lightbulb className="w-4 h-4 inline-block mr-1.5 -mt-0.5" />
 <span className="font-semibold">Restored:</span> {restoredMessage}
 </span>
 <button
 onClick={() => {
   localStorage.removeItem(`${MAPPING_STORAGE_PREFIX}${columnMapping.length}`);
   setSavedMappingExists(false);
   setRestoredMessage(null);
 }}
 className="text-xs underline hover:no-underline ml-2 shrink-0"
 >
 Clear saved mapping
 </button>
 </div>
 )}
 {detectionMessage && (
 <div className="mb-4 bg-emerald-50 border border-emerald-200 p-4 rounded-md text-sm text-emerald-800">
 <Lightbulb className="w-4 h-4 inline-block mr-1.5 -mt-0.5" />
 <span className="font-semibold">Auto-detected:</span> {detectionMessage}
 </div>
 )}
 <div className="mb-4 bg-blue-50 p-4 rounded-md text-sm text-blue-800">
 Map your columns below. First 5 rows shown for preview.
 </div>
 
 <div className="overflow-x-auto">
 <table className="min-w-full divide-y divide-[var(--card-border)]">
 <thead>
 <tr>
 {columnMapping.map((col, index) => (
 <th key={index} className="px-3 py-2 text-left text-xs font-medium text-[var(--nav-text-color)] uppercase tracking-wider min-w-[150px]">
 <select
 value={col}
 onChange={(e) => {
 const newMapping = [...columnMapping];
 newMapping[index] = e.target.value;
 setColumnMapping(newMapping);
}}
 className="block w-full border-[var(--card-border)] rounded-md shadow-sm focus:ring-[#06B6D4] focus:border-[#06B6D4] text-xs"
 >
 {COLUMNS.map(c => (
 <option key={c.id} value={c.id}>{c.label}</option>
))}
 </select>
 </th>
))}
 </tr>
 </thead>
 <tbody className="bg-[var(--card-bg)] divide-y divide-[var(--card-border)]">
 {pasteContent.split(/\r?\n/).slice(0, 5).map((line, i) => (
 <tr key={i}>
 {line.split("\t").map((cell, j) => (
 <td key={j} className="px-3 py-2 whitespace-nowrap text-xs text-[var(--nav-text-color)] border-r last:border-r-0 border-[var(--card-border)]">
 {cell}
 </td>
))}
 </tr>
))}
 </tbody>
 </table>
 </div>
 </div>
)}

 {step ==="confirm" && (
 <div className="space-y-6">
 <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
 <div className="bg-green-50 p-4 rounded-lg border border-green-100">
 <div className="text-sm text-green-600 font-medium">Valid Records</div>
 <div className="text-2xl font-bold text-green-700">{validCount}</div>
 </div>
 <div className="bg-amber-50 p-4 rounded-lg border border-amber-200">
 <div className="text-sm text-amber-700 font-medium flex items-center gap-1">
 <CopyX className="w-4 h-4" /> Duplicates
 </div>
 <div className="text-2xl font-bold text-amber-700">{duplicateCount}</div>
 </div>
 <div className="bg-red-50 p-4 rounded-lg border border-red-100">
 <div className="text-sm text-red-600 font-medium">Invalid Records</div>
 <div className="text-2xl font-bold text-red-700">{invalidCount}</div>
 </div>
 <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
 <div className="text-sm text-blue-600 font-medium">Total Revenue</div>
 <div className="text-2xl font-bold text-blue-700">
 {new Intl.NumberFormat("en-ZA", { style:"currency", currency:"ZAR"}).format(totalRevenue)}
 </div>
 </div>
 </div>

 {duplicateCount > 0 && (
 <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 p-3 rounded-md text-sm text-amber-800">
 <CopyX className="w-4 h-4 shrink-0 mt-0.5 text-amber-500" />
 <p>
 <span className="font-semibold">{duplicateCount} duplicate{duplicateCount === 1 ? "" : "s"} detected.</span>{" "}
 These already exist for the same date, truck, trailer, client and amount —
 they will not be imported.
 </p>
 </div>
 )}

 <div className="border rounded-md overflow-hidden">
 <table className="min-w-full divide-y divide-[var(--card-border)]">
 <thead className="bg-[var(--card-bg)]">
 <tr>
 <th className="px-4 py-2 text-left text-xs font-medium text-[var(--nav-text-color)] uppercase">Status</th>
 <th className="px-4 py-2 text-left text-xs font-medium text-[var(--nav-text-color)] uppercase">Region</th>
 <th className="px-4 py-2 text-left text-xs font-medium text-[var(--nav-text-color)] uppercase">Date</th>
 <th className="px-4 py-2 text-left text-xs font-medium text-[var(--nav-text-color)] uppercase">Truck</th>
 <th className="px-4 py-2 text-left text-xs font-medium text-[var(--nav-text-color)] uppercase">Client</th>
 <th className="px-4 py-2 text-left text-xs font-medium text-[var(--nav-text-color)] uppercase">To</th>
 <th className="px-4 py-2 text-right text-xs font-medium text-[var(--nav-text-color)] uppercase">Amount</th>
 </tr>
 </thead>
 <tbody className="bg-[var(--card-bg)] divide-y divide-[var(--card-border)]">
 {parsedRows.slice(0, 50).map((row) => {
   const isDuplicate = row.isValid && duplicateRowIds.has(row.id);
   return (
 <tr key={row.id} className={!row.isValid ?"bg-red-50" : isDuplicate ?"bg-amber-50" :""}>
 <td className="px-4 py-2 whitespace-nowrap">
 {isDuplicate ? (
 <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800" title="Already exists for this date, truck, trailer, client and amount — not imported">
 Duplicate
 </span>
) : row.isValid ? (
 <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">Valid</span>
) : (
 <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800" title={row.errors.join(",")}>
 Invalid
 </span>
)}
 </td>
 <td className="px-4 py-2 whitespace-nowrap">
 {regionLabel ? (
 <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border ${
   regionLabel === "Garden Route"
     ? "bg-cyan-50 text-cyan-700 border-cyan-200"
     : "bg-purple-50 text-purple-700 border-purple-200"
 }`}>
 <span className={`w-1.5 h-1.5 rounded-full ${regionLabel === "Garden Route" ? "bg-[#06B6D4]" : "bg-purple-500"}`} />
 {regionLabel}
 </span>
 ) : (
 <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
 Select region
 </span>
 )}
 </td>
 <td className="px-4 py-2 whitespace-nowrap text-xs text-[var(--foreground)]">{row.mappedValues.routeDate}</td>
 <td className="px-4 py-2 whitespace-nowrap text-xs text-[var(--foreground)]">{row.mappedValues.truckFleetNoStr}</td>
 <td className="px-4 py-2 whitespace-nowrap text-xs text-[var(--foreground)]">{row.mappedValues.client}</td>
 <td className="px-4 py-2 whitespace-nowrap text-xs text-[var(--foreground)]">
 {row.isSplit ? (
 <span className="text-purple-600 font-medium" title={(row.mappedValues.toLocations as string[]).join(",")}>
 {(row.mappedValues.toLocations as string[]).length} Drops (Split)
 </span>
) : (
 row.mappedValues.toLocations?.[0] ||"-"
)}
 </td>
 <td className="px-4 py-2 whitespace-nowrap text-xs text-[var(--foreground)] text-right">
 {row.mappedValues.rate}
 </td>
 </tr>
   );
 })}
 </tbody>
 </table>
 {parsedRows.length > 50 && (
 <div className="px-4 py-2 text-xs text-[var(--nav-text-color)] bg-[var(--card-bg)] border-t">
 ...and {parsedRows.length - 50} more rows
 </div>
)}
 </div>
 </div>
)}
 </div>

 {/* Footer */}
 <div className="px-6 py-4 border-t bg-[var(--card-bg)] flex justify-end gap-3">
 {step ==="paste" && (
 <button
 onClick={handleParse}
 disabled={!pasteContent.trim()}
 className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
 >
 Next: Map Columns
 </button>
)}
 {step ==="map" && (
 <>
 <button
 onClick={() => setStep("paste")}
 className="text-[var(--nav-text-color)] px-4 py-2 rounded-md text-sm font-medium hover:text-[var(--foreground)]"
 >
 Back
 </button>
 <button
 onClick={() => {
   saveMapping(columnMapping, columnMapping.length);
   setSavedMappingExists(true);
 }}
 className={`px-3 py-2 rounded-md text-xs font-medium border transition-colors ${
   savedMappingExists
     ? "border-emerald-300 text-emerald-700 bg-emerald-50"
     : "border-[var(--card-border)] text-[var(--nav-text-color)] hover:bg-[var(--card-bg)]"
 }`}
 >
 {savedMappingExists ? "✓ Default saved" : "💾 Save as default"}
 </button>
 <button
 onClick={processRows}
 className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700"
 >
 Next: Preview
 </button>
 </>
)}
 {step ==="confirm" && (
 <>
 <button
 onClick={() => setStep("map")}
 className="text-[var(--nav-text-color)] px-4 py-2 rounded-md text-sm font-medium hover:text-[var(--foreground)]"
 >
 Back
 </button>
 <span className={importBlocked ? "cursor-not-allowed" : ""} title={importBlocked ? "Select a region before importing" : undefined}>
 <button
 onClick={handleImport}
 disabled={isSubmitting || validCount === 0 || importBlocked}
 className="bg-green-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
 >
 {isSubmitting ?"Importing..." :`Import ${validCount} Loads`}
 </button>
 </span>
 </>
)}
 </div>
 </div>
 </div>
);
}
