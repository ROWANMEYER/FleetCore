"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";

interface AllocationModalProps {
  paymentId: Id<"payments">;
  paymentAmount: number;
  paymentDescription: string;
  paymentReference?: string;
  onClose: () => void;
}

export default function AllocationModal({
  paymentId,
  paymentAmount,
  paymentDescription,
  paymentReference,
  onClose,
}: AllocationModalProps) {
  const [selectedSnapshotId, setSelectedSnapshotId] = useState<Id<"ageSnapshots"> | "">("");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedRowId, setSelectedRowId] = useState<Id<"ageSnapshotRows"> | null>(null);

  // Load Allocations
  const allocations = useQuery(api.finance.allocations.getPaymentAllocations, { paymentId });
  const alreadyAllocated = allocations
    ? allocations.reduce((sum, a) => sum + a.allocatedAmount, 0)
    : 0;
  const remainingAmount = paymentAmount - alreadyAllocated;

  const [allocationAmount, setAllocationAmount] = useState<string>(
    remainingAmount.toFixed(2)
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Load Snapshots
  const snapshots = useQuery(api.finance.getAgeSnapshots.getAgeSnapshots) || [];

  // Load Snapshot Rows (if snapshot selected)
  const rows = useQuery(
    api.finance.getAgeSnapshotRows.getAgeSnapshotRows,
    selectedSnapshotId
      ? { snapshotId: selectedSnapshotId as Id<"ageSnapshots"> }
      : "skip"
  );

  const createAllocation = useMutation(api.finance.allocations.createAllocation);

  // Filter rows based on search
  const filteredRows = rows
    ?.filter((row) => {
      if (!searchTerm) return false;
      const searchLower = searchTerm.toLowerCase();
      return (
        row.clientName.toLowerCase().includes(searchLower) ||
        row.accountNumber.toLowerCase().includes(searchLower)
      );
    })
    .slice(0, 10); // Limit to top 10 matches

  // Derived selected row
  const selectedRow = rows?.find((r) => r._id === selectedRowId);

  // Auto-select latest snapshot
  if (!selectedSnapshotId && snapshots.length > 0) {
    setSelectedSnapshotId(snapshots[0].snapshotId);
  }

  const handleAllocate = async () => {
    if (!selectedSnapshotId || !selectedRowId) return;
    const amount = parseFloat(allocationAmount);
    if (isNaN(amount) || amount <= 0) return;
    if (amount > remainingAmount + 0.01) {
      alert(
        `Cannot allocate more than remaining amount (${remainingAmount.toFixed(2)})`
      );
      return;
    }

    setIsSubmitting(true);
    try {
      await createAllocation({
        paymentId,
        snapshotId: selectedSnapshotId as Id<"ageSnapshots">,
        snapshotRowId: selectedRowId,
        amount,
      });
      onClose();
    } catch (error) {
      console.error(error);
      alert("Failed to allocate payment: " + error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat("en-ZA", {
      style: "currency",
      currency: "ZAR",
    }).format(val);

  // Calculate live preview values
  const allocValue = parseFloat(allocationAmount) || 0;
  const remPayment = Math.max(0, remainingAmount - allocValue);
  const remOutstanding = selectedRow
    ? Math.max(0, selectedRow.totalDue - allocValue)
    : 0;
    
  const selectedSnapshot = snapshots.find(s => s.snapshotId === selectedSnapshotId);

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50 flex items-center justify-center">
      <div className="relative bg-white rounded-lg shadow-xl max-w-lg w-full p-6">
        <h3 className="text-lg font-bold text-gray-900 mb-4">Allocate Payment</h3>

        {/* SECTION 1: Payment Received (Facts) */}
        <div className="bg-blue-50 p-4 rounded-md mb-6 border border-blue-100">
          <h4 className="text-xs font-semibold text-blue-800 uppercase tracking-wide mb-2">
            Payment Received
          </h4>
          <div className="flex justify-between items-end">
            <div>
              <div className="text-2xl font-bold text-blue-900">
                {formatCurrency(paymentAmount)}
              </div>
              <div className="text-xs text-blue-600 mt-1 max-w-xs truncate" title={paymentDescription}>
                {paymentDescription}
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-blue-500">Bank Ref</div>
              <div className="font-mono text-sm text-blue-700">
                {paymentReference || "N/A"}
              </div>
            </div>
          </div>
        </div>

        {remainingAmount <= 0.01 ? (
          <div className="text-center py-4 text-green-600 font-medium bg-green-50 rounded-md border border-green-100">
            Payment fully allocated.
          </div>
        ) : (
          <>
            {/* SECTION 2: Outstanding Debt (Action) */}
            <div className="mb-6 space-y-4">
              <h4 className="text-sm font-medium text-gray-900 border-b pb-2">
                Select Invoice to Pay
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    Snapshot Month
                  </label>
                  <select
                    value={selectedSnapshotId}
                    onChange={(e) => {
                      setSelectedSnapshotId(e.target.value as Id<"ageSnapshots">);
                      setSelectedRowId(null);
                      setSearchTerm("");
                      setAllocationAmount("0.00");
                    }}
                    className="w-full border-gray-300 rounded-md shadow-sm text-sm focus:ring-blue-500 focus:border-blue-500"
                  >
                    {snapshots.map((s) => (
                      <option key={s.snapshotId} value={s.snapshotId}>
                        {s.month}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    Find Customer
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Name or Account #"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full border-gray-300 rounded-md shadow-sm text-sm focus:ring-blue-500 focus:border-blue-500"
                    />
                    {searchTerm && filteredRows && (
                      <div className="absolute w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg z-20 max-h-48 overflow-auto">
                         {filteredRows.length === 0 ? (
                            <div className="p-2 text-gray-500 text-xs">No matches found</div>
                          ) : (
                            filteredRows.map(row => (
                              <div
                                key={row._id}
                                onClick={() => {
                                  setSelectedRowId(row._id);
                                  setSearchTerm(`${row.clientName}`);
                                  // Auto-fill logic
                                  const toAllocate = Math.min(remainingAmount, row.totalDue);
                                  setAllocationAmount(toAllocate.toFixed(2));
                                }}
                                className="p-2 hover:bg-blue-50 cursor-pointer text-sm border-b last:border-b-0"
                              >
                                <div className="font-medium text-gray-900">{row.clientName}</div>
                                <div className="text-gray-500 text-xs flex justify-between">
                                    <span>{row.accountNumber}</span>
                                    <span>Due: {formatCurrency(row.totalDue)}</span>
                                </div>
                              </div>
                            ))
                          )}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {selectedRow ? (
                <div className="bg-gray-50 p-4 rounded-md border border-gray-200 mt-2">
                  <div className="flex justify-between items-center mb-4">
                    <span className="text-sm text-gray-600">
                      Outstanding in <strong>{selectedSnapshot?.month}</strong>
                    </span>
                    <span className="text-lg font-bold text-gray-900">
                      {formatCurrency(selectedRow.totalDue)}
                    </span>
                  </div>

                  <label className="block text-xs font-medium text-gray-500 uppercase mb-1">
                    Amount to Apply
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2 text-gray-500">R</span>
                    <input
                      type="number"
                      step="0.01"
                      max={remainingAmount}
                      value={allocationAmount}
                      onChange={(e) => setAllocationAmount(e.target.value)}
                      className="w-full pl-8 border-gray-300 rounded-md shadow-sm text-lg font-mono focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div className="text-xs text-gray-400 mt-1 text-right">
                    Max allocatable: {formatCurrency(remainingAmount)}
                  </div>
                </div>
              ) : (
                <div className="text-sm text-gray-400 italic p-6 text-center border-2 border-dashed border-gray-100 rounded-md">
                  Select a customer to view their outstanding balance.
                </div>
              )}
            </div>

            {/* SECTION 3: Result Preview (Live) */}
            {selectedRow && (
              <div className="bg-gray-900 text-white p-4 rounded-md mb-6 shadow-inner">
                <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
                  After Allocation
                </h4>
                <div className="grid grid-cols-2 gap-8">
                  <div>
                    <div className="text-xs text-gray-400 mb-1">Remaining Payment</div>
                    <div
                      className={`text-lg font-mono font-medium ${
                        remPayment < 0 ? "text-red-400" : "text-white"
                      }`}
                    >
                      {formatCurrency(remPayment)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-gray-400 mb-1">
                      Remaining Outstanding
                    </div>
                    <div className="text-lg font-mono font-medium text-white">
                      {formatCurrency(remOutstanding)}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        <div className="mt-6 flex justify-end gap-3 pt-4 border-t border-gray-100">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
          >
            Cancel
          </button>
          {remainingAmount > 0.01 && (
            <button
              onClick={handleAllocate}
              disabled={isSubmitting || !selectedRowId}
              className="px-6 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
            >
              {isSubmitting ? "Processing..." : "Confirm Allocation"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
