"use client";

import { useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useAuth, useRegionArg } from "@/src/components/auth/AuthProvider";
import { useToast } from "@/src/components/common/Toast";
import {
  amountToRate,
  buildQuickAddPayload,
  emptyQuickAddDraft,
  quickAddAmount,
  quickAddMissingFields,
  quickAddRPerKm,
  type QuickAddDraft,
} from "@/src/lib/sheets/quickAddRow";
import type { SpreadsheetFooterColumn } from "./SpreadsheetDataTable";

/**
 * Excel-style manual entry row for the Sheets tab.
 *
 * Renders inside the spreadsheet grid (the table hands it the visible columns,
 * their widths and the grid template) so the cells line up with the data above.
 * Typing a truck, client, from, to and amount and pressing Enter creates a real
 * daily route, clears the row and re-arms it for the next one — so a day with no
 * data can be typed out straight into the sheet.
 *
 * The load details that have no column of their own (qty, unit, rate type, km)
 * live in a strip under the row, revealed with the "+" toggle. The Amount cell
 * is the load total: typing into it back-solves the rate from the quantity, so
 * it behaves like the Amount column users already see. The draft → route mapping
 * itself is the pure, tested part in src/lib/sheets/quickAddRow.ts.
 */

const UNIT_OPTIONS = [
  { value: "tons", label: "Tons" },
  { value: "pallets", label: "Pallets" },
  { value: "bales", label: "Bales" },
  { value: "bags", label: "Bags" },
];

const RATE_TYPE_OPTIONS = [
  { value: "per_unit", label: "Per unit" },
  { value: "flat", label: "Flat (total)" },
];

const formatZAR = (value: number) => {
  if (value <= 0) return "—";
  const parts = value.toFixed(2).split(".");
  const integerPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `R ${integerPart},${parts[1]}`;
};

const todayIso = () => new Date().toISOString().split("T")[0];

const INPUT_CELL =
  "w-full h-full bg-transparent border-0 outline-none focus:ring-2 focus:ring-inset focus:ring-[#06B6D4] focus:bg-[var(--card-bg)] px-2 text-[12px] text-[var(--foreground)] placeholder:text-[var(--nav-text-color)]/50";

interface Props {
  columns: SpreadsheetFooterColumn[];
  gridTemplateColumns: string;
  density: "comfortable" | "compact";
  /** Date the new route is filed under (the date currently selected on Sheets). */
  defaultDate: string;
  /** Range currently loaded, used to flag a row saved outside the view. */
  rangeStart?: string;
  rangeEnd?: string;
  /** Fleet reference data for the autocomplete lists (the page already loads it). */
  trucks?: any[];
  trailers?: any[];
  drivers?: any[];
}

export default function SheetAddRow({
  columns,
  gridTemplateColumns,
  density,
  defaultDate,
  rangeStart,
  rangeEnd,
  trucks,
  trailers,
  drivers,
}: Props) {
  const { user, token } = useAuth();
  const region = useRegionArg();
  const { addToast } = useToast();
  const createDailyRoute = useMutation(api.dailyRoutes.createDailyRoute);
  const customers = useQuery(api.customers.list, {});

  const [draft, setDraft] = useState<QuickAddDraft>(() =>
    emptyQuickAddDraft(defaultDate || todayIso())
  );
  const [showDetails, setShowDetails] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);

  // Admin with "All Regions" selected has no target region — the backend would
  // silently file the row in Garden Route, so entry is blocked until a region
  // is chosen (same rule as the paste import).
  const regionBlocked = user?.role === "admin" && !region;
  const regionLabel =
    region === "eastern_cape"
      ? "Eastern Cape"
      : region === "garden_route"
        ? "Garden Route"
        : null;

  const inputs = useRef<Record<string, HTMLInputElement | null>>({});
  const focusCell = (field: string) => inputs.current[field]?.focus();

  const set = (field: keyof QuickAddDraft) => (value: string) => {
    setError(null);
    setDraft((prev) => ({ ...prev, [field]: value }));
  };

  const amount = quickAddAmount(draft);
  const rPerKm = quickAddRPerKm(draft);

  // The Amount cell is the load total. Typing into it back-solves the rate
  // against the quantity, so the column users see always matches the row.
  const setAmountFromInput = (value: string) => {
    setError(null);
    setDraft((prev) => ({ ...prev, rate: amountToRate(value, prev) }));
  };

  const reset = (keepDate: boolean) => {
    setDraft((prev) => emptyQuickAddDraft(keepDate ? prev.date : defaultDate || todayIso()));
  };

  const handleSave = async () => {
    if (saving) return;
    if (regionBlocked) {
      setError("Select a region (top right) before adding rows.");
      return;
    }
    const missing = quickAddMissingFields(draft);
    if (missing.length > 0) {
      setError(`Fill in the ${missing.join(" and ")} to save this row.`);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await createDailyRoute({ ...buildQuickAddPayload(draft), region, token });

      const outsideView =
        (rangeStart && draft.date < rangeStart) || (rangeEnd && draft.date > rangeEnd);
      addToast(
        outsideView
          ? `Route added for ${draft.date} — outside the dates currently shown.`
          : `Route added for ${draft.date}.`,
        "success"
      );
      setSavedFlash(true);
      window.setTimeout(() => setSavedFlash(false), 1200);
      // Clear the row (keeping the date) so the next one can be typed straight
      // away, and drop the cursor back on the first cell.
      reset(true);
      window.setTimeout(() => focusCell("truck"), 0);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not save the row.";
      setError(message);
      addToast(message, "error");
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void handleSave();
    } else if (e.key === "Escape") {
      e.preventDefault();
      reset(true);
      (e.target as HTMLInputElement).blur();
    }
  };

  const cell = (col: SpreadsheetFooterColumn, node: React.ReactNode) => (
    <div
      key={col.key}
      className="relative flex items-center h-full border-r border-[var(--card-border)] last:border-r-0"
    >
      {node}
    </div>
  );

  const textInput = (
    field: keyof QuickAddDraft,
    placeholder: string,
    list?: string,
    extra?: {
      type?: "text" | "date" | "number";
      inputMode?: "text" | "decimal" | "numeric";
      className?: string;
    }
  ) => (
    <input
      ref={(el) => {
        inputs.current[field] = el;
      }}
      type={extra?.type ?? "text"}
      inputMode={extra?.inputMode}
      list={list}
      value={draft[field]}
      placeholder={placeholder}
      onChange={(e) => set(field)(e.target.value)}
      onKeyDown={handleKeyDown}
      disabled={saving}
      className={`${INPUT_CELL} ${extra?.className ?? ""}`}
    />
  );

  const autoCell = (col: SpreadsheetFooterColumn, hint: string) =>
    cell(
      col,
      <div key={col.key} className="px-2 text-[11px] text-[var(--nav-text-color)]/60 truncate">
        {hint}
      </div>
    );

  const rowPad = density === "compact" ? "py-0.5" : "py-1";

  return (
    <div className="border-t-2 border-dashed border-[#06B6D4]/40 bg-[rgba(6,182,212,0.04)]">
      {/* ── The entry row itself — cells follow the table's column layout ── */}
      <div
        className={`grid min-w-max text-[12px] ${rowPad} ${savedFlash ? "bg-emerald-500/10" : ""}`}
        style={{ gridTemplateColumns }}
      >
        {columns.map((col) => {
          switch (col.key) {
            case "truckNo":
              return cell(col, textInput("truck", "Truck", "sheet-add-trucks"));
            case "trailerNo":
              return cell(col, textInput("trailer", "Trailer", "sheet-add-trailers"));
            case "date":
              return cell(col, textInput("date", "", undefined, { type: "date" }));
            case "driverName":
              return cell(col, textInput("driver", "Driver", "sheet-add-drivers"));
            case "origin":
              return cell(col, textInput("origin", "From"));
            case "destination":
              return cell(col, textInput("destination", "To"));
            case "customer":
              return cell(col, textInput("client", "Client", "sheet-add-clients"));
            case "amount":
              return cell(
                col,
                <input
                  ref={(el) => {
                    inputs.current.amount = el;
                  }}
                  type="text"
                  inputMode="decimal"
                  value={amount > 0 ? String(Number(amount.toFixed(2))) : ""}
                  placeholder="Amount"
                  onChange={(e) => setAmountFromInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={saving}
                  className={`${INPUT_CELL} text-right font-mono tabular-nums`}
                />
              );
            case "rkm":
              return autoCell(col, rPerKm > 0 ? formatZAR(rPerKm) : "auto");
            case "notes":
              return cell(col, textInput("notes", "Notes"));
            case "region":
              return autoCell(col, regionLabel ?? "select a region");
            default:
              return autoCell(col, "auto");
          }
        })}
      </div>

      {/* ── Details strip: load fields that have no column of their own ── */}
      {showDetails && (
        <div className="flex flex-wrap items-center gap-2 border-t border-[var(--card-border)] px-3 py-2 text-[11px] text-[var(--foreground)]">
          <label className="flex items-center gap-1.5">
            <span className="text-[var(--nav-text-color)]">Qty</span>
            <input
              value={draft.qty}
              onChange={(e) => set("qty")(e.target.value)}
              onKeyDown={handleKeyDown}
              className="w-16 rounded border border-[var(--card-border)] bg-[var(--card-bg)] px-1.5 py-1 text-[12px] outline-none focus:border-[#06B6D4]"
            />
          </label>
          <label className="flex items-center gap-1.5">
            <span className="text-[var(--nav-text-color)]">Unit</span>
            <select
              value={draft.unit}
              onChange={(e) => set("unit")(e.target.value)}
              className="rounded border border-[var(--card-border)] bg-[var(--card-bg)] px-1.5 py-1 text-[12px] outline-none focus:border-[#06B6D4]"
            >
              {UNIT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1.5">
            <span className="text-[var(--nav-text-color)]">
              {draft.rateType === "flat" ? "Total" : "Rate / unit"}
            </span>
            <input
              value={draft.rate}
              onChange={(e) => set("rate")(e.target.value)}
              onKeyDown={handleKeyDown}
              className="w-24 rounded border border-[var(--card-border)] bg-[var(--card-bg)] px-1.5 py-1 text-[12px] outline-none focus:border-[#06B6D4]"
            />
          </label>
          <label className="flex items-center gap-1.5">
            <span className="text-[var(--nav-text-color)]">Rate type</span>
            <select
              value={draft.rateType}
              onChange={(e) =>
                setDraft((prev) => ({
                  ...prev,
                  rateType: e.target.value as "per_unit" | "flat",
                }))
              }
              className="rounded border border-[var(--card-border)] bg-[var(--card-bg)] px-1.5 py-1 text-[12px] outline-none focus:border-[#06B6D4]"
            >
              {RATE_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1.5">
            <span className="text-[var(--nav-text-color)]">KM</span>
            <input
              value={draft.km}
              onChange={(e) => set("km")(e.target.value)}
              onKeyDown={handleKeyDown}
              className="w-20 rounded border border-[var(--card-border)] bg-[var(--card-bg)] px-1.5 py-1 text-[12px] outline-none focus:border-[#06B6D4]"
            />
          </label>
          <span className="ml-auto text-[var(--nav-text-color)]">
            Amount {formatZAR(amount)}
            {rPerKm > 0 ? ` · R/KM ${formatZAR(rPerKm)}` : ""}
          </span>
        </div>
      )}

      {/* ── Actions + guidance ── */}
      <div className="flex flex-wrap items-center gap-2 border-t border-[var(--card-border)] px-3 py-1.5 text-[11px]">
        <button
          type="button"
          onClick={() => setShowDetails((s) => !s)}
          className="rounded border border-[var(--card-border)] px-2 py-0.5 font-bold text-[var(--nav-text-color)] hover:bg-[var(--card-bg)] hover:text-[var(--foreground)]"
          title="Quantity, rate type and kilometres"
        >
          {showDetails ? "− Details" : "+ Details"}
        </button>
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving || regionBlocked}
          className="rounded bg-gradient-to-br from-[#06B6D4] to-[#0891B2] px-3 py-1 font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {saving ? "Saving…" : "Add row"}
        </button>
        <button
          type="button"
          onClick={() => {
            reset(true);
            setError(null);
          }}
          className="rounded border border-[var(--card-border)] px-2 py-0.5 font-bold text-[var(--nav-text-color)] hover:bg-[var(--card-bg)] hover:text-[var(--foreground)]"
        >
          Clear
        </button>
        <span className="text-[var(--nav-text-color)]">
          {error
            ? error
            : regionBlocked
              ? "Select a region (top right) to add rows to it."
              : "Type a truck, client, from, to and amount · Enter saves and arms the next row · Esc clears"}
        </span>
      </div>

      {/* ── Autocomplete sources ── */}
      <datalist id="sheet-add-trucks">
        {(trucks ?? []).map((t: any) => (
          <option key={t._id} value={String(t.truckFleetNo ?? "")}>
            {[t.registration, t.make, t.model].filter(Boolean).join(" ")}
          </option>
        ))}
      </datalist>
      <datalist id="sheet-add-trailers">
        {/* getTrailers flattens a trailer's sub-trailers, so _id repeats — key on the pair */}
        {(trailers ?? []).map((t: any, i: number) => (
          <option
            key={`${t._id}-${i}`}
            value={String(t.trailerFleetNoStr ?? t.trailerFleetNo ?? "")}
          >
            {[t.type, t.length, t.registration].filter(Boolean).join(" ")}
          </option>
        ))}
      </datalist>
      <datalist id="sheet-add-drivers">
        {(drivers ?? []).map((d: any) => (
          <option key={d._id} value={String(d.driverName ?? "")} />
        ))}
      </datalist>
      <datalist id="sheet-add-clients">
        {(customers ?? []).map((c: any) => (
          <option key={c._id} value={String(c.name ?? "")} />
        ))}
      </datalist>
    </div>
  );
}
