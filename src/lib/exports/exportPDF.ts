import jsPDF from "jspdf";
import { SheetExportRow } from "@/src/types/sheetExport";

// ---------------------------------------------------------------------------
// Single-page LANDSCAPE dashboard of the selected routes.
//
// Design language: "dark command center" — matches the app's dark theme
// tokens (--background #0B1220, cards #0F172A, teal accent #06B6D4/#22D3EE,
// muted #94A3B8). Large KPI numbers over small uppercase labels, rounded
// cards with subtle borders, a circular completion gauge with a soft glow,
// thin rounded revenue bars, and restrained semantic status colors.
//
// Layout (A4 landscape, 297 x 210 mm):
//   • Header band     — teal edge, FLEETCORE wordmark, period, timestamp
//   • KPI row         — Total Revenue / Total Distance / Avg Rate / Completion
//   • Left panel      — Revenue by Client (top 6 thin rounded bars)
//   • Right panel     — circular completion gauge + status legend + snapshot
//   • Footer band     — confidentiality note, page marker
//
// Everything is drawn with absolute mm coordinates on a single page — no
// auto page breaks, no flow layout.
// ---------------------------------------------------------------------------

// DESIGN SYSTEM (app dark-theme tokens)
const C = {
  BG:      [11,  18,  32] as [number, number, number],   // --background #0B1220
  CARD:    [15,  23,  42] as [number, number, number],   // --card-bg #0F172A
  BORDER:  [42,  55,  78] as [number, number, number],   // subtle card border
  TRACK:   [30,  41,  59] as [number, number, number],   // #1E293B bar/gauge tracks
  TEAL:    [6,  182, 212] as [number, number, number],   // #06B6D4
  TEALBRT: [34, 211, 238] as [number, number, number],   // #22D3EE
  FG:      [226, 232, 240] as [number, number, number],  // --foreground #E2E8F0
  MUTED:   [148, 163, 184] as [number, number, number],  // --nav-text-color #94A3B8
  FAINT:   [100, 116, 139] as [number, number, number],  // #64748B
  GREEN:   [16, 185, 129] as [number, number, number],   // emerald (completed)
  VIOLET:  [167, 139, 250] as [number, number, number],  // violet (locked)
  SKY:     [56, 189, 248] as [number, number, number],   // sky (planned)
  AMBER:   [245, 158, 11] as [number, number, number],   // amber (completion KPI)
} as const;

const CLIENT_PALETTE: [number, number, number][] = [
  C.TEAL, [45, 155, 214], C.TEALBRT, C.GREEN, C.SKY, C.VIOLET,
  C.AMBER, [249, 115, 22], [236, 72, 153], C.FAINT,
];

// HELPERS
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

// jsPDF's typings don't expose GState as a constructible type — cast it.
type GStateCtor = new (opts: { opacity: number }) => unknown;

/** Soft glow — draws the same shape at a low opacity, then resets (finally). */
function withGlow(doc: jsPDF, opacity: number, draw: () => void) {
  const GState = (doc as unknown as { GState: GStateCtor }).GState;
  doc.setGState(new GState({ opacity }));
  try {
    draw();
  } finally {
    doc.setGState(new GState({ opacity: 1 }));
  }
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
    if (l === "locked") return C.VIOLET;
    if (l === "planned") return C.SKY;
    return C.FAINT;
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
  font(doc, "bold", 7);
  set(doc, { text: C.MUTED });
  doc.text(text.toUpperCase(), x, y);
  set(doc, { stroke: C.BORDER, lw: 0.4 });
  doc.line(x, y + 2.5, x + 34, y + 2.5);
}

function panel(doc: jsPDF, x: number, y: number, w: number, h: number) {
  set(doc, { fill: C.CARD, stroke: C.BORDER, lw: 0.4 });
  doc.roundedRect(x, y, w, h, 4, 4, "FD");
}

function kpiCard(
  doc: jsPDF, x: number, y: number, w: number, h: number,
  value: string, label: string, sub: string, accent: [number, number, number]
) {
  set(doc, { fill: C.CARD, stroke: C.BORDER, lw: 0.4 });
  doc.roundedRect(x, y, w, h, 3, 3, "FD");
  // Top accent strip + soft glow
  withGlow(doc, 0.3, () => {
    set(doc, { fill: accent, lw: 0 });
    doc.roundedRect(x + 2, y, w - 4, 2.6, 1.3, 1.3, "F");
  });
  set(doc, { fill: accent, lw: 0 });
  doc.roundedRect(x + 2, y, w - 4, 1.6, 0.8, 0.8, "F");
  // Large number, small uppercase label, tiny sub (reference hierarchy)
  font(doc, "bold", 18);
  set(doc, { text: C.FG });
  doc.text(value, x + 5, y + 16.5);
  font(doc, "bold", 6.5);
  set(doc, { text: C.MUTED });
  doc.text(label, x + 5, y + 22.5);
  font(doc, "normal", 5.5);
  set(doc, { text: C.FAINT });
  doc.text(sub, x + 5, y + 26.5);
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

    // Track + thin rounded fill
    set(doc, { fill: C.TRACK, lw: 0 });
    doc.roundedRect(barStartX, rowY + 1.5, barW, 4.5, 2.25, 2.25, "F");
    withGlow(doc, 0.25, () => {
      set(doc, { fill: color, lw: 0 });
      doc.roundedRect(barStartX, rowY + 1.5, Math.max((c.revenue / maxRev) * barW, 0.8), 4.5, 2.25, 2.25, "F");
    });
    set(doc, { fill: color, lw: 0 });
    doc.roundedRect(barStartX, rowY + 1.5, Math.max((c.revenue / maxRev) * barW, 0.8), 4.5, 2.25, 2.25, "F");

    // Name
    font(doc, "bold", 7);
    set(doc, { text: C.FG });
    doc.text(trunc(c.name, 16), x, rowY + 4);

    // Value
    font(doc, "bold", 7.5);
    set(doc, { text: C.TEALBRT });
    doc.text(fmtCur(c.revenue), valX, rowY + 4);

    // Share + rate (subdued)
    const pct = totalRevenue > 0 ? (c.revenue / totalRevenue) * 100 : 0;
    const rate = c.km > 0 ? c.revenue / c.km : 0;
    font(doc, "normal", 5.5);
    set(doc, { text: C.FAINT });
    doc.text(`${pct.toFixed(1)}%  ·  ${rate > 0 ? fmtRate(rate) : "—"}`, valX, rowY + 8);
  });

  return y + top.length * rowH;
}

/** Circular gauge arc built from short segments (jsPDF has no native arc). */
function gaugeArc(
  doc: jsPDF, cx: number, cy: number, r: number,
  startDeg: number, endDeg: number, lw: number, color: [number, number, number],
  opts?: { cap?: "round" | "butt"; stepDeg?: number }
) {
  set(doc, { stroke: color, lw });
  doc.setLineCap(opts?.cap ?? "round");
  const stepDeg = opts?.stepDeg ?? 2;
  const steps = Math.max(2, Math.ceil((endDeg - startDeg) / stepDeg));
  let px = 0;
  let py = 0;
  for (let i = 0; i <= steps; i += 1) {
    const a = ((startDeg + ((endDeg - startDeg) * i) / steps) * Math.PI) / 180;
    const x = cx + r * Math.cos(a);
    const y = cy + r * Math.sin(a);
    if (i > 0) doc.line(px, py, x, y);
    px = x;
    py = y;
  }
}

function drawCompletionGauge(
  doc: jsPDF, compRate: number, total: number,
  cx: number, cy: number, r: number
) {
  // Track (full ring, butt caps so the 0/360 seam has no cap bump)
  gaugeArc(doc, cx, cy, r, 0, 360, 3.2, C.TRACK, { cap: "butt" });
  // Progress arc: 12 o'clock clockwise, with a soft glow underneath
  const sweep = Math.min(compRate * 3.6, 360);
  if (sweep > 0.5) {
    // The translucent glow is drawn at a coarser step — opacity hides the edges.
    withGlow(doc, 0.3, () => {
      gaugeArc(doc, cx, cy, r, -90, -90 + sweep, 5.5, C.TEAL, { stepDeg: 4 });
    });
    gaugeArc(doc, cx, cy, r, -90, -90 + sweep, 3.2, C.TEALBRT);
  }
  // Center readout
  font(doc, "bold", 17);
  set(doc, { text: C.FG });
  doc.text(`${compRate}%`, cx, cy + 5.5, { align: "center" });
  font(doc, "normal", 5.5);
  set(doc, { text: C.FAINT });
  doc.text(`of ${total} route${total === 1 ? "" : "s"} done`, cx, cy + 13, { align: "center" });
}

function drawStatusLegend(
  doc: jsPDF, stats: StatusStat[], total: number,
  x: number, y: number, w: number
): number {
  let ly = y;
  stats.forEach((s) => {
    const pct = total > 0 ? (s.count / total) * 100 : 0;
    set(doc, { fill: s.color, lw: 0 });
    doc.circle(x + 1.6, ly - 1.6, 1.6, "F");
    font(doc, "bold", 6.5);
    set(doc, { text: C.FG });
    doc.text(s.label, x + 5, ly);
    const rightStr = `${s.count}  ·  ${pct.toFixed(0)}%`;
    font(doc, "bold", 6.5);
    set(doc, { text: C.MUTED });
    doc.text(rightStr, x + w - doc.getTextWidth(rightStr), ly);
    ly += 6.5;
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
            color: C.FAINT,
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

  // ── Page background ───────────────────────────────────────────────────────
  set(doc, { fill: C.BG, lw: 0 });
  doc.rect(0, 0, pw, ph, "F");

  // ── Header band ───────────────────────────────────────────────────────────
  set(doc, { fill: C.CARD, lw: 0 });
  doc.rect(0, 0, pw, 17, "F");
  withGlow(doc, 0.35, () => {
    set(doc, { fill: C.TEAL, lw: 0 });
    doc.rect(0, 0, 4, 17, "F");
  });
  set(doc, { fill: C.TEAL, lw: 0 });
  doc.rect(0, 0, 2.6, 17, "F");

  font(doc, "bold", 14);
  set(doc, { text: C.FG });
  doc.text("FLEETCORE", LM + 6, 11.5);
  const wmW = doc.getTextWidth("FLEETCORE");
  font(doc, "normal", 8.5);
  set(doc, { text: C.TEALBRT });
  doc.text("Operations Dashboard", LM + 6 + wmW + 5, 11.5);

  font(doc, "bold", 9);
  set(doc, { text: C.FG });
  doc.text(period, pw - LM - doc.getTextWidth(period), 9.5);
  font(doc, "normal", 6.5);
  set(doc, { text: C.FAINT });
  const genStr = `Generated ${generatedAt}`;
  doc.text(genStr, pw - LM - doc.getTextWidth(genStr), 14);

  set(doc, { stroke: C.BORDER, lw: 0.5 });
  doc.line(0, 17, pw, 17);

  // ── KPI row ───────────────────────────────────────────────────────────────
  const kpiY = 22;
  const kpiH = 30;
  const kpiGap = 3;
  const kpiW = (W - kpiGap * 3) / 4;
  const cards = [
    { value: fmtCur(totalRev), label: "Total Revenue", sub: `${rows.length} routes selected`, accent: C.TEAL },
    { value: `${totalKm.toLocaleString("en-ZA")} km`, label: "Total Distance", sub: `${clients.length} clients`, accent: C.GREEN },
    { value: fmtRate(avgRate), label: "Fleet Avg Rate", sub: "Blended all routes", accent: C.VIOLET },
    { value: `${compRate}%`, label: "Completion", sub: `${completed} of ${rows.length} done`, accent: C.AMBER },
  ];
  cards.forEach((c, i) =>
    kpiCard(doc, LM + i * (kpiW + kpiGap), kpiY, kpiW, kpiH, c.value, c.label, c.sub, c.accent)
  );

  // ── Left panel — Revenue by Client ────────────────────────────────────────
  const chartTop = 58;
  const chartH = 132;
  const leftX = LM;
  const leftW = 168;
  const rightX = leftX + leftW + 8;
  const rightW = W - leftW - 8;
  panel(doc, leftX, chartTop, leftW, chartH);
  panel(doc, rightX, chartTop, rightW, chartH);

  const pad = 8;
  const leftInnerX = leftX + pad;
  sectionLabel(doc, "Revenue by Client", leftInnerX, chartTop + pad + 2);
  const barsEnd = drawClientBars(doc, clients, totalRev, leftInnerX, chartTop + pad + 14, 48, 55, 13.5, 6);
  font(doc, "normal", 5.5);
  set(doc, { text: C.FAINT });
  const caption = `Top ${Math.min(clients.length, 6)} of ${clients.length} client${clients.length === 1 ? "" : "s"} by revenue`;
  doc.text(caption, leftInnerX, barsEnd + 5);

  // ── Right panel — Status Mix gauge + legend + snapshot ────────────────────
  const rightInnerX = rightX + pad;
  const rightInnerW = rightW - pad * 2;
  sectionLabel(doc, "Status Mix", rightInnerX, chartTop + pad + 2);

  drawCompletionGauge(
    doc, compRate, rows.length,
    rightX + rightW / 2, chartTop + 40, 15
  );

  const legendY = drawStatusLegend(doc, stats, rows.length, rightInnerX, chartTop + 70, rightInnerW);

  // Divider + snapshot
  const snapY = legendY + 6;
  set(doc, { stroke: C.BORDER, lw: 0.3 });
  doc.line(rightInnerX, snapY, rightX + rightW - pad, snapY);
  font(doc, "bold", 6.5);
  set(doc, { text: C.MUTED });
  doc.text("SNAPSHOT", rightInnerX, snapY + 6);

  let sy = snapY + 13;
  const snapLine = (k: string, v: string) => {
    font(doc, "normal", 5.5);
    set(doc, { text: C.FAINT });
    doc.text(k, rightInnerX, sy);
    font(doc, "bold", 7.5);
    set(doc, { text: C.FG });
    doc.text(trunc(v, 26), rightInnerX, sy + 4.5);
    sy += 11;
  };
  if (topClient) snapLine("Top client", `${topClient.name} — ${fmtCur(topClient.revenue)}`);
  if (topDriver) snapLine("Top driver", `${topDriver.name} — ${fmtCur(topDriver.amount)}`);

  // ── Footer band ───────────────────────────────────────────────────────────
  const footY = ph - 8;
  set(doc, { fill: C.CARD, lw: 0 });
  doc.rect(0, footY, pw, 8, "F");
  set(doc, { stroke: C.BORDER, lw: 0.5 });
  doc.line(0, footY, pw, footY);
  font(doc, "normal", 6.5);
  set(doc, { text: C.FAINT });
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
