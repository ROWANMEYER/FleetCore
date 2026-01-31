"use client";

import { useMemo } from "react";

export type KpiType = 
  | "total_outstanding"
  | "overdue_60"
  | "risk_120"
  | "customers_overdue"
  | "on_account"
  | null;

interface DrillDownPanelProps {
  isOpen: boolean;
  onClose: () => void;
  kpiType: KpiType;
  snapshotRows?: any[];
  payments?: any[];
}

const formatCurrency = (val: number) =>
  new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    maximumFractionDigits: 2,
  }).format(val);

const getOldestBucket = (row: any) => {
  if (row.days120 > 0.01) return "120+ Days";
  if (row.days90 > 0.01) return "90 Days";
  if (row.days60 > 0.01) return "60 Days";
  if (row.days30 > 0.01) return "30 Days";
  return "Current";
};

const getBucketBadgeClass = (bucket: string) => {
  switch (bucket) {
    case "120+ Days": return "bg-red-100 text-red-800";
    case "90 Days": return "bg-orange-100 text-orange-800";
    case "60 Days": return "bg-yellow-100 text-yellow-800";
    case "30 Days": return "bg-blue-100 text-blue-800";
    default: return "bg-green-100 text-green-800";
  }
};

export default function DrillDownPanel({
  isOpen,
  onClose,
  kpiType,
  snapshotRows = [],
  payments = [],
  kpiValue
}: DrillDownPanelProps & { kpiValue?: string }) {
  const config = useMemo(() => {
    if (!kpiType) return { title: "", definition: "", data: [], columns: [] };
    
    switch (kpiType) {
      case "total_outstanding":
        return {
          title: "Total Outstanding",
          definition: "All customers with totalDue > 0 in the selected snapshot.",
          data: snapshotRows
            .filter(r => r.totalDue > 0.01)
            .sort((a, b) => b.totalDue - a.totalDue),
          columns: [
            { header: "Account No", accessor: (r: any) => r.accountNumber || "-" },
            { header: "Customer Name", accessor: (r: any) => r.clientName },
            { header: "Total Due", accessor: (r: any) => formatCurrency(r.totalDue), className: "font-mono text-right" },
            { header: "Oldest Bucket", accessor: (r: any) => (
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${getBucketBadgeClass(getOldestBucket(r))}`}>
                    {getOldestBucket(r)}
                </span>
            ) }
          ]
        };
      case "overdue_60": {
        const data = snapshotRows
            .filter(r => (r.days60 + r.days90 + r.days120) > 0.01)
            .map(r => ({ ...r, overdueAmount: r.days60 + r.days90 + r.days120 }))
            .sort((a, b) => b.overdueAmount - a.overdueAmount);
        return {
          title: "Overdue (60+ Days)",
          definition: "Sum of balances where days60 + days90 + days120 > 0.",
          data,
          columns: [
            { header: "Account No", accessor: (r: any) => r.accountNumber || "-" },
            { header: "Customer Name", accessor: (r: any) => r.clientName },
            { header: "Overdue Amount", accessor: (r: any) => formatCurrency(r.overdueAmount), className: "font-mono text-right text-red-600 font-bold" },
            { header: "Oldest Bucket", accessor: (r: any) => (
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${getBucketBadgeClass(getOldestBucket(r))}`}>
                    {getOldestBucket(r)}
                </span>
            ) }
          ]
        };
      }
      case "risk_120": {
        const data = snapshotRows
            .filter(r => r.days120 > 0.01)
            .map(r => ({ 
                ...r, 
                pctTotal: r.totalDue > 0 ? (r.days120 / r.totalDue) * 100 : 0 
            }))
            .sort((a, b) => b.days120 - a.days120);
        return {
          title: "120+ Risk",
          definition: "Balances outstanding more than 120 days.",
          data,
          columns: [
            { header: "Account No", accessor: (r: any) => r.accountNumber || "-" },
            { header: "Customer Name", accessor: (r: any) => r.clientName },
            { header: "120+ Amount", accessor: (r: any) => formatCurrency(r.days120), className: "font-mono text-right text-red-700 font-bold" },
            { header: "% of Total", accessor: (r: any) => `${r.pctTotal.toFixed(1)}%`, className: "text-right text-gray-500" }
          ]
        };
      }
      case "customers_overdue": {
         const data = snapshotRows
            .filter(r => (r.days60 + r.days90 + r.days120) > 0.01)
            .sort((a, b) => (b.days60 + b.days90 + b.days120) - (a.days60 + a.days90 + a.days120));
         return {
          title: "Customers Overdue",
          definition: "Number of customers with any balance in 60+ buckets.",
          data,
          columns: [
            { header: "Account No", accessor: (r: any) => r.accountNumber || "-" },
            { header: "Customer Name", accessor: (r: any) => r.clientName },
            { header: "Age Flags", accessor: (r: any) => (
                <div className="flex gap-1 justify-end">
                    {r.days60 > 0.01 && <span className="px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-800 text-xs">60</span>}
                    {r.days90 > 0.01 && <span className="px-1.5 py-0.5 rounded bg-orange-100 text-orange-800 text-xs">90</span>}
                    {r.days120 > 0.01 && <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-800 text-xs">120+</span>}
                </div>
            ) }
          ]
         };
      }
      case "on_account": {
        const data = payments
            .filter(p => p.hasOnAccount && p.onAccountAmount > 0.01)
            .sort((a, b) => b.paymentDate.localeCompare(a.paymentDate));
        return {
          title: "On Account Balance",
          definition: "Payments marked as On Account (advance payments not allocated to snapshots).",
          data,
          columns: [
            { header: "Customer", accessor: (r: any) => r.onAccountClientNames || "Unassigned" },
            { header: "Credit Amount", accessor: (r: any) => formatCurrency(r.onAccountAmount), className: "font-mono text-right text-blue-600 font-bold" },
            { header: "Date Received", accessor: (r: any) => r.paymentDate },
            { header: "Reference", accessor: (r: any) => r.reference || r.rawDescription }
          ]
        };
      }
      default:
        return { title: "", definition: "", data: [], columns: [] };
    }
  }, [kpiType, snapshotRows, payments]);

  if (!isOpen || !kpiType) return null;

  const handleExport = () => {
    if (!config.data.length) return;
    const headers = config.columns.map((c: any) => c.header).join(",");
    const rows = config.data.map((row: any) => 
        config.columns.map((c: any) => {
             // For export, we need string values, not React nodes
             // This is a quick hack. For production, we should have separate export accessor or logic.
             // But for now, let's try to grab text content or fallback.
             if (c.header === "Oldest Bucket") return `"${getOldestBucket(row)}"`;
             if (c.header === "Age Flags") {
                 const flags = [];
                 if (row.days60 > 0.01) flags.push("60");
                 if (row.days90 > 0.01) flags.push("90");
                 if (row.days120 > 0.01) flags.push("120+");
                 return `"${flags.join("|")}"`;
             }
             if (c.header === "Customer") return `"${row.onAccountClientNames || "Unassigned"}"`;
             if (c.header === "Total Due") return `"${row.totalDue.toFixed(2)}"`;
             if (c.header === "Overdue Amount") return `"${row.overdueAmount.toFixed(2)}"`;
             if (c.header === "120+ Amount") return `"${row.days120.toFixed(2)}"`;
             if (c.header === "Credit Amount") return `"${row.onAccountAmount.toFixed(2)}"`;

             const val = typeof c.accessor === 'function' ? c.accessor(row) : row[c.accessor];
             if (typeof val === 'object') return ""; 
             return `"${val}"`;
        }).join(",")
    ).join("\n");
    
    const blob = new Blob([`${headers}\n${rows}`], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${config.title.replace(/\s+/g, "_")}_Export.csv`;
    a.click();
  };

  return (
    <div className="fixed inset-y-0 right-0 z-40 w-[600px] bg-white shadow-2xl border-l border-gray-200 transform transition-transform duration-300 ease-in-out flex flex-col h-full">
        {/* Header */}
        <div className="px-6 py-6 border-b border-gray-200 bg-gray-50">
            <div className="flex items-start justify-between mb-4">
                <div>
                    <h2 className="text-2xl font-bold text-gray-900">{config.title}</h2>
                    {kpiValue && <div className="text-3xl font-bold text-blue-600 mt-1">{kpiValue}</div>}
                    <p className="mt-2 text-sm text-gray-600 leading-relaxed max-w-md">{config.definition}</p>
                </div>
                <button type="button" className="rounded-md bg-white text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 p-2 border border-gray-200 shadow-sm" onClick={onClose}>
                    <span className="sr-only">Close panel</span>
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>
            
            <div className="flex items-center justify-between mt-6">
                 <div className="flex items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-800 text-xs font-medium">
                        {config.data.length} Contributing Rows
                    </span>
                    {snapshotRows && snapshotRows.length > 0 && (
                        <span className="text-xs text-gray-400">
                             • From Latest Snapshot
                        </span>
                    )}
                 </div>
                 <button onClick={handleExport} className="inline-flex items-center px-3 py-1.5 border border-gray-300 shadow-sm text-xs font-medium rounded text-gray-700 bg-white hover:bg-gray-50 focus:outline-none">
                    <svg className="mr-1.5 h-4 w-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    Export CSV
                 </button>
            </div>
        </div>
        
        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 bg-white">
            <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 rounded-lg">
                <table className="min-w-full divide-y divide-gray-300">
                    <thead className="bg-gray-50 sticky top-0 z-10">
                        <tr>
                            {config.columns.map((col: any, idx: number) => (
                                <th key={idx} scope="col" className={`py-3.5 pl-4 pr-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider ${col.className?.includes("text-right") ? "text-right" : ""}`}>
                                    {col.header}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white">
                        {config.data.map((row: any, rowIdx: number) => (
                            <tr key={rowIdx} className={`hover:bg-gray-50 transition-colors ${rowIdx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                                 {config.columns.map((col: any, colIdx: number) => (
                                    <td key={colIdx} className={`whitespace-nowrap py-3 pl-4 pr-3 text-sm text-gray-700 ${col.className || ""}`}>
                                        {typeof col.accessor === 'function' ? col.accessor(row) : row[col.accessor]}
                                    </td>
                                 ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <div className="mt-8 text-center text-xs text-gray-400 pb-8">
                End of list
            </div>
        </div>
    </div>
  );
}