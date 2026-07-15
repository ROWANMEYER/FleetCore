"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useAction, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

import * as XLSX from "xlsx";

// Shared interface for rows (aligned with Convex args)
interface AgeAnalysisRow {
  accountNumber: string;
  clientName: string;
  days120: number;
  days90: number;
  days60: number;
  days30: number;
  current: number;
  totalDue: number;
  originalRowIndex: number;
}

const REQUIRED_FIELDS = [
  { key: "accountClient", label: "Account / Client" },
  { key: "days120", label: "120+ Days" },
  { key: "days90", label: "90 Days" },
  { key: "days60", label: "60 Days" },
  { key: "days30", label: "30 Days" },
  { key: "current", label: "Current" },
  { key: "totalDue", label: "Total Due" },
] as const;

function AgeAnalysisPageContent() {
  const importSnapshot = useAction(api.finance.importAgeSnapshot.importSnapshot);
  const snapshots = useQuery(api.finance.getAgeSnapshots.getAgeSnapshots);

  const [month, setMonth] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);
  const [rawRows, setRawRows] = useState<unknown[][]>([]);
  const [selectedHeaderIndex, setSelectedHeaderIndex] = useState<number | null>(null);
  const [columnMapping, setColumnMapping] = useState<Record<string, number>>({});
  const [status, setStatus] = useState<"idle" | "preview" | "mapping" | "validating" | "success" | "error">("idle");
  const [resultMessage, setResultMessage] = useState("");
  const [errorDetails, setErrorDetails] = useState<string[]>([]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setFile(file);
      setStatus("idle");
      setResultMessage("");
      setErrorDetails([]);
      setSelectedHeaderIndex(null);
      setColumnMapping({});

      // Parse raw rows for preview
      try {
        const buffer = await file.arrayBuffer();
        const data = new Uint8Array(buffer);
        const workbook = XLSX.read(data, { type: "array" });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        
        // Parse as raw array of arrays
        const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { 
          header: 1,
          blankrows: false,
          defval: ""
        });
        
        setRawRows(rows);
        setStatus("preview");
        
        // Auto-select first likely header row (first non-empty row with strings)
        const likelyIndex = rows.findIndex(row => 
          Array.isArray(row) && row.some(cell => typeof cell === "string" && cell.trim().length > 0)
        );
        if (likelyIndex !== -1) {
          setSelectedHeaderIndex(likelyIndex);
        }
      } catch (error) {
        setStatus("error");
        setResultMessage("Failed to parse Excel file for preview.");
      }
    }
  };

  const handleConfirmHeader = () => {
    if (!month) {
      setStatus("error");
      setResultMessage("Please select a month before importing.");
      return;
    }
    
    if (!file || selectedHeaderIndex === null) return;

    // Proceed to mapping
    setStatus("mapping");
    setResultMessage("");
    setErrorDetails([]);
  };

  const handleImport = async () => {
    if (!month || !file || selectedHeaderIndex === null) return;

    // Validate mapping
    const missing = REQUIRED_FIELDS.filter(f => columnMapping[f.key] === undefined);
    if (missing.length > 0) {
      setStatus("error");
      setResultMessage(`Please map all columns. Missing: ${missing.map(f => f.label).join(", ")}`);
      return;
    }

    // Check for duplicates
    const usedCols = new Set<number>();
    for (const key of Object.keys(columnMapping)) {
      const colIdx = columnMapping[key];
      if (usedCols.has(colIdx)) {
        setStatus("error");
        setResultMessage("Duplicate column selection. Each column must be mapped only once.");
        return;
      }
      usedCols.add(colIdx);
    }

    setStatus("validating");

    try {
      // 2. Parse Data Rows
      const parsedRows: AgeAnalysisRow[] = [];
      const grandTotals = {
        days120: 0,
        days90: 0,
        days60: 0,
        days30: 0,
        current: 0,
        totalDue: 0,
      };

      // Build Header Index Map for Totals Row extraction
      // (Handles merged cells where user mapping might be off)
      const headerRow = rawRows[selectedHeaderIndex] as any[];
      const headerIndexMap = new Map<string, number>();
      if (headerRow && Array.isArray(headerRow)) {
        headerRow.forEach((cell, idx) => {
          if (typeof cell === "string") {
            const norm = cell.toLowerCase().replace(/[^a-z0-9]/g, ""); // "120days", "totaldue"
            headerIndexMap.set(norm, idx);
          }
        });
      }

      const parseRawCurrency = (val: unknown): number => {
        if (val == null || val === "") return 0;
        if (typeof val === "number") return val;
        if (typeof val === "string") {
          // Remove all non-numeric chars except dot and minus (handles "R", ",", spaces)
          const clean = val.replace(/[^0-9.-]/g, "");
          const num = parseFloat(clean);
          return isNaN(num) ? 0 : num;
        }
        return 0;
      };

      const findHeaderCol = (substrings: string[]) => {
        for (const [h, idx] of headerIndexMap.entries()) {
          if (substrings.some(s => h.includes(s))) return idx;
        }
        return undefined;
      };

      for (let i = selectedHeaderIndex + 1; i < rawRows.length; i++) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const row = rawRows[i] as any[];
        if (!row || row.length === 0) continue;

        // Account / Client Logic
        const accClientIdx = columnMapping["accountClient"];
        const accClientVal = row[accClientIdx] ? String(row[accClientIdx]).trim() : "";
        if (!accClientVal) continue; // Skip empty rows

        // CHECK FOR GRAND TOTAL ROW
        const nameLower = accClientVal.toLowerCase();
        if (nameLower.startsWith("totals") || nameLower.startsWith("grand") || nameLower.startsWith("percentage")) {
          // If this is the Grand Total row, capture ALL totals
          if (nameLower.startsWith("totals") || nameLower.startsWith("grand")) {
             // FIX: Scan entire row for numeric values
             const numericValues = row
                .map(cell => parseRawCurrency(cell))
                .filter(v => v > 0);
             
             // 1. Identify Total Due (largest value)
             // 2. Filter it out to get just the buckets
             // 3. Assign buckets in order (120 -> 90 -> 60 -> 30 -> Current)
             if (numericValues.length > 0) {
               const maxVal = Math.max(...numericValues);
               grandTotals.totalDue = maxVal;

               // Get buckets by excluding the total (handle floating point exactly if needed, but strict equality usually fine for extracted values)
               const buckets = numericValues.filter(v => v !== maxVal);

               if (buckets.length >= 1) grandTotals.days120 = buckets[0];
               if (buckets.length >= 2) grandTotals.days90 = buckets[1];
               if (buckets.length >= 3) grandTotals.days60 = buckets[2];
               if (buckets.length >= 4) grandTotals.days30 = buckets[3];
               if (buckets.length >= 5) grandTotals.current = buckets[4];
             }
          }
          // Skip adding this row to parsedRows
          continue;
        }

        // Split logic: Try "Account - Client" or fallback
        let rekNo = accClientVal;
        let clientName = accClientVal;

        // Heuristic: Check for " - " separator
        const splitMatch = accClientVal.match(/^(\S+)\s+-\s+(.+)$/);
        if (splitMatch) {
          rekNo = splitMatch[1];
          clientName = splitMatch[2];
        } else {
          // If no separator, use first word as account number if it looks like one?
          // Or just keep both same. User said "Combined Name column is accepted".
          // We'll keep both same as safe default if no split found, 
          // but Convex might expect distinct values.
          // Let's try a simple space split if " - " fails
          const spaceSplit = accClientVal.split(/\s+(.+)/);
          if (spaceSplit.length > 1) {
             rekNo = spaceSplit[0];
             clientName = spaceSplit[1];
          }
        }

        const parseNumber = (key: string): number => {
          const idx = columnMapping[key];
          if (idx === undefined) return 0;
          return parseRawCurrency(row[idx]);
        };

        parsedRows.push({
          accountNumber: rekNo,
          clientName: clientName,
          days120: parseNumber("days120"),
          days90: parseNumber("days90"),
          days60: parseNumber("days60"),
          days30: parseNumber("days30"),
          current: parseNumber("current"),
          totalDue: parseNumber("totalDue"),
          originalRowIndex: i + 1,
        });
      }

      // 3. Call Action
      console.log("Grand Totals captured:", grandTotals); // Debug log for verification
      const result = await importSnapshot({
        month,
        fileName: file.name,
        rows: parsedRows,
        totalDue: grandTotals.totalDue,
        days120: grandTotals.days120,
        days90: grandTotals.days90,
        days60: grandTotals.days60,
        days30: grandTotals.days30,
        current: grandTotals.current,
        importedBy: "Admin",
      });

      setStatus("success");
      setResultMessage(`Validation successful! ${result.count} rows processed.`);
    } catch (error: unknown) {
      setStatus("error");
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes("Validation failed")) {
        setResultMessage("Validation failed. Please correct the following errors:");
        const lines = msg.split("\n").slice(1);
        setErrorDetails(lines);
      } else {
        setResultMessage(`Import failed: ${msg}`);
      }
    }
  };

  return (
    <div className="p-8 max-w-4xl">
      <h1 className="text-2xl font-bold mb-4">Age Analysis</h1>
      <p className="text-gray-600 mb-8">
        Import and manage monthly age analysis snapshots.
      </p>

      {/* Import Card */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-8">
        <h2 className="text-lg font-semibold mb-4">Import New Snapshot</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          {/* Month Selector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select Month
            </label>
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              disabled={status === "validating" || status === "success"}
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2"
            />
          </div>

          {/* File Picker */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select File (.xlsx)
            </label>
            <input
              type="file"
              accept=".xlsx"
              onChange={handleFileChange}
              disabled={status === "validating" || status === "success"}
              className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
            />
          </div>
        </div>

        {/* Header Preview & Confirmation */}
        {status === "preview" && rawRows.length > 0 && (
          <div className="mb-6 border rounded-md p-4 bg-gray-50">
            <h3 className="text-sm font-medium text-gray-900 mb-2">1. Confirm Header Row</h3>
            <p className="text-xs text-gray-500 mb-4">
              Select the row that contains the column headers (Rek No, Client Name, etc.)
            </p>
            
            <div className="overflow-x-auto border rounded bg-white max-h-60">
              <table className="min-w-full divide-y divide-gray-200 text-xs">
                <tbody className="divide-y divide-gray-200">
                  {rawRows.slice(0, 15).map((row, idx) => (
                    <tr 
                      key={idx} 
                      onClick={() => setSelectedHeaderIndex(idx)}
                      className={`cursor-pointer hover:bg-blue-50 transition-colors ${
                        selectedHeaderIndex === idx ? "bg-blue-100 ring-2 ring-inset ring-blue-500" : ""
                      }`}
                    >
                      <td className="px-3 py-2 text-gray-500 w-8">{idx + 1}</td>
                      {(row as unknown[]).map((cell, cellIdx) => (
                        <td key={cellIdx} className="px-3 py-2 text-gray-700 whitespace-nowrap max-w-xs truncate">
                          {String(cell ?? "")}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Column Mapping UI */}
        {status === "mapping" && selectedHeaderIndex !== null && (
          <div className="mb-6 border rounded-md p-4 bg-gray-50">
            <h3 className="text-sm font-medium text-gray-900 mb-4">2. Map Columns</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {REQUIRED_FIELDS.map((field) => (
                <div key={field.key} className="flex flex-col">
                  <label className="text-xs font-semibold text-gray-700 mb-1">
                    {field.label}
                  </label>
                  <select
                    value={columnMapping[field.key] ?? ""}
                    onChange={(e) => {
                      const val = e.target.value;
                      setColumnMapping((prev) => ({
                        ...prev,
                        [field.key]: val === "" ? undefined : Number(val),
                      } as any));
                    }}
                    className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm border p-2"
                  >
                    <option value="">-- Select Column --</option>
                    {(rawRows[selectedHeaderIndex] as unknown[]).map((headerCell, idx) => (
                      <option key={idx} value={idx}>
                        {idx + 1}: {String(headerCell ?? "").trim() || "(Empty)"}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Action Bar */}
        <div className="flex items-center justify-end border-t pt-4">
          {status === "preview" ? (
            <button
              onClick={handleConfirmHeader}
              disabled={!month || selectedHeaderIndex === null}
              className={`px-4 py-2 rounded-md text-sm font-medium text-white shadow-sm
                ${!month || selectedHeaderIndex === null
                  ? "bg-gray-400 cursor-not-allowed"
                  : "bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                }`}
            >
              Next: Map Columns
            </button>
          ) : status === "mapping" ? (
            <button
              onClick={handleImport}
              className="px-4 py-2 rounded-md text-sm font-medium text-white shadow-sm bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Import Data
            </button>
          ) : (
             // Show reset/re-upload state if needed, or nothing if success
            status === "validating" ? (
              <span className="text-sm text-gray-500">Validating...</span>
            ) : status === "success" ? (
              <button
                onClick={() => {
                  setStatus("idle");
                  setFile(null);
                  setRawRows([]);
                  setResultMessage("");
                }}
                className="px-4 py-2 rounded-md text-sm font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50"
              >
                Import Another
              </button>
            ) : null
          )}
        </div>
      </div>

      {/* Results Section */}
      {status === "success" && (
        <div className="bg-green-50 border-l-4 border-green-400 p-4 mb-8">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-green-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-green-700 font-medium">
                {resultMessage}
              </p>
            </div>
          </div>
        </div>
      )}

      {status === "error" && (
        <div className="bg-red-50 border-l-4 border-red-400 p-4 mb-8">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">
                {resultMessage}
              </h3>
              {errorDetails.length > 0 && (
                <div className="mt-2 text-sm text-red-700">
                  <ul className="list-disc pl-5 space-y-1">
                    {errorDetails.map((line, idx) => (
                      <li key={idx} className="font-mono text-xs">{line}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Snapshot List */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Imported Snapshots</h2>
        </div>
        
        {!snapshots ? (
          <div className="p-6 text-center text-gray-500">Loading snapshots...</div>
        ) : snapshots.length === 0 ? (
          <div className="p-6 text-center text-gray-500">No snapshots imported yet.</div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Month
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Imported On
                </th>
                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Total Due
                </th>
                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Action
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {snapshots.map((snapshot) => (
                <tr key={snapshot.snapshotId} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {snapshot.month}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(snapshot.importedAt).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right font-mono">
                    {new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(snapshot.totalDue)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <Link
                      href={`/admin/age-analysis/${snapshot.snapshotId}`}
                      className="text-blue-600 hover:text-blue-900"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default function AgeAnalysisPage() {
  return (
    <Suspense fallback={null}>
      <AgeAnalysisPageContent />
    </Suspense>
  );
}
