"use client";

import { useState} from"react";
import { useQuery, useAction} from"convex/react";
import { api} from"@/convex/_generated/api";
import { Id} from"@/convex/_generated/dataModel";
import EmailReportModal from"@/src/components/EmailReportModal";
import { renderTransportReport} from"@/convex/templates/TransportReport";
import { SkeletonCard} from"@/src/components/common/Skeleton";
import { EmptyState} from"@/src/components/common/EmptyState";
import { useToast} from"@/src/components/common/Toast";
import { useAuth, useRegionArg} from"@/src/components/auth/AuthProvider";

type ColumnKey ="date" |"truck" |"trailer" |"driver" |"client" |"from" |"to" |"rate" |"distance" |"notes";

export default function QuickSendPage() {
 // 1. Date Selection (Shared State Model with Sheets)
 const [dateMode, setDateMode] = useState<"single" |"range">("single");

 // Single Date State (defaults to today)
 const [singleDate, setSingleDate] = useState(() => new Date().toISOString().split("T")[0]);

 // Range Date State (defaults to today)
 const [rangeStartDate, setRangeStartDate] = useState(() => new Date().toISOString().split("T")[0]);
 const [rangeEndDate, setRangeEndDate] = useState(() => new Date().toISOString().split("T")[0]);

 // Derive query dates based on mode (Identical logic to Sheets)
 const queryStartDate = dateMode ==="single" ? singleDate : rangeStartDate;
 const queryEndDate = dateMode ==="single" ? singleDate : rangeEndDate;

 // Guard against empty/inverted ranges BEFORE querying — prevents the backend
 // "Start date cannot be after end date" error from crashing the page.
 const missingDate = queryStartDate ==="" || queryEndDate ==="";
 const rangeReversed = dateMode ==="range" && queryStartDate !=="" && queryEndDate !=="" && queryEndDate < queryStartDate;
 const dateError = rangeReversed
 ?"End date cannot be before the start date."
 : missingDate
 ?"Please select a date to load the report."
 :"";

 // 2. Data Fetching
 const [completedOnly, setCompletedOnly] = useState(true);

 const { token } = useAuth();
 const region = useRegionArg();
 const reportData = useQuery(
 api.dailyRoutes.getQuickSendReport,
 dateError !==""
 ?"skip"
 : {
 startDate: queryStartDate, 
 endDate: queryEndDate,
 completedOnly,
 token,
 region
 }
);
 
 const sendLoadReportEmail = useAction(api.emails.sendLoadReportEmail);
 const { addToast } = useToast();

 // 3. UI State
 const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);

 // Column State
 const [columns, setColumns] = useState<Record<ColumnKey, { visible: boolean; note: string}>>({
 date: { visible: true, note:""},
 truck: { visible: true, note:""},
 trailer: { visible: true, note:""},
 driver: { visible: true, note:""},
 client: { visible: true, note:""},
 from: { visible: true, note:""},
 to: { visible: true, note:""},
 rate: { visible: true, note:""},
 distance: { visible: false, note:""},
 notes: { visible: false, note:""},
});

 const activeColumns = (Object.entries(columns) as [ColumnKey, { visible: boolean}][])
 .filter(([, config]) => config.visible)
 .map(([key]) => key);

 const columnNotes = (Object.entries(columns) as [ColumnKey, { visible: boolean; note: string}][])
 .filter(([, config]) => config.visible && config.note.trim() !=="")
 .map(([key, config]) => ({ column: key, note: config.note}));

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
 columnNotes,
 token,
 region
});
 addToast("Email sent successfully!", "success");
} catch (error) {
 console.error("Failed to send email:", error);
 addToast("Failed to send email. Please check the logs.", "error");
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
 const printWindow = window.open("","_blank");
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
 <p className="text-[var(--nav-text-color)] mt-1">
 Review loads and send reports to stakeholders.
 </p>
 </div>
 </div>

 {/* Filters */}
 <div className="bg-[var(--card-bg)] dark:backdrop-blur-xl p-4 rounded-lg border border-[var(--card-border)] shadow-sm flex flex-col md:flex-row gap-4 items-end">
 {/* Date Mode Selector */}
 <div className="flex flex-col gap-2">
 <span className="text-xs font-medium text-[var(--foreground)]">Date Mode</span>
 <div className="flex gap-4 p-2 bg-[var(--card-bg)] rounded border border-[var(--card-border)]">
 <label className="flex items-center gap-2 cursor-pointer">
 <input 
 type="radio" 
 checked={dateMode ==="single"} 
 onChange={() => setDateMode("single")} 
 className="h-4 w-4 text-[var(--foreground)] focus:ring-[#06B6D4]"
 /> 
 <span className="text-sm text-[var(--foreground)]">Single Date</span> 
 </label> 
 
 <label className="flex items-center gap-2 cursor-pointer">
 <input 
 type="radio" 
 checked={dateMode ==="range"} 
 onChange={() => setDateMode("range")} 
 className="h-4 w-4 text-[var(--foreground)] focus:ring-[#06B6D4]"
 /> 
 <span className="text-sm text-[var(--foreground)]">Date Range</span> 
 </label> 
 </div>
 </div>

 {/* Conditional Date Inputs */}
 {dateMode ==="single" ? (
 <div>
 <label htmlFor="single-date" className="block text-sm font-medium text-[var(--foreground)] mb-1">
 Date
 </label>
 <input
 type="date"
 id="single-date"
 value={singleDate}
 onChange={(e) => setSingleDate(e.target.value)}
 className="block w-full border border-[var(--card-border)] rounded-md px-3 py-2 focus:outline-none focus:ring-[#06B6D4] focus:border-[#06B6D4] sm:text-sm"
 />
 </div>
) : (
 <div className="flex gap-4">
 <div>
 <label htmlFor="start-date" className="block text-sm font-medium text-[var(--foreground)] mb-1">
 Start Date
 </label>
 <input
 type="date"
 id="start-date"
 value={rangeStartDate}
 onChange={(e) => setRangeStartDate(e.target.value)}
 className="block w-full border border-[var(--card-border)] rounded-md px-3 py-2 focus:outline-none focus:ring-[#06B6D4] focus:border-[#06B6D4] sm:text-sm"
 />
 </div>
 <div>
 <label htmlFor="end-date" className="block text-sm font-medium text-[var(--foreground)] mb-1">
 End Date
 </label>
 <input
 type="date"
 id="end-date"
 value={rangeEndDate}
 onChange={(e) => setRangeEndDate(e.target.value)}
 className="block w-full border border-[var(--card-border)] rounded-md px-3 py-2 focus:outline-none focus:ring-[#06B6D4] focus:border-[#06B6D4] sm:text-sm"
 />
 {rangeReversed && (
 <p className="text-xs font-medium text-red-600 mt-1">
 {dateError}
 </p>
 )}
 </div>
 </div>
)}

 <div className="flex items-center pb-2">
 <label className="flex items-center gap-2 text-sm font-medium text-[var(--foreground)] cursor-pointer select-none">
 <input 
 type="checkbox" 
 checked={completedOnly} 
 onChange={(e) => setCompletedOnly(e.target.checked)} 
 className="h-4 w-4 text-[var(--foreground)] border-[var(--card-border)] rounded focus:ring-[#06B6D4]"
 />
 Show completed only
 </label>
 </div>
 </div>

 {/* Column Selection */}
 <div className="bg-[var(--card-bg)] dark:backdrop-blur-xl p-4 rounded-lg border border-[var(--card-border)] shadow-sm">
 <h3 className="text-sm font-medium text-[var(--foreground)] mb-3">Report Columns</h3>
 <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
 {Object.entries(columns).map(([key, config]) => (
 <div key={key} className="flex flex-col space-y-1">
 <label className="flex items-center gap-2 cursor-pointer">
 <input
 type="checkbox"
 checked={config.visible}
 onChange={(e) => setColumns(prev => ({
 ...prev,
 [key]: { ...prev[key as ColumnKey], visible: e.target.checked}
}))}
 className="h-4 w-4 text-[var(--foreground)] border-[var(--card-border)] rounded focus:ring-[#06B6D4]"
 />
 <span className="text-sm text-[var(--foreground)]">
 {key ==="notes" ?"Route Notes" : key.charAt(0).toUpperCase() + key.slice(1)}
 </span>
 </label>
 {config.visible && (
 <input
 type="text"
 placeholder="Add note..."
 value={config.note}
 onChange={(e) => setColumns(prev => ({
 ...prev,
 [key]: { ...prev[key as ColumnKey], note: e.target.value}
}))}
 className="text-xs border-b border-[var(--card-border)] focus:border-[#06B6D4] focus:outline-none px-0 py-0.5 bg-transparent"
 />
)}
 </div>
))}
 </div>
 </div>

 {/* Report Preview (Email-Exact) */}
 <div className="bg-[var(--card-bg)] dark:backdrop-blur-xl rounded-lg border border-[var(--card-border)] shadow-sm overflow-hidden flex flex-col h-[800px]">
 <div className="bg-[var(--card-bg)] dark:backdrop-blur-xl px-6 py-4 border-b border-[var(--card-border)] flex justify-between items-center flex-shrink-0">
 <h2 className="text-lg font-medium text-[var(--foreground)]">Email Preview</h2>
 <div className="flex items-center gap-3">
 {hasData && (
 <span className="text-sm text-[var(--nav-text-color)] mr-2">
 {reportData.summary.totalLoads} loads found
 </span>
)}
 <button
 onClick={handleDownloadPDF}
 disabled={!hasData}
 className="inline-flex items-center px-3 py-1.5 border border-[var(--card-border)] shadow-sm text-sm font-medium rounded-md text-[var(--foreground)] bg-[var(--card-bg)] hover:bg-[var(--card-bg)] disabled:opacity-50"
 >
 Download PDF
 </button>
 <button
 onClick={() => setIsEmailModalOpen(true)}
 disabled={!hasData}
 className="inline-flex items-center px-3 py-1.5 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-gradient-to-br from-[#06B6D4] to-[#0891B2] hover:opacity-90 disabled:opacity-50"
 >
 Send Report
 </button>
 </div>
 </div>

 <div className="flex-1 bg-[var(--card-bg)] dark:backdrop-blur-lg p-8 overflow-auto">
 {dateError ? (
 <EmptyState
 icon="calendar"
 title={rangeReversed ?"Invalid date range" :"Select a date"}
 description={dateError}
 />
) : isLoading ? (
 <div className="space-y-6 p-12">
 <SkeletonCard />
 <SkeletonCard />
 </div>
) : !hasData ? (
 <EmptyState icon="search" title="No loads found" description="No loads were found for the selected period. Try a different date range." />
) : (
 <div className="bg-[var(--card-bg)] dark:bg-[var(--card-bg)] shadow-lg mx-auto max-w-[800px] min-h-[1000px]">
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
