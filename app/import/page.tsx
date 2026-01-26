"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";

type ImportType = "drivers" | "trucks" | "trailers";

export default function ImportPage() {
  const [activeTab, setActiveTab] = useState<ImportType>("drivers");
  const [jsonInput, setJsonInput] = useState("");
  const [status, setStatus] = useState<{ type: "success" | "error" | "info"; message: string } | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const importDrivers = useMutation(api.dataImport.importDrivers);
  const importTrucks = useMutation(api.dataImport.importTrucks);
  const importTrailers = useMutation(api.dataImport.importTrailers);

  const handleImport = async () => {
    if (!jsonInput.trim()) {
      setStatus({ type: "error", message: "Please paste JSON content first." });
      return;
    }

    setIsProcessing(true);
    setStatus({ type: "info", message: "Processing..." });

    try {
      const data = JSON.parse(jsonInput);
      
      if (!Array.isArray(data)) {
        throw new Error("Input must be a JSON array.");
      }

      let resultMessage = "";

      if (activeTab === "drivers") {
        resultMessage = await importDrivers({ drivers: data });
      } else if (activeTab === "trucks") {
        resultMessage = await importTrucks({ trucks: data });
      } else if (activeTab === "trailers") {
        resultMessage = await importTrailers({ trailers: data });
      }

      setStatus({ type: "success", message: resultMessage });
      setJsonInput(""); // Clear input on success
    } catch (err: any) {
      console.error(err);
      setStatus({ 
        type: "error", 
        message: `Import failed: ${err.message || "Unknown error"}` 
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const getExampleJson = (type: ImportType) => {
    switch (type) {
      case "drivers":
        return `[
  {
    "driverId": "D001",
    "driverName": "John Doe",
    "idNumber": "1234567890123",
    "phone": "0821234567",
    "status": "active"
  }
]`;
      case "trucks":
        return `[
  {
    "truckFleetNo": "T001",
    "registration": "AB 12 CD GP",
    "make": "Volvo",
    "model": "FH16"
  }
]`;
      case "trailers":
        return `[
  {
    "trailerFleetNo": 101,
    "type": "Flatbed",
    "trailerFleetNoStr": "101",
    "trailers": [
      { "length": "12m", "registration": "TR 99 AA GP" }
    ]
  }
]`;
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setJsonInput(content);
      setStatus({ type: "info", message: `Loaded file: ${file.name}` });
    };
    reader.onerror = () => {
      setStatus({ type: "error", message: "Error reading file." });
    };
    reader.readAsText(file);
  };

  return (
    <div className="p-8 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Data Import</h1>
      </div>

      <div className="bg-white rounded-lg shadow-sm border p-6">
        {/* Tabs */}
        <div className="flex border-b mb-6">
          {(["drivers", "trucks", "trailers"] as ImportType[]).map((tab) => (
            <button
              key={tab}
              onClick={() => {
                setActiveTab(tab);
                setStatus(null);
                setJsonInput("");
              }}
              className={`px-6 py-3 font-medium text-sm transition-colors ${
                activeTab === tab
                  ? "border-b-2 border-black text-black"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        <div className="space-y-4">
          <div className="flex justify-between items-center">
             <label className="block text-sm font-medium text-gray-700">
               Upload JSON File or Paste Content
             </label>
             <button 
                onClick={() => setJsonInput(getExampleJson(activeTab))}
                className="text-xs text-blue-600 hover:underline"
             >
                Load Example
             </button>
          </div>

          <div className="flex items-center gap-4 p-4 border-2 border-dashed border-gray-300 rounded-md bg-gray-50 hover:bg-gray-100 transition-colors">
            <input
              type="file"
              accept=".json"
              onChange={handleFileUpload}
              className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-black file:text-white hover:file:bg-gray-800 cursor-pointer"
            />
          </div>
          
          <textarea
            value={jsonInput}
            onChange={(e) => setJsonInput(e.target.value)}
            rows={15}
            className="w-full font-mono text-sm p-4 rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black bg-gray-50"
            placeholder={`[\n  ...\n]`}
          />

          {status && (
            <div
              className={`p-4 rounded-md text-sm ${
                status.type === "success"
                  ? "bg-green-50 text-green-700"
                  : status.type === "error"
                  ? "bg-red-50 text-red-700"
                  : "bg-blue-50 text-blue-700"
              }`}
            >
              {status.message}
            </div>
          )}

          <div className="flex justify-end pt-4">
            <button
              onClick={handleImport}
              disabled={isProcessing}
              className={`px-6 py-2 bg-black text-white rounded-md hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {isProcessing ? "Importing..." : "Import Data"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
