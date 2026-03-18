"use client";

import { useState } from "react";
import { useQuery, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import EmailReportModal from "@/src/components/EmailReportModal";
import { renderTransportReport } from "@/convex/templates/TransportReport";

type ColumnKey = "date" | "truck" | "trailer" | "driver" | "client" | "from" | "to" | "rate" | "distance" | "notes";

export default function QuickSendPage() {
  // 1. Date Selection (Shared State Model with Sheets)
  const [dateMode, setDateMode] = useState<"single" | "range">("single");

  // Single Date State (defaults to today)
  const [singleDate, setSingleDate] = useState(() => new Date().toISOString().split("T")[0]);

  // Range Date State (defaults to today)
  const [rangeStartDate, setRangeStartDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [rangeEndDate, setRangeEndDate] = useState(() => new Date().toISOString().split("T")[0]);

  // Derive query dates based on mode (Identical logic to Sheets)
  const queryStartDate = dateMode === "single" ? singleDate : rangeStartDate;
  const queryEndDate = dateMode === "single" ? singleDate : rangeEndDate;

  // 2. Data Fetching
  const [completedOnly, setCompletedOnly] = useState(true);

  const reportData = useQuery(api.dailyRoutes.getQuickSendReport, { 
    startDate: queryStartDate, 
    endDate: queryEndDate,
    completedOnly
  });
  
  const sendLoadReportEmail = useAction(api.emails.sendLoadReportEmail);

  // 3. UI State
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);

  // Column State
  const [columns, setColumns] = useState<Record<ColumnKey, { visible: boolean; note: string }>>({
    date: { visible: true, note: "" },
    truck: { visible: true, note: "" },
    trailer: { visible: true, note: "" },
    driver: { visible: true, note: "" },
    client: { visible: true, note: "" },
    from: { visible: true, note: "" },
    to: { visible: true, note: "" },
    rate: { visible: true, note: "" },
    distance: { visible: false, note: "" },
    notes: { visible: false, note: "" },
  });

  const activeColumns = (Object.entries(columns) as [ColumnKey, { visible: boolean }][])
    .filter(([, config]) => config.visible)
    .map(([key]) => key);

  const columnNotes = (Object.entries(columns) as [ColumnKey, { visible: boolean; note: string }][])
    .filter(([, config]) => config.visible && config.note.trim() !== "")
    .map(([key, config]) => ({ column: key, note: config.note }));

  // 4. Handlers
  const handleSendEmail = async (recipientIds: Id<"recipients">[], subject: string) => {
    try {
      await sendLoadReportEmail({ 
        recipientIds, 
        startDate: queryStartDate, 
        endDate: queryEndDate, 
        subject,
        completedOnly,
        activeColumns,
        columnNotes
      });
      alert("Email sent successfully!");
    } catch (error) {
      console.error("Failed to send email:", error);
      alert("Failed to send email. Please check the logs.");
    }
  };

  const handleDownloadPDF = () => {
    if (!reportData) return;
    const html = renderTransportReport({
      data: reportData,
      startDate: queryStartDate,
      endDate: queryEndDate,
      activeColumns,
      columnNotes
    });
    const printWindow = window.open("", "_blank");
    if (printWindow) {
      printWindow.document.write(html);
      printWindow.document.close();
      printWindow.focus();
      printWindow.print();
    }
  };

  const isLoading = reportData === undefined;
  const hasData = reportData && reportData.loads && reportData.loads.length > 0;

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-6xl mx-auto space-y-8 p-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">QuickSend – Transport Report</h1>
          <p className="text-gray-500 mt-1">
            Review loads and send reports to stakeholders.
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white/10 backdrop-blur-xl p-4 rounded-lg border border-white/10 shadow-sm flex flex-col md:flex-row gap-4 items-end">
        {/* Date Mode Selector */}
        <div className="flex flex-col gap-2">
           <span className="text-xs font-medium text-gray-700">Date Mode</span>
           <div className="flex gap-4 p-2 bg-gray-50 rounded border border-gray-200">
             <label className="flex items-center gap-2 cursor-pointer">
               <input 
                 type="radio" 
                 checked={dateMode === "single"} 
                 onChange={() => setDateMode("single")} 
                 className="h-4 w-4 text-black focus:ring-black"
               /> 
               <span className="text-sm text-gray-700">Single Date</span> 
             </label> 
           
             <label className="flex items-center gap-2 cursor-pointer">
               <input 
                 type="radio" 
                 checked={dateMode === "range"} 
                 onChange={() => setDateMode("range")} 
                 className="h-4 w-4 text-black focus:ring-black"
               /> 
               <span className="text-sm text-gray-700">Date Range</span> 
             </label> 
           </div>
        </div>

        {/* Conditional Date Inputs */}
        {dateMode === "single" ? (
          <div>
            <label htmlFor="single-date" className="block text-sm font-medium text-gray-700 mb-1">
              Date
            </label>
            <input
              type="date"
              id="single-date"
              value={singleDate}
              onChange={(e) => setSingleDate(e.target.value)}
              className="block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-black focus:border-black sm:text-sm"
            />
          </div>
        ) : (
          <div className="flex gap-4">
            <div>
              <label htmlFor="start-date" className="block text-sm font-medium text-gray-700 mb-1">
                Start Date
              </label>
              <input
                type="date"
                id="start-date"
                value={rangeStartDate}
                onChange={(e) => setRangeStartDate(e.target.value)}
                className="block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-black focus:border-black sm:text-sm"
              />
            </div>
            <div>
              <label htmlFor="end-date" className="block text-sm font-medium text-gray-700 mb-1">
                End Date
              </label>
              <input
                type="date"
                id="end-date"
                value={rangeEndDate}
                onChange={(e) => setRangeEndDate(e.target.value)}
                className="block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-black focus:border-black sm:text-sm"
              />
            </div>
          </div>
        )}

        <div className="flex items-center pb-2">
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 cursor-pointer select-none">
                <input 
                    type="checkbox" 
                    checked={completedOnly} 
                    onChange={(e) => setCompletedOnly(e.target.checked)} 
                    className="h-4 w-4 text-black border-gray-300 rounded focus:ring-black"
                />
                Show completed only
            </label>
        </div>
      </div>

      {/* Column Selection */}
      <div className="bg-white/10 backdrop-blur-xl p-4 rounded-lg border border-white/10 shadow-sm">
        <h3 className="text-sm font-medium text-gray-900 mb-3">Report Columns</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {Object.entries(columns).map(([key, config]) => (
            <div key={key} className="flex flex-col space-y-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.visible}
                  onChange={(e) => setColumns(prev => ({
                    ...prev,
                    [key]: { ...prev[key as ColumnKey], visible: e.target.checked }
                  }))}
                  className="h-4 w-4 text-black border-gray-300 rounded focus:ring-black"
                />
                <span className="text-sm text-gray-700">
                  {key === "notes" ? "Route Notes" : key.charAt(0).toUpperCase() + key.slice(1)}
                </span>
              </label>
              {config.visible && (
                <input
                  type="text"
                  placeholder="Add note..."
                  value={config.note}
                  onChange={(e) => setColumns(prev => ({
                    ...prev,
                    [key]: { ...prev[key as ColumnKey], note: e.target.value }
                  }))}
                  className="text-xs border-b border-gray-300 focus:border-black focus:outline-none px-0 py-0.5 bg-transparent"
                />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Report Preview (Email-Exact) */}
      <div className="bg-white/10 backdrop-blur-xl rounded-lg border border-white/10 shadow-sm overflow-hidden flex flex-col h-[800px]">
        <div className="bg-white/10 backdrop-blur-xl px-6 py-4 border-b border-white/10 flex justify-between items-center flex-shrink-0">
          <h2 className="text-lg font-medium text-gray-900">Email Preview</h2>
          <div className="flex items-center gap-3">
             {hasData && (
                <span className="text-sm text-gray-500 mr-2">
                  {reportData.summary.totalLoads} loads found
                </span>
             )}
             <button
               onClick={handleDownloadPDF}
               disabled={!hasData}
               className="inline-flex items-center px-3 py-1.5 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
             >
               Download PDF
             </button>
             <button
               onClick={() => setIsEmailModalOpen(true)}
               disabled={!hasData}
               className="inline-flex items-center px-3 py-1.5 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-black hover:bg-gray-800 disabled:opacity-50"
             >
               Send Report
             </button>
          </div>
        </div>

        <div className="flex-1 bg-white/5 backdrop-blur-lg p-8 overflow-auto">
          {isLoading ? (
            <div className="p-12 text-center text-gray-500">Loading report data...</div>
          ) : !hasData ? (
            <div className="p-12 text-center text-gray-500">
              No loads found for the selected period.
            </div>
          ) : (
            <div className="bg-white/90 backdrop-blur-xl shadow-lg mx-auto max-w-[800px] min-h-[1000px]">
              <iframe 
                srcDoc={renderTransportReport({
                  data: reportData,
                  startDate: queryStartDate,
                  endDate: queryEndDate,
                  activeColumns,
                  columnNotes
                })}
                className="w-full h-full min-h-[1000px] border-none"
                title="Report Preview"
              />
            </div>
          )}
        </div>
      </div>

      <EmailReportModal
        isOpen={isEmailModalOpen}
        onClose={() => setIsEmailModalOpen(false)}
        initialSubject={`Transport Report: ${queryStartDate} to ${queryEndDate}`}
        onSend={handleSendEmail}
      />
      </div>
    </div>
  );
}
