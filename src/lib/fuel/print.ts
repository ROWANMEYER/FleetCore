/**
 * The diesel price history as a sheet of paper.
 *
 * A printout is a different medium from the screen, so it gets its own document
 * rather than a print stylesheet trying to squeeze the app into A4. The screen
 * carries a delete button on every row, a chart drawn in SVG and a panel of
 * selects; none of those belong on paper, so the printout is built from the same
 * rows and the same ordering rule and then deliberately drops what does not
 * travel. The action column going is the clearest example of a difference that
 * is a feature rather than an omission.
 *
 * Two things are carried across on purpose. The direction of a move travels as
 * an arrow as well as a sign, because a printout is as likely to come out of a
 * greyscale laser printer as a colour one, so colour is never the only signal
 * here. And every figure goes through the same formatters the screen uses, so a
 * number on paper is character for character the number the reader was just
 * looking at.
 *
 * No webfont is loaded. The print window is a fresh document with no next/font
 * CSS in it, and asking a printer to fetch a font mid job is a way to get a
 * half rendered page, so the system stack stands in for Inter.
 *
 * Pure string building throughout: nothing here reads a clock, touches the
 * database or writes, so what lands on the page can be asserted in a test.
 */
import {
  DASH,
  formatDay,
  formatLongDay,
  formatPercent,
  formatRand,
  formatSignedPercent,
  formatSignedRand,
  movementArrow,
  orderForDisplay,
  type OrderableRow,
} from "./display";

/**
 * Escapes text going into the document.
 *
 * The notes column is free text typed by an admin, and this string is written
 * straight into a document with document.write, so an unescaped note is a
 * script injection rather than a formatting quirk. Everything user supplied goes
 * through here, including the apostrophe, because a cell can end up inside a
 * single quoted attribute.
 */
function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** What a printable row needs. The same fields the on-screen table reads. */
export type PrintableFuelRow = OrderableRow & {
  _id: string;
  pricePerLitre: number;
  compositionPercent?: number;
  notes: string;
};

/**
 * The comparison panel, as far as the printout cares.
 *
 * Structural rather than a re-export of MonthComparison, so this module does not
 * depend on the comparison generics: the shape is small, and a MonthComparison
 * satisfies it as it stands.
 */
export type PrintableComparison = {
  fromKey: string;
  toKey: string;
  baseline: { label: string; price: number; row: { effectiveDate: string } } | null;
  comparison: { label: string; price: number; row: { effectiveDate: string } } | null;
  randDifference: number | null;
  dieselPercentChange: number | null;
};

export type FuelPrintOptions = {
  rows: PrintableFuelRow[];
  /** Prints the rows in the order the reader has the table in. */
  newestFirst: boolean;
  /** Printed only when the reader has a month comparison open. */
  comparison?: PrintableComparison | null;
  /** Passed in rather than read, so the document is a function of its inputs. */
  printedAt: Date;
};

const COMPANY = "Anton Le Roux Vervoer";

/** "28 Sept 2026 at 09:30" off the local date, so a morning print cannot read as yesterday. */
function formatMoment(date: Date): string {
  if (Number.isNaN(date.getTime())) return DASH;
  const stamp = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  return `${date.toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" })} at ${stamp}`;
}

/**
 * The three headline figures, worked out from the newest record.
 *
 * Null in, null out: a record with no previous price, or no composition, has to
 * print the dash rather than a zero that would read as a real figure of nothing.
 */
function headline(label: string, value: number | null, render: (value: number) => string, detail: string): string {
  return summaryCell(label, value === null ? DASH : render(value), detail);
}

/**
 * A figure with its direction, as one cell of text.
 *
 * The arrow is what makes a move readable without colour, so a fall and a rise
 * stay apart on a black and white printout. An absent figure is the dash rather
 * than a zero, for the same reason it is on screen: the first price in a history
 * has no previous price to move against, and that is not a change of nothing.
 */
function movementCell(rand: number | null, percent: number | null): string {
  if (rand === null) return DASH;
  const arrow = movementArrow(rand);
  const prefix = arrow ? `${arrow} ` : "";
  // Both figures are printed, because a rand move and a percentage move are
  // different claims and one of them alone leaves the other unsaid.
  return percent === null
    ? `${prefix}${formatSignedRand(rand)}`
    : `${prefix}${formatSignedRand(rand)}<br />${formatSignedPercent(percent)}`;
}

function summaryCell(label: string, value: string, detail: string): string {
  return `<div class="cell">
    <p class="cell-label">${escapeHtml(label)}</p>
    <p class="cell-value">${escapeHtml(value)}</p>
    <p class="cell-detail">${escapeHtml(detail)}</p>
  </div>`;
}

function comparisonSection(comparison: PrintableComparison): string {
  const side = (heading: string, entry: PrintableComparison["baseline"]) =>
    `<div class="side">
      <p class="cell-label">${escapeHtml(heading)}</p>
      ${
        entry
          ? `<p class="cell-value">${escapeHtml(formatRand(entry.price))}</p>
             <p class="cell-detail">${escapeHtml(entry.label)} · from ${escapeHtml(formatDay(entry.row.effectiveDate))}</p>`
          : `<p class="cell-value">${DASH}</p>
             <p class="cell-detail">No price recorded in that month.</p>`
      }
    </div>`;

  return `<section class="block">
    <h2 class="block-title">Compare months</h2>
    <div class="sides">
      ${side("From · baseline", comparison.baseline)}
      ${side("To · comparison", comparison.comparison)}
      <div class="side">
        <p class="cell-label">Rand difference</p>
        <p class="cell-value">${comparison.randDifference === null ? DASH : escapeHtml(formatSignedRand(comparison.randDifference))}</p>
        <p class="cell-detail">Diesel change ${
          comparison.dieselPercentChange === null ? DASH : escapeHtml(formatSignedPercent(comparison.dieselPercentChange))
        }</p>
      </div>
    </div>
  </section>`;
}

const STYLES = `
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: "Segoe UI", system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif;
    color: #0f172a;
    font-size: 12px;
    line-height: 1.45;
  }
  .sheet { padding: 18px 20px 0; }
  .head { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; border-bottom: 2px solid #0f172a; padding-bottom: 8px; }
  .head h1 { margin: 0; font-size: 18px; letter-spacing: -0.01em; }
  .head p { margin: 2px 0 0; color: #475569; font-size: 11px; }
  .head-meta { text-align: right; color: #475569; font-size: 11px; white-space: nowrap; }
  .head-meta strong { display: block; color: #0f172a; font-size: 12px; }
  .block { margin-top: 18px; }
  .block-title { margin: 0 0 8px; font-size: 13px; }
  .cells { display: flex; gap: 10px; }
  .cell, .side { flex: 1; border: 1px solid #cbd5e1; border-radius: 4px; padding: 8px 10px; }
  .cell-label, .cell-detail { margin: 0; color: #475569; font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; }
  .cell-detail { text-transform: none; letter-spacing: 0; margin-top: 3px; }
  .cell-value { margin: 4px 0 0; font-size: 15px; font-weight: 700; font-variant-numeric: tabular-nums; }
  table { width: 100%; border-collapse: collapse; margin-top: 6px; }
  thead { display: table-header-group; }
  th { background: #f1f5f9; border-bottom: 1px solid #94a3b8; padding: 6px 6px; text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; color: #334155; }
  td { border-bottom: 1px solid #e2e8f0; padding: 5px 6px; vertical-align: top; }
  .n { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .date { white-space: nowrap; }
  .notes { color: #334155; }
  .tag { display: inline-block; border: 1px solid #0891b2; border-radius: 999px; padding: 0 6px; font-size: 9px; text-transform: uppercase; letter-spacing: 0.04em; color: #0e7490; margin-left: 6px; }
  tr.latest td { background: #ecfeff; }
  .empty { padding: 24px 0; text-align: center; color: #475569; }
  .foot { margin-top: 22px; border-top: 1px solid #cbd5e1; padding: 8px 0 0; color: #475569; font-size: 10px; display: flex; justify-content: space-between; gap: 16px; }
  @page { size: A4 portrait; margin: 12mm; }
  /* Long histories break over pages, and a lone heading at the foot of a page
     reads as the end of the table. Keeping the header row on every page stops
     a continuation page being a column of numbers with no labels. */
  tr { break-inside: avoid; }
`;

/**
 * Renders the whole printout as a standalone document.
 *
 * The rows go out in the order the reader has chosen, but the summary is worked
 * out from the chronological sequence regardless. That is deliberate: flipping
 * the sort is a reading convenience, and the headline figures must not change
 * because someone reversed the table.
 */
export function fuelHistoryPrintHtml({ rows, newestFirst, comparison = null, printedAt }: FuelPrintOptions): string {
  const chronological = orderForDisplay(rows, false);
  const displayed = orderForDisplay(rows, newestFirst);
  const latest = chronological.at(-1) ?? null;
  const latestId = latest?._id ?? null;

  const summary = `<section class="block">
    <h2 class="block-title">Summary</h2>
    <div class="cells">
      ${summaryCell(
        "Latest diesel price",
        latest ? formatRand(latest.pricePerLitre) : DASH,
        latest ? `per litre · effective ${formatLongDay(latest.effectiveDate)}` : "Nothing recorded yet",
      )}
      ${headline(
        "Change from previous",
        latest ? latest.percentChange : null,
        formatSignedPercent,
        latest && latest.change !== null
          ? `${formatSignedRand(latest.change)} a litre on the previous price`
          : latest
            ? "No earlier price to compare against"
            : "Nothing recorded yet",
      )}
      ${headline(
        "Carried rate impact",
        latest ? latest.carriedPercent : null,
        formatSignedPercent,
        latest && latest.compositionPercent !== undefined
          ? `at ${formatPercent(latest.compositionPercent)} composition`
          : latest
            ? "No composition recorded"
            : "Nothing recorded yet",
      )}
    </div>
  </section>`;

  const body = displayed
    .map(row => {
      const isLatest = row._id === latestId;
      return `<tr class="${isLatest ? "latest" : ""}">
        <td class="date">${escapeHtml(formatDay(row.effectiveDate))}${isLatest ? '<span class="tag">Latest</span>' : ""}</td>
        <td class="n">${escapeHtml(formatRand(row.pricePerLitre))}</td>
        <td class="n">${movementCell(row.change, row.percentChange)}</td>
        <td class="n">${row.compositionPercent === undefined ? DASH : escapeHtml(formatPercent(row.compositionPercent))}</td>
        <td class="n">${row.carriedPercent === null ? DASH : escapeHtml(formatSignedPercent(row.carriedPercent))}</td>
        <td class="notes">${escapeHtml(row.notes || DASH)}</td>
      </tr>`;
    })
    .join("");

  const table = displayed.length
    ? `<table>
        <thead>
          <tr>
            <th>Effective date</th>
            <th class="n">Diesel price</th>
            <th class="n">Price change</th>
            <th class="n">Composition</th>
            <th class="n">Carried impact</th>
            <th>Notes</th>
          </tr>
        </thead>
        <tbody>${body}</tbody>
      </table>`
    : '<p class="empty">No diesel price recorded yet.</p>';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Fuel price history</title>
<style>${STYLES}</style>
</head>
<body>
  <div class="sheet">
    <header class="head">
      <div>
        <h1>Fuel price history</h1>
        <p>${escapeHtml(COMPANY)}</p>
      </div>
      <div class="head-meta">
        <strong>${displayed.length} ${displayed.length === 1 ? "price" : "prices"} recorded</strong>
        Printed ${escapeHtml(formatMoment(printedAt))}<br />
        Listed ${newestFirst ? "newest first" : "oldest first"}
      </div>
    </header>

    ${summary}

    ${comparison ? comparisonSection(comparison) : ""}

    <section class="block">
      <h2 class="block-title">Price history</h2>
      ${table}
    </section>

    <div class="foot">
      <span>${escapeHtml(COMPANY)} · 2 Meul Straat, George Industria, George, 6536</span>
      <span>063 257 0340 · 044 874 2292 · rowan@alrtpt.co.za</span>
    </div>
  </div>
</body>
</html>`;
}
