"use client";

import { useState } from "react";
import { InvoiceData } from "@/src/pdf/types";
import { formatCurrency, formatDate } from "@/src/pdf/formatters";

interface InvoiceDeliveryPanelProps {
  invoiceData: InvoiceData;
  pdfBlob: Blob;
  onClose: () => void;
}

export default function InvoiceDeliveryPanel({
  invoiceData,
  pdfBlob,
  onClose,
}: InvoiceDeliveryPanelProps) {
  const [copyFeedback, setCopyFeedback] = useState("");

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
    <div className="mt-4 border-t border-gray-100 pt-4 bg-gray-50 rounded-lg p-4 animate-in fade-in slide-in-from-top-2">
      <div className="flex justify-between items-start mb-3">
        <div>
            <h3 className="text-sm font-semibold text-gray-900">Invoice Ready</h3>
            <p className="text-xs text-gray-500 mt-0.5">
                #{invoiceData.invoiceNumber} • {invoiceData.client.name}
            </p>
        </div>
        <button 
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-1 text-lg leading-none"
            aria-label="Close"
        >
            ✕
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <button
          onClick={handleDownload}
          className="flex items-center justify-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded transition-colors"
        >
          <span className="text-sm">⬇️</span>
          Download PDF
        </button>
        
        <button
          onClick={handleCopySummary}
          className="flex items-center justify-center gap-2 px-3 py-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 text-xs font-medium rounded transition-colors relative"
        >
          <span className="text-sm">📋</span>
          {copyFeedback || "Copy Summary"}
        </button>

        <button
          onClick={handleWhatsApp}
          className="flex items-center justify-center gap-2 px-3 py-2 bg-[#25D366] hover:bg-[#128C7E] text-white text-xs font-medium rounded transition-colors"
        >
          <span className="text-sm">💬</span>
          WhatsApp
        </button>
      </div>
    </div>
  );
}
