"use client";

import { useEffect, useState } from "react";
import { InvoiceData } from "@/src/pdf/types";
import { formatCurrency, formatDate } from "@/src/pdf/formatters";
import { X, Download, ClipboardList, MessageSquare } from "lucide-react";
import { registerCaptureEscape } from "./invoiceEscape";

interface InvoiceDeliveryPanelProps {
  invoiceData: InvoiceData;
  pdfBlob: Blob;
  onClose: () => void;
}

/**
 * Invoice delivery modal — pops up on top of the route detail panel once the
 * PDF has been generated. Uses a solid background (never transparent); the
 * backdrop dims the page behind it. Closes via the ✕ button or backdrop click.
 */
export default function InvoiceDeliveryPanel({
  invoiceData,
  pdfBlob,
  onClose,
}: InvoiceDeliveryPanelProps) {
  const [copyFeedback, setCopyFeedback] = useState("");

  // Escape closes this modal first. Registered in the capture phase with
  // stopImmediatePropagation so it wins over the route detail panel's own
  // bubble-phase Escape handler — a single Escape closes the invoice modal,
  // and a second Escape then closes the route panel underneath.
  useEffect(() => registerCaptureEscape(document, onClose), [onClose]);

  const handleDownload = () => {
    // 1. Create Object URL
    const url = URL.createObjectURL(pdfBlob);

    // 2. Create Hidden Link
    const a = document.createElement("a");
    a.href = url;
    a.download = `Invoice_${invoiceData.invoiceNumber}.pdf`;

    // 3. Trigger Download
    document.body.appendChild(a);
    a.click();

    // 4. Cleanup
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const getSummaryText = () => {
    return `*Invoice ${invoiceData.invoiceNumber}*
Client: ${invoiceData.client.name}
Date: ${formatDate(invoiceData.date)}
Total: ${formatCurrency(invoiceData.totals.totalAmount)}`;
  };

  const handleCopySummary = async () => {
    try {
      await navigator.clipboard.writeText(getSummaryText());
      setCopyFeedback("Copied!");
      setTimeout(() => setCopyFeedback(""), 2000);
    } catch (err) {
      console.error("Failed to copy", err);
    }
  };

  const handleWhatsApp = () => {
    const text = encodeURIComponent(getSummaryText());
    window.open(`https://wa.me/?text=${text}`, "_blank");
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      {/* backdrop — dims the page behind, click to close */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* panel — solid background, sits above the route detail panel (z-50) */}
      <div className="relative w-full max-w-md max-h-[90dvh] overflow-y-auto bg-[var(--background)] border border-[var(--card-border)] rounded-xl shadow-2xl animate-in zoom-in-95 duration-200">
        <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3 border-b border-[var(--card-border)]">
          <div>
            <h3 className="text-sm font-bold text-[var(--foreground)]">Invoice Ready</h3>
            <p className="text-xs text-[var(--nav-text-color)] mt-0.5">
              #{invoiceData.invoiceNumber} • {invoiceData.client.name}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-[var(--nav-text-color)] hover:text-[var(--foreground)] hover:bg-[var(--card-border)] p-1.5 rounded-full transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5">
          <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--nav-text-color)] mb-3">
            Deliver invoice
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <button
              onClick={handleDownload}
              className="flex items-center justify-center gap-2 px-3 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg transition-colors active:scale-[0.98]"
            >
              <Download className="w-4 h-4" />
              Download PDF
            </button>

            <button
              onClick={handleCopySummary}
              className="flex items-center justify-center gap-2 px-3 py-2.5 bg-[var(--card-bg)] border border-[var(--card-border)] hover:bg-[var(--card-border)] text-[var(--foreground)] text-xs font-medium rounded-lg transition-colors active:scale-[0.98]"
            >
              <ClipboardList className="w-4 h-4" />
              {copyFeedback || "Copy Summary"}
            </button>

            <button
              onClick={handleWhatsApp}
              className="flex items-center justify-center gap-2 px-3 py-2.5 bg-[#25D366] hover:bg-[#128C7E] text-white text-xs font-medium rounded-lg transition-colors active:scale-[0.98]"
            >
              <MessageSquare className="w-4 h-4" />
              WhatsApp
            </button>
          </div>

          <div className="mt-4 pt-3 border-t border-[var(--card-border)] text-[11px] text-[var(--nav-text-color)] space-y-1">
            <div className="flex justify-between gap-4">
              <span>Invoice</span>
              <span className="font-semibold text-[var(--foreground)]">#{invoiceData.invoiceNumber}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span>Date</span>
              <span className="font-semibold text-[var(--foreground)]">{formatDate(invoiceData.date)}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span>Total</span>
              <span className="font-semibold text-[var(--foreground)]">{formatCurrency(invoiceData.totals.totalAmount)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
