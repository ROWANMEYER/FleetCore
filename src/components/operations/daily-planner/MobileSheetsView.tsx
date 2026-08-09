"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { calculateLoadAmount } from "@/convex/utils";
import { useMobileChrome } from "@/src/components/MobileChromeContext";
import {
  Search,
  SlidersHorizontal,
  X,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsUp,
  CalendarDays,
  RotateCcw,
} from "lucide-react";

/* ────────────────────────────────────────────────────────────────────────────
   Mobile Sheets screen (phone app)

   Rendered instead of the desktop grid when the viewport is <768px (see
   useIsMobile). Routes arrive already filtered + sorted from the parent page;
   this view groups them by day and layers the mobile UX on top:

     • Date navigation — Day / Range / Month with prev-day / next-day / Today
     • Quick search + a filter bottom sheet (same filter fields as desktop)
     • Day-grouped route cards with status badge, revenue, truck, driver,
       client, route and load summary

   Filters, search, sort and the date range are owned by the parent page, so
   they persist to localStorage and stay in sync with the desktop screens.
   ──────────────────────────────────────────────────────────────────────────── */

type RiskStatus = { label: string; level: "red" | "yellow" | "green" | "blue" };

type FiltersShape = {
  date: string;
  truck: string;
  trailer: string;
  client: string;
  driver: string;
  from: string;
  to: string;
  status: string[];
  amountMin: string;
  amountMax: string;
};

type SortConfig = { column: string | null; direction: "asc" | "desc" };
type DateMode = "single" | "range" | "month";

interface MobileSheetsViewProps {
  routes: any[];
  loading: boolean;
  filters: FiltersShape;
  updateFilter: (key: keyof FiltersShape, value: any) => void;
  quickSearch: string;
  setQuickSearch: (v: string) => void;
  sortConfig: SortConfig;
  setSortConfig: (cfg: SortConfig) => void;
  clearFilters: () => void;
  dateMode: DateMode;
  setDateMode: (m: DateMode) => void;
  singleDate: string;
  setSingleDate: (d: string) => void;
  fromDate: string;
  setFromDate: (d: string) => void;
  toDate: string;
  setToDate: (d: string) => void;
  selectedMonth: string;
  setSelectedMonth: (m: string) => void;
  syncDateToUrl: (date: string) => void;
  riskStatusOf: (route: any) => RiskStatus;
  /** Opens the shared route detail/edit panel (the page owns the panel state). */
  onRouteTap: (route: any) => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseNumberSafe(value: unknown): number {
  if (value == null) return 0;
  const cleaned = String(value)
    .replace(/[A-Za-z]/g, "")
    .replace(/\s+/g, "")
    .replace(/,/g, ".");
  const n = parseFloat(cleaned);
  return Number.isNaN(n) ? 0 : n;
}

// [HYDRATION SAFE] Deterministic ZAR formatting ("R 1 234,56"), matching the
// rest of the app (never toLocaleString).
function formatZAR(value: number): string {
  const parts = value.toFixed(2).split(".");
  const integerPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `R ${integerPart},${parts[1]}`;
}

function todayIso(): string {
  return new Date().toISOString().split("T")[0];
}

function shiftDay(iso: string, delta: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + delta);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDayLabel(iso: string): string {
  if (!iso) return "";
  const d = new Date(`${iso}T00:00:00`);
  const weekday = d.toLocaleDateString(undefined, { weekday: "short" });
  const day = d.getDate();
  const month = d.toLocaleDateString(undefined, { month: "short" });
  const isToday = iso === todayIso();
  return `${weekday} ${day} ${month}${isToday ? " · Today" : ""}`;
}

function uniqueFroms(route: any): string[] {
  const froms = (route.loads ?? []) as string[];
  return [...new Set(froms.flatMap((l: any) => (l.fromLocations ?? []) as string[]))];
}

function uniqueTos(route: any): string[] {
  const tos = (route.loads ?? []) as string[];
  return [...new Set(tos.flatMap((l: any) => (l.toLocations ?? []) as string[]))];
}

// Route revenue — matches the desktop spreadsheet: the sum of load amounts, or
// the route-level rate when the route has no loads.
function routeRevenue(route: any): number {
  const loads = route.loads ?? [];
  if (loads.length === 0) return Number(route.rate) || 0;
  return loads.reduce((sum: number, l: any) => {
    return (
      sum +
      calculateLoadAmount(
        parseNumberSafe(l.quantity),
        parseNumberSafe(l.rate),
        l.rateType || "per_unit"
      )
    );
  }, 0);
}

// R / KM — identical to the desktop table column: route revenue ÷ kilometres
// (0 when KM or revenue is missing, so the card just hides the badge).
function routeRPerKm(route: any): number {
  const km = Number(route.kilometers) || 0;
  const revenue = routeRevenue(route);
  return km > 0 && revenue > 0 ? Number((revenue / km).toFixed(2)) : 0;
}

const STATUS_OPTIONS = [
  "🔴 Incomplete",
  "🟡 Missing KM",
  "🟡 Multi-drop",
  "🟡 Multi-pick",
  "🔵 Finalized",
  "🟢 Clean",
];

const LEVEL_PILL: Record<string, string> = {
  red: "bg-red-50 text-red-700 border-red-200",
  yellow: "bg-amber-50 text-amber-700 border-amber-200",
  green: "bg-emerald-50 text-emerald-700 border-emerald-200",
  blue: "bg-blue-50 text-blue-700 border-blue-200",
};

const LEVEL_DOT: Record<string, string> = {
  red: "bg-red-500",
  yellow: "bg-amber-500",
  green: "bg-emerald-500",
  blue: "bg-blue-500",
};

// Region badge metadata — same colors as the desktop sheets table's Region
// column, so a route reads identically across web and phone.
const REGION_META: Record<string, { label: string; cls: string; dot: string }> = {
  garden_route: {
    label: "Garden Route",
    cls: "bg-[rgba(6,182,212,0.12)] text-[#06B6D4] dark:text-[#22D3EE] border-[rgba(6,182,212,0.25)]",
    dot: "bg-[#06B6D4]",
  },
  eastern_cape: {
    label: "Eastern Cape",
    cls: "bg-[rgba(168,85,247,0.12)] text-purple-600 dark:text-purple-400 border-[rgba(168,85,247,0.3)]",
    dot: "bg-purple-500",
  },
};

const inputClass =
  "w-full h-9 px-3 rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)]/60 text-sm text-[var(--foreground)] placeholder:text-[var(--nav-text-color)] shadow-sm focus:border-[#06B6D4] focus:ring-2 focus:ring-[#06B6D4]/30 focus:outline-none transition-colors";

// Floating restore pill — the user can drag it anywhere on the screen; its
// position survives in localStorage so it stays where they left it.
const RESTORE_PILL_POS_KEY = "fleetcore-restore-pill-pos";
// Approximate pill size used to keep it on-screen after resize/rotation; the
// drag handler clamps with the real measured size.
const RESTORE_PILL_EST_SIZE = { w: 112, h: 40 };

// ─── Component ───────────────────────────────────────────────────────────────

export default function MobileSheetsView({
  routes,
  loading,
  filters,
  updateFilter,
  quickSearch,
  setQuickSearch,
  sortConfig,
  setSortConfig,
  clearFilters,
  dateMode,
  setDateMode,
  singleDate,
  setSingleDate,
  fromDate,
  setFromDate,
  toDate,
  setToDate,
  selectedMonth,
  setSelectedMonth,
  syncDateToUrl,
  riskStatusOf,
  onRouteTap,
}: MobileSheetsViewProps) {
  const [showFilters, setShowFilters] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const { minimized, setMinimized } = useMobileChrome();

  const today = todayIso();

  // Reset the app-wide chrome state when leaving the mobile sheets screen,
  // so the top bar / bottom tabs never stay hidden on another page.
  useEffect(() => {
    return () => setMinimized(false);
  }, [setMinimized]);

  const minimizeChrome = () => {
    // Close the filter bottom sheet and sort dropdown first — they belong to
    // the toolbar that is about to disappear.
    setShowFilters(false);
    setSortOpen(false);
    setMinimized(true);
  };

  // ── Floating (draggable) restore pill ──────────────────────────────────────
  const [restorePos, setRestorePos] = useState<{ x: number; y: number } | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const raw = localStorage.getItem(RESTORE_PILL_POS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (typeof parsed.x === "number" && typeof parsed.y === "number") {
          return { x: parsed.x, y: parsed.y };
        }
      }
    } catch {
      /* ignore */
    }
    return null;
  });
  const restoreDragRef = useRef<{
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);
  const restoreDraggedRef = useRef(false);
  const restoreLatestPosRef = useRef<{ x: number; y: number } | null>(null);

  const persistRestorePos = () => {
    const latest = restoreLatestPosRef.current;
    if (!latest) return;
    try {
      localStorage.setItem(RESTORE_PILL_POS_KEY, JSON.stringify(latest));
    } catch {
      /* ignore */
    }
  };

  const handleRestorePillPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    restoreDragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origX: restorePos?.x ?? rect.left,
      origY: restorePos?.y ?? rect.top,
    };
    restoreDraggedRef.current = false;
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handleRestorePillPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const drag = restoreDragRef.current;
    if (!drag) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (Math.abs(dx) > 5 || Math.abs(dy) > 5) restoreDraggedRef.current = true;
    const w = e.currentTarget.offsetWidth;
    const h = e.currentTarget.offsetHeight;
    const next = {
      x: Math.max(0, Math.min(drag.origX + dx, Math.max(0, window.innerWidth - w))),
      y: Math.max(0, Math.min(drag.origY + dy, Math.max(0, window.innerHeight - h))),
    };
    restoreLatestPosRef.current = next;
    setRestorePos(next);
  };

  const handleRestorePillPointerUp = () => {
    restoreDragRef.current = null;
    persistRestorePos();
  };

  // Saved position re-clamped to the current viewport (resize / rotation);
  // before the user has dragged anywhere, fall back to bottom-right.
  const restorePillStyle = (() => {
    if (!restorePos || typeof window === "undefined") {
      return { right: 16, bottom: "calc(1.25rem + env(safe-area-inset-bottom))" } as React.CSSProperties;
    }
    const maxX = Math.max(0, window.innerWidth - RESTORE_PILL_EST_SIZE.w);
    const maxY = Math.max(0, window.innerHeight - RESTORE_PILL_EST_SIZE.h);
    return {
      left: Math.max(0, Math.min(restorePos.x, maxX)),
      top: Math.max(0, Math.min(restorePos.y, maxY)),
    } as React.CSSProperties;
  })();

  // Group routes by day, newest day first; order within a day is preserved
  // (the parent already applied the user's sort).
  const groups = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const r of routes) {
      const key = r.routeDate || "";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [routes]);

  const activeFilterCount =
    (quickSearch ? 1 : 0) +
    (filters.truck ? 1 : 0) +
    (filters.trailer ? 1 : 0) +
    (filters.client ? 1 : 0) +
    (filters.driver ? 1 : 0) +
    (filters.from ? 1 : 0) +
    (filters.to ? 1 : 0) +
    (filters.date ? 1 : 0) +
    filters.status.length +
    (filters.amountMin || filters.amountMax ? 1 : 0);

  const hasAnyFilter = activeFilterCount > 0;

  // ── Date navigation ────────────────────────────────────────────────────────
  const goPrevDay = () => {
    if (!singleDate) return;
    const next = shiftDay(singleDate, -1);
    setSingleDate(next);
    syncDateToUrl(next);
  };

  const goNextDay = () => {
    if (!singleDate) return;
    const next = shiftDay(singleDate, 1);
    setSingleDate(next);
    syncDateToUrl(next);
  };

  const goToday = () => {
    setDateMode("single");
    setSingleDate(today);
    syncDateToUrl(today);
  };

  const changeSingleDate = (v: string) => {
    setSingleDate(v);
    syncDateToUrl(v);
  };

  const sortOptions: { key: string; label: string }[] = [
    { key: "date", label: "Date" },
    { key: "truck", label: "Truck" },
    { key: "client", label: "Client" },
    { key: "driver", label: "Driver" },
    { key: "amount", label: "Amount" },
    { key: "status", label: "Status" },
  ];

  const applySort = (column: string) => {
    setSortConfig({
      column,
      direction: sortConfig.column === column && sortConfig.direction === "asc" ? "desc" : "asc",
    });
    setSortOpen(false);
  };

  const statusPill = (route: any) => {
    const { label, level } = riskStatusOf(route);
    const text = label.replace(/^\S+\s*/, ""); // strip the leading emoji
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${LEVEL_PILL[level] ?? "bg-[var(--card-bg)] text-[var(--nav-text-color)] border-[var(--card-border)]"}`}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${LEVEL_DOT[level] ?? "bg-[var(--nav-text-color)]"}`} />
        {text || label}
      </span>
    );
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="h-full flex flex-col">
      {/* ── Sticky header: title + date navigation ──
          Hidden entirely when the screen is minimized — only the cards stay. */}
      {!minimized && (
      <div className="sticky top-0 z-30 -mx-4 px-4 pt-3 pb-2 sm:-mx-8 sm:px-8 bg-[var(--card-bg)]/90 backdrop-blur-md border-b border-[var(--card-border)]">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-lg font-black tracking-tight text-[var(--foreground)]">
            Sheets
            <span className="ml-2 text-xs font-medium text-[var(--nav-text-color)]">
              {routes.length} route{routes.length === 1 ? "" : "s"}
            </span>
          </h1>
          <div className="flex items-center gap-1.5">
            {/* Minimize: hides this toolbar, the mobile top bar and the bottom
                tab bar so only the route cards remain visible. */}
            <button
              onClick={minimizeChrome}
              aria-label="Minimize toolbar and navigation"
              title="Minimize toolbar and navigation"
              className="inline-flex items-center gap-1.5 px-2.5 h-8 rounded-lg text-xs font-semibold text-[var(--nav-text-color)] bg-[var(--card-bg)] border border-[var(--card-border)] active:scale-95 transition-all"
            >
              <ChevronsUp size={14} strokeWidth={2.5} />
              <span className="hidden sm:inline">Minimize</span>
            </button>
            <button
              onClick={goToday}
              className="inline-flex items-center gap-1.5 px-2.5 h-8 rounded-lg text-xs font-semibold text-[#06B6D4] bg-[rgba(6,182,212,0.08)] border border-[rgba(6,182,212,0.2)] active:scale-95 transition-all"
            >
              <RotateCcw size={12} strokeWidth={2.5} />
              Today
            </button>
          </div>
        </div>

        {/* Mode chips */}
        <div className="flex items-center gap-1.5 mb-1.5">
          {(["single", "range", "month"] as DateMode[]).map((m) => (
            <button
              key={m}
              onClick={() => setDateMode(m)}
              className={`flex-1 h-8 rounded-lg text-xs font-semibold capitalize transition-all ${
                dateMode === m
                  ? "bg-gradient-to-br from-[#06B6D4] to-[#0891B2] text-white shadow-sm"
                  : "bg-[var(--card-bg)] border border-[var(--card-border)] text-[var(--nav-text-color)]"
              }`}
            >
              {m === "single" ? "Day" : m}
            </button>
          ))}
        </div>

        {/* Date controls */}
        {dateMode === "single" && (
          <div className="flex items-center gap-2">
            <button
              onClick={goPrevDay}
              aria-label="Previous day"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--foreground)] shadow-sm active:scale-95 transition-all"
            >
              <ChevronLeft size={18} strokeWidth={2.5} />
            </button>
            <label className="flex-1 relative">
              <CalendarDays
                size={15}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--nav-text-color)] pointer-events-none"
              />
              <input
                type="date"
                name="mobile-single-date"
                value={singleDate}
                onChange={(e) => changeSingleDate(e.target.value)}
                className={`${inputClass} pl-9`}
                aria-label="Select date"
              />
            </label>
            <button
              onClick={goNextDay}
              aria-label="Next day"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--foreground)] shadow-sm active:scale-95 transition-all"
            >
              <ChevronRight size={18} strokeWidth={2.5} />
            </button>
          </div>
        )}

        {dateMode === "range" && (
          <div className="grid grid-cols-2 gap-1.5">
            <label className="text-[10px] font-semibold text-[var(--nav-text-color)]">
              From
              <input
                type="date"
                name="mobile-from-date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className={`${inputClass} mt-0.5`}
              />
            </label>
            <label className="text-[10px] font-semibold text-[var(--nav-text-color)]">
              To
              <input
                type="date"
                name="mobile-to-date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className={`${inputClass} mt-0.5`}
              />
            </label>
          </div>
        )}

        {dateMode === "month" && (
          <label className="block text-[10px] font-semibold text-[var(--nav-text-color)]">
            Month
            <input
              type="month"
              name="mobile-month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className={`${inputClass} mt-0.5`}
            />
          </label>
        )}

        {/* Search + filter row */}
        <div className="flex items-center gap-2 mt-2">
          <div className="relative flex-1">
            <Search
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--nav-text-color)] pointer-events-none"
            />
            <input
              type="search"
              name="mobile-search"
              value={quickSearch}
              onChange={(e) => setQuickSearch(e.target.value)}
              placeholder="Search truck, client, driver…"
              className={`${inputClass} pl-9`}
            />
          </div>
          <button
            onClick={() => setShowFilters(true)}
            className={`relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border shadow-sm active:scale-95 transition-all ${
              hasAnyFilter
                ? "border-[#06B6D4] bg-[rgba(6,182,212,0.1)] text-[#06B6D4]"
                : "border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--foreground)]"
            }`}
            aria-label="Filters"
          >
            <SlidersHorizontal size={17} strokeWidth={2.25} />
            {hasAnyFilter && (
              <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-gradient-to-br from-[#06B6D4] to-[#0891B2] px-1 text-[9px] font-black text-white shadow-sm">
                {activeFilterCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setSortOpen((s) => !s)}
            className={`relative flex h-9 w-9 shrink-0 items-center justify-center gap-1.5 px-0 rounded-lg border text-xs font-semibold shadow-sm active:scale-95 transition-all sm:w-auto sm:px-3 sm:justify-start ${
              sortConfig.column
                ? "border-[#06B6D4] bg-[rgba(6,182,212,0.1)] text-[#06B6D4]"
                : "border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--foreground)]"
            }`}
            aria-label="Sort"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round">
              <path d="M11 5h10" />
              <path d="M11 9h7" />
              <path d="M11 13h4" />
              <path d="m3 17 3 3 3-3" />
              <path d="M6 18V4" />
            </svg>
            <span className="hidden sm:inline">
              {sortConfig.column ? `${sortConfig.column} ${sortConfig.direction === "asc" ? "↑" : "↓"}` : "Sort"}
            </span>
          </button>
        </div>

        {/* Sort dropdown */}
        {sortOpen && (
          <div className="absolute right-4 sm:right-8 top-full mt-1 z-40 min-w-[180px] rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] shadow-xl backdrop-blur-xl py-1">
            <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-[var(--nav-text-color)]">
              Sort by
            </div>
            {sortOptions.map((o) => {
              const active = sortConfig.column === o.key;
              return (
                <button
                  key={o.key}
                  onClick={() => applySort(o.key)}
                  className="w-full text-left px-3 py-2.5 text-sm text-[var(--foreground)] hover:bg-[var(--card-border)] transition-colors flex items-center justify-between"
                >
                  <span>{o.label}</span>
                  {active && (
                    <span className="text-[#06B6D4] font-bold">
                      {sortConfig.direction === "asc" ? "↑" : "↓"}
                    </span>
                  )}
                </button>
              );
            })}
            {sortConfig.column && (
              <button
                onClick={() => {
                  setSortConfig({ column: null, direction: "asc" });
                  setSortOpen(false);
                }}
                className="w-full text-left px-3 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
              >
                Clear sort
              </button>
            )}
          </div>
        )}
      </div>
      )}

      {/* ── Active filter chips (also hidden when minimized) ── */}
      {!minimized && hasAnyFilter && (
        <div className="flex flex-wrap items-center gap-1.5 px-0.5 py-2">
          {quickSearch && (
            <Chip label={`Search: "${quickSearch}"`} onClear={() => setQuickSearch("")} />
          )}
          {filters.truck && <Chip label={`Truck: ${filters.truck}`} onClear={() => updateFilter("truck", "")} />}
          {filters.trailer && <Chip label={`Trailer: ${filters.trailer}`} onClear={() => updateFilter("trailer", "")} />}
          {filters.client && <Chip label={`Client: ${filters.client}`} onClear={() => updateFilter("client", "")} />}
          {filters.driver && <Chip label={`Driver: ${filters.driver}`} onClear={() => updateFilter("driver", "")} />}
          {filters.from && <Chip label={`From: ${filters.from}`} onClear={() => updateFilter("from", "")} />}
          {filters.to && <Chip label={`To: ${filters.to}`} onClear={() => updateFilter("to", "")} />}
          {filters.date && <Chip label={`Date: ${filters.date}`} onClear={() => updateFilter("date", "")} />}
          {filters.status.length > 0 && (
            <Chip label={`Status (${filters.status.length})`} onClear={() => updateFilter("status", [])} />
          )}
          {(filters.amountMin || filters.amountMax) && (
            <Chip
              label={`Amount ${filters.amountMin ? `≥ ${filters.amountMin}` : ""}${filters.amountMax ? ` ≤ ${filters.amountMax}` : ""}`}
              onClear={() => {
                updateFilter("amountMin", "");
                updateFilter("amountMax", "");
              }}
            />
          )}
          <button
            onClick={clearFilters}
            className="text-xs font-medium text-red-600 hover:text-red-800 underline ml-0.5"
          >
            Clear all
          </button>
        </div>
      )}

      {/* ── Content: loading / empty / day groups ── */}
      <div className="flex-1 min-h-0 overflow-x-hidden overflow-y-auto overscroll-y-contain pb-6">
        {loading ? (
          <div className="space-y-3">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="glass-card rounded-xl p-4 space-y-2.5">
                <div className="skeleton-shimmer h-3 w-24 rounded" />
                <div className="skeleton-shimmer h-8 w-40 rounded" />
                <div className="skeleton-shimmer h-3 w-full rounded" />
                <div className="skeleton-shimmer h-3 w-2/3 rounded" />
              </div>
            ))}
          </div>
        ) : groups.length === 0 ? (
          <div className="flex flex-col items-center justify-center pt-16 px-6 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--card-bg)] border border-[var(--card-border)] mb-3">
              <CalendarDays size={24} className="text-[var(--nav-text-color)]" />
            </div>
            <p className="text-sm font-semibold text-[var(--foreground)]">No routes found</p>
            <p className="text-xs text-[var(--nav-text-color)] mt-1 max-w-[240px]">
              There are no routes for this date range. Try a different date or
              clear the filters.
            </p>
            {hasAnyFilter && (
              <button
                onClick={clearFilters}
                className="mt-4 px-4 h-10 rounded-lg text-sm font-semibold bg-gradient-to-br from-[#06B6D4] to-[#0891B2] text-white shadow-sm active:scale-95 transition-all"
              >
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-5">
            {groups.map(([day, dayRoutes]) => (
              <section key={day}>
                <div className="flex items-baseline justify-between mb-1.5 px-0.5">
                  <h2 className="text-sm font-black tracking-tight text-[var(--foreground)] capitalize">
                    {formatDayLabel(day)}
                  </h2>
                  <span className="text-[11px] font-medium text-[var(--nav-text-color)] tabular-nums">
                    {dayRoutes.length} route{dayRoutes.length === 1 ? "" : "s"}
                  </span>
                </div>
                <div className="space-y-2">
                  {dayRoutes.map((route: any) => (
                    <RouteCard
                      key={route._id}
                      route={route}
                      statusPill={statusPill}
                      onTap={() => onRouteTap(route)}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>

      {/* ── Floating restore pill (visible only while minimized) — drag to
             move it anywhere, tap to restore the toolbar and navigation ── */}
      {minimized && (
        <button
          onPointerDown={handleRestorePillPointerDown}
          onPointerMove={handleRestorePillPointerMove}
          onPointerUp={handleRestorePillPointerUp}
          onPointerCancel={() => {
            restoreDragRef.current = null;
            persistRestorePos();
          }}
          onClick={() => {
            if (!restoreDraggedRef.current) setMinimized(false);
          }}
          aria-label="Restore toolbar and navigation (drag to move)"
          title="Restore toolbar and navigation — drag to move, tap to restore"
          className="fixed z-[60] touch-none select-none cursor-grab active:cursor-grabbing inline-flex items-center gap-1.5 px-3.5 h-10 rounded-full bg-gradient-to-br from-[#06B6D4] to-[#0891B2] text-white text-xs font-bold shadow-lg shadow-[rgba(6,182,212,0.35)]"
          style={restorePillStyle}
        >
          <ChevronDown size={14} strokeWidth={2.75} />
          Restore
        </button>
      )}

      {/* ── Filter bottom sheet ── */}
      {showFilters && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-[2px] animate-in fade-in duration-150"
            onClick={() => setShowFilters(false)}
          />
          <div
            className="relative bg-[var(--background)] rounded-t-2xl border-t border-[var(--card-border)] shadow-2xl max-h-[85dvh] flex flex-col animate-in slide-in-from-bottom duration-200"
            style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
          >
            <div className="flex items-center justify-between px-5 pt-4 pb-2 border-b border-[var(--card-border)]">
              <h3 className="text-base font-black tracking-tight text-[var(--foreground)]">
                Filters
              </h3>
              <button
                onClick={() => setShowFilters(false)}
                aria-label="Close filters"
                className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--nav-text-color)] hover:text-[var(--foreground)] hover:bg-[var(--card-border)] transition-colors"
              >
                <X size={18} strokeWidth={2.5} />
              </button>
            </div>

            <div className="flex-1 overflow-x-hidden overflow-y-auto overscroll-y-contain px-5 py-4 space-y-4">
              {/* Status checkboxes */}
              <div>
                <p className="text-[11px] font-bold uppercase tracking-widest text-[var(--nav-text-color)] mb-2">
                  Status
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {STATUS_OPTIONS.map((s) => {
                    const checked = filters.status.includes(s);
                    return (
                      <button
                        key={s}
                        onClick={() =>
                          updateFilter(
                            "status",
                            checked
                              ? filters.status.filter((x) => x !== s)
                              : [...filters.status, s]
                          )
                        }
                        className={`flex items-center gap-2 h-11 px-3 rounded-lg border text-xs font-semibold transition-all active:scale-[0.98] ${
                          checked
                            ? "border-[#06B6D4] bg-[rgba(6,182,212,0.1)] text-[var(--foreground)]"
                            : "border-[var(--card-border)] bg-[var(--card-bg)]/60 text-[var(--nav-text-color)]"
                        }`}
                      >
                        <span
                          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                            checked ? "bg-[#06B6D4] border-[#06B6D4] text-white" : "border-[var(--card-border)]"
                          }`}
                        >
                          {checked && (
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          )}
                        </span>
                        <span className="truncate">{s.replace(/^\S+\s*/, "")}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Text filters */}
              <div className="grid grid-cols-2 gap-2.5">
                {(
                  [
                    ["truck", "Truck"],
                    ["trailer", "Trailer"],
                    ["client", "Client"],
                    ["driver", "Driver"],
                    ["from", "From"],
                    ["to", "To"],
                  ] as [keyof FiltersShape, string][]
                ).map(([key, label]) => (
                  <label key={key} className="block text-[11px] font-bold uppercase tracking-widest text-[var(--nav-text-color)]">
                    {label}
                    <input
                      type="text"
                      name={`mobile-filter-${key}`}
                      value={String(filters[key] ?? "")}
                      onChange={(e) => updateFilter(key, e.target.value)}
                      placeholder={label}
                      className={`${inputClass} mt-1`}
                    />
                  </label>
                ))}
              </div>

              {/* Amount range */}
              <div className="grid grid-cols-2 gap-2.5">
                <label className="block text-[11px] font-bold uppercase tracking-widest text-[var(--nav-text-color)]">
                  Amount min (R)
                  <input
                    type="number"
                    name="mobile-amount-min"
                    inputMode="decimal"
                    value={filters.amountMin}
                    onChange={(e) => updateFilter("amountMin", e.target.value)}
                    placeholder="0"
                    className={`${inputClass} mt-1`}
                  />
                </label>
                <label className="block text-[11px] font-bold uppercase tracking-widest text-[var(--nav-text-color)]">
                  Amount max (R)
                  <input
                    type="number"
                    name="mobile-amount-max"
                    inputMode="decimal"
                    value={filters.amountMax}
                    onChange={(e) => updateFilter("amountMax", e.target.value)}
                    placeholder="—"
                    className={`${inputClass} mt-1`}
                  />
                </label>
              </div>
            </div>

            <div className="flex items-center gap-2.5 px-5 py-3 border-t border-[var(--card-border)]">
              <button
                onClick={clearFilters}
                className="flex-1 h-11 rounded-lg border border-[var(--card-border)] text-sm font-semibold text-[var(--nav-text-color)] hover:text-[var(--foreground)] active:scale-[0.98] transition-all"
              >
                Clear all
              </button>
              <button
                onClick={() => setShowFilters(false)}
                className="flex-1 h-11 rounded-lg bg-gradient-to-br from-[#06B6D4] to-[#0891B2] text-sm font-bold text-white shadow-sm active:scale-[0.98] transition-all"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Small pieces ────────────────────────────────────────────────────────────

function Chip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <span className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-full text-xs font-medium bg-[rgba(6,182,212,0.08)] text-[#06B6D4] border border-[rgba(6,182,212,0.15)]">
      {label}
      <button
        onClick={onClear}
        aria-label={`Remove ${label}`}
        className="flex h-5 w-5 items-center justify-center rounded-full hover:bg-[rgba(6,182,212,0.15)] transition-colors"
      >
        <X size={11} strokeWidth={3} />
      </button>
    </span>
  );
}

function RouteCard({
  route,
  statusPill,
  onTap,
}: {
  route: any;
  statusPill: (route: any) => React.ReactNode;
  onTap: () => void;
}) {
  const revenue = routeRevenue(route);
  const rPerKm = routeRPerKm(route);
  const froms = uniqueFroms(route);
  const tos = uniqueTos(route);
  const truck = route.truckFleetNoStr || String(route.truckFleetNo ?? "—");
  const km = Number(route.kilometers) || 0;
  const regionMeta = REGION_META[route.region];

  return (
    <button
      type="button"
      onClick={onTap}
      className="glass-card rounded-xl p-3 w-full text-left transition-all active:scale-[0.99] active:bg-[var(--card-bg)] cursor-pointer group"
      aria-label={`View details for Truck ${truck}`}
    >
      {/* Status + revenue (+ R / KM) */}
      <div className="flex items-center justify-between gap-2 mb-1.5">
        {statusPill(route)}
        <div className="flex items-center gap-2 shrink-0">
          {rPerKm > 0 && (
            <span
              className="inline-flex items-center rounded-md border border-[rgba(6,182,212,0.2)] bg-[rgba(6,182,212,0.08)] px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-[#06B6D4]"
              title="Revenue per kilometre"
            >
              {formatZAR(rPerKm)}/km
            </span>
          )}
          <span className="text-sm font-black text-[var(--foreground)] tabular-nums">
            {revenue > 0 ? formatZAR(revenue) : "—"}
          </span>
        </div>
      </div>

      {/* Truck + driver */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-[15px] font-black tracking-tight text-[#06B6D4]">
          {truck}
        </span>
        <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--nav-text-color)] truncate">
          {route.driverName ? route.driverName.toUpperCase() : "—"}
        </span>
      </div>

      {/* Client + route (merged onto one compact line) */}
      {(route.client || froms.length > 0 || tos.length > 0) && (
        <p className="text-[12px] font-semibold text-[var(--foreground)] mt-0.5 truncate">
          {route.client && route.client.toUpperCase()}
          {(froms.length > 0 || tos.length > 0) && (
            <span className="text-[var(--nav-text-color)] font-medium">
              {route.client ? " · " : ""}
              {froms.length > 0 ? froms.join(", ").toUpperCase() : "?"} →{" "}
              {tos.length > 0 ? tos.join(", ").toUpperCase() : "?"}
            </span>
          )}
        </p>
      )}

      {/* Meta + tap affordance — the loads/trailer/km cluster truncates on
          narrow phones so the region badge and Details stay on one line. */}
      <div className="flex items-center gap-1.5 mt-1.5 pt-1.5 border-t border-[var(--card-border)] text-[10px] font-medium text-[var(--nav-text-color)]">
        {regionMeta ? (
          <span
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold whitespace-nowrap shrink-0 ${regionMeta.cls}`}
            title="Region"
          >
            <span className={`w-1.5 h-1.5 rounded-full ${regionMeta.dot}`} />
            {regionMeta.label}
          </span>
        ) : (
          <span className="shrink-0">—</span>
        )}
        <span className="min-w-0 truncate">
          {route.loads?.length ?? 0} load{(route.loads?.length ?? 0) === 1 ? "" : "s"}
          {route.trailerFleetNoStr && (
            <>
              <span className="opacity-40"> · </span>
              {route.trailerFleetNoStr}
            </>
          )}
          {km > 0 && (
            <>
              <span className="opacity-40"> · </span>
              {km} km
            </>
          )}
        </span>
        <span className="ml-auto shrink-0 flex items-center gap-0.5 text-[10px] font-bold text-[#06B6D4]">
          Details
          <ChevronRight size={11} strokeWidth={2.75} />
        </span>
      </div>
    </button>
  );
}
