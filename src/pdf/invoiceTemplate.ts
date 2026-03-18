import jsPDF from "jspdf";
import { formatCurrency, formatDate, formatDescription, clampText } from "./formatters";
import { InvoiceData } from "./types";

export const generateInvoicePDF = (data: InvoiceData): jsPDF => {
  // 1. Initialize with Points (pt) for absolute precision
  // [LAYOUT CRITICAL] Do not change unit to 'mm' or 'px'. 
  // All coordinates are manually tuned for 'pt'.
  const doc = new jsPDF({ unit: "pt", format: "a4" });

  // --- Layout Constants (Fixed Zones) ---
  // [LAYOUT CRITICAL] Fixed zones ensure no overlapping. 
  // Do NOT convert to relative flow logic.
  const LEFT_MARGIN = 40;
  const RIGHT_MARGIN = 555; // Used as right anchor for aligned text
  
  const ZONE_BILL_TO_Y = 140;
  const ZONE_DESC_Y = 220;
  const ZONE_TOTALS_Y = 300; // Isolated Totals Block (Below Description)
  const ZONE_BANKING_Y = 380;

  const DESC_MAX_WIDTH = 350;
  
  // --- Static Data ---
  const COMPANY_NAME = "FleetCore Logistics (Pty) Ltd";
  const COMPANY_REG = "2024/123456/07";
  const COMPANY_VAT = "4000123456";
  const COMPANY_ADDRESS = "123 Transport Way, George, 6530";
  const BANK_DETAILS = {
    bank: "First National Bank",
    account: "1234567890",
    branch: "210114",
    name: "FleetCore Logistics"
  };

  // --- 1. Header Section ---
  // Left: Company Info
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text(COMPANY_NAME, LEFT_MARGIN, 40);

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(COMPANY_ADDRESS, LEFT_MARGIN, 52); // lineGap ~12
  doc.text(`Reg: ${COMPANY_REG}`, LEFT_MARGIN, 64);
  doc.text(`VAT: ${COMPANY_VAT}`, LEFT_MARGIN, 76);

  // Right: Invoice Info
  doc.setFontSize(20);
  doc.setFont("helvetica", "bold");
  doc.text("PROFORMA INVOICE", RIGHT_MARGIN, 40, { align: "right" });

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`Invoice #: ${data.invoiceNumber}`, RIGHT_MARGIN, 60, { align: "right" });
  doc.text(`Date: ${formatDate(data.date)}`, RIGHT_MARGIN, 74, { align: "right" });

  // --- 2. Bill To Section ---
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("BILL TO:", LEFT_MARGIN, ZONE_BILL_TO_Y);

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(clampText(data.client.name), LEFT_MARGIN, ZONE_BILL_TO_Y + 14);
  doc.text(clampText(data.client.vatNumber ? `VAT: ${data.client.vatNumber}` : ""), LEFT_MARGIN, ZONE_BILL_TO_Y + 26);
  doc.text(clampText(data.client.address), LEFT_MARGIN, ZONE_BILL_TO_Y + 38);
  doc.text(clampText(data.client.contactPerson ? `Attn: ${data.client.contactPerson}` : ""), LEFT_MARGIN, ZONE_BILL_TO_Y + 50);

  // --- 3. Description & Line Items (The Flexible Zone) ---
  // [LAYOUT CRITICAL] Constrained to max 2 lines to prevent overlap with Totals
  // Header
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setFillColor(245, 245, 245); // Light gray background
  doc.rect(LEFT_MARGIN - 5, ZONE_DESC_Y - 15, DESC_MAX_WIDTH + 10, 20, "F"); // Background for header
  doc.text("DESCRIPTION", LEFT_MARGIN, ZONE_DESC_Y);
  
  doc.text("AMOUNT (ZAR)", RIGHT_MARGIN, ZONE_DESC_Y, { align: "right" });

  // Content
  // We assume a single main line item for now as per previous logic, 
  // but loop if needed (though layout constants are somewhat fixed)
  const item = data.lineItems[0];
  if (item) {
    // Draw Description
    doc.setFontSize(9.5); // User requested 9.5pt
    doc.setFont("helvetica", "normal");
    
    const descY = ZONE_DESC_Y + 20;
    // Format description (insert newlines, etc.)
    const formattedDesc = formatDescription(item.description);
    const baseParts = formattedDesc.split("\n");
    
    const wrapped: string[] = [];
    for (const part of baseParts) {
      const lines = doc.splitTextToSize(part, DESC_MAX_WIDTH);
      for (const l of lines) {
        wrapped.push(l);
        if (wrapped.length >= 2) break;
      }
      if (wrapped.length >= 2) break;
    }
    const line1 = clampText(wrapped[0] ?? "");
    const line2 = clampText(wrapped[1] ?? "");
    doc.text(line1, LEFT_MARGIN, descY);
    doc.text(line2, LEFT_MARGIN, descY + 12);
    const subDescY = descY + 24;
    doc.setFontSize(8);
    doc.setTextColor(100);
    doc.text(clampText(item.subDescription), LEFT_MARGIN, subDescY);
    doc.setTextColor(0);

    // Draw Line Item Amount (Aligned with start of description)
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(formatCurrency(item.amount), RIGHT_MARGIN, descY, { align: "right" });
  }

  // --- 4. Totals Block (ISOLATED) ---
  // Fixed position, independent of description height
  // [LAYOUT CRITICAL] Must remain at fixed Y to match pre-printed stationery style
  const totalsStartY = ZONE_TOTALS_Y; 
  const totalsLabelX = RIGHT_MARGIN - 100; // Anchor for labels
  const totalsValueX = RIGHT_MARGIN;       // Anchor for values

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");

  // Subtotal
  doc.text("Subtotal:", totalsLabelX, totalsStartY, { align: "right" });
  doc.text(formatCurrency(data.totals.subtotal), totalsValueX, totalsStartY, { align: "right" });

  // VAT
  doc.text("VAT @ 15%:", totalsLabelX, totalsStartY + 14, { align: "right" });
  doc.text(formatCurrency(data.totals.vatAmount), totalsValueX, totalsStartY + 14, { align: "right" });

  // TOTAL
  doc.setFontSize(14); // User: "10-15% larger" -> Bumped to 14pt
  doc.setFont("helvetica", "bold");
  doc.text("TOTAL:", totalsLabelX, totalsStartY + 30, { align: "right" });
  doc.text(formatCurrency(data.totals.totalAmount), totalsValueX, totalsStartY + 30, { align: "right" });

  // --- 5. Banking Details ---
  // User: y=360
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("BANKING DETAILS:", LEFT_MARGIN, ZONE_BANKING_Y);

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(`Bank: ${BANK_DETAILS.bank}`, LEFT_MARGIN, ZONE_BANKING_Y + 12);
  doc.text(`Account Name: ${BANK_DETAILS.name}`, LEFT_MARGIN, ZONE_BANKING_Y + 24);
  doc.text(`Account No: ${BANK_DETAILS.account}`, LEFT_MARGIN, ZONE_BANKING_Y + 36);
  doc.text(`Branch Code: ${BANK_DETAILS.branch}`, LEFT_MARGIN, ZONE_BANKING_Y + 48);
  
  // --- 6. Footer ---
  doc.setFontSize(8);
  doc.setTextColor(120);
  doc.text("Thank you for your business.", LEFT_MARGIN, 770);
  doc.setTextColor(0);

  // --- Save ---
  doc.save(`Proforma_${data.client.name}_${data.invoiceNumber}.pdf`);
  return doc;
};
