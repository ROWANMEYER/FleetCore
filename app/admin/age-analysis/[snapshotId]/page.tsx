"use client";

import { useState, useEffect, useMemo } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";

export default function SnapshotDetailPage() {
  const params = useParams();
  const router = useRouter();
  const snapshotId = typeof params?.snapshotId === "string" ? (params.snapshotId as Id<"ageSnapshots">) : undefined;
  
  const deleteSnapshot = useMutation(api.finance.deleteAgeSnapshot.deleteAgeSnapshot);

  const handleDelete = async () => {
    if (!snapshotId) return;

    if (confirm("This will permanently delete this snapshot and all its rows.\nThis action cannot be undone.\nAre you sure?")) {
      try {
        await deleteSnapshot({ snapshotId });
        router.replace("/admin/age-analysis");
      } catch (error) {
        alert("Failed to delete snapshot: " + error);
      }
    }
  };

  const summary = useQuery(
    api.finance.getAgeSnapshotSummary.getAgeSnapshotSummary,
    snapshotId ? { snapshotId } : "skip"
  );

  if (!summary) {
    return (
      <div className="p-6">
        <div className="mb-6">
          <Link href="/admin/age-analysis" className="text-blue-600 hover:text-blue-800 text-sm font-medium">
            ← Back to List
          </Link>
        </div>
        <div className="text-center py-12 text-gray-500">Loading snapshot summary...</div>
      </div>
    );
  }

  const formatCurrency = (val: number) => 
    new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(val);

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <Link href="/admin/age-analysis" className="text-blue-600 hover:text-blue-800 text-sm font-medium">
              ← Back to List
            </Link>
            <div className="text-sm text-gray-500">
              Imported on {new Date(summary.importedAt).toLocaleDateString()}
            </div>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">
            Age Analysis: {summary.month}
          </h1>
          <p className="text-sm text-gray-500 mt-1">Source: {summary.fileName}</p>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-8">
          <SummaryCard label="120+ Days" value={summary.total120} totalDue={summary.totalDue} />
          <SummaryCard label="90 Days" value={summary.total90} totalDue={summary.totalDue} />
          <SummaryCard label="60 Days" value={summary.total60} totalDue={summary.totalDue} />
          <SummaryCard label="30 Days" value={summary.total30} totalDue={summary.totalDue} />
          <SummaryCard label="Current" value={summary.totalCurrent} totalDue={summary.totalDue} />
          <SummaryCard label="Total Due" value={summary.totalDue} isTotal />
        </div>

        {/* Customer List (Phase 2.3) */}
        <div className="mb-8">
          <h2 className="text-xl font-semibold mb-4 text-gray-800">Customer Details</h2>
          <CustomerTable snapshotId={snapshotId} />
        </div>

        {/* Admin Actions */}
        <div className="mt-12 border-t pt-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Admin Actions</h2>
          <div className="bg-red-50 border border-red-200 rounded-lg p-6">
            <h3 className="text-red-800 font-medium mb-2">Danger Zone</h3>
            <p className="text-red-600 text-sm mb-4">
              Deleting a snapshot will permanently remove the snapshot record and all associated customer rows. 
              This action cannot be undone.
            </p>
            <button
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700 text-white font-medium py-2 px-4 rounded shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
            >
              Delete Snapshot (Admin)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, isTotal = false, totalDue }: { label: string; value: number; isTotal?: boolean; totalDue?: number }) {
  const pct = totalDue && totalDue > 0 ? (value / totalDue) * 100 : 0;
  
  return (
    <div className={`p-4 rounded-lg border shadow-sm ${
      isTotal ? 'bg-blue-50 border-blue-200' : 'bg-white border-gray-200'
    }`}>
      <div className="text-sm font-medium text-gray-500 mb-1">{label}</div>
      <div className={`text-xl font-bold font-mono ${
        isTotal ? 'text-blue-700' : 'text-gray-900'
      }`}>
        {new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(value)}
      </div>
      {!isTotal && (
        <div className="text-xs text-gray-400 mt-2">
          {pct.toFixed(1)}% of total
        </div>
      )}
    </div>
  );
}

function CustomerTable({ snapshotId }: { snapshotId: Id<"ageSnapshots"> | undefined }) {
  const rows = useQuery(
    api.finance.getAgeSnapshotRows.getAgeSnapshotRows,
    snapshotId ? { snapshotId } : "skip"
  );
  const searchParams = useSearchParams();
  const filter = searchParams.get("filter");
  
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  useEffect(() => {
    if (filter === "risk_120") {
      setSortKey("days120");
      setSortDirection("desc");
    } else if (filter === "overdue_60" || filter === "customers_overdue") {
       // Optional: maybe sort by total overdue?
       // For now, let's leave default sort or user sort.
    }
  }, [filter]);

  if (rows === undefined) {
    return <div className="text-center py-12 text-gray-500">Loading customer data...</div>;
  }

  // Apply filters
  const filteredRows = useMemo(() => {
      let r = rows;
      if (filter === "overdue_60" || filter === "customers_overdue") {
          r = r.filter(row => (row.days60 + row.days90 + row.days120) > 0);
      } else if (filter === "risk_120") {
          r = r.filter(row => row.days120 > 0);
      }
      return r;
  }, [rows, filter]);

  if (filteredRows.length === 0) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-12 text-center text-gray-500">
        {rows.length === 0 ? "No customer rows found for this snapshot." : "No customers match the current filter."}
      </div>
    );
  }

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDirection("asc");
    }
  };

  const sortedRows = [...filteredRows].sort((a, b) => {
    if (!sortKey) return 0;

    const valA = (a as any)[sortKey];
    const valB = (b as any)[sortKey];

    if (typeof valA === "number" && typeof valB === "number") {
      return sortDirection === "asc" ? valA - valB : valB - valA;
    }

    const strA = String(valA).toLowerCase();
    const strB = String(valB).toLowerCase();

    if (strA < strB) return sortDirection === "asc" ? -1 : 1;
    if (strA > strB) return sortDirection === "asc" ? 1 : -1;
    return 0;
  });

  const formatCurrency = (val: number) => 
    new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(val);

  const SortIcon = ({ columnKey }: { columnKey: string }) => {
    if (sortKey !== columnKey) return <span className="text-gray-300 ml-1">⇅</span>;
    return <span className="ml-1 text-blue-600">{sortDirection === "asc" ? "▲" : "▼"}</span>;
  };

  const headers = [
    { key: "accountNumber", label: "Account No", align: "left" },
    { key: "clientName", label: "Client Name", align: "left" },
    { key: "days120", label: "120+ Days", align: "right" },
    { key: "days90", label: "90 Days", align: "right" },
    { key: "days60", label: "60 Days", align: "right" },
    { key: "days30", label: "30 Days", align: "right" },
    { key: "current", label: "Current", align: "right" },
    { key: "totalDue", label: "Total Due", align: "right" },
  ];

  const totals = rows.reduce((acc, row) => ({
    days120: acc.days120 + row.days120,
    days90: acc.days90 + row.days90,
    days60: acc.days60 + row.days60,
    days30: acc.days30 + row.days30,
    current: acc.current + row.current,
    totalDue: acc.totalDue + row.totalDue,
  }), { days120: 0, days90: 0, days60: 0, days30: 0, current: 0, totalDue: 0 });

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-sm relative">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              {headers.map((header) => (
                <th 
                  key={header.key}
                  scope="col" 
                  className={`sticky top-0 z-20 bg-gray-50 px-6 py-3 ${header.align === 'right' ? 'text-right' : 'text-left'} text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none transition-colors group shadow-sm`}
                  onClick={() => handleSort(header.key)}
                >
                  <div className={`flex items-center ${header.align === "right" ? "justify-end" : "justify-start"}`}>
                    {header.label}
                    <SortIcon columnKey={header.key} />
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {sortedRows.map((row) => (
              <tr key={row._id} className="hover:bg-blue-50/50 transition-colors">
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{row.accountNumber}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-medium">{row.clientName}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right font-mono">{formatCurrency(row.days120)}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right font-mono">{formatCurrency(row.days90)}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right font-mono">{formatCurrency(row.days60)}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right font-mono">{formatCurrency(row.days30)}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right font-mono">{formatCurrency(row.current)}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right font-mono font-semibold">{formatCurrency(row.totalDue)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-gray-50 font-bold border-t-2 border-gray-200">
            <tr>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">Totals</td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900"></td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right font-mono">{formatCurrency(totals.days120)}</td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right font-mono">{formatCurrency(totals.days90)}</td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right font-mono">{formatCurrency(totals.days60)}</td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right font-mono">{formatCurrency(totals.days30)}</td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right font-mono">{formatCurrency(totals.current)}</td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right font-mono">{formatCurrency(totals.totalDue)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
