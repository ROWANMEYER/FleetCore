"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Plus, Printer, Trash2, X, ArrowRightLeft, ChevronDown, Maximize2, Minimize2 } from "lucide-react";
import type { Id } from "@/convex/_generated/dataModel";
import { api } from "@/convex/_generated/api";
import { MAX_PRICE, priceProblem } from "@/convex/fuelPriceFields";
import { useAuth } from "@/src/components/auth/AuthProvider";
import { ConfirmDialog } from "@/src/components/common/ConfirmDialog";
import { EmptyState } from "@/src/components/common/EmptyState";
import { SkeletonCard, SkeletonKpiGrid } from "@/src/components/common/Skeleton";
import { DieselTrendChart } from "@/src/components/fuel/DieselTrendChart";
import { useTilt } from "@/src/hooks/useTilt";
import {
  DASH,
  formatDay,
  formatLongDay,
  formatPercent,
  formatRand,
  formatSignedPercent,
  formatSignedRand,
  movementArrow,
  movementText,
  movementWord,
  orderForDisplay,
} from "@/src/lib/fuel/display";
import {
  availableMonths,
  compareMonths,
  compositionProblem,
  compositionValue,
  defaultPair,
  estimatedRateImpact,
  monthLabel,
} from "@/src/lib/fuel/compare";
import { fuelHistoryPrintHtml } from "@/src/lib/fuel/print";
import { useCollapsedCards } from "@/src/lib/fuel/collapsedCards";

/**
 * The diesel price history and what it does to a rate.
 *
 * The records hold a date, a price per litre, an optional composition and a
 * note. Everything else on this screen is worked out: the change in rand, the
 * percentage, and the part of that percentage the composition carries. None of
 * it is typed in, so none of it can drift away from the prices it came from.
 *
 * The list arrives in date order, oldest first, and the movement figures are
 * worked out in that order. Switching the table to newest first is a display
 * choice only: it reverses the rows for drawing and leaves the figures alone,
 * so no order of reading can invent a movement that did not happen.
 */
const input = "settings-input";
const today = () => new Date().toISOString().slice(0, 10);

type FuelRow = {
  _id: Id<"fuelPrices">;
  effectiveDate: string;
  pricePerLitre: number;
  compositionPercent?: number;
  notes: string;
  change: number | null;
  percentChange: number | null;
  carriedPercent: number | null;
};

/**
 * Which field a complaint is about, so the message can sit under that field
 * rather than in a lump at the bottom. The wording of the complaint itself
 * still comes from the one shared rule.
 */
function offendingField(problem: string | null): "date" | "price" | "composition" | null {
  if (!problem) return null;
  if (problem.includes("effective date")) return "date";
  if (problem.includes("composition")) return "composition";
  return "price";
}

const FIELD_COMPLAINTS: Record<"date" | "price" | "composition", string> = {
  date: "Enter the date this price took effect.",
  price: `Enter a diesel price above zero and below R ${MAX_PRICE} a litre.`,
  composition: "Enter a composition between 0 and 100%, or leave it blank.",
};

/** A signed figure with an arrow, so the direction survives without colour. */
function Delta({ value, render }: { value: number | null; render: (value: number) => string }) {
  if (value === null) return <span className="text-[var(--nav-text-color)]">{DASH}</span>;
  return (
    <span className={`inline-flex items-center gap-1 ${movementText(value)}`}>
      <span aria-hidden="true" className="text-[0.7em] leading-none">{movementArrow(value)}</span>
      <span className="sr-only">{movementWord(value)} </span>
      {render(value)}
    </span>
  );
}

/**
 * The small chevron that folds a card down to its headline.
 *
 * Present rather than hidden: a card that folds but gives no sign that it can
 * would be a trap for anyone who did not already know. It sits in the card's
 * own corner so it never shifts the figure it belongs to, and it is a real
 * button with aria-expanded, so a screen reader is told the state rather than
 * having to infer it from a rotated triangle.
 */
function FoldToggle({
  label,
  collapsed,
  onToggle,
}: {
  label: string;
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={!collapsed}
      aria-label={`${collapsed ? "Show" : "Hide"} ${label} detail`}
      title={collapsed ? `Show ${label.toLowerCase()}` : `Hide ${label.toLowerCase()}`}
      className="inline-flex shrink-0 cursor-pointer items-center justify-center rounded-md border border-[var(--card-border)] p-1.5 text-[var(--nav-text-color)] transition-colors hover:bg-[var(--card-bg)] hover:text-[var(--foreground)] active:bg-[var(--card-bg)] focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
    >
      <ChevronDown
        className={`h-4 w-4 transition-transform duration-200 ${collapsed ? "" : "rotate-180"}`}
        aria-hidden="true"
      />
    </button>
  );
}

/**
 * One of the three figures at the top of the page.
 *
 * Deliberately carries no progress bar: a diesel price, a percentage change and
 * a carried impact are all open ended, so a bar filled against an invented
 * maximum would be decoration pretending to be a scale. The composition is the
 * one figure here with a real ceiling, and it is shown as a bar in the table
 * where it sits beside the number it belongs to.
 */
function SummaryCard({
  label,
  value,
  valueClass = "text-[var(--foreground)]",
  detail,
  fold,
}: {
  label: string;
  value: React.ReactNode;
  valueClass?: string;
  detail: React.ReactNode;
  fold?: { collapsed: boolean; onToggle: () => void };
}) {
  const tilt = useTilt();
  return (
    <div
      data-tilt
      onMouseMove={tilt.onMouseMove}
      onMouseLeave={tilt.onMouseLeave}
      style={tilt.style}
      className="glass-card rounded-xl p-4 sm:p-5 transition-transform duration-200 ease-out"
    >
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-[var(--nav-text-color)]">{label}</h2>
        {fold && <FoldToggle label={label} collapsed={fold.collapsed} onToggle={fold.onToggle} />}
      </div>
      <p className={`mt-2 text-2xl sm:text-3xl font-black tabular-nums leading-none ${valueClass}`}>{value}</p>
      {(!fold || !fold.collapsed) && <p className="mt-2 text-xs text-[var(--nav-text-color)]">{detail}</p>}
    </div>
  );
}

export default function FuelCompositionPage() {
  const { token, user } = useAuth();
  const admin = user?.role === "admin";
  const rows = useQuery(api.fuelPrices.list, admin && token ? { token } : "skip");
  const save = useMutation(api.fuelPrices.save);
  const remove = useMutation(api.fuelPrices.remove);

  const [open, setOpen] = useState(false);
  const [newestFirst, setNewestFirst] = useState(true);
  const [effectiveDate, setEffectiveDate] = useState(today);
  const [price, setPrice] = useState("");
  const [composition, setComposition] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [confirming, setConfirming] = useState<Id<"fuelPrices"> | null>(null);
  // Null means the reader has not chosen yet, so the panel follows the data. Once
  // they pick, their pick is kept even as other months come and go.
  const [chosenFrom, setChosenFrom] = useState<string | null>(null);
  const [chosenTo, setChosenTo] = useState<string | null>(null);
  // Null means "not typed yet", which is different from "typed and cleared".
  const [compositionInput, setCompositionInput] = useState<string | null>(null);
  // The history table gets the whole screen when the reader wants to work
  // through the rows without the rest of the page in the way.
  const [historyFullScreen, setHistoryFullScreen] = useState(false);
  // Which cards are folded away, remembered per browser. Folding only ever
  // shortens a card: every figure stays worked out by the same functions and the
  // detail is one click away, so nothing on this screen can hide a number.
  const { isCollapsed, toggle } = useCollapsedCards("overview");

  const dateRef = useRef<HTMLInputElement>(null);
  const priceRef = useRef<HTMLInputElement>(null);
  const compositionRef = useRef<HTMLInputElement>(null);

  const problem = priceProblem({ effectiveDate, price, compositionPercent: composition });
  const badField = offendingField(problem);

  const records = (rows ?? []) as FuelRow[];
  // The list arrives oldest first, so the current price is the last one. This is
  // the newest record whichever way the table happens to be sorted.
  const latest = records.at(-1);
  const latestId = latest?._id;
  // One ordering rule, tested in src/lib/fuel/display.test.ts. The chart is
  // always given the chronological sequence, because a line read right to left
  // says something different from the same line read left to right; the table
  // gets whichever order the reader picked, and every figure stays with its row.
  const chronological = orderForDisplay(records, false);
  const displayed = orderForDisplay(records, newestFirst);
  // The row the confirm dialog is talking about, named up front so the title
  // cannot read "Remove the  price?" if the list has moved on underneath it.
  const removingLabel = formatLongDay(records.find(r => r._id === confirming)?.effectiveDate ?? "") || "recorded";
  // One complaint at a time, placed under the field it is about.
  const fields: { date?: string; price?: string; composition?: string } = {};
  if (badField) fields[badField] = FIELD_COMPLAINTS[badField];

  // ── Compare months ──────────────────────────────────────────────
  // Only months that actually hold a price are offered, so neither end of the
  // comparison can be a month that would come back empty.
  const months = availableMonths(records);
  const suggested = defaultPair(records);
  // A chosen month that has since had its price removed falls back to the
  // suggestion rather than leaving the select showing an option that is gone.
  const fromKey = chosenFrom && months.includes(chosenFrom) ? chosenFrom : suggested.from;
  const toKey = chosenTo && months.includes(chosenTo) ? chosenTo : suggested.to;
  const comparison = fromKey && toKey ? compareMonths(records, fromKey, toKey) : null;
  const savedComposition = comparison?.comparison?.row.compositionPercent;
  const compositionText = compositionInput ?? (savedComposition === undefined ? "" : String(savedComposition));
  const compositionError = comparison === null ? null : compositionProblem(compositionText);
  // A field nobody has touched yet gets a plain prompt rather than a red mark on
  // first sight. A field that has been filled in and then left unusable is a
  // real mistake and is called one.
  const showCompositionError = compositionError !== null
    && !(compositionText.trim() === "" && compositionInput === null);
  const assumedComposition = compositionError === null ? compositionValue(compositionText) : null;
  const estimatedImpact = comparison && assumedComposition !== null
    ? estimatedRateImpact(comparison.dieselPercentChange, assumedComposition)
    : null;
  // Once the reader types, their figure stands even though the month moved on.
  const compositionOverridden = compositionInput !== null;
  // Both bars are drawn against the larger of the two, so their lengths can be
  // compared by eye rather than each filling its own box.
  const barScale = Math.max(comparison?.baseline?.price ?? 0, comparison?.comparison?.price ?? 0, 0.01);
  // The history table's own fold, kept apart from the others because full screen
  // overrides it and the two are otherwise easy to tangle up.
  const historyFolded = isCollapsed("history");
  // Compare months folds as one piece: the heading stays, everything under it goes.
  const compareFolded = isCollapsed("compare");

  function swapMonths() {
    setChosenFrom(toKey);
    setChosenTo(fromKey);
  }

  // Opening the panel puts the cursor in it, so a keyboard user is not left
  // tabbing through the page to find what they just opened.
  useEffect(() => {
    if (open) dateRef.current?.focus();
  }, [open]);

  // While the table has the screen, Escape is the way back out and the page
  // behind it must not scroll away underneath.
  useEffect(() => {
    if (!historyFullScreen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setHistoryFullScreen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previous;
    };
  }, [historyFullScreen]);

  function revealForm() {
    setOpen(true);
    setError("");
  }

  /** Collapses the panel but leaves what was typed, so reopening it costs nothing. */
  function collapseForm() {
    setOpen(false);
    setError("");
  }

  /** An explicit cancel discards, rather than leaving a half typed price for the next person. */
  function cancelForm() {
    setOpen(false);
    setEffectiveDate(today());
    setPrice("");
    setComposition("");
    setNotes("");
    setError("");
    setSaved("");
  }

  /**
   * Puts the history on paper.
   *
   * A document of its own rather than a print stylesheet over the page: the
   * screen carries a delete button on every row, an SVG chart and a panel of
   * selects, and none of those belong on a printout. The rows go out in the order
   * the reader has the table in, so the sheet reads the way the table did, and
   * the month comparison is only included when they have one open.
   *
   * A blocked popup is a real possibility here, so it is reported rather than
   * left as a button that silently does nothing. The window is left open on
   * purpose: "Save as PDF" is a destination in the print dialog, and closing the
   * document first would take that choice away.
   */
  function printHistory() {
    setSaved("");
    setError("");
    const sheet = window.open("", "_blank");
    if (!sheet) {
      setError("Allow popups for this site, then print the history again.");
      return;
    }
    sheet.document.write(fuelHistoryPrintHtml({ rows: records, newestFirst, comparison, printedAt: new Date() }));
    sheet.document.close();
    sheet.focus();
    sheet.print();
  }

  async function record(event: React.FormEvent) {
    event.preventDefault();
    setSaved("");
    setError("");
    if (problem) {
      setError(`This price ${problem}.`);
      const field = badField === "composition" ? compositionRef : badField === "price" ? priceRef : dateRef;
      field.current?.focus();
      return;
    }
    setBusy(true);
    try {
      const amount = Number(price.trim());
      // A blank composition goes up as absent rather than as zero, so "not
      // recorded" stays distinct from "recorded as 0%".
      const percent = composition.trim() === "" ? undefined : Number(composition.trim());
      await save({ token: token!, effectiveDate, pricePerLitre: amount, compositionPercent: percent, notes });
      // The figures, chart and table all come from the query, which Convex
      // refetches on its own once the write lands.
      setPrice("");
      setComposition("");
      setNotes("");
      // The date moves on rather than staying put. Left as it was, the next
      // price typed into the panel would silently amend the one just saved
      // instead of adding a new day.
      setEffectiveDate(today());
      setSaved(`${formatLongDay(effectiveDate)} recorded at ${formatRand(amount)} a litre.`);
    } catch (e) {
      // Nothing is cleared on a failure, so a dropped connection does not cost
      // the user the figures they just typed.
      setError(e instanceof Error ? e.message : "Could not record the diesel price.");
    } finally {
      setBusy(false);
    }
  }

  if (!admin) return <p className="p-6">Admin access is required to manage fuel prices.</p>;

  if (rows === undefined) {
    return (
      <main className={`h-full overflow-auto p-4 sm:p-6 space-y-6 max-w-none ${historyFullScreen ? "overflow-hidden" : ""}`}>
        <SkeletonKpiGrid count={3} />
        <SkeletonCard className="h-72" />
        <SkeletonCard className="h-64" />
      </main>
    );
  }

  return (
    <main className={`h-full overflow-auto p-4 sm:p-6 space-y-6 max-w-none ${historyFullScreen ? "overflow-hidden" : ""}`}>
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Fuel composition</h1>
          <p className="text-sm text-[var(--nav-text-color)]">Diesel prices and their impact on your rates</p>
        </div>
        <button
          type="button"
          onClick={() => (open ? collapseForm() : revealForm())}
          aria-expanded={open}
          aria-controls="fuel-price-form"
          className="inline-flex items-center justify-center gap-2 self-start rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-cyan-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--card-bg)]"
        >
          {open ? <X className="h-4 w-4" aria-hidden="true" /> : <Plus className="h-4 w-4" aria-hidden="true" />}
          {open ? "Close" : "Record price"}
        </button>
      </header>

      <section aria-label="Summary" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <SummaryCard
          label="Latest diesel price"
          value={latest ? formatRand(latest.pricePerLitre) : DASH}
          valueClass={latest ? "text-[var(--foreground)]" : "text-[var(--nav-text-color)]"}
          detail={latest ? <>per litre · effective {formatLongDay(latest.effectiveDate)}</> : "Nothing recorded yet"}
          fold={{ collapsed: isCollapsed("summary:price"), onToggle: () => toggle("summary:price") }}
        />
        <SummaryCard
          label="Change from previous"
          value={
            latest && latest.percentChange !== null ? (
              <Delta value={latest.percentChange} render={formatSignedPercent} />
            ) : (
              <span className="text-[var(--nav-text-color)]">{DASH}</span>
            )
          }
          valueClass={latest && latest.percentChange !== null ? movementText(latest.percentChange) : "text-[var(--nav-text-color)]"}
          detail={
            latest && latest.change !== null
              ? <>{formatSignedRand(latest.change)} a litre on the previous price</>
              : latest
                ? "No earlier price to compare against"
                : "Nothing recorded yet"
          }
          fold={{ collapsed: isCollapsed("summary:change"), onToggle: () => toggle("summary:change") }}
        />
        <SummaryCard
          label="Carried rate impact"
          value={
            latest && latest.carriedPercent !== null ? (
              <Delta value={latest.carriedPercent} render={formatSignedPercent} />
            ) : (
              <span className="text-[var(--nav-text-color)]">{DASH}</span>
            )
          }
          valueClass={latest && latest.carriedPercent !== null ? movementText(latest.carriedPercent) : "text-[var(--nav-text-color)]"}
          detail={
            latest && latest.compositionPercent !== undefined
              ? <>at {formatPercent(latest.compositionPercent)} composition</>
              : latest
                ? "No composition recorded"
                : "Nothing recorded yet"
          }
          fold={{ collapsed: isCollapsed("summary:impact"), onToggle: () => toggle("summary:impact") }}
        />
      </section>

      {open && (
        <section id="fuel-price-form" aria-label="Record a diesel price" className="glass-card rounded-xl p-4 sm:p-5 space-y-4">
          <form onSubmit={record} noValidate className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <label className="text-sm block">
                <span className="font-medium">Effective date</span>
                <input
                  ref={dateRef}
                  type="date"
                  className={`${input} block w-full mt-1`}
                  value={effectiveDate}
                  onChange={e => { setSaved(""); setEffectiveDate(e.target.value); }}
                  aria-invalid={badField === "date"}
                  aria-describedby={badField === "date" ? "fuel-date-error" : undefined}
                />
                {fields.date && <span id="fuel-date-error" className="mt-1 block text-xs text-red-500">{fields.date}</span>}
              </label>
              <label className="text-sm block">
                <span className="font-medium">Diesel price (R per litre)</span>
                <input
                  ref={priceRef}
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  placeholder="0.00"
                  className={`${input} block w-full mt-1`}
                  value={price}
                  onChange={e => { setSaved(""); setPrice(e.target.value); }}
                  aria-invalid={badField === "price"}
                  aria-describedby={badField === "price" ? "fuel-price-error" : undefined}
                />
                {fields.price && <span id="fuel-price-error" className="mt-1 block text-xs text-red-500">{fields.price}</span>}
              </label>
              <label className="text-sm block">
                <span className="font-medium">Fuel composition (%)</span>
                <input
                  ref={compositionRef}
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  inputMode="decimal"
                  placeholder="40"
                  className={`${input} block w-full mt-1`}
                  value={composition}
                  onChange={e => { setSaved(""); setComposition(e.target.value); }}
                  aria-invalid={badField === "composition"}
                  aria-describedby={badField === "composition" ? "fuel-composition-error" : "fuel-composition-hint"}
                />
                {fields.composition
                  ? <span id="fuel-composition-error" className="mt-1 block text-xs text-red-500">{fields.composition}</span>
                  : <span id="fuel-composition-hint" className="mt-1 block text-xs text-[var(--nav-text-color)]">Optional. The part of the move that carries.</span>}
              </label>
              <label className="text-sm block">
                <span className="font-medium">Notes <span className="font-normal text-[var(--nav-text-color)]">(optional)</span></span>
                <input
                  type="text"
                  className={`${input} block w-full mt-1`}
                  placeholder="Optional"
                  value={notes}
                  onChange={e => { setSaved(""); setNotes(e.target.value); }}
                />
              </label>
            </div>
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                type="submit"
                disabled={busy}
                className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-cyan-500 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--card-bg)]"
              >
                {busy ? "Saving…" : "Save"}
              </button>
              <button
                type="button"
                onClick={cancelForm}
                disabled={busy}
                className="rounded-lg border border-[var(--card-border)] px-4 py-2 text-sm font-medium text-[var(--nav-text-color)] transition-colors hover:bg-[var(--card-bg)] disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
              >
                Cancel
              </button>
              {saved && <p role="status" className="text-sm text-teal-600 dark:text-teal-300">{saved}</p>}
              {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
            </div>
          </form>
        </section>
      )}

      {saved && !open && <p role="status" className="text-sm text-teal-600 dark:text-teal-300">{saved}</p>}
      {/* The form carries its own messages, so these only speak when it is closed.
          Printing and removing both report from here, and neither opens it. */}
      {error && !open && <p role="alert" className="text-sm text-red-500">{error}</p>}

      {records.length > 0 ? (
        <>
          <section aria-label="Diesel price trend" className="glass-card rounded-xl p-4 sm:p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
              <h2 className="font-semibold">Diesel price trend</h2>
              <div className="flex items-center gap-3">
                <p className="text-xs text-[var(--nav-text-color)]">{records.length} {records.length === 1 ? "price" : "prices"} recorded</p>
                <FoldToggle
                  label="Diesel price trend"
                  collapsed={isCollapsed("trend")}
                  onToggle={() => toggle("trend")}
                />
              </div>
            </div>
            {!isCollapsed("trend") && (
              <DieselTrendChart
                points={chronological.map(row => ({
                  effectiveDate: row.effectiveDate,
                  pricePerLitre: row.pricePerLitre,
                  percentChange: row.percentChange,
                }))}
              />
            )}
          </section>

          {comparison && (
          <section aria-label="Compare months" className="glass-card rounded-xl p-4 sm:p-5 space-y-5">
            {/* One fold for the whole section, on the same pattern as the trend
                chart and the history table above and below it. The cards inside
                are figures, not panels: each holds a number and the line that
                explains it, and a reader folding the section wants the lot out of
                the way, not one box at a time. */}
            <div className="space-y-1">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-semibold">Compare months</h2>
                <FoldToggle
                  label="Compare months"
                  collapsed={compareFolded}
                  onToggle={() => toggle("compare")}
                />
              </div>
              {!compareFolded && (
                <p className="text-sm text-[var(--nav-text-color)]">
                  The last price recorded in each month, set side by side. Either month can be the baseline.
                </p>
              )}
            </div>

            {!compareFolded && (
            <>
            <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-end">
              <div>
                <label htmlFor="compare-from" className="block text-sm font-medium">From · baseline</label>
                <select
                  id="compare-from"
                  className={`${input} block w-full mt-1 rounded-lg px-3 py-2`}
                  value={fromKey ?? ""}
                  onChange={e => setChosenFrom(e.target.value)}
                >
                  {months.map(key => <option key={key} value={key}>{monthLabel(key)}</option>)}
                </select>
              </div>
              <button
                type="button"
                onClick={swapMonths}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-lg border border-[var(--card-border)] px-4 py-2 text-sm font-medium text-[var(--nav-text-color)] transition-colors hover:bg-[var(--card-bg)] hover:text-[var(--foreground)] focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 sm:mb-0.5"
              >
                <ArrowRightLeft className="h-4 w-4" aria-hidden="true" />
                Swap
              </button>
              <div>
                <label htmlFor="compare-to" className="block text-sm font-medium">To · comparison</label>
                <select
                  id="compare-to"
                  className={`${input} block w-full mt-1 rounded-lg px-3 py-2`}
                  value={toKey ?? ""}
                  onChange={e => setChosenTo(e.target.value)}
                >
                  {months.map(key => <option key={key} value={key}>{monthLabel(key)}</option>)}
                </select>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {([
                { heading: "From · baseline", side: comparison.baseline },
                { heading: "To · comparison", side: comparison.comparison },
              ] as const).map(({ heading, side }) => (
                <div key={heading} className="rounded-lg border border-[var(--card-border)] p-3 sm:p-4 space-y-2">
                  <h3 className="text-[11px] font-semibold uppercase tracking-wider text-[var(--nav-text-color)]">{heading}</h3>
                  {side ? (
                    <>
                      <p className="text-xl font-black tabular-nums leading-none">{formatRand(side.price)}</p>
                      <p className="text-xs text-[var(--nav-text-color)]">
                        per litre · {monthLabel(side.key)} · from {formatDay(side.row.effectiveDate)}
                      </p>
                      <span className="block h-1.5 w-full rounded-full bg-[var(--card-border)]" aria-hidden="true">
                        <span
                          className={`block h-1.5 rounded-full ${side.key === comparison.toKey ? "bg-cyan-500" : "bg-cyan-500/60"}`}
                          style={{ width: `${(side.price / barScale) * 100}%` }}
                        />
                      </span>
                    </>
                  ) : (
                    <p className="text-sm text-[var(--nav-text-color)]">No price recorded in that month.</p>
                  )}
                </div>
              ))}
            </div>

            {/* These two carry a figure and nothing else, so they get no fold
                control: a chevron that changed nothing would read as broken. */}
            <div className="grid gap-3 sm:grid-cols-2">
              {([
                { heading: "Rand difference", value: comparison.randDifference, render: formatSignedRand },
                { heading: "Diesel change", value: comparison.dieselPercentChange, render: formatSignedPercent },
              ] as const).map(({ heading, value, render }) => (
                <div key={heading} className="rounded-lg border border-[var(--card-border)] p-3 sm:p-4 space-y-1">
                  <h3 className="text-[11px] font-semibold uppercase tracking-wider text-[var(--nav-text-color)]">{heading}</h3>
                  <p className="text-xl font-black tabular-nums leading-none">
                    <Delta value={value} render={render} />
                  </p>
                </div>
              ))}
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:items-start">
              <div>
                <label htmlFor="compare-composition" className="block text-sm font-medium">Fuel composition (%)</label>
                <input
                  id="compare-composition"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  inputMode="decimal"
                  placeholder="e.g. 55"
                  className={`${input} block w-full mt-1`}
                  value={compositionText}
                  onChange={e => { setCompositionInput(e.target.value); }}
                  aria-invalid={showCompositionError}
                  aria-describedby={showCompositionError ? "compare-composition-error" : "compare-composition-hint"}
                />
                {showCompositionError
                  ? <p id="compare-composition-error" className="mt-1 text-xs text-red-500">{compositionError}</p>
                  : <p id="compare-composition-hint" className="mt-1 text-xs text-[var(--nav-text-color)]">
                      {compositionOverridden
                        ? "Your figure, kept as you set it."
                        : savedComposition === undefined
                          ? "No composition saved for this month — enter one to see the impact."
                          : `Using the ${formatPercent(savedComposition)} saved for this month.`}
                    </p>}
              </div>
              <div className="rounded-lg border border-[var(--card-border)] p-3 sm:p-4 space-y-1 lg:col-span-2">
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-[var(--nav-text-color)]">Estimated rate impact</h3>
                <p className="text-xl font-black tabular-nums leading-none">
                  {estimatedImpact === null
                    ? <span className="text-[var(--nav-text-color)]">{DASH}</span>
                    : <span className={`inline-flex items-center gap-1 ${movementText(estimatedImpact)}`}>
                        <span aria-hidden="true" className="text-[0.7em] leading-none">{movementArrow(estimatedImpact)}</span>
                        <span className="sr-only">{movementWord(estimatedImpact)} </span>
                        {formatSignedPercent(estimatedImpact)}
                      </span>}
                </p>
                <p className="text-xs text-[var(--nav-text-color)]">
                  {assumedComposition === null
                    ? "Enter a composition to see the impact."
                    : <>at {formatPercent(assumedComposition)} composition</>}
                </p>
              </div>
            </div>

            <p className="text-xs text-[var(--nav-text-color)]">
              This compares the two chosen months end to end using the composition above. It is not the
              cumulative total of the carried adjustments recorded in between, and it does not change any saved price.
            </p>
            </>
            )}
          </section>
          )}

          {historyFullScreen && (
            <div aria-hidden="true" className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-md" />
          )}

          <section
            aria-label="Price history"
            style={historyFullScreen ? { background: "var(--background)" } : undefined}
            className={`glass-card p-4 sm:p-5 ${
              historyFullScreen
                ? "fixed inset-0 z-50 overflow-auto rounded-none p-4 sm:p-6"
                : "rounded-xl"
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <h2 className="font-semibold">Price history</h2>
              <div className="flex flex-wrap items-center gap-2">
                <div role="group" aria-label="Sort order" className="inline-flex rounded-lg border border-[var(--card-border)] p-0.5">
                  {([["newest", "Newest first"], ["oldest", "Oldest first"]] as const).map(([value, label]) => {
                    const active = (value === "newest") === newestFirst;
                    return (
                      <button
                        key={value}
                        type="button"
                        aria-pressed={active}
                        onClick={() => setNewestFirst(value === "newest")}
                        className={`rounded-md px-3 py-1 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${
                          active ? "bg-cyan-700 text-white dark:bg-cyan-600" : "text-[var(--nav-text-color)] hover:text-[var(--foreground)]"
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
                <button
                  type="button"
                  onClick={printHistory}
                  className="inline-flex items-center gap-2 rounded-lg border border-[var(--card-border)] px-3 py-1.5 text-xs font-medium text-[var(--nav-text-color)] transition-colors hover:bg-[var(--card-bg)] hover:text-[var(--foreground)] focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
                >
                  <Printer className="h-3.5 w-3.5" aria-hidden="true" />
                  Print
                </button>
                <button
                  type="button"
                  onClick={() => setHistoryFullScreen(value => !value)}
                  aria-pressed={historyFullScreen}
                  className="inline-flex items-center gap-2 rounded-lg border border-[var(--card-border)] px-3 py-1.5 text-xs font-medium text-[var(--nav-text-color)] transition-colors hover:bg-[var(--card-bg)] hover:text-[var(--foreground)] focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
                >
                  {historyFullScreen
                    ? <Minimize2 className="h-3.5 w-3.5" aria-hidden="true" />
                    : <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />}
                  {historyFullScreen ? "Exit full screen" : "Full screen"}
                </button>
                <FoldToggle
                  label="Price history table"
                  collapsed={historyFolded}
                  onToggle={() => toggle("history")}
                />
              </div>
            </div>
            {/* Full screen exists to give the table the whole display, so it
                ignores the fold rather than showing an empty page the reader
                asked to expand. */}
            {(!historyFolded || historyFullScreen) && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[46rem] text-sm">
                <caption className="sr-only">
                  Recorded diesel prices with the movement from the previous price, the fuel composition, and the part of the move that composition carries.
                </caption>
                <thead>
                  <tr className="border-b border-[var(--card-border)] text-left text-[11px] uppercase tracking-wider text-[var(--nav-text-color)]">
                    <th scope="col" className="py-2 pr-3 font-semibold">Effective date</th>
                    <th scope="col" className="py-2 px-3 text-right font-semibold">Diesel price</th>
                    <th scope="col" className="py-2 px-3 text-right font-semibold">Price change</th>
                    <th scope="col" className="py-2 px-3 text-right font-semibold">Composition</th>
                    <th scope="col" className="py-2 px-3 text-right font-semibold">Carried impact</th>
                    <th scope="col" className="py-2 px-3 font-semibold">Notes</th>
                    <th scope="col" className="py-2 pl-3 text-right font-semibold">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {displayed.map(row => {
                    const isLatest = row._id === latestId;
                    return (
                      <tr
                        key={row._id}
                        className={`border-b border-[var(--card-border)] last:border-0 ${isLatest ? "bg-[var(--accent-soft-bg)]" : ""}`}
                      >
                        <td className="py-2.5 pr-3 whitespace-nowrap">
                          <span className={isLatest ? "font-semibold" : ""}>{formatDay(row.effectiveDate)}</span>
                          {isLatest && <span className="ml-2 rounded-full bg-cyan-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-cyan-700 dark:text-cyan-300">Latest</span>}
                        </td>
                        <td className="py-2.5 px-3 text-right tabular-nums">{formatRand(row.pricePerLitre)}</td>
                        <td className="py-2.5 px-3 text-right tabular-nums">
                          {row.change === null ? (
                            <span className="text-[var(--nav-text-color)]">{DASH}</span>
                          ) : (
                            <span className="flex flex-col items-end leading-tight">
                              <Delta value={row.change} render={formatSignedRand} />
                              <Delta value={row.percentChange} render={formatSignedPercent} />
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right tabular-nums">
                          {row.compositionPercent === undefined ? (
                            <span className="text-[var(--nav-text-color)]">{DASH}</span>
                          ) : (
                            <span className="inline-flex flex-col items-end gap-1">
                              <span>{formatPercent(row.compositionPercent)}</span>
                              <span className="block h-1 w-14 rounded-full bg-[var(--card-border)]" aria-hidden="true">
                                <span className="block h-1 rounded-full bg-cyan-500" style={{ width: `${Math.min(100, Math.max(0, row.compositionPercent))}%` }} />
                              </span>
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right tabular-nums">
                          <Delta value={row.carriedPercent} render={formatSignedPercent} />
                        </td>
                        <td className="py-2.5 px-3 text-[var(--nav-text-color)]">
                          <span className="line-clamp-1 inline-block max-w-[14rem]" title={row.notes || undefined}>{row.notes || DASH}</span>
                        </td>
                        <td className="py-2.5 pl-3 text-right">
                          <button
                            type="button"
                            onClick={() => { setError(""); setSaved(""); setConfirming(row._id); }}
                            aria-label={`Remove the price for ${formatLongDay(row.effectiveDate)}`}
                            className="inline-flex items-center justify-center rounded-md p-1.5 text-[var(--nav-text-color)] transition-colors hover:bg-orange-500/10 hover:text-orange-600 dark:hover:bg-orange-400/10 dark:hover:text-orange-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            )}
          </section>
        </>
      ) : (
        <section className="glass-card rounded-xl">
          <EmptyState
            icon="empty"
            title="No diesel price recorded yet"
            description="Record the price a litre is going for and this page will track how it moves, and how much of that move your composition carries."
            action={{ label: "Record price", onClick: revealForm }}
          />
        </section>
      )}

      <ConfirmDialog
        open={confirming !== null}
        title={`Remove the ${removingLabel} price?`}
        message="The row is removed. The rows around it keep their own prices, and their change and percentage are worked out afresh from what is left."
        confirmLabel="Remove price"
        variant="danger"
        loading={busy}
        onConfirm={async () => {
          setBusy(true); setError("");
          try { await remove({ token: token!, id: confirming! }); setConfirming(null); setSaved("Price removed."); }
          catch (e) { setError(e instanceof Error ? e.message : "Could not remove the price."); }
          finally { setBusy(false); }
        }}
        onCancel={() => { if (!busy) setConfirming(null); }}
      />
    </main>
  );
}
