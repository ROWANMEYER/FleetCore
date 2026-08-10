import jsPDF from "jspdf";
import { SheetExportRow } from "@/src/types/sheetExport";

// ---------------------------------------------------------------------------
// Single-page LANDSCAPE dashboard of the selected routes.
//
// Layout (A4 landscape, 297 x 210 mm):
//   • Navy header   — wordmark, report title, period, generated timestamp
//   • KPI row       — Total Revenue / Total Distance / Avg Rate / Completion
//   • Left panel    — Revenue by Client (top 6 horizontal bars)
//   • Right panel   — Status Mix (completion % + stacked bar + legend) and a
//                     Top client / Top driver snapshot
//   • Footer band   — confidentiality note, page marker
//
// Everything is drawn with absolute mm coordinates on a single page — no
// auto page breaks, no flow layout.
// ---------------------------------------------------------------------------

// DESIGN SYSTEM
const C = {
  NAVY:   [27,  43,  75] as [number, number, number],
  ACCENT: [29, 111, 232] as [number, number, number],
  SKY:    [56, 189, 248] as [number, number, number],
  GREEN:  [16, 185, 129] as [number, number, number],
  AMBER:  [245, 158, 11] as [number, number, number],
  PURPLE: [139, 92, 246] as [number, number, number],
  TEAL:   [20, 184, 166] as [number, number, number],
  WHITE:  [255, 255, 255] as [number, number, number],
  OFFWHITE: [249, 250, 251] as [number, number, number],
  LGRAY:  [241, 245, 249] as [number, number, number],
  MGRAY:  [203, 213, 225] as [number, number, number],
  DGRAY:  [100, 116, 139] as [number, number, number],
  TEXT:   [30,  41,  59] as [number, number, number],
  MUTED:  [148, 163, 184] as [number, number, number],
} as const;

const CLIENT_PALETTE: [number, number, number][] = [
  C.ACCENT, [44, 74, 124], C.TEAL, C.GREEN, C.AMBER, C.PURPLE,
  C.SKY, [249, 115, 22], [236, 72, 153], C.DGRAY,
];

// HELPERS
// NOTE: whole-number ZAR (no comma decimals) is a deliberate dashboard format —
// the strict invoice formatters in src/pdf/ ("R 1 234,56") don't apply to KPIs.
const fmtCur = (v: number) =>
  `R${v.toLocaleString("en-ZA", { maximumFractionDigits: 0 })}`;
const fmtRate = (v: number) => `R${v.toFixed(2)}/km`;
const trunc = (s: string, n: number) =>
  s.length > n ? `${s.slice(0, n - 1)}…` : s;

function set(
  doc: jsPDF,
  opts: {
    fill?: [number, number, number];
    stroke?: [number, number, number];
    text?: [number, number, number];
    lw?: number;
  }
) {
  if (opts.fill) doc.setFillColor(...opts.fill);
  if (opts.stroke) doc.setDrawColor(...opts.stroke);
  if (opts.text) doc.setTextColor(...opts.text);
  if (opts.lw !== undefined) doc.setLineWidth(opts.lw);
}

function font(doc: jsPDF, style: "normal" | "bold", size: number) {
  doc.setFont("helvetica", style);
  doc.setFontSize(size);
}

// AGGREGATION
interface ClientStat { name: string; revenue: number; km: number; routes: number }
interface StatusStat { label: string; count: number; color: [number, number, number] }

function aggregateClients(rows: SheetExportRow[]): ClientStat[] {
  const map = new Map<string, ClientStat>();
  rows.forEach((r) => {
    const k = r.client || "Unknown";
    if (!map.has(k)) map.set(k, { name: k, revenue: 0, km: 0, routes: 0 });
    const e = map.get(k)!;
    e.revenue += r.amount;
    e.km += r.routeKm;
    e.routes += 1;
  });
  return [...map.values()].sort((a, b) => b.revenue - a.revenue);
}

function statusStats(rows: SheetExportRow[]): StatusStat[] {
  const colorFor = (s: string): [number, number, number] => {
    const l = s.toLowerCase();
    if (l === "completed") return C.GREEN;
    if (l === "locked") return C.PURPLE;
    if (l === "planned") return C.SKY;
    return C.DGRAY;
  };
  const map = new Map<string, StatusStat>();
  rows.forEach((r) => {
    const label = r.status || "Planned";
    if (!map.has(label)) map.set(label, { label, count: 0, color: colorFor(label) });
    map.get(label)!.count += 1;
  });
  return [...map.values()].sort((a, b) => b.count - a.count);
}

// SMALL PIECES
function sectionLabel(doc: jsPDF, text: string, x: number, y: number) {
  font(doc, "bold", 8);
  set(doc, { text: C.MUTED });
  doc.text(text.toUpperCase(), x, y);
  set(doc, { stroke: C.MGRAY, lw: 0.4 });
  doc.line(x, y + 2.5, x + 34, y + 2.5);
}

function panel(doc: jsPDF, x: number, y: number, w: number, h: number) {
  set(doc, { fill: C.WHITE, stroke: C.MGRAY, lw: 0.4 });
  doc.rect(x, y, w, h, "FD");
}

function kpiCard(
  doc: jsPDF, x: number, y: number, w: number, h: number,
  value: string, label: string, sub: string, color: [number, number, number]
) {
  set(doc, { fill: C.OFFWHITE, stroke: C.MGRAY, lw: 0.4 });
  doc.rect(x, y, w, h, "FD");
  set(doc, { fill: color, lw: 0 });
  doc.rect(x, y, w, 2.2, "F");
  font(doc, "bold", 15);
  set(doc, { text: color });
  doc.text(value, x + 5, y + 15.5);
  font(doc, "bold", 7.5);
  set(doc, { text: C.TEXT });
  doc.text(label, x + 5, y + 21.5);
  font(doc, "normal", 6.5);
  set(doc, { text: C.DGRAY });
  doc.text(sub, x + 5, y + 25.5);
}

function drawClientBars(
  doc: jsPDF, clients: ClientStat[], totalRevenue: number,
  x: number, y: number, labelW: number, barW: number, rowH: number, maxRows: number
): number {
  const top = clients.slice(0, maxRows);
  const maxRev = top[0]?.revenue || 1;
  const barStartX = x + labelW;
  const valX = barStartX + barW + 2.5;

  top.forEach((c, i) => {
    const color = CLIENT_PALETTE[i % CLIENT_PALETTE.length];
    const rowY = y + i * rowH;

    // Track + fill
    set(doc, { fill: C.LGRAY, lw: 0 });
    doc.rect(barStartX, rowY + 1.5, barW, 4, "F");
    set(doc, { fill: color });
    doc.rect(barStartX, rowY + 1.5, Math.max((c.revenue / maxRev) * barW, 0.8), 4, "F");

    // Name
    font(doc, "bold", 7.5);
    set(doc, { text: C.TEXT });
    doc.text(trunc(c.name, 16), x, rowY + 4);

    // Value
    font(doc, "bold", 7.5);
    set(doc, { text: color });
    doc.text(fmtCur(c.revenue), valX, rowY + 4);

    // Share + rate
    const pct = totalRevenue > 0 ? (c.revenue / totalRevenue) * 100 : 0;
    const rate = c.km > 0 ? c.revenue / c.km : 0;
    font(doc, "normal", 6);
    set(doc, { text: C.DGRAY });
    doc.text(`${pct.toFixed(1)}%  ·  ${rate > 0 ? fmtRate(rate) : "—"}`, valX, rowY + 8);
  });

  return y + top.length * rowH;
}

function drawStatusMix(
  doc: jsPDF, stats: StatusStat[], total: number,
  x: number, y: number, w: number
): number {
  // Stacked bar
  let cx = x;
  set(doc, { lw: 0 });
  stats.forEach((s) => {
    const sw = (s.count / total) * w;
    set(doc, { fill: s.color });
    doc.rect(cx, y, Math.max(sw, 0.5), 9, "F");
    cx += sw;
  });
  set(doc, { stroke: C.MGRAY, lw: 0.3 });
  doc.rect(x, y, w, 9, "S");

  // Legend rows
  let ly = y + 15;
  stats.forEach((s) => {
    const pct = total > 0 ? (s.count / total) * 100 : 0;
    set(doc, { fill: s.color, lw: 0 });
    doc.rect(x, ly - 2.5, 3.5, 3.5, "F");
    font(doc, "bold", 7.5);
    set(doc, { text: C.TEXT });
    doc.text(s.label, x + 6, ly);
    const rightStr = `${s.count}  ·  ${pct.toFixed(0)}%`;
    font(doc, "bold", 7.5);
    set(doc, { text: s.color });
    doc.text(rightStr, x + w - doc.getTextWidth(rightStr), ly);
    ly += 7.5;
  });
  return ly;
}

// ---------------------------------------------------------------------------
// DOC BUILDER — single-page landscape dashboard (pure, testable: no save)
// ---------------------------------------------------------------------------
export function buildDashboardDoc(
  rows: SheetExportRow[],
  metadata?: { dateRange: string; generatedAt: string }
): jsPDF | null {
  if (rows.length === 0) return null;

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pw = doc.internal.pageSize.getWidth();   // 297
  const ph = doc.internal.pageSize.getHeight();  // 210
  const LM = 10;
  const W = pw - LM * 2;                          // 277

  // ── Aggregates ────────────────────────────────────────────────────────────
  const clients = aggregateClients(rows);
  // Cap the status mix to the top 3 slices + an "Other" bucket so the legend
  // always fits the fixed panel — imported data can carry arbitrary status strings.
  const rawStats = statusStats(rows);
  const stats =
    rawStats.length > 3
      ? [
          ...rawStats.slice(0, 3),
          {
            label: "Other",
            count: rawStats.slice(3).reduce((s, x) => s + x.count, 0),
            color: C.DGRAY,
          },
        ]
      : rawStats;
  const totalRev = rows.reduce((s, r) => s + r.amount, 0);
  const totalKm = rows.reduce((s, r) => s + r.routeKm, 0);
  const completed = rows.filter(
    (r) => r.status?.toLowerCase() === "completed" || r.status?.toLowerCase() === "locked"
  ).length;
  const compRate = Math.round((completed / rows.length) * 100);
  const avgRate = totalKm > 0 ? totalRev / totalKm : 0;
  const period = metadata?.dateRange || "Selected Period";
  const generatedAt = metadata?.generatedAt || new Date().toLocaleString();
  const topClient = clients[0];
  const topDriver = rows
    .filter((r) => r.amount > 0)
    .reduce<{ name: string; amount: number } | null>(
      (best, r) => (!best || r.amount > best.amount ? { name: r.driver || "Unknown", amount: r.amount } : best),
      null
    );

  // ── Header band ───────────────────────────────────────────────────────────
  set(doc, { fill: C.NAVY, lw: 0 });
  doc.rect(0, 0, pw, 16, "F");
  set(doc, { fill: C.ACCENT });
  doc.rect(0, 0, 4, 16, "F");

  font(doc, "bold", 14);
  set(doc, { text: C.WHITE });
  doc.text("FLEETCORE", LM + 5, 11.5);
  const wmW = doc.getTextWidth("FLEETCORE");
  font(doc, "normal", 8.5);
  set(doc, { text: C.SKY });
  doc.text("Operations Dashboard", LM + 5 + wmW + 5, 11.5);

  font(doc, "bold", 9);
  set(doc, { text: C.WHITE });
  doc.text(period, pw - LM - doc.getTextWidth(period), 9.5);
  font(doc, "normal", 6.5);
  set(doc, { text: C.MUTED });
  const genStr = `Generated ${generatedAt}`;
  doc.text(genStr, pw - LM - doc.getTextWidth(genStr), 14);

  // ── KPI row ───────────────────────────────────────────────────────────────
  const kpiY = 22;
  const kpiH = 27;
  const kpiGap = 3;
  const kpiW = (W - kpiGap * 3) / 4;
  const cards = [
    { value: fmtCur(totalRev), label: "Total Revenue", sub: `${rows.length} routes selected`, color: C.ACCENT },
    { value: `${totalKm.toLocaleString("en-ZA")} km`, label: "Total Distance", sub: `${clients.length} clients`, color: C.TEAL },
    { value: fmtRate(avgRate), label: "Fleet Avg Rate", sub: "Blended all routes", color: C.PURPLE },
    { value: `${compRate}%`, label: "Completion", sub: `${completed} of ${rows.length} done`, color: C.GREEN },
  ];
  cards.forEach((c, i) =>
    kpiCard(doc, LM + i * (kpiW + kpiGap), kpiY, kpiW, kpiH, c.value, c.label, c.sub, c.color)
  );

  // ── Left panel — Revenue by Client ────────────────────────────────────────
  const chartTop = 56;
  const chartH = 140;
  const leftX = LM;
  const leftW = 168;
  const rightX = leftX + leftW + 8;
  const rightW = W - leftW - 8;
  panel(doc, leftX, chartTop, leftW, chartH);
  panel(doc, rightX, chartTop, rightW, chartH);

  const pad = 8;
  const leftInnerX = leftX + pad;
  sectionLabel(doc, "Revenue by Client", leftInnerX, chartTop + pad + 2);
  const barsEnd = drawClientBars(doc, clients, totalRev, leftInnerX, chartTop + pad + 14, 48, 55, 12, 6);
  font(doc, "normal", 6);
  set(doc, { text: C.DGRAY });
  const caption = `Top ${Math.min(clients.length, 6)} of ${clients.length} client${clients.length === 1 ? "" : "s"} by revenue`;
  doc.text(caption, leftInnerX, barsEnd + 5);

  // ── Right panel — Status Mix + snapshot ───────────────────────────────────
  const rightInnerX = rightX + pad;
  sectionLabel(doc, "Status Mix", rightInnerX, chartTop + pad + 2);

  font(doc, "bold", 26);
  set(doc, { text: C.GREEN });
  doc.text(`${compRate}%`, rightInnerX, chartTop + 34);
  font(doc, "normal", 7);
  set(doc, { text: C.DGRAY });
  doc.text(`of ${rows.length} route${rows.length === 1 ? "" : "s"} done`, rightInnerX, chartTop + 40);

  drawStatusMix(doc, stats, rows.length, rightInnerX, chartTop + 48, rightW - pad * 2);

  // Divider + snapshot
  const snapY = chartTop + 96;
  set(doc, { stroke: C.MGRAY, lw: 0.3 });
  doc.line(rightInnerX, snapY, rightX + rightW - pad, snapY);
  font(doc, "bold", 8);
  set(doc, { text: C.MUTED });
  doc.text("SNAPSHOT", rightInnerX, snapY + 6);

  let sy = snapY + 14;
  const snapLine = (k: string, v: string) => {
    font(doc, "normal", 6);
    set(doc, { text: C.MUTED });
    doc.text(k, rightInnerX, sy);
    font(doc, "bold", 8);
    set(doc, { text: C.TEXT });
    doc.text(trunc(v, 26), rightInnerX, sy + 4.5);
    sy += 11;
  };
  if (topClient) snapLine("Top client", `${topClient.name} — ${fmtCur(topClient.revenue)}`);
  if (topDriver) snapLine("Top driver", `${topDriver.name} — ${fmtCur(topDriver.amount)}`);

  // ── Footer band ───────────────────────────────────────────────────────────
  const footY = ph - 8;
  set(doc, { fill: C.LGRAY, lw: 0 });
  doc.rect(0, footY, pw, 8, "F");
  font(doc, "normal", 6.5);
  set(doc, { text: C.MUTED });
  doc.text("FleetCore  •  Confidential — For Internal Use Only", LM, ph - 3.5);
  const pageStr = "Page 1 of 1";
  doc.text(pageStr, pw - LM - doc.getTextWidth(pageStr), ph - 3.5);

  return doc;
}

// ---------------------------------------------------------------------------
// MAIN EXPORT — builds the dashboard and saves it
// ---------------------------------------------------------------------------
export function exportPDF(
  rows: SheetExportRow[],
  metadata?: { dateRange: string; generatedAt: string }
) {
  const doc = buildDashboardDoc(rows, metadata);
  if (!doc) return;
  const safePeriod = (metadata?.dateRange || "selected_period").replace(/[^a-z0-9]/gi, "_").toLowerCase();
  doc.save(`fleetcore_dashboard_${safePeriod}.pdf`);
}
