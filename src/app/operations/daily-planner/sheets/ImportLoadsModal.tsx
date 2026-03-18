"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";

interface ImportLoadsModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

type ImportStep = "paste" | "map" | "confirm";

interface ParsedRow {
  id: string;
  originalValues: string[];
  mappedValues: Record<string, string | string[]>;
  isValid: boolean;
  errors: string[];
  isSplit: boolean; // If split from a single row
}

const COLUMNS = [
  { id: "ignore", label: "Ignore" },
  { id: "routeDate", label: "Date" },
  { id: "truckFleetNo", label: "Truck" },
  { id: "trailerFleetNoStr", label: "Trailer" },
  { id: "driverName", label: "Driver" },
  { id: "fromLocation", label: "From" },
  { id: "toLocation", label: "To" },
  { id: "client", label: "Client" },
  { id: "rate", label: "Amount" },
  { id: "notes", label: "Notes" },
];

const REQUIRED_FIELDS = ["routeDate", "truckFleetNo", "rate"];

export default function ImportLoadsModal({ onClose, onSuccess }: ImportLoadsModalProps) {
  const [step, setStep] = useState<ImportStep>("paste");
  const [pasteContent, setPasteContent] = useState("");
  const [columnMapping, setColumnMapping] = useState<string[]>([]);
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const createBulkDailyRoutes = useMutation(api.dailyRoutes.createBulkDailyRoutes);

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
      if (lower.includes("datum") || lower.includes("date")) initialMapping[index] = "routeDate";
      else if (lower.includes("vloot") || lower.includes("truck")) initialMapping[index] = "truckFleetNo";
      else if (lower.includes("trailer")) initialMapping[index] = "trailerFleetNoStr";
      else if (lower.includes("drywer") || lower.includes("driver")) initialMapping[index] = "driverName";
      else if (lower.includes("van") || lower.includes("from")) initialMapping[index] = "fromLocation";
      else if (lower.includes("na") || lower.includes("to")) initialMapping[index] = "toLocation";
      else if (lower.includes("klient") || lower.includes("client")) initialMapping[index] = "client";
      else if (lower.includes("tarief") || lower.includes("amount") || lower.includes("rate")) initialMapping[index] = "rate";
      else if (lower.includes("opmerking") || lower.includes("note")) initialMapping[index] = "notes";
    });

    setColumnMapping(initialMapping);
    setStep("map");
  };

  // Process rows based on mapping
  const processRows = () => {
    const lines = pasteContent.split(/\r?\n/).filter(line => line.trim());
    const newParsedRows: ParsedRow[] = [];

    lines.forEach((line, lineIndex) => {
      // Skip "Total" rows
      if (line.toLowerCase().startsWith("total")) return;

      const values = line.split("\t");
      const mapped: Record<string, string | string[]> = {};
      const errors: string[] = [];
      let isSplit = false;

      // Extract values based on mapping
      columnMapping.forEach((fieldId, colIndex) => {
        if (fieldId === "ignore") return;
        const value = values[colIndex]?.trim() || "";
        
        // Clean up South African Currency
        if (fieldId === "rate") {
            // Remove 'R', spaces, convert ',' to '.'
            // "R18 500,00" -> "18500.00"
            const clean = value.replace(/R/g, "").replace(/\s/g, "").replace(/,/g, ".");
            mapped[fieldId] = clean; // Keep as string for now, parse later
        } else if (fieldId === "routeDate") {
             // Try to parse date if needed, but keeping as string is safer for now if input matches
             // Assuming input is YYYY-MM-DD or similar. 
             // If input is "19 09 2025" (DD MM YYYY) -> Convert to YYYY-MM-DD
             if (value.match(/^\d{1,2}\s\d{1,2}\s\d{4}$/)) {
                 const parts = value.split(" ");
                 // parts[0] = DD, parts[1] = MM, parts[2] = YYYY
                 mapped[fieldId] = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
             } else if (value.match(/^\d{1,2}\/\d{1,2}\/\d{4}$/)) {
                  const parts = value.split("/");
                  mapped[fieldId] = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
             } else {
                 mapped[fieldId] = value;
             }
        } else {
            mapped[fieldId] = value;
        }
      });

      // Split Logic for "To" location
      if (mapped.toLocation && (mapped.toLocation as string).includes("+")) {
          const destinations = (mapped.toLocation as string).split("+").map((d: string) => d.trim());
          isSplit = true;
          // We create one row, but mark it as split. The mutation will handle array of locations.
          // Wait, the mutation expects `toLocations: string[]`.
          mapped.toLocations = destinations;
      } else {
          mapped.toLocations = mapped.toLocation ? [mapped.toLocation as string] : [];
      }
      
      // Also handle "From" as array
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
          id: `row-${lineIndex}`,
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
    setIsSubmitting(true);
    try {
      const validRows = parsedRows.filter(r => r.isValid);
      
      const routes = validRows.map(row => {
          const { mappedValues } = row;
          return {
              routeDate: mappedValues.routeDate as string,
              driverName: (mappedValues.driverName as string) || "",
              kilometers: 0, // Will be calculated or default
              truckFleetNo: mappedValues.truckFleetNo as string,
              truckFleetNoStr: mappedValues.truckFleetNo as string,
              trailerFleetNoStr: mappedValues.trailerFleetNoStr as string,
              notes: mappedValues.notes as string,
              isSplit: row.isSplit,
              loads: [{
                  client: (mappedValues.client as string) || "Unknown",
                  quantity: "1", // Default quantity
                  quantityType: "load",
                  rate: mappedValues.rate as string,
                  rateType: "flat", // Assuming flat rate for imported loads
                  fromLocations: mappedValues.fromLocations as string[],
                  toLocations: mappedValues.toLocations as string[],
              }]
          };
      });

      await createBulkDailyRoutes({ routes });
      onSuccess();
      onClose();
    } catch (error) {
      console.error("Import failed:", error);
      alert("Failed to import loads.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const validCount = parsedRows.filter(r => r.isValid).length;
  const invalidCount = parsedRows.length - validCount;
  const totalRevenue = parsedRows
    .filter(r => r.isValid)
    .reduce((sum, r) => sum + (parseFloat(r.mappedValues.rate as string) || 0), 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl h-[80vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b flex justify-between items-center">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Import Loads</h2>
            <p className="text-sm text-gray-500">Paste Excel data to bulk create routes</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          {step === "paste" && (
            <div className="h-full flex flex-col">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Paste Excel Data (Tab-separated)
              </label>
              <textarea
                className="flex-1 w-full border border-gray-300 rounded-md p-4 font-mono text-xs focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder={`VLOOT\tTRAILER\tDATUM\t...\n154\t154\t19 09 2025\t...`}
                value={pasteContent}
                onChange={(e) => setPasteContent(e.target.value)}
              />
            </div>
          )}

          {step === "map" && (
            <div>
              <div className="mb-4 bg-blue-50 p-4 rounded-md text-sm text-blue-800">
                Map your columns below. First 5 rows shown for preview.
              </div>
              
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead>
                    <tr>
                      {columnMapping.map((col, index) => (
                        <th key={index} className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[150px]">
                          <select
                            value={col}
                            onChange={(e) => {
                              const newMapping = [...columnMapping];
                              newMapping[index] = e.target.value;
                              setColumnMapping(newMapping);
                            }}
                            className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-xs"
                          >
                            {COLUMNS.map(c => (
                              <option key={c.id} value={c.id}>{c.label}</option>
                            ))}
                          </select>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {pasteContent.split(/\r?\n/).slice(0, 5).map((line, i) => (
                      <tr key={i}>
                        {line.split("\t").map((cell, j) => (
                          <td key={j} className="px-3 py-2 whitespace-nowrap text-xs text-gray-500 border-r last:border-r-0 border-gray-100">
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

          {step === "confirm" && (
            <div className="space-y-6">
               <div className="grid grid-cols-3 gap-4">
                 <div className="bg-green-50 p-4 rounded-lg border border-green-100">
                   <div className="text-sm text-green-600 font-medium">Valid Records</div>
                   <div className="text-2xl font-bold text-green-700">{validCount}</div>
                 </div>
                 <div className="bg-red-50 p-4 rounded-lg border border-red-100">
                   <div className="text-sm text-red-600 font-medium">Invalid Records</div>
                   <div className="text-2xl font-bold text-red-700">{invalidCount}</div>
                 </div>
                 <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
                   <div className="text-sm text-blue-600 font-medium">Total Revenue</div>
                   <div className="text-2xl font-bold text-blue-700">
                     {new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(totalRevenue)}
                   </div>
                 </div>
               </div>

               <div className="border rounded-md overflow-hidden">
                 <table className="min-w-full divide-y divide-gray-200">
                   <thead className="bg-gray-50">
                     <tr>
                       <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                       <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                       <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Truck</th>
                       <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Client</th>
                       <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">To</th>
                       <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
                     </tr>
                   </thead>
                   <tbody className="bg-white divide-y divide-gray-200">
                     {parsedRows.slice(0, 50).map((row) => (
                       <tr key={row.id} className={!row.isValid ? "bg-red-50" : ""}>
                         <td className="px-4 py-2 whitespace-nowrap">
                           {row.isValid ? (
                             <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">Valid</span>
                           ) : (
                             <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800" title={row.errors.join(", ")}>
                               Invalid
                             </span>
                           )}
                         </td>
                         <td className="px-4 py-2 whitespace-nowrap text-xs text-gray-900">{row.mappedValues.routeDate}</td>
                         <td className="px-4 py-2 whitespace-nowrap text-xs text-gray-900">{row.mappedValues.truckFleetNoStr}</td>
                         <td className="px-4 py-2 whitespace-nowrap text-xs text-gray-900">{row.mappedValues.client}</td>
                         <td className="px-4 py-2 whitespace-nowrap text-xs text-gray-900">
                           {row.isSplit ? (
                             <span className="text-purple-600 font-medium" title={(row.mappedValues.toLocations as string[]).join(", ")}>
                               {(row.mappedValues.toLocations as string[]).length} Drops (Split)
                             </span>
                           ) : (
                             row.mappedValues.toLocations?.[0] || "-"
                           )}
                         </td>
                         <td className="px-4 py-2 whitespace-nowrap text-xs text-gray-900 text-right">
                           {row.mappedValues.rate}
                         </td>
                       </tr>
                     ))}
                   </tbody>
                 </table>
                 {parsedRows.length > 50 && (
                   <div className="px-4 py-2 text-xs text-gray-500 bg-gray-50 border-t">
                     ...and {parsedRows.length - 50} more rows
                   </div>
                 )}
               </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t bg-gray-50 flex justify-end gap-3">
          {step === "paste" && (
            <button
              onClick={handleParse}
              disabled={!pasteContent.trim()}
              className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next: Map Columns
            </button>
          )}
          {step === "map" && (
            <>
              <button
                onClick={() => setStep("paste")}
                className="text-gray-600 px-4 py-2 rounded-md text-sm font-medium hover:text-gray-800"
              >
                Back
              </button>
              <button
                onClick={processRows}
                className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700"
              >
                Next: Preview
              </button>
            </>
          )}
          {step === "confirm" && (
            <>
              <button
                onClick={() => setStep("map")}
                className="text-gray-600 px-4 py-2 rounded-md text-sm font-medium hover:text-gray-800"
              >
                Back
              </button>
              <button
                onClick={handleImport}
                disabled={isSubmitting || validCount === 0}
                className="bg-green-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? "Importing..." : `Import ${validCount} Loads`}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
