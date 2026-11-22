import jsPDF from "jspdf";
import type { RateSheetData } from "./types";
import { formatCurrency } from "./formatters";

/** Fixed A4 zones in the existing rate-sheet units. Each page has three rate columns. */
const W = 210;
const TABLE_LEFT = 20, TABLE_RIGHT = 190, TABLE_TOP = 104, TABLE_BOTTOM = 250;
const LABEL_WIDTH = 84, TEXT_PADDING = 3, LINE_HEIGHT = 4;
const ROW_PADDING = 2.2, BOTTOM_PADDING = 4;

export const generateRateSheetPDF = (data: RateSheetData): jsPDF => {
  if (data.calculationProblem) throw new Error(data.calculationProblem);
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const sf = (style: "normal" | "bold" | "italic" | "bolditalic", size: number) => { doc.setFont("helvetica", style); doc.setFontSize(size); };
  type Align = "left" | "right" | "center";
  const at = (x: number, y: number, text: string, opts?: { align?: Align }) => doc.text(text, x, y, opts?.align ? { align: opts.align } : undefined);
  const formatRateCell = (value: number | null | undefined): string => {
    if (value === null || value === undefined) return "";
    return formatCurrency(value);
  };

  const effectiveRateLabels = data.rateLabels && data.rateLabels.length ? data.rateLabels : ["", "", ""];
  const originKey = (value: string) => value.trim().replace(/\s+/g, " ").toUpperCase();
  const originTitle = (value: string) => {
    const key = originKey(value);
    if (key === "BABELEGI + KRUGERSDORP + VEREENIGING") return "BABALEGI + KRUGERSDORP + VEREENIGING";
    return key || "LOADING POINT NOT SPECIFIED";
  };
  const customerName = data.customer.name || "";
  const contactPerson = data.customer.contactPerson || "";
  const email = data.customer.email || "";
  const phone = data.customer.phone || "";
  const address = data.customer.address || "";

  // Group destinations under their loading point; continuation pages repeat
  // the section title, never the origin in every destination row.
  const headerHeight = 10;
  const bodyTop = TABLE_TOP + headerHeight;
  const bodyBottom = TABLE_BOTTOM - BOTTOM_PADDING;
  const capacity = bodyBottom - bodyTop;
  const groups = new Map<string, { title: string; lanes: RateSheetData["lanes"] }>();
  for (const lane of data.lanes) {
    const key = originKey(lane.loadingPoint);
    let group = groups.get(key);
    if (!group) {
      group = { title: originTitle(lane.loadingPoint), lanes: [] };
      groups.set(key, group);
    }
    group.lanes.push(lane);
  }
  type Row = { lane: RateSheetData["lanes"][number]; lines: string[]; height: number };
  type Section = { headingLines: string[]; height: number; rows: Row[] };
  const pages: Section[][] = [[]];
  let usedHeight = 0;
  for (const group of groups.values()) {
    sf("bold", 10);
    const headingLines: string[] = doc.splitTextToSize(group.title, TABLE_RIGHT - TABLE_LEFT - TEXT_PADDING * 2);
    const headingHeight = Math.max(8, headingLines.length * LINE_HEIGHT + 4);
    let section: Section | undefined;
    sf("normal", 9);
    for (const lane of group.lanes) {
      const lines: string[] = doc.splitTextToSize(lane.destination || "-", LABEL_WIDTH - TEXT_PADDING * 2);
      const row = { lane, lines, height: lines.length * LINE_HEIGHT + ROW_PADDING };
      if (headingHeight + row.height > capacity) throw new Error("Route text is too long to fit on a rate-sheet page.");
      if (!section || usedHeight + row.height > capacity) {
        if (usedHeight + headingHeight + row.height > capacity) {
          pages.push([]);
          usedHeight = 0;
        }
        section = { headingLines, height: headingHeight, rows: [] };
        pages[pages.length - 1].push(section);
        usedHeight += headingHeight;
      }
      section.rows.push(row);
      usedHeight += row.height;
    }
  }
  const pageCount = pages.length;
  for (let page = 0; page < pageCount; page++) {
    if (page > 0) doc.addPage();
    const pageSections = pages[page];
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

    const boxLeft = TABLE_LEFT;
    const boxRight = TABLE_RIGHT;
    const boxTop = TABLE_TOP;
    const boxBottom = TABLE_BOTTOM;
    const totalTableWidth = boxRight - boxLeft;
    const labelWidth = LABEL_WIDTH;
    const rateCellWidth = (totalTableWidth - labelWidth) / 3;

    sf("bold", 10);
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.4);
    doc.rect(boxLeft, boxTop, totalTableWidth, boxBottom - boxTop);
    doc.line(boxLeft, bodyTop, boxRight, bodyTop);

    at(boxLeft + TEXT_PADDING, boxTop + 6, "Destination");
    for (let i = 0; i < 3; i++) {
      const x = boxLeft + labelWidth + i * rateCellWidth + 2;
      at(x, boxTop + headerHeight / 2 + 1, effectiveRateLabels[i] ?? "", { align: "left" });
    }

    doc.line(boxLeft + labelWidth, boxTop, boxLeft + labelWidth, boxBottom);
    for (let i = 1; i < 3; i++) {
      const x = boxLeft + labelWidth + i * rateCellWidth;
      doc.line(x, boxTop, x, boxBottom);
    }

    let rowTop = bodyTop;
    for (const section of pageSections) {
      doc.setFillColor(238, 242, 246);
      doc.rect(boxLeft + 0.2, rowTop, totalTableWidth - 0.4, section.height, "F");
      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(0.25);
      doc.line(boxLeft, rowTop, boxRight, rowTop);
      sf("bold", 10);
      section.headingLines.forEach((line, index) => at(boxLeft + TEXT_PADDING, rowTop + 5 + index * LINE_HEIGHT, line));
      rowTop += section.height;
      doc.line(boxLeft, rowTop, boxRight, rowTop);
      sf("normal", 9);
      for (const { lane, lines, height } of section.rows) {
        lines.forEach((line, index) => at(boxLeft + TEXT_PADDING, rowTop + 4.2 + index * LINE_HEIGHT, line));
        const rateY = rowTop + height / 2 + 1.1;
        const laneRates = Array.isArray(lane.rates) && lane.rates.length ? lane.rates.slice(0, 3) : [lane.rate ?? null, null, null];
        for (let i = 0; i < 3; i++) {
          const x = boxLeft + labelWidth + (i + 1) * rateCellWidth - 2;
          at(x, rateY, formatRateCell(laneRates[i]), { align: "right" });
        }
        rowTop += height;
        doc.setDrawColor(220, 220, 220);
        doc.setLineWidth(0.15);
        doc.line(boxLeft, rowTop, boxRight, rowTop);
        doc.setDrawColor(0, 0, 0);
      }
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
