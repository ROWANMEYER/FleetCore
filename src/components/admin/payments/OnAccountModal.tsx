"use client";

import { useState, useMemo } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";

interface OnAccountModalProps {
  paymentId: Id<"payments">;
  paymentAmount: number;
  paymentDescription: string;
  paymentReference?: string;
  onClose: () => void;
}

export default function OnAccountModal({
  paymentId,
  paymentAmount,
  paymentDescription,
  paymentReference,
  onClose,
}: OnAccountModalProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<{
    accountNumber: string;
    clientName: string;
  } | null>(null);
  const [note, setNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Load Allocations to calculate remaining
  const allocations = useQuery(api.finance.allocations.getPaymentAllocations, { paymentId });
  const alreadyAllocated = allocations
    ? allocations.reduce((sum, a) => sum + a.allocatedAmount, 0)
    : 0;
  const remainingAmount = paymentAmount - alreadyAllocated;

  const [allocationAmount, setAllocationAmount] = useState<string>(
    remainingAmount.toFixed(2)
  );

  // Search Customers from Master Table
  const searchResults = useQuery(api.customers.search, { searchTerm });
  
  const createOnAccountAllocation = useMutation(api.finance.allocations.createOnAccountAllocation);

  const handleAllocate = async () => {
    if (!selectedCustomer) return;
    const amount = parseFloat(allocationAmount);
    if (isNaN(amount) || amount <= 0) return;
    if (amount > remainingAmount + 0.01) {
      alert(`Cannot allocate more than remaining amount (${remainingAmount.toFixed(2)})`);
      return;
    }

    setIsSubmitting(true);
    try {
      await createOnAccountAllocation({
        paymentId,
        amount,
        accountNumber: selectedCustomer.accountNumber,
        clientName: selectedCustomer.clientName,
        notes: note.trim() || undefined,
      });
      onClose();
    } catch (error) {
      console.error(error);
      alert("Failed to create on-account allocation: " + error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(val);

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50 flex items-center justify-center">
      <div className="relative bg-white rounded-lg shadow-xl max-w-lg w-full p-6">
        <h3 className="text-lg font-bold text-gray-900 mb-4">
          Mark Payment On Account
        </h3>

        <div className="bg-blue-50 p-4 rounded-md mb-6 text-sm border border-blue-100">
          <p className="mb-2 text-blue-800">
            This will record the payment as an <strong>Advance</strong> for the selected customer.
            It will NOT reduce the outstanding balance on any specific Age Analysis snapshot, 
            but will appear in reconciliation reports.
          </p>
          <div className="grid grid-cols-2 gap-2 mt-3">
            <span className="text-gray-500">Total Amount:</span>
            <span className="font-medium text-gray-900">
              {formatCurrency(paymentAmount)}
            </span>

            <span className="text-gray-500">Remaining:</span>
            <span
              className={`font-bold ${
                remainingAmount === 0 ? "text-green-600" : "text-blue-600"
              }`}
            >
              {formatCurrency(remainingAmount)}
            </span>
          </div>
        </div>

        {remainingAmount <= 0.01 ? (
          <div className="text-center py-4 text-green-600 font-medium">
            Payment fully allocated.
          </div>
        ) : (
          <div className="space-y-4">
            {/* Customer Search */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Select Customer
              </label>
              {selectedCustomer ? (
                <div className="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-md">
                  <div>
                    <div className="font-bold text-green-900">{selectedCustomer.clientName}</div>
                    <div className="text-xs text-green-700">{selectedCustomer.accountNumber}</div>
                  </div>
                  <button
                    onClick={() => {
                      setSelectedCustomer(null);
                      setSearchTerm("");
                    }}
                    className="text-xs text-red-600 hover:text-red-800 font-medium"
                  >
                    Change
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Search by Name or Account Number..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  />
                  {searchTerm && (
                    <div className="absolute z-10 w-full bg-white shadow-lg max-h-48 overflow-auto border border-gray-200 mt-1 rounded-md">
                      {(!searchResults || searchResults.length === 0) ? (
                        <div className="p-3 text-sm text-gray-500 text-center">
                          No customers found in master list.
                        </div>
                      ) : (
                        searchResults.map((row) => (
                          <div
                            key={row._id}
                            onClick={() => {
                              setSelectedCustomer({
                                clientName: row.name,
                                accountNumber: row.accountNumber || "",
                              });
                            }}
                            className="p-2 hover:bg-blue-50 cursor-pointer text-sm border-b last:border-b-0"
                          >
                            <div className="font-medium">{row.name}</div>
                            <div className="text-gray-500 text-xs">
                              {row.accountNumber || "No Account #"}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Amount */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Amount (ZAR)
              </label>
              <input
                type="number"
                step="0.01"
                max={remainingAmount}
                value={allocationAmount}
                onChange={(e) => setAllocationAmount(e.target.value)}
                className="w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              />
            </div>

            {/* Note */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Note (Optional)
              </label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. Pre-payment for next month"
                rows={2}
                className="w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              />
            </div>
          </div>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleAllocate}
            disabled={
              isSubmitting ||
              remainingAmount <= 0.01 ||
              !selectedCustomer
            }
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? "Saving..." : "Confirm On Account"}
          </button>
        </div>
      </div>
    </div>
  );
}
