"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import * as XLSX from "xlsx";

export default function ReconciliationPage() {
  const [leftWidth, setLeftWidth] = useState(50);
  const isDraggingRef = useRef(false);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const totalWidth = window.innerWidth;
      const newLeftWidth = (e.clientX / totalWidth) * 100;
      setLeftWidth(Math.max(20, Math.min(80, newLeftWidth))); // Clamp between 20% and 80%
    };

    const onMouseUp = () => {
      isDraggingRef.current = false;
      document.body.style.cursor = "default";
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);

    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  const startResize = () => {
    isDraggingRef.current = true;
    document.body.style.cursor = "col-resize";
  };

  const unallocatedPayments = useQuery(
    api.finance.allocations.getUnallocatedPaymentsSummary
  );
  const snapshots = useQuery(api.finance.getAgeSnapshots.getAgeSnapshots);

  const [selectedSnapshotId, setSelectedSnapshotId] = useState<
    Id<"ageSnapshots"> | ""
  >("");

  const effectiveSnapshotId =
    selectedSnapshotId ||
    (snapshots && snapshots.length > 0 ? snapshots[0].snapshotId : "");

  const customerReconciliation = useQuery(
    api.finance.allocations.getSnapshotCustomerReconciliation,
    effectiveSnapshotId
      ? { snapshotId: effectiveSnapshotId as Id<"ageSnapshots"> }
      : "skip"
  );

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat("en-ZA", {
      style: "currency",
      currency: "ZAR",
    }).format(val);

  const getPaymentStatus = (allocated: number, remaining: number) => {
    if (allocated === 0) return "Unallocated";
    if (remaining <= 0.01) return "Fully Allocated";
    return "Partially Allocated";
  };

  const handleExportPayments = () => {
    if (!unallocatedPayments || unallocatedPayments.length === 0) return;

    const data = unallocatedPayments.map((p) => ({
      "Payment Date": p.paymentDate,
      "Raw Description": p.rawDescription,
      "Total Amount": p.amount,
      "Allocated Amount": p.allocatedAmount,
      "Remaining Amount": p.remainingAmount,
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Unallocated Payments");
    XLSX.writeFile(wb, "unallocated_payments.xlsx");
  };

  const handleExportCustomers = () => {
    if (!customerReconciliation || customerReconciliation.length === 0) return;

    const data = customerReconciliation.map((row) => ({
      "Customer Name": row.clientName,
      "Account Number": row.accountNumber,
      "Original Due": row.originalTotalDue,
      "Allocated": row.allocatedAmount,
      "Remaining": row.remainingOutstanding,
      "On Account": row.onAccountAmount,
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Outstanding Customers");
    XLSX.writeFile(wb, "outstanding_customers.xlsx");
  };

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-white">
      {/* Page Header - Fixed */}
      <div className="px-8 py-4 border-b flex-shrink-0 bg-white">
        <div>
          <Link
            href="/admin"
            className="text-blue-600 hover:text-blue-800 text-sm font-medium mb-2 block"
          >
            ← Back to Admin
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">
            Reconciliation View
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Read-only reconciliation between bank payments and age analysis.
          </p>
        </div>
      </div>

      {/* Split View Container */}
      <div className="flex-1 flex overflow-hidden w-full relative">
        {/* Left Pane — Unallocated Payments */}
        <div
          className="h-full overflow-y-auto min-h-0 bg-white"
          style={{ width: `${leftWidth}%` }}
        >
          {/* Pane Header (Sticky) */}
          <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between sticky top-0 z-10">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                Unallocated Payments
              </h2>
              <p className="text-xs text-gray-500">
                Payments with remaining amount greater than zero.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleExportPayments}
                disabled={!unallocatedPayments || unallocatedPayments.length === 0}
                className="text-xs font-medium text-blue-600 hover:text-blue-800 disabled:opacity-50"
              >
                Export Excel
              </button>
              <span className="text-sm text-gray-500">
                {unallocatedPayments ? unallocatedPayments.length : 0} payments
              </span>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Raw Description
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Total
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Allocated
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Remaining
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {!unallocatedPayments && (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-6 py-6 text-center text-sm text-gray-400"
                    >
                      Loading payments...
                    </td>
                  </tr>
                )}
                {unallocatedPayments &&
                  unallocatedPayments.map((p) => {
                    const status = getPaymentStatus(
                      p.allocatedAmount,
                      p.remainingAmount
                    );
                    const statusClass =
                      status === "Unallocated"
                        ? "bg-red-50 text-red-700 border-red-200"
                        : status === "Fully Allocated"
                        ? "bg-green-50 text-green-700 border-green-200"
                        : "bg-yellow-50 text-yellow-700 border-yellow-200";
                    return (
                      <tr key={p._id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {p.paymentDate}
                        </td>
                        <td
                          className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-mono max-w-xs truncate"
                          title={p.rawDescription}
                        >
                          {p.rawDescription}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-mono text-gray-900">
                          {formatCurrency(p.amount)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-mono text-blue-700">
                          {formatCurrency(p.allocatedAmount)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-mono font-semibold text-orange-700">
                          {formatCurrency(p.remainingAmount)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-right">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${statusClass}`}
                          >
                            {status}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                {unallocatedPayments && unallocatedPayments.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-6 py-6 text-center text-sm text-gray-400"
                    >
                      All payments are fully allocated.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Resizer */}
        <div
          className="w-2 cursor-col-resize bg-gray-200 hover:bg-gray-300 flex-shrink-0"
          onMouseDown={startResize}
        />

        {/* Right Pane — Outstanding Customers */}
        <div className="h-full overflow-y-auto min-h-0 flex-1 bg-white">
          {/* Pane Header (Sticky) */}
          <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between sticky top-0 z-10">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                Outstanding Customers
              </h2>
              <p className="text-xs text-gray-500">
                Based on selected age analysis snapshot and allocations.
              </p>
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={handleExportCustomers}
                disabled={
                  !customerReconciliation || customerReconciliation.length === 0
                }
                className="text-xs font-medium text-blue-600 hover:text-blue-800 disabled:opacity-50"
              >
                Export Excel
              </button>
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-500">Snapshot</label>
                <select
                  value={effectiveSnapshotId || ""}
                  onChange={(e) =>
                    setSelectedSnapshotId(
                      (e.target.value as Id<"ageSnapshots">) || ""
                    )
                  }
                  className="border-gray-300 rounded-md text-sm shadow-sm focus:ring-blue-500 focus:border-blue-500"
                >
                  {snapshots &&
                    snapshots.map((s) => (
                      <option key={s.snapshotId} value={s.snapshotId}>
                        {s.month}
                      </option>
                    ))}
                </select>
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Account No
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Client Name
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Original Due
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Allocated
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Remaining
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    On Account
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {!customerReconciliation && (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-6 py-6 text-center text-sm text-gray-400"
                    >
                      {snapshots && snapshots.length === 0
                        ? "No age analysis snapshots available."
                        : "Loading customer reconciliation..."}
                    </td>
                  </tr>
                )}
                {customerReconciliation &&
                  customerReconciliation.map((row) => (
                    <tr key={row._id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-mono">
                        {row.accountNumber}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                        {row.clientName}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-mono text-gray-900">
                        {formatCurrency(row.originalTotalDue)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-mono text-blue-700">
                        {formatCurrency(row.allocatedAmount)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-mono font-semibold text-orange-700">
                        {formatCurrency(row.remainingOutstanding)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-mono text-purple-700">
                        {row.onAccountAmount > 0.01 ? formatCurrency(row.onAccountAmount) : "-"}
                      </td>
                    </tr>
                  ))}
                {customerReconciliation &&
                  customerReconciliation.length === 0 && (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-6 py-6 text-center text-sm text-gray-400"
                      >
                        No customers found for this snapshot.
                      </td>
                    </tr>
                  )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
