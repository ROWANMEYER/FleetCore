"use client";

import { ChevronDown, Trash2 } from "lucide-react";
import type { Id } from "@/convex/_generated/dataModel";
import { DASH, formatDay, formatLongDay, formatPercent, formatRand, formatSignedPercent, formatSignedRand, movementText, movementArrow, movementWord } from "@/src/lib/fuel/display";
import css from "./fuel.module.css";

type HistoryRow = {
  _id: Id<"fuelPrices">; effectiveDate: string; pricePerLitre: number; notes: string;
  change: number | null; percentChange: number | null; carriedPercent: number | null;
  compositionPercent?: number;
};
function Movement({ value, format }: { value: number | null; format: (value: number) => string }) {
  return <span className={movementText(value)}>{value === null ? DASH : <><span aria-hidden="true">{movementArrow(value)} </span><span className="sr-only">{movementWord(value)} </span>{format(value)}</>}</span>;
}
export function FuelHistoryCards({ rows, latestId, onRemove }: { rows: HistoryRow[]; latestId?: string; onRemove: (id: Id<"fuelPrices">) => void }) {
  return <div className={css.historyCards} aria-label="Recorded fuel prices">{rows.map((row) => <details key={row._id} className={css.historyCard} data-latest={row._id === latestId}>
    <summary>
      <span className={css.historyDate}><strong>{formatDay(row.effectiveDate)}</strong>{row._id === latestId && <small>Latest</small>}<span>Effective date</span></span>
      <span className={css.historyPrice}><strong>{formatRand(row.pricePerLitre)}</strong><span>per litre</span></span>
      <span className={css.historyMovement}><span>Price change</span><strong><Movement value={row.percentChange} format={formatSignedPercent} /></strong></span>
      <ChevronDown size={17} className={css.historyChevron} />
    </summary>
    <div className={css.historyDetails}>
      <dl>
        <div><dt>Rand difference</dt><dd><Movement value={row.change} format={formatSignedRand} /></dd></div>
        <div><dt>Diesel change</dt><dd><Movement value={row.percentChange} format={formatSignedPercent} /></dd></div>
        <div><dt>Fuel composition</dt><dd>{row.compositionPercent === undefined ? DASH : formatPercent(row.compositionPercent)}</dd></div>
        <div><dt>Carried rate impact</dt><dd><Movement value={row.carriedPercent} format={formatSignedPercent} /></dd></div>
      </dl>
      <p className={css.historyNote}>{row.notes || "No notes recorded."}</p>
      <button type="button" className={css.remove} onClick={() => onRemove(row._id)} aria-label={`Remove the price for ${formatLongDay(row.effectiveDate)}`}><Trash2 size={16} />Remove price</button>
    </div>
  </details>)}</div>;
}
