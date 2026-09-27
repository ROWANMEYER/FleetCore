import jsPDF from "jspdf";
import type { RateSheetData } from "./types";
import { formatCurrency } from "./formatters";

/** Fixed A4 zones in the existing rate-sheet units. Each page has three rate columns. */
const W = 210;
const ROWS_PER_PAGE = 21;

export const generateRateSheetPDF = (data: RateSheetData): jsPDF => {
  if (data.calculationProblem) throw new Error(data.calculationProblem);
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const sf = (style: "normal" | "bold" | "italic" | "bolditalic", size: number) => { doc.setFont("helvetica", style); doc.setFontSize(size); };
  type Align = "left" | "right" | "center";
  const at = (x: number, y: number, text: string, opts?: { align?: Align }) => doc.text(text, x, y, opts?.align ? { align: opts.align } : undefined);
  const clamp = (text: string, max: number) => text.length > max ? `${text.slice(0, max - 1)}…` : text;
  const formatRateCell = (value: number | null | undefined): string => {
    if (value === null || value === undefined) return "";
    return formatCurrency(value);
  };

  const effectiveRateLabels = data.rateLabels && data.rateLabels.length ? data.rateLabels : ["", "", ""];
  const allSameOrigin = data.lanes.length > 0 && data.lanes.every(lane => lane.loadingPoint && lane.loadingPoint.trim() === data.lanes[0].loadingPoint.trim());
  const originHeading = allSameOrigin && data.lanes[0]?.loadingPoint ? `FROM ${data.lanes[0].loadingPoint.trim().toUpperCase()} TO:` : "Route:";
  const customerName = data.customer.name || "";
  const contactPerson = data.customer.contactPerson || "";
  const email = data.customer.email || "";
  const phone = data.customer.phone || "";
  const address = data.customer.address || "";

  const pageCount = Math.max(1, Math.ceil(data.lanes.length / ROWS_PER_PAGE));
  for (let page = 0; page < pageCount; page++) {
  if (page > 0) doc.addPage();
  const pageLanes = data.lanes.slice(page * ROWS_PER_PAGE, (page + 1) * ROWS_PER_PAGE);
  sf("bolditalic", 11);
  at(W / 2, 18, "ANTON LE ROUX", { align: "center" });
  sf("normal", 9);
  at(W / 2 + 12, 25, "VERVOER (EDMS)BPK.", { align: "center" });
  at(W / 2 + 12, 30, "TRANSPORT (PTY)LTD.", { align: "center" });

  sf("bold", 9);
  at(20, 27, "Telephone:");
  sf("normal", 9);
  at(43, 27, "044 874 2292");
  sf("bold", 9);
  at(20, 32, "Cell:");
  sf("normal", 9);
  at(43, 32, "083 653 2292");
  sf("bold", 9);
  at(20, 37, "E-mail:");
  sf("normal", 8);
  at(43, 37, "victor@alrtpt.co.za");
  at(43, 42, "morney@alrtpt.co.za");

  sf("bold", 10);
  at(20, 55, "TO:");
  sf("normal", 10);
  at(33, 55, customerName || "");
  if (contactPerson) {
    sf("bold", 10);
    at(20, 60, "ATTENTION:");
    sf("normal", 10);
    at(45, 60, contactPerson);
  }
  if (phone) {
    sf("bold", 10);
    at(20, 65, "PHONE:");
    sf("normal", 10);
    at(42, 65, phone);
  }
  if (email) {
    sf("bold", 10);
    at(20, 70, "E-MAIL:");
    sf("normal", 9);
    at(36, 70, email);
  }
  if (address) {
    sf("normal", 9);
    at(20, 80, address);
  }

  sf("bold", 10);
  at(20, 87, "Diesel price");
  sf("normal", 10);
  at(47, 87, data.diesel.change == null ? "Not available" : data.diesel.change < 0 ? "Decrease" : data.diesel.change > 0 ? "Increase" : "Unchanged");
  sf("bold", 10);
  at(20, 92, "Amount");
  sf("normal", 10);
  at(47, 92, data.diesel.change == null ? "-" : formatCurrency(Math.abs(data.diesel.change)));
  sf("normal", 8);
  at(20, 98, `Starting rates: ${data.effectiveDate} | All rates exclude VAT`);

  const tableY = 104;
  const rowHeight = 6.2;
  const boxLeft = 20;
  const boxRight = 190;
  const boxTop = tableY;
  const boxBottom = 250;
  const totalTableWidth = boxRight - boxLeft;
  const labelWidth = 84;
  const rateCellWidth = (totalTableWidth - labelWidth) / 3;

  sf("bold", 10);
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.4);
  doc.rect(boxLeft, boxTop, totalTableWidth, boxBottom - boxTop);
  doc.line(boxLeft, boxTop + 10, boxRight, boxTop + 10);

  at(boxLeft + 3, boxTop + 6, originHeading);
  for (let i = 0; i < 3; i++) {
    const x = boxLeft + labelWidth + i * rateCellWidth + 2;
    at(x, boxTop + 6, effectiveRateLabels[i] ?? "", { align: "left" });
  }

  doc.line(boxLeft, boxTop + 10, boxRight, boxTop + 10);
  doc.line(boxLeft + labelWidth, boxTop, boxLeft + labelWidth, boxBottom);
  for (let i = 1; i < 3; i++) {
    const x = boxLeft + labelWidth + i * rateCellWidth;
    doc.line(x, boxTop, x, boxBottom);
  }

  let y = boxTop + 16;
  sf("normal", 9);
  for (const lane of pageLanes) {
    const cityLabel = allSameOrigin ? lane.destination : [lane.loadingPoint, lane.destination].filter(Boolean).join(" - ");
    at(boxLeft + 3, y, clamp(cityLabel || "—", 30));

    const laneRates = Array.isArray(lane.rates) && lane.rates.length ? lane.rates.slice(0, 3) : [lane.rate ?? null, null, null];
    for (let i = 0; i < 3; i++) {
      const x = boxLeft + labelWidth + (i + 1) * rateCellWidth - 2;
      const v = laneRates[i];
      const text = formatRateCell(v as number | null | undefined);
      at(x, y, text, { align: "right" });
    }
    y += rowHeight;
    if (y > boxBottom - 8) break;
  }

  sf("normal", 8);
  if (data.notes) {
    const lines: string[] = doc.splitTextToSize(data.notes, 170);
    lines.slice(0, 3).forEach((line, index) => at(20, 256 + index * 4, line));
  }
  at(190, 270, `Page ${page + 1} of ${pageCount}`, { align: "right" });
  const bottomY = 273;
  doc.setLineWidth(0.5);
  doc.line(20, bottomY, 190, bottomY);
  sf("bold", 9);
  at(20, 282, "ANTON LE ROUX VERVOER");
  sf("normal", 8);
  at(20, 287, "Posbus 132, George, 6530");
  at(20, 292, "Tel: 044 874 2292 | VAT: 4130255724");
  }

  return doc;
};
