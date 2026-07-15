 "use client";

import { useState, useEffect, Suspense } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import AllocationModal from "@/src/components/admin/payments/AllocationModal";
import OnAccountModal from "@/src/components/admin/payments/OnAccountModal";
import { Id } from "@/convex/_generated/dataModel";

type SortField =
  | "none"
  | "paymentDate"
  | "amount"
  | "allocatedAmount"
  | "reference"
  | "allocationStatus";

type AllocationStatusFilter =
  | "all"
  | "unallocated"
  | "partiallyAllocated"
  | "fullyAllocated"
  | "onAccount";

interface PaymentWithStatus {
  _id: Id<"payments">;
  paymentDate: string;
  amount: number;
  reference?: string | null;
  rawDescription: string;
  source: string;
  flags: string[];
  importedAt: number;
  notes?: string | null;
  allocatedAmount: number;
  remainingAmount: number;
  allocationStatus: "Unallocated" | "Partially Allocated" | "Fully Allocated";
  hasOnAccount?: boolean;
}

function PaymentsPageContent() {
  const searchParams = useSearchParams();
  const initialFilter = searchParams.get("filter") === "on_account" ? "onAccount" : "all";

  const [date, setDate] = useState<string>(
    new Date().toISOString().split("T")[0]
  );
  const [pasteContent, setPasteContent] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  const [selectedPayment, setSelectedPayment] = useState<{
    id: Id<"payments">;
    amount: number;
    description: string;
    reference?: string;
  } | null>(null);

  const [onAccountPayment, setOnAccountPayment] = useState<{
    id: Id<"payments">;
    amount: number;
    description: string;
    reference?: string;
  } | null>(null);

  const [sortField, setSortField] = useState<SortField>("none");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [statusFilter, setStatusFilter] =
    useState<AllocationStatusFilter>(initialFilter as AllocationStatusFilter);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [editPaymentDate, setEditPaymentDate] = useState("");
  const [referenceFilter, setReferenceFilter] = useState("");
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");
  const [editingPaymentId, setEditingPaymentId] =
    useState<Id<"payments"> | null>(null);
  const [editReference, setEditReference] = useState("");
  const [editFlags, setEditFlags] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [deletingPaymentId, setDeletingPaymentId] =
    useState<Id<"payments"> | null>(null);

  const createPayments = useMutation(api.finance.payments.createPayments);
  const updatePayment = useMutation(
    api.finance.payments.updatePaymentMetadata
  );
  const deletePayment = useMutation(
    api.finance.payments.deletePaymentIfUnallocated
  );

  const payments =
    (useQuery(api.finance.payments.getPaymentsWithAllocationStatus) as
      | PaymentWithStatus[]
      | undefined) || [];

  useEffect(() => {
    const filter = searchParams.get("filter");
    if (filter === "on_account") {
      setStatusFilter("onAccount");
    }
  }, [searchParams]);

  const handleImport = async () => {
    if (!pasteContent.trim()) return;

    const formattedDate = new Date(date).toLocaleDateString("en-ZA", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });

    const confirmed = window.confirm(
      `Confirm Payment Date\n\n` +
        `You are about to import bank payments with the date:\n\n` +
        `📅 ${formattedDate}\n\n` +
        `This date will be applied to all pasted payments and cannot be changed in bulk later.\n\n` +
        `Please confirm this date is correct.`
    );

    if (!confirmed) return;

    setIsProcessing(true);

    try {
      const lines = pasteContent
        .split(/\r?\n/)
        .filter((line) => line.trim());
      const parsedPayments = lines.map((line) => parseLine(line, date));

      const batchSignatures = new Set<string>();
      parsedPayments.forEach((p) => {
        const signature = `${p.paymentDate}-${p.amount}-${p.reference}`;
        if (batchSignatures.has(signature)) {
          p.flags.push("possible_duplicate_in_batch");
        }
        batchSignatures.add(signature);
      });

      await createPayments({ payments: parsedPayments });
      setPasteContent("");
    } catch (error) {
      console.error(error);
      alert("Failed to import payments.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSort = (field: SortField) => {
    if (field === "none") {
      setSortField("none");
      return;
    }
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const filteredAndSortedPayments: PaymentWithStatus[] = (() => {
    let result = payments.slice();

    if (statusFilter !== "all") {
      result = result.filter((p) => {
        if (statusFilter === "unallocated") {
          return p.allocationStatus === "Unallocated";
        }
        if (statusFilter === "fullyAllocated") {
          return p.allocationStatus === "Fully Allocated";
        }
        if (statusFilter === "onAccount") {
          return p.hasOnAccount === true;
        }
        return p.allocationStatus === "Partially Allocated";
      });
    }

    if (fromDate) {
      result = result.filter((p) => p.paymentDate >= fromDate);
    }
    if (toDate) {
      result = result.filter((p) => p.paymentDate <= toDate);
    }

    if (referenceFilter.trim()) {
      const needle = referenceFilter.trim().toLowerCase();
      result = result.filter((p) =>
        (p.reference || "").toLowerCase().includes(needle)
      );
    }

    const min = minAmount.trim() ? parseFloat(minAmount) : undefined;
    const max = maxAmount.trim() ? parseFloat(maxAmount) : undefined;
    if (min !== undefined && !Number.isNaN(min)) {
      result = result.filter((p) => p.amount >= min);
    }
    if (max !== undefined && !Number.isNaN(max)) {
      result = result.filter((p) => p.amount <= max);
    }

    if (sortField !== "none") {
      result.sort((a, b) => {
        let cmp = 0;
        if (sortField === "paymentDate") {
          cmp = a.paymentDate.localeCompare(b.paymentDate);
        } else if (sortField === "amount") {
          cmp = a.amount - b.amount;
        } else if (sortField === "allocatedAmount") {
          cmp = a.allocatedAmount - b.allocatedAmount;
        } else if (sortField === "reference") {
          const aRef = a.reference || "";
          const bRef = b.reference || "";
          cmp = aRef.localeCompare(bRef);
        } else if (sortField === "allocationStatus") {
          cmp = a.allocationStatus.localeCompare(b.allocationStatus);
        }
        return sortDirection === "asc" ? cmp : -cmp;
      });
    }

    return result;
  })();

  const beginEdit = (payment: PaymentWithStatus) => {
    setEditingPaymentId(payment._id);
    setEditPaymentDate(payment.paymentDate);
    setEditReference(payment.reference || "");
    setEditFlags(payment.flags.join(", "));
    setEditNotes(payment.notes || "");
  };

  const cancelEdit = () => {
    setEditingPaymentId(null);
    setEditPaymentDate("");
    setEditReference("");
    setEditFlags("");
    setEditNotes("");
  };

  const handleSaveEdit = async (payment: PaymentWithStatus) => {
    if (editingPaymentId === null) return;
    const isAllocated = payment.allocationStatus !== "Unallocated";
    const dateChanged = editPaymentDate && editPaymentDate !== payment.paymentDate;
    if (isAllocated && dateChanged) {
      const confirmed = window.confirm(
        "You are changing the payment date of an allocated payment. This will not affect allocations or amounts, but may change reporting and filters. Continue?"
      );
      if (!confirmed) {
        return;
      }
    }
    setIsSaving(true);
    try {
      const flagsArray = editFlags
        .split(",")
        .map((f) => f.trim())
        .filter((f) => f.length > 0);

      await updatePayment({
        paymentId: payment._id,
        paymentDate: editPaymentDate || payment.paymentDate,
        reference: editReference.trim() || undefined,
        flags: flagsArray,
        notes: editNotes.trim() || undefined,
      });

      cancelEdit();
    } catch (error: any) {
      alert(error?.message || "Failed to update payment.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (payment: PaymentWithStatus) => {
    const confirmed = window.confirm(
      "Are you sure you want to delete this payment? This is only allowed for payments with zero allocations."
    );
    if (!confirmed) return;

    setDeletingPaymentId(payment._id);
    try {
      await deletePayment({ paymentId: payment._id });
    } catch (error: any) {
      alert(error?.message || "Failed to delete payment.");
    } finally {
      setDeletingPaymentId(null);
    }
  };

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("en-ZA", {
      style: "currency",
      currency: "ZAR",
    }).format(value);

  const renderSortLabel = (label: string, field: SortField) => {
    const isActive = sortField === field;
    const directionSymbol =
      !isActive || sortDirection === "asc" ? "▲" : "▼";
    return (
      <button
        type="button"
        onClick={() => handleSort(field)}
        className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 uppercase tracking-wider hover:text-gray-700"
      >
        <span>{label}</span>
        {field !== "none" && (
          <span className={`text-[10px] ${isActive ? "opacity-100" : "opacity-40"}`}>
            {directionSymbol}
          </span>
        )}
      </button>
    );
  };

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <Link
            href="/admin"
            className="text-blue-600 hover:text-blue-800 text-sm font-medium mb-2 block"
          >
            ← Back to Admin
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">
            Bank Payment Intake
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Paste raw bank statement lines below.
          </p>
        </div>
      </div>

      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 mb-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Payment Date
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Paste Payments
          </label>
          <textarea
            value={pasteContent}
            onChange={(e) => setPasteContent(e.target.value)}
            rows={10}
            className="w-full font-mono text-sm border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 p-2"
            placeholder="Example: COALITION TRADING R 9,200.00 1418"
          />
        </div>

        <button
          onClick={handleImport}
          disabled={isProcessing || !pasteContent.trim()}
          className="bg-blue-600 text-white px-4 py-2 rounded-md font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isProcessing ? "Importing..." : "Import Payments"}
        </button>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
          <h2 className="text-lg font-semibold text-gray-900">
            Recent Imports
          </h2>
          <span className="text-sm text-gray-500">
            {payments.length} payments
          </span>
        </div>

        <div className="px-6 py-4 border-b border-gray-100 bg-white">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Allocation Status
              </label>
              <select
                value={statusFilter}
                onChange={(e) =>
                  setStatusFilter(e.target.value as AllocationStatusFilter)
                }
                className="w-full border-gray-300 rounded-md shadow-sm text-xs py-1.5"
              >
                <option value="all">All</option>
                <option value="unallocated">Unallocated</option>
                <option value="partiallyAllocated">Partially allocated</option>
                <option value="fullyAllocated">Fully allocated</option>
                <option value="onAccount">Has On Account (Unapplied)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Date Range
              </label>
              <div className="flex gap-2">
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="w-full border-gray-300 rounded-md shadow-sm text-xs py-1.5"
                />
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="w-full border-gray-300 rounded-md shadow-sm text-xs py-1.5"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Reference contains
              </label>
              <input
                type="text"
                value={referenceFilter}
                onChange={(e) => setReferenceFilter(e.target.value)}
                className="w-full border-gray-300 rounded-md shadow-sm text-xs py-1.5"
                placeholder="Reference"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Amount range
              </label>
              <div className="flex gap-2">
                <input
                  type="number"
                  value={minAmount}
                  onChange={(e) => setMinAmount(e.target.value)}
                  className="w-full border-gray-300 rounded-md shadow-sm text-xs py-1.5"
                  placeholder="Min"
                />
                <input
                  type="number"
                  value={maxAmount}
                  onChange={(e) => setMaxAmount(e.target.value)}
                  className="w-full border-gray-300 rounded-md shadow-sm text-xs py-1.5"
                  placeholder="Max"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left">
                  {renderSortLabel("Date", "paymentDate")}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Raw Description
                </th>
                <th className="px-6 py-3 text-right">
                  {renderSortLabel("Amount", "amount")}
                </th>
                <th className="px-6 py-3 text-right">
                  {renderSortLabel("Allocated", "allocatedAmount")}
                </th>
                <th className="px-6 py-3 text-left">
                  {renderSortLabel("Status", "allocationStatus")}
                </th>
                <th className="px-6 py-3 text-right">
                  {renderSortLabel("Reference", "reference")}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Flags
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Notes
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredAndSortedPayments.map((payment) => {
                const isEditing =
                  editingPaymentId !== null &&
                  payment._id === editingPaymentId;
                const allocated = payment.allocatedAmount ?? 0;
                const isUnallocated = allocated === 0;
                const hasAllocations = !isUnallocated;

                const isFullyAllocated =
                  payment.allocationStatus === "Fully Allocated";
                const statusClass = isUnallocated
                  ? "bg-red-50 text-red-700 border-red-200"
                  : isFullyAllocated
                  ? "bg-green-50 text-green-700 border-green-200"
                  : "bg-yellow-50 text-yellow-700 border-yellow-200";

                const showAllocatedAmount = payment.allocatedAmount > 0.01;
                const showRemainingAmount =
                  Math.abs(payment.remainingAmount) > 0.01 &&
                  payment.allocatedAmount > 0;

                return (
                  <tr
                    key={payment._id}
                    className="hover:bg-gray-50 transition-colors"
                  >
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {isEditing ? (
                        <input
                          type="date"
                          value={editPaymentDate}
                          onChange={(e) => setEditPaymentDate(e.target.value)}
                          className="border-gray-300 rounded-md shadow-sm text-xs py-1 px-2"
                        />
                      ) : (
                        payment.paymentDate
                      )}
                    </td>
                    <td
                      className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-mono max-w-xs truncate"
                      title={payment.rawDescription}
                    >
                      {payment.rawDescription}
                    </td>
                    <td
                      className={`px-6 py-4 whitespace-nowrap text-sm text-right font-mono font-medium ${
                        payment.amount <= 0
                          ? "text-red-600"
                          : "text-gray-900"
                      }`}
                    >
                      {formatCurrency(payment.amount)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-mono">
                      {showAllocatedAmount ? (
                        <div className="flex flex-col items-end">
                          <span
                            className={
                              isFullyAllocated
                                ? "text-green-600 font-bold"
                                : "text-blue-600"
                            }
                          >
                            {formatCurrency(payment.allocatedAmount)}
                          </span>
                          {showRemainingAmount && (
                            <span className="text-xs text-gray-400">
                              Rem: {formatCurrency(payment.remainingAmount)}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${statusClass}`}
                      >
                        {payment.allocationStatus}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-mono">
                      {isEditing ? (
                        <input
                          type="text"
                          value={editReference}
                          onChange={(e) => setEditReference(e.target.value)}
                          className="w-full border-gray-300 rounded-md shadow-sm text-xs py-1 px-2"
                          placeholder="Reference"
                        />
                      ) : (
                        <span
                          className="text-gray-600"
                        >
                          {payment.reference || (
                            <span className="text-gray-300">-</span>
                          )}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      {isEditing ? (
                        <input
                          type="text"
                          value={editFlags}
                          onChange={(e) => setEditFlags(e.target.value)}
                          className="w-full border-gray-300 rounded-md shadow-sm text-xs py-1 px-2"
                          placeholder="comma,separated,flags"
                        />
                      ) : (
                        <div className="flex gap-1 flex-wrap">
                          {payment.flags.length > 0 ? (
                            payment.flags.map((flag, i) => (
                              <span
                                key={i}
                                className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800"
                                title={flag}
                              >
                                {flag.replace(/_/g, " ")}
                              </span>
                            ))
                          ) : (
                            <span className="text-green-600 text-xs font-medium bg-green-50 px-2 py-0.5 rounded">
                              OK
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {isEditing ? (
                        <input
                          type="text"
                          value={editNotes}
                          onChange={(e) => setEditNotes(e.target.value)}
                          className="w-full border-gray-300 rounded-md shadow-sm text-xs py-1 px-2"
                          placeholder="Notes (optional)"
                        />
                      ) : payment.notes && payment.notes.trim() ? (
                        <span className="block max-w-xs truncate" title={payment.notes}>
                          {payment.notes}
                        </span>
                      ) : (
                        <span className="text-gray-300 text-xs">No notes</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right">
                      <div className="flex items-center justify-end gap-3">
                        {hasAllocations && !isEditing && (
                          <span className="text-xs text-gray-400">
                            Allocated (amount locked)
                          </span>
                        )}
                        {!isEditing && (
                          <>
                            <button
                              type="button"
                              onClick={() => beginEdit(payment)}
                              className="text-xs text-gray-700 hover:text-gray-900 font-medium"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(payment)}
                              disabled={
                                hasAllocations ||
                                deletingPaymentId === payment._id
                              }
                              className="text-xs text-red-600 hover:text-red-800 font-medium disabled:opacity-50"
                            >
                              {deletingPaymentId === payment._id
                                ? "Deleting..."
                                : hasAllocations
                                ? "Cannot delete (allocated)"
                                : "Delete"}
                            </button>
                          </>
                        )}
                        {isEditing && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleSaveEdit(payment)}
                              disabled={isSaving}
                              className="text-xs text-blue-600 hover:text-blue-800 font-medium disabled:opacity-50"
                            >
                              {isSaving ? "Saving..." : "Save"}
                            </button>
                            <button
                              type="button"
                              onClick={cancelEdit}
                              className="text-xs text-gray-500 hover:text-gray-700 font-medium"
                            >
                              Cancel
                            </button>
                          </>
                        )}
                        <button
                          type="button"
                          onClick={() =>
                            setOnAccountPayment({
                              id: payment._id,
                              amount: payment.amount,
                              description: payment.rawDescription,
                              reference: payment.reference || undefined,
                            })
                          }
                          className="text-xs font-medium text-purple-600 hover:text-purple-900 bg-purple-50 px-2 py-1 rounded"
                        >
                          On Acct
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setSelectedPayment({
                              id: payment._id,
                              amount: payment.amount,
                              description: payment.rawDescription,
                              reference: payment.reference || undefined,
                            })
                          }
                          className="text-blue-600 hover:text-blue-900 font-medium text-xs"
                        >
                          Allocate
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredAndSortedPayments.length === 0 && (
                <tr>
                  <td
                    colSpan={9}
                    className="px-6 py-12 text-center text-gray-500"
                  >
                    No payments imported yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedPayment && (
        <AllocationModal
          paymentId={selectedPayment.id}
          paymentAmount={selectedPayment.amount}
          paymentDescription={selectedPayment.description}
          paymentReference={selectedPayment.reference}
          onClose={() => setSelectedPayment(null)}
        />
      )}

      {onAccountPayment && (
        <OnAccountModal
          paymentId={onAccountPayment.id}
          paymentAmount={onAccountPayment.amount}
          paymentDescription={onAccountPayment.description}
          paymentReference={onAccountPayment.reference}
          onClose={() => setOnAccountPayment(null)}
        />
      )}
    </div>
  );
}

function parseLine(line: string, defaultDate: string) {
  const flags: string[] = [];
  const trimmedLine = line.trim();
  
  // 1. Reference Extraction (Last token if numeric)
  const tokens = trimmedLine.split(/\s+/);
  let reference: string | undefined;
  let textForAmount = trimmedLine;

  if (tokens.length > 0) {
    const lastToken = tokens[tokens.length - 1];
    // Check if numeric (digits only)
    if (/^\d+$/.test(lastToken)) {
      reference = lastToken;
      // Remove reference from text used for amount extraction
      textForAmount = trimmedLine.substring(0, trimmedLine.lastIndexOf(lastToken)).trim();
    } else {
      flags.push("missing_reference");
    }
  }

  // 2. Amount Extraction
  // Look for currency-like patterns: R 1,234.56 or 1,234.56 or -1,234.56
  // Regex matches:
  // - Optional negative sign
  // - Optional R with optional space
  // - Digits and commas
  // - Mandatory decimal point and 2 digits
  const amountRegex = /(-?)(?:R\s?)?([\d,]+\.\d{2})/;
  const match = textForAmount.match(amountRegex);
  
  let amount = 0;
  if (match) {
    const isNegative = match[1] === "-";
    const cleanAmount = match[2].replace(/,/g, '');
    amount = parseFloat(cleanAmount);
    if (isNegative) amount = -amount;
  } else {
    flags.push("missing_amount");
  }

  // Validation Flags
  if (amount <= 0 && !flags.includes("missing_amount")) {
    flags.push("zero_or_negative_amount");
  }
  if (amount > 1000000) {
    flags.push("outlier_amount");
  }

  return {
    paymentDate: defaultDate,
    amount,
    reference,
    rawDescription: trimmedLine,
    source: "manual-paste",
    flags,
  };
}

export default function PaymentsPage() {
  return (
    <Suspense fallback={null}>
      <PaymentsPageContent />
    </Suspense>
  );
}
