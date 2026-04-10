import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { SheetExportRow } from "@/src/types/sheetExport";

// ---------------------------------------------------------------------------
// DESIGN SYSTEM
// ---------------------------------------------------------------------------
const C = {
  INK:      [13,  27,  42]  as [number,number,number],
  NAVY:     [27,  43,  75]  as [number,number,number],
  ACCENT:   [29, 111, 232]  as [number,number,number],
  SKY:      [56, 189, 248]  as [number,number,number],
  GREEN:    [16, 185, 129]  as [number,number,number],
  AMBER:    [245,158,  11]  as [number,number,number],
  PURPLE:   [139, 92, 246]  as [number,number,number],
  TEAL:     [20, 184, 166]  as [number,number,number],
  WHITE:    [255,255, 255]  as [number,number,number],
  OFFWHITE: [249,250, 251]  as [number,number,number],
  LGRAY:    [241,245, 249]  as [number,number,number],
  MGRAY:    [203,213, 225]  as [number,number,number],
  DGRAY:    [100,116, 139]  as [number,number,number],
  TEXT:     [30,  41,  59]  as [number,number,number],
  MUTED:    [148,163, 184]  as [number,number,number],
};

const CLIENT_PALETTE: [number,number,number][] = [
  C.ACCENT, [44,74,124], C.TEAL, C.GREEN, C.AMBER, C.PURPLE,
  C.SKY, [249,115,22], [236,72,153], C.DGRAY,
];

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------
const fmtCur  = (v: number) => `R${v.toLocaleString('en-ZA', { maximumFractionDigits: 0 })}`;
const fmtRate = (v: number) => `R${v.toFixed(2)}/km`;

function set(doc: jsPDF, opts: { fill?: [number,number,number]; stroke?: [number,number,number]; text?: [number,number,number]; lw?: number }) {
  if (opts.fill)   doc.setFillColor(...opts.fill);
  if (opts.stroke) doc.setDrawColor(...opts.stroke);
  if (opts.text)   doc.setTextColor(...opts.text);
  if (opts.lw !== undefined) doc.setLineWidth(opts.lw);
}

function font(doc: jsPDF, style: 'normal'|'bold', size: number) {
  doc.setFont('helvetica', style);
  doc.setFontSize(size);
}

// ---------------------------------------------------------------------------
// CHROME — header + footer drawn on every page
// ---------------------------------------------------------------------------
function drawChrome(doc: jsPDF, pageNum: number, totalPages: number, period: string) {
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const LM = 16;
  const HEADER_H = 18;
  const FOOTER_H = 10;

  // Header background
  set(doc, { fill: C.NAVY });
  doc.rect(0, 0, pw, HEADER_H, 'F');

  // Accent stripe
  set(doc, { fill: C.ACCENT });
  doc.rect(0, 0, 3.5, HEADER_H, 'F');

  // Wordmark
  font(doc, 'bold', 13);
  set(doc, { text: C.WHITE });
  doc.text('FLEETCORE', LM + 6, 11.5);
  const wmW = doc.getTextWidth('FLEETCORE');

  // Subtitle
  font(doc, 'normal', 8);
  set(doc, { text: C.SKY });
  doc.text('Monthly Operations Report', LM + 6 + wmW + 4, 11.5);

  // Right info
  font(doc, 'normal', 7.5);
  set(doc, { text: C.MUTED });
  const rightTxt = `${period}    Page ${pageNum} of ${totalPages}`;
  doc.text(rightTxt, pw - LM - doc.getTextWidth(rightTxt), 11.5);

  // Bottom rule on header
  set(doc, { stroke: C.ACCENT, lw: 0.8 });
  doc.line(0, HEADER_H, pw, HEADER_H);

  // Footer
  set(doc, { fill: C.LGRAY });
  doc.rect(0, ph - FOOTER_H, pw, FOOTER_H, 'F');
  font(doc, 'normal', 7);
  set(doc, { text: C.MUTED });
  doc.text('ALR Transport (Pty) Ltd  •  Confidential — For Internal Use Only', LM, ph - 3.5);
  const domain = 'fleetcore.app';
  doc.text(domain, pw - LM - doc.getTextWidth(domain), ph - 3.5);
}

// ---------------------------------------------------------------------------
// AGGREGATION
// ---------------------------------------------------------------------------
interface ClientStat { name: string; revenue: number; km: number; routes: number }
interface DriverStat { name: string; revenue: number; km: number }

function aggregateClients(rows: SheetExportRow[]): ClientStat[] {
  const map = new Map<string, ClientStat>();
  rows.forEach(r => {
    const k = r.client || 'Unknown';
    if (!map.has(k)) map.set(k, { name: k, revenue: 0, km: 0, routes: 0 });
    const e = map.get(k)!;
    e.revenue += r.amount;
    e.km += r.routeKm;
    e.routes += 1;
  });
  return [...map.values()].sort((a, b) => b.revenue - a.revenue);
}

function aggregateDrivers(rows: SheetExportRow[]): DriverStat[] {
  const map = new Map<string, DriverStat>();
  rows.forEach(r => {
    const k = r.driver || 'Unknown';
    if (!map.has(k)) map.set(k, { name: k, revenue: 0, km: 0 });
    const e = map.get(k)!;
    e.revenue += r.amount;
    e.km += r.routeKm;
  });
  return [...map.values()].sort((a, b) => b.revenue - a.revenue);
}

// ---------------------------------------------------------------------------
// SECTION LABEL
// ---------------------------------------------------------------------------
function sectionLabel(doc: jsPDF, text: string, y: number, LM: number, W: number): number {
  font(doc, 'bold', 7.5);
  set(doc, { text: C.MUTED });
  doc.text(text.toUpperCase(), LM, y);
  y += 4;
  set(doc, { stroke: C.MGRAY, lw: 0.4 });
  doc.line(LM, y, LM + W, y);
  return y + 5;
}

// ---------------------------------------------------------------------------
// HORIZONTAL BAR (client revenue)
// ---------------------------------------------------------------------------
function drawHBar(
  doc: jsPDF, clients: ClientStat[], totalRevenue: number,
  x: number, y: number, w: number, maxH: number
): number {
  const top = clients.slice(0, 10);
  const maxRev = top[0]?.revenue || 1;
  const barAreaW = w * 0.55;
  const rowH = Math.min(10, (maxH - 10) / top.length);

  top.forEach((c, i) => {
    const color = CLIENT_PALETTE[i % CLIENT_PALETTE.length];
    const barW = (c.revenue / maxRev) * barAreaW;
    const rowY = y + i * rowH;

    // Name
    font(doc, 'bold', 7.5);
    set(doc, { text: C.TEXT });
    doc.text(c.name.length > 25 ? c.name.slice(0, 24) + '…' : c.name, x, rowY + rowH * 0.65);

    // Bar bg
    const barStartX = x + w * 0.25;
    set(doc, { fill: C.LGRAY });
    doc.rect(barStartX, rowY + 1.5, barAreaW, rowH - 3, 'F');

    // Bar fill
    set(doc, { fill: color });
    doc.rect(barStartX, rowY + 1.5, barW, rowH - 3, 'F');

    // Values
    const pct = totalRevenue > 0 ? (c.revenue / totalRevenue * 100).toFixed(1) : '0.0';
    const rate = c.km > 0 ? c.revenue / c.km : 0;
    font(doc, 'bold', 7.5);
    set(doc, { text: color });
    doc.text(fmtCur(c.revenue), barStartX + barW + 4, rowY + rowH * 0.45);
    font(doc, 'normal', 6.5);
    set(doc, { text: C.DGRAY });
    doc.text(`${pct}%  ${rate > 0 ? fmtRate(rate) : '—'}`, barStartX + barW + 4, rowY + rowH * 0.45 + 3.5);
  });

  return y + top.length * rowH + 4;
}

// ---------------------------------------------------------------------------
// DONUT (pure jsPDF — drawn as pie wedges)
// ---------------------------------------------------------------------------
function drawDonut(
  doc: jsPDF, clients: ClientStat[], totalRevenue: number,
  cx: number, cy: number, r: number
) {
  const top5 = clients.slice(0, 5);
  const otherRev = clients.slice(5).reduce((s, c) => s + c.revenue, 0);
  const slices = [...top5.map((c, i) => ({ label: c.name, value: c.revenue, color: CLIENT_PALETTE[i % CLIENT_PALETTE.length] }))];
  if (otherRev > 0) slices.push({ label: 'Other', value: otherRev, color: C.MGRAY });

  const total = slices.reduce((s, sl) => s + sl.value, 0);
  let angle = -Math.PI / 2;

  slices.forEach(sl => {
    const sweep = (sl.value / total) * 2 * Math.PI;
    // Draw as thick arc by approximating with polygon
    const steps = Math.max(8, Math.floor(sweep / 0.1));
    const outerR = r;
    const innerR = r * 0.52;
    const pts: number[][] = [];

    for (let i = 0; i <= steps; i++) {
      const a = angle + (i / steps) * sweep;
      pts.push([cx + Math.cos(a) * outerR, cy + Math.sin(a) * outerR]);
    }
    for (let i = steps; i >= 0; i--) {
      const a = angle + (i / steps) * sweep;
      pts.push([cx + Math.cos(a) * innerR, cy + Math.sin(a) * innerR]);
    }

    set(doc, { fill: sl.color, stroke: C.WHITE, lw: 0.8 });
    (doc as any).path = undefined;
    const [fx, fy] = pts[0];
    doc.lines(
      pts.slice(1).map(([px, py], idx) => [px - pts[idx][0], py - pts[idx][1]] as [number,number]),
      fx, fy, [1,1], 'FD', true
    );

    angle += sweep;
  });

  // Centre text
  font(doc, 'bold', 9);
  set(doc, { text: C.TEXT });
  const revStr = fmtCur(totalRevenue);
  doc.text(revStr, cx - doc.getTextWidth(revStr) / 2, cy);
  font(doc, 'normal', 7);
  set(doc, { text: C.DGRAY });
  const lbl = 'Total Revenue';
  doc.text(lbl, cx - doc.getTextWidth(lbl) / 2, cy + 5);
}

// ---------------------------------------------------------------------------
// VERTICAL BAR (driver revenue)
// ---------------------------------------------------------------------------
function drawDriverBars(
  doc: jsPDF, drivers: DriverStat[], avgRate: number,
  x: number, y: number, w: number, h: number
) {
  const top = drivers.slice(0, 10);
  if (top.length === 0) return;
  
  const maxRev = top[0]?.revenue || 1;
  const maxRate = Math.max(...top.map(d => d.km > 0 ? d.revenue / d.km : 0), avgRate * 2);
  
  // Create clean upper bounds for axes (5 ticks)
  const maxRevScale = Math.max(Math.ceil((maxRev * 1.1) / 5000) * 5000, 5000);
  const maxRateScale = Math.max(Math.ceil((maxRate * 1.1) / 50) * 50, 50);
  
  const chartW = w - 36; // leave space for left/right Y axis labels
  const chartX = x + 18;
  const chartH = h - 16;
  const chartY = y + 8;
  
  const barW = (chartW / top.length) * 0.55;
  const gap = chartW / top.length;

  // Axes Spines
  set(doc, { stroke: C.MGRAY, lw: 0.2 });
  doc.line(chartX, chartY + chartH, chartX + chartW, chartY + chartH); // X
  doc.line(chartX, chartY, chartX, chartY + chartH); // left Y
  set(doc, { stroke: C.AMBER, lw: 0.2 });
  doc.line(chartX + chartW, chartY, chartX + chartW, chartY + chartH); // right Y

  // Grid and Y-axes ticks
  const ticks = 5;
  font(doc, 'normal', 6);
  for (let i = 0; i <= ticks; i++) {
    const py = chartY + chartH - (i / ticks) * chartH;
    
    // Grid lines
    set(doc, { stroke: C.LGRAY, lw: 0.15 });
    if (i > 0) doc.line(chartX, py, chartX + chartW, py);
    
    // Left axis (Rev) - Add tick
    set(doc, { stroke: C.MGRAY, lw: 0.2 });
    doc.line(chartX - 1.5, py, chartX, py);
    const revTick = (maxRevScale * (i / ticks)) / 1000;
    set(doc, { text: C.DGRAY });
    const revStr = `R${Math.round(revTick)}k`;
    doc.text(revStr, chartX - 3 - doc.getTextWidth(revStr), py + 2);
    
    // Right axis (Rate) - Add tick
    set(doc, { stroke: C.AMBER, lw: 0.2 });
    doc.line(chartX + chartW, py, chartX + chartW + 1.5, py);
    const rateTick = maxRateScale * (i / ticks);
    set(doc, { text: C.AMBER });
    const rateStr = `${Math.round(rateTick)}`;
    doc.text(rateStr, chartX + chartW + 3, py + 2);
  }

  // Axis Labels
  doc.setFontSize(6);
  set(doc, { text: C.ACCENT });
  doc.text('Revenue', chartX - 14, chartY + chartH/2 + doc.getTextWidth('Revenue')/2, { angle: 90 } as any);
  set(doc, { text: C.AMBER });
  doc.text('Rate R/km', chartX + chartW + 14, chartY + chartH/2 + doc.getTextWidth('Rate R/km')/2, { angle: 90 } as any);

  const linePoints: [number, number][] = [];

  top.forEach((d, i) => {
    const bx = chartX + i * gap + gap / 2 - barW / 2;
    const bh = (d.revenue / maxRevScale) * chartH;
    const by = chartY + chartH - bh;

    // Bar
    set(doc, { fill: C.ACCENT });
    doc.rect(bx, by, barW, bh, 'F');

    // Value above
    font(doc, 'bold', 6.5);
    set(doc, { text: C.ACCENT });
    const vStr = `R${Math.round(d.revenue / 1000)}k`;
    doc.text(vStr, bx + barW / 2 - doc.getTextWidth(vStr) / 2, by - 2);

    // Name below
    font(doc, 'normal', 6);
    set(doc, { text: C.TEXT });
    const last = d.name.split(' ').pop() || d.name;
    const nm = last.length > 10 ? last.slice(0, 9) + '…' : last;
    doc.text(nm, bx + barW / 2 - doc.getTextWidth(nm) / 2, chartY + chartH + 6);

    // Rate point
    if (d.km > 0) {
      const rate = d.revenue / d.km;
      const rateH = (rate / maxRateScale) * chartH;
      const dotY = chartY + chartH - rateH;
      const dotX = bx + barW / 2;
      linePoints.push([dotX, dotY]);
    }
  });

  // Connected Rate Line
  if (linePoints.length > 1) {
    set(doc, { stroke: C.AMBER, lw: 0.45 });
    for (let i = 0; i < linePoints.length - 1; i++) {
      doc.line(linePoints[i][0], linePoints[i][1], linePoints[i+1][0], linePoints[i+1][1]);
    }
  }

  // Rate Dots
  set(doc, { fill: C.AMBER });
  linePoints.forEach(pt => {
    doc.circle(pt[0], pt[1], 1.0, 'F');
  });

  // Legend
  const lx = chartX + chartW - 35;
  const ly = chartY + 2;
  set(doc, { fill: C.ACCENT });
  doc.rect(lx, ly, 5, 2.5, 'F');
  font(doc, 'normal', 6);
  set(doc, { text: C.TEXT });
  doc.text('Revenue', lx + 7, ly + 2.5);

  set(doc, { fill: C.AMBER });
  doc.rect(lx, ly + 5, 5, 1.5, 'F');
  doc.circle(lx + 2.5, ly + 5.75, 1.2, 'F');
  doc.text('Rate R/km', lx + 7, ly + 7.5);
}

// ---------------------------------------------------------------------------
// RATE BAR CHART (client rate/km)
// ---------------------------------------------------------------------------
function drawRateBars(
  doc: jsPDF, clients: ClientStat[], avgRate: number,
  x: number, y: number, w: number, h: number
) {
  const filtered = clients.filter(c => c.km > 0).slice(0, 10);
  if (filtered.length === 0) return;
  // Sort descending by rate to match visually
  filtered.sort((a, b) => (b.revenue / b.km) - (a.revenue / a.km));

  const rates = filtered.map(c => c.revenue / c.km);
  const maxRate = Math.max(...rates, avgRate * 1.5);
  const maxRateScale = Math.max(Math.ceil((maxRate * 1.1) / 20) * 20, 20);

  const chartW = w - 40; // leaving extra space right side
  const chartX = x + 16;
  const chartH = h - 24; // Extra space for labels at bottom
  const chartY = y + 10;
  
  const barW = (chartW / filtered.length) * 0.65;
  const gap = chartW / filtered.length;

  // Grid & Left Y Axis
  const ticks = 5;
  font(doc, 'normal', 6);
  for (let i = 0; i <= ticks; i++) {
    const py = chartY + chartH - (i / ticks) * chartH;
    
    set(doc, { stroke: C.LGRAY, lw: 0.15 });
    if (i > 0) doc.line(chartX, py, chartX + chartW, py);
    
    set(doc, { stroke: C.MGRAY, lw: 0.2 });
    doc.line(chartX - 1.5, py, chartX, py);
    
    const tickVal = maxRateScale * (i / ticks);
    set(doc, { text: C.DGRAY });
    const tStr = `${Math.round(tickVal)}`;
    doc.text(tStr, chartX - 3 - doc.getTextWidth(tStr), py + 2);
  }

  // Spines
  set(doc, { stroke: C.MGRAY, lw: 0.2 });
  doc.line(chartX, chartY, chartX, chartY + chartH); // Left
  doc.line(chartX, chartY + chartH, chartX + chartW, chartY + chartH); // Bottom

  // Bars
  filtered.forEach((c, i) => {
    const rate = rates[i];
    const bh = (rate / maxRateScale) * chartH;
    const bx = chartX + i * gap + gap / 2 - barW / 2;
    const by = chartY + chartH - bh;
    const color = rate >= avgRate ? C.GREEN : C.AMBER;

    set(doc, { fill: color });
    doc.rect(bx, by, barW, bh, 'F');

    font(doc, 'bold', 6.5);
    set(doc, { text: C.TEXT });
    const vStr = `R${rate.toFixed(2)}`;
    doc.text(vStr, bx + barW / 2 - doc.getTextWidth(vStr) / 2, by - 2);

    // Angle 45 labels
    font(doc, 'normal', 6);
    set(doc, { text: C.DGRAY });
    
    const tw = doc.getTextWidth(c.name);
    const rad = 45 * Math.PI / 180;
    const targetX = bx + barW / 2 + 2;
    const targetY = chartY + chartH + 4;
    const textX = targetX - tw * Math.cos(rad);
    const textY = targetY + tw * Math.sin(rad);
    
    doc.text(c.name, textX, textY, { angle: 45 } as any);
  });

  // Fleet Average Line
  const avgH = (avgRate / maxRateScale) * chartH;
  const avgY = chartY + chartH - avgH;
  set(doc, { stroke: C.NAVY, lw: 0.5 });
  doc.setLineDashPattern([2, 1.5], 0);
  doc.line(chartX, avgY, chartX + chartW, avgY);
  doc.setLineDashPattern([], 0);

  // Y-Axis Label
  font(doc, 'normal', 6);
  set(doc, { text: C.DGRAY });
  doc.text('R/km', chartX - 12, chartY + chartH/2 + doc.getTextWidth('R/km')/2, { angle: 90 } as any);

  // Legend (Centered Below Graph)
  const item1W = 35;
  const item2W = 35;
  const item3W = 40;
  const totalLegW = item1W + item2W + item3W;
  const lx = chartX + (chartW - totalLegW) / 2;
  // Position aggressively below X-axis labels to avoid overlap
  const ly = chartY + chartH + 24;

  set(doc, { fill: C.GREEN });
  doc.rect(lx, ly, 6, 3, 'F');
  font(doc, 'normal', 6.5);
  set(doc, { text: C.TEXT });
  doc.text('Above fleet avg', lx + 9, ly + 2.5);
  
  set(doc, { fill: C.AMBER });
  doc.rect(lx + item1W, ly, 6, 3, 'F');
  doc.text('Below fleet avg', lx + item1W + 9, ly + 2.5);
  
  set(doc, { fill: C.NAVY });
  doc.rect(lx + item1W + item2W, ly + 0.5, 8, 1.5, 'F');
  doc.text(`Fleet Avg R${avgRate.toFixed(2)}/km`, lx + item1W + item2W + 11, ly + 2.5);
}

// ---------------------------------------------------------------------------
// KPI CARD helper
// ---------------------------------------------------------------------------
function kpiCard(
  doc: jsPDF, x: number, y: number, w: number, h: number,
  value: string, label: string, sub: string, color: [number,number,number]
) {
  // Card bg
  set(doc, { fill: C.OFFWHITE, stroke: C.MGRAY, lw: 0.4 });
  doc.rect(x, y, w, h, 'FD');
  // Top colour stripe
  set(doc, { fill: color, lw: 0 });
  doc.rect(x, y, w, 2.5, 'F');
  // Value
  font(doc, 'bold', 14);
  set(doc, { text: color });
  doc.text(value, x + 6, y + 16);
  // Label
  font(doc, 'bold', 7.5);
  set(doc, { text: C.TEXT });
  doc.text(label, x + 6, y + 23);
  // Sub
  font(doc, 'normal', 6.5);
  set(doc, { text: C.DGRAY });
  doc.text(sub, x + 6, y + 29);
}

// ---------------------------------------------------------------------------
// MAIN EXPORT FUNCTION
// ---------------------------------------------------------------------------
export function exportPDF(rows: SheetExportRow[], metadata?: { dateRange: string; generatedAt: string }) {
  if (rows.length === 0) return;

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const LM = 16;
  const W = pw - LM * 2;
  const CHROME_TOP = 20;      // content starts below header
  const CHROME_BOT = ph - 12; // content ends above footer

  // Pre-aggregate
  const clients   = aggregateClients(rows);
  const drivers   = aggregateDrivers(rows);
  const totalRev  = rows.reduce((s, r) => s + r.amount, 0);
  const totalKm   = rows.reduce((s, r) => s + r.routeKm, 0);
  const completed = rows.filter(r => r.status?.toLowerCase() === 'completed' || r.status?.toLowerCase() === 'locked').length;
  const avgRate   = totalKm > 0 ? totalRev / totalKm : 0;
  const period    = metadata?.dateRange || 'Selected Period';

  // We'll draw chrome after building — need total pages first
  // jsPDF doesn't offer two-pass, so we draw chrome per-page inline
  // and fix page count post-build using setPage

  let currentPage = 1;

  const addPage = () => {
    doc.addPage();
    currentPage++;
  };

  // =====================================================================
  // PAGE 1 — EXECUTIVE COVER
  // =====================================================================
  drawChrome(doc, 1, 1, period); // placeholder; we'll rewrite pages at end
  let y = CHROME_TOP + 4;

  // Period + title
  font(doc, 'normal', 9);
  set(doc, { text: C.DGRAY });
  doc.text(`Monthly Operations Report  •  ${period}`, LM, y);
  y += 6;

  font(doc, 'bold', 26);
  set(doc, { text: C.INK });
  doc.text('Monthly Operations', LM, y + 8);
  doc.text('Report', LM, y + 20);
  y += 24;

  font(doc, 'normal', 10);
  set(doc, { text: C.DGRAY });
  doc.text('FleetCore Logistics  •  Confidential', LM, y + 4);
  y += 10;

  // Rule
  set(doc, { stroke: C.MGRAY, lw: 0.6 });
  doc.line(LM, y, LM + W, y);
  y += 8;

  // KPI CARDS
  y = sectionLabel(doc, 'Key Performance Indicators', y, LM, W);
  const cardW = (W - 6) / 4;
  const cardH = 34;
  const compRate = rows.length > 0 ? Math.round(completed / rows.length * 100) : 0;
  const cards = [
    { value: fmtCur(totalRev),    label: 'Total Revenue',    sub: period,                     color: C.ACCENT  },
    { value: `${totalKm.toLocaleString('en-ZA')} km`, label: 'Total Distance', sub: `${rows.length} routes`,   color: C.TEAL   },
    { value: `${compRate}%`,       label: 'Completion Rate',  sub: `${completed} of ${rows.length} completed`, color: C.GREEN  },
    { value: fmtRate(avgRate),     label: 'Fleet Avg Rate',   sub: 'Blended all clients',      color: C.PURPLE  },
  ];
  cards.forEach((c, i) => kpiCard(doc, LM + i * (cardW + 2), y, cardW, cardH, c.value, c.label, c.sub, c.color));
  y += cardH + 10;

  // INSIGHT BOX
  const topClient = clients[0];
  const topDriver = drivers[0];
  
  // Set font before measuring text wrap
  font(doc, 'normal', 9);
  const insightLines = doc.splitTextToSize(
    `FleetCore completed ${completed} of ${rows.length} dispatched routes, achieving a ${compRate}% completion rate ` +
    `and generating total revenue of ${fmtCur(totalRev)} across ${totalKm.toLocaleString('en-ZA')} km of operations. ` +
    (topClient ? `${topClient.name} led revenue at ${fmtCur(topClient.revenue)} (${(topClient.revenue / totalRev * 100).toFixed(0)}% of total). ` : '') +
    (topDriver ? `Top earner was ${topDriver.name} at ${fmtCur(topDriver.revenue)}.` : '') +
    (avgRate > 0 ? ` Fleet averaged ${fmtRate(avgRate)}.` : ''),
    W - 20
  );
  const boxH = insightLines.length * 5.5 + 22;
  set(doc, { fill: [239,246,255] as [number,number,number], stroke: C.MGRAY, lw: 0.4 });
  doc.rect(LM, y, W, boxH, 'FD');
  set(doc, { fill: C.ACCENT, lw: 0 });
  doc.rect(LM, y, W, 2, 'F');
  font(doc, 'bold', 9.5);
  set(doc, { text: C.TEXT });
  doc.text('Executive Summary', LM + 10, y + 10);
  font(doc, 'normal', 9);
  doc.text(insightLines, LM + 10, y + 18);

  // =====================================================================
  // PAGE 2 — CLIENT PERFORMANCE
  // =====================================================================
  addPage();
  y = CHROME_TOP + 4;

  font(doc, 'bold', 18);
  set(doc, { text: C.INK });
  doc.text('Client Performance', LM, y + 6);
  y += 8;
  font(doc, 'normal', 9);
  set(doc, { text: C.DGRAY });
  doc.text(`Revenue and rate analysis by client — ${period}`, LM, y + 4);
  y += 10;

  // Revenue bar
  y = sectionLabel(doc, 'Revenue by Client', y, LM, W);
  const chartH1 = 60;
  drawHBar(doc, clients, totalRev, LM, y, W, chartH1);
  y += chartH1 + 12;

  // Donut (Centered below bar chart)
  const dntCx = LM + W / 2;
  const dntCy = y + 20;
  const dntR = 20;
  drawDonut(doc, clients, totalRev, dntCx, dntCy, dntR);

  // Legend (Centered below donut)
  const top5 = clients.slice(0, 5);
  const legendItemW = 32;
  const totalLegendW = top5.length * legendItemW;
  const legendStartX = LM + (W - totalLegendW) / 2;
  
  top5.forEach((c, i) => {
    const lx = legendStartX + i * legendItemW;
    const ly = dntCy + dntR + 12;
    set(doc, { fill: CLIENT_PALETTE[i] });
    doc.rect(lx, ly - 3, 4, 3.5, 'F');
    font(doc, 'normal', 6.5);
    set(doc, { text: C.TEXT });
    doc.text(c.name.length > 10 ? c.name.slice(0, 9) + '…' : c.name, lx + 6, ly);
  });

  y += 56; // Add space for donut and legend

  // Rate/km chart
  y += 6;
  y = sectionLabel(doc, 'Rate per KM by Client', y, LM, W);
  y += 2;
  font(doc, 'bold', 14);
  set(doc, { text: C.NAVY });
  doc.text('Rate per KM by Client', LM, y);
  y += 8;
  drawRateBars(doc, clients, avgRate, LM, y, W, 55);
  y += 70;

  // =====================================================================
  // PAGE 3 — DRIVER PERFORMANCE
  // =====================================================================
  addPage();
  y = CHROME_TOP + 4;

  font(doc, 'bold', 18);
  set(doc, { text: C.INK });
  doc.text('Driver Performance', LM, y + 6);
  y += 8;
  font(doc, 'normal', 9);
  set(doc, { text: C.DGRAY });
  doc.text(`Individual revenue, distance, and efficiency — ${period}`, LM, y + 4);
  y += 10;

  y = sectionLabel(doc, 'Top 10 Drivers — Revenue & Rate', y, LM, W);
  drawDriverBars(doc, drivers, avgRate, LM, y, W, 75);
  y += 81;

  // Driver scatter
  y += 4;
  y = sectionLabel(doc, 'Driver Efficiency Scatter', y, LM, W);
  y += 2;
  font(doc, 'bold', 14);
  set(doc, { text: C.NAVY });
  doc.text('Driver Efficiency Scatter', LM, y);
  y += 6;
  const scH = CHROME_BOT - y - 10;
  const activeDrivers = drivers.filter(d => d.km > 0);

  if (activeDrivers.length > 0) {
    const maxDRev = Math.max(...activeDrivers.map(d => d.revenue));
    const maxDKm  = Math.max(...activeDrivers.map(d => d.km));
    const maxDRate = Math.max(...activeDrivers.map(d => d.revenue / d.km));
    const minDRate = Math.min(...activeDrivers.map(d => d.revenue / d.km));
    
    const maxRevScale = Math.max(Math.ceil((maxDRev * 1.1) / 10000) * 10000, 10000);
    const maxKmScale = Math.max(Math.ceil((maxDKm * 1.1) / 200) * 200, 200);
    const maxRateScale = Math.max(Math.ceil(maxDRate / 20) * 20, 20);
    const minRateScale = Math.floor(minDRate / 20) * 20;

    const chartX = LM + 18;
    const chartW = W - 48; // Leave right margin for Colorbar
    const chartY = y;
    const chartH = scH - 12; // Leave bottom margin for X axis
    
    // Grid & Left Y Axis
    const yTicks = 6;
    font(doc, 'normal', 6);
    for (let i = 0; i <= yTicks; i++) {
        const py = chartY + chartH - (i / yTicks) * chartH;
        set(doc, { stroke: C.LGRAY, lw: 0.1 });
        if (i > 0) doc.line(chartX, py, chartX + chartW, py);
        
        set(doc, { stroke: C.MGRAY, lw: 0.15 });
        doc.line(chartX - 1.5, py, chartX, py);
        const revTick = (maxRevScale * (i / yTicks)) / 1000;
        set(doc, { text: C.DGRAY });
        const revStr = `R${Math.round(revTick)}k`;
        doc.text(revStr, chartX - 3 - doc.getTextWidth(revStr), py + 2);
    }

    // Grid & Bottom X Axis
    const xTicks = 8;
    for (let i = 0; i <= xTicks; i++) {
        const px = chartX + (i / xTicks) * chartW;
        set(doc, { stroke: C.LGRAY, lw: 0.1 });
        if (i > 0 && i < xTicks) doc.line(px, chartY, px, chartY + chartH);

        set(doc, { stroke: C.MGRAY, lw: 0.15 });
        doc.line(px, chartY + chartH, px, chartY + chartH + 1.5);
        if (i > 0) {
            const kmTick = maxKmScale * (i / xTicks);
            const kmStr = `${Math.round(kmTick)}km`;
            set(doc, { text: C.DGRAY });
            doc.text(kmStr, px - doc.getTextWidth(kmStr)/2, chartY + chartH + 5);
        }
    }

    // Spines (Left and Bottom only)
    set(doc, { stroke: C.MGRAY, lw: 0.15 });
    doc.line(chartX, chartY, chartX, chartY + chartH);
    doc.line(chartX, chartY + chartH, chartX + chartW, chartY + chartH);

    // Color gradient (Light Blue [224, 242, 254] to Navy [30, 64, 175])
    const cMin = [224, 242, 254];
    const cMax = [30, 64, 175];
    function getDotC(rate: number): [number,number,number] {
        const t = Math.max(0, Math.min(1, (rate - minRateScale) / (maxRateScale - minRateScale || 1)));
        return [
            Math.round(cMin[0] + t * (cMax[0] - cMin[0])),
            Math.round(cMin[1] + t * (cMax[1] - cMin[1])),
            Math.round(cMin[2] + t * (cMax[2] - cMin[2]))
        ];
    }

    // Draw Dots
    activeDrivers.forEach((d, i) => {
        const px = chartX + (d.km / maxKmScale) * chartW;
        const py = chartY + chartH - (d.revenue / maxRevScale) * chartH;
        const rate = d.revenue / d.km;
        
        set(doc, { fill: getDotC(rate) });
        doc.circle(px, py, 2.0, 'F');
        
        if (i < 5) {
            font(doc, 'normal', 6);
            set(doc, { text: C.TEXT });
            const last = d.name.split(' ').pop() || d.name;
            doc.text(last, px + 3, py - 2);
        }
    });

    // Axis Labels
    set(doc, { text: C.DGRAY });
    doc.text('Revenue', chartX - 14, chartY + chartH/2 + doc.getTextWidth('Revenue')/2, { angle: 90 } as any);
    doc.text('Distance (km)', chartX + chartW/2 - doc.getTextWidth('Distance (km)')/2, chartY + chartH + 11);

    // Colorbar on the Right
    const cbX = chartX + chartW + 10;
    const cbY = chartY + 10;
    const cbW = 4;
    const cbH = chartH - 20;
    
    // Draw gradient chunks
    const cbSteps = 20;
    for(let i=0; i<cbSteps; i++) {
        const t1 = i/cbSteps;
        const t2 = (i+1)/cbSteps;
        const cy1 = cbY + cbH - t1*cbH;
        const cy2 = cbY + cbH - t2*cbH;
        const rateVal = minRateScale + t1 * (maxRateScale - minRateScale);
        
        set(doc, { fill: getDotC(rateVal) });
        doc.rect(cbX, cy2, cbW, cy1 - cy2, 'F');
    }
    
    set(doc, { stroke: C.MGRAY, lw: 0.1 });
    doc.rect(cbX, cbY, cbW, cbH);
    
    const cbTicks = 5;
    for(let i=0; i<=cbTicks; i++) {
        const cy = cbY + cbH - (i/cbTicks)*cbH;
        set(doc, { stroke: C.MGRAY, lw: 0.15 });
        doc.line(cbX + cbW, cy, cbX + cbW + 1.5, cy);
        
        const tickVal = minRateScale + (i/cbTicks) * (maxRateScale - minRateScale);
        set(doc, { text: C.DGRAY });
        const tkStr = `${Math.round(tickVal)}`;
        doc.text(tkStr, cbX + cbW + 3, cy + 2);
    }
    
    doc.text('Rate R/km', cbX + cbW + 14, cbY + cbH/2 + doc.getTextWidth('Rate R/km')/2, { angle: 90 } as any);
  }

  // =====================================================================
  // PAGE 4 — DRIVER LEADERBOARD
  // =====================================================================
  addPage();
  y = CHROME_TOP + 4;

  font(doc, 'bold', 18);
  set(doc, { text: C.INK });
  doc.text('Full Driver Leaderboard', LM, y + 6);
  y += 8;
  font(doc, 'normal', 9);
  set(doc, { text: C.DGRAY });
  doc.text(`All drivers ranked by revenue — ${period}`, LM, y + 4);
  y += 10;

  y = sectionLabel(doc, 'Driver Rankings', y, LM, W);

  const leaderRows = drivers.map((d, i) => {
    const rate = d.km > 0 ? d.revenue / d.km : 0;
    return [
      `${i + 1}`,
      d.name,
      fmtCur(d.revenue),
      d.km > 0 ? d.km.toLocaleString('en-ZA') : '—',
      rate > 0 ? `R${rate.toFixed(2)}` : '—',
    ];
  });

  const medalColors: [number,number,number][] = [C.AMBER, C.DGRAY, [205,127,50]];

  autoTable(doc, {
    startY: y,
    head: [['#', 'DRIVER', 'REVENUE', 'KM', 'RATE/KM']],
    body: leaderRows,
    theme: 'grid',
    headStyles: {
      fillColor: C.NAVY, textColor: C.WHITE,
      fontStyle: 'bold', fontSize: 8,
    },
    columnStyles: {
      0: { halign: 'center', cellWidth: W * 0.06 },
      1: { halign: 'left',   cellWidth: W * 0.32 },
      2: { halign: 'right',  cellWidth: W * 0.20 },
      3: { halign: 'right',  cellWidth: W * 0.16 },
      4: { halign: 'right',  cellWidth: W * 0.26 },
    },
    bodyStyles: { fontSize: 8, textColor: C.TEXT },
    alternateRowStyles: { fillColor: C.OFFWHITE },
    styles: { cellPadding: { top: 3, bottom: 3, left: 2, right: 2 } },
    margin: { left: LM, right: LM },
    didParseCell: (data) => {
      if (data.section === 'body') {
        const rowIdx = data.row.index;
        if (rowIdx < 3) {
          if (data.column.index === 1) {
            data.cell.styles.fontStyle = 'bold';
          }
          if (data.column.index === 2) {
            const mc = medalColors[rowIdx];
            data.cell.styles.textColor = mc;
            data.cell.styles.fontStyle = 'bold';
          }
        }
      }
    },
    didDrawPage: () => {},
  });

  // =====================================================================
  // PAGES 5+ — ROUTE DETAIL
  // =====================================================================
  addPage();
  y = CHROME_TOP + 4;

  font(doc, 'bold', 18);
  set(doc, { text: C.INK });
  doc.text('Route Detail', LM, y + 6);
  y += 8;
  font(doc, 'normal', 9);
  set(doc, { text: C.DGRAY });
  doc.text(`Complete route log — ${period}  •  ${rows.length} routes shown`, LM, y + 4);
  y += 10;

  y = sectionLabel(doc, 'Route Log', y, LM, W);

  const routeBody = rows.map(r => [
    r.date,
    r.truck,
    r.driver,
    r.client,
    r.from,
    r.to,
    r.routeKm > 0 ? `${r.routeKm.toLocaleString('en-ZA')}` : '—',
    fmtCur(r.amount),
    r.ratePerKm > 0 ? `R${r.ratePerKm.toFixed(2)}` : '—',
  ]);

  autoTable(doc, {
    startY: y,
    head: [['DATE','TRUCK','DRIVER','CLIENT','FROM','TO','KM','REVENUE','R/KM']],
    body: routeBody,
    theme: 'grid',
    headStyles: {
      fillColor: C.NAVY, textColor: C.WHITE,
      fontStyle: 'bold', fontSize: 7.5,
    },
    columnStyles: {
      0: { cellWidth: W * 0.11, halign: 'center' },
      1: { cellWidth: W * 0.08, halign: 'center', fontStyle: 'bold', textColor: C.NAVY },
      2: { cellWidth: W * 0.15, halign: 'left' },
      3: { cellWidth: W * 0.15, halign: 'left' },
      4: { cellWidth: W * 0.14, halign: 'left' },
      5: { cellWidth: W * 0.12, halign: 'left' },
      6: { cellWidth: W * 0.07, halign: 'right' },
      7: { cellWidth: W * 0.10, halign: 'right', fontStyle: 'bold', textColor: C.ACCENT },
      8: { cellWidth: W * 0.08, halign: 'right' },
    },
    bodyStyles: { fontSize: 7.5, textColor: C.TEXT },
    alternateRowStyles: { fillColor: C.OFFWHITE },
    styles: { cellPadding: { top: 3, bottom: 3, left: 1.5, right: 1.5 } },
    margin: { left: LM, right: LM },
    didDrawPage: () => {},
  });

  // TOTALS ROW
  const finalY = (doc as any).lastAutoTable?.finalY ?? CHROME_BOT - 20;
  if (finalY + 18 < CHROME_BOT) {
    const blendedRate = totalKm > 0 ? totalRev / totalKm : 0;
    const totCols = [W*0.75, W*0.07, W*0.10, W*0.08];
    autoTable(doc, {
      startY: finalY + 6,
      body: [[
        `MONTH TOTALS   |   ${completed}/${rows.length} routes completed (${compRate}%)`,
        `${totalKm.toLocaleString('en-ZA')}`,
        fmtCur(totalRev),
        `R${blendedRate.toFixed(2)}`,
      ]],
      theme: 'grid',
      styles: { cellPadding: { top: 3, bottom: 3, left: 1.5, right: 1.5 } },
      bodyStyles: { fontSize: 8, fontStyle: 'bold', fillColor: C.OFFWHITE, textColor: C.TEXT },
      columnStyles: {
        0: { cellWidth: totCols[0], halign: 'left' },
        1: { cellWidth: totCols[1], halign: 'right' },
        2: { cellWidth: totCols[2], halign: 'right', textColor: C.ACCENT },
        3: { cellWidth: totCols[3], halign: 'right' },
      },
      margin: { left: LM, right: LM },
    });
  }

  // =====================================================================
  // APPLY CHROME TO ALL PAGES
  // =====================================================================
  const totalPages = (doc as any).internal.pages.length - 1;
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    drawChrome(doc, p, totalPages, period);
  }

  // SAVE
  const safePeriod = period.replace(/[^a-z0-9]/gi, '_').toLowerCase();
  doc.save(`fleetcore_report_${safePeriod}.pdf`);
}
