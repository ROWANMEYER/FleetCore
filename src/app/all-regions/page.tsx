"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/src/components/auth/AuthProvider";
import { calculateLoadAmount } from "@/convex/utils";
import { BarChart3, ChevronDown } from "lucide-react";
import SpreadsheetDataTable, {
  type SpreadsheetRow,
  type SpreadsheetExtraColumn,
} from "@/src/components/operations/daily-planner/SpreadsheetDataTable";
import { SkeletonLine, SkeletonKpiGrid } from "@/src/components/common/Skeleton";
import { EmptyState } from "@/src/components/common/EmptyState";
import { useToast } from "@/src/components/common/Toast";

/* ─── helpers ─────────────────────────────────────────────────────────────── */

const today = () => new Date().toISOString().split("T")[0];

const monthRange = (ym: string) => {
  const [year, month] = ym.split("-").map(Number);
  const start = new Date(Date.UTC(year, month - 1, 1)).toISOString().split("T")[0];
  const end = new Date(Date.UTC(year, month, 0)).toISOString().split("T")[0];
  return { start, end };
};

// "August 2026" style label for the month stepper (UTC-safe for the YYYY-MM key).
const monthLabel = (iso: string) => {
  const d = new Date(iso + "-01");
  return d.toLocaleDateString("en-ZA", { month: "long", year: "numeric" });
};

// Step a YYYY-MM key by ±1 month with pure UTC arithmetic — Date.UTC handles
// December → January wrap and month-length shifts with no timezone/DST drift
// (local-time setMonth on a UTC-parsed date can land on the wrong month).
const shiftMonth = (ym: string, delta: number) => {
  const [year, month] = ym.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1 + delta, 1)).toISOString().slice(0, 7);
};

// Same number parsing as the spreadsheet table (strips letters/spaces, treats
// commas as decimal separators) so R / KM aggregates match the column values.
function parseNumberSafe(value: unknown): number {
  if (value == null) return 0;
  const cleaned = String(value)
    .replace(/[A-Za-z]/g, "")
    .replace(/\s+/g, "")
    .replace(/,/g, ".");
  const n = parseFloat(cleaned);
  return Number.isNaN(n) ? 0 : n;
}

// Deterministic ZAR formatting ("R 1 234,56") matching the rest of the app.
function formatZAR(value: number): string {
  const parts = value.toFixed(2).split(".");
  const integerPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `R ${integerPart},${parts[1]}`;
}

// Route revenue — identical to the spreadsheet rows: the sum of load amounts,
// or the route-level rate when the route has no loads.
function routeRevenueOf(route: any): number {
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

const REGION_META: Record<string, { label: string; cls: string; dot: string }> = {
  garden_route: {
    label: "Garden Route",
    cls: "bg-[rgba(6,182,212,0.12)] text-[#06B6D4] dark:text-[#22D3EE]",
    dot: "bg-[#06B6D4]",
  },
  eastern_cape: {
    label: "Eastern Cape",
    cls: "bg-[rgba(168,85,247,0.12)] text-purple-600 dark:text-purple-400",
    dot: "bg-purple-500",
  },
};

/* ─── Region cell with inline dropdown (change region right from the table) ── */

const REGION_OPTIONS: {
  value: string | null;
  label: string;
  dot: string | null;
  cls: string;
}[] = [
  { value: "garden_route", label: "Garden Route", dot: "bg-[#06B6D4]", cls: "text-[#06B6D4] dark:text-[#22D3EE]" },
  { value: "eastern_cape", label: "Eastern Cape", dot: "bg-purple-500", cls: "text-purple-600 dark:text-purple-400" },
  { value: null, label: "Unassigned", dot: null, cls: "text-[var(--nav-text-color)]" },
];

function RegionCell({ row }: { row: SpreadsheetRow }) {
  const { token } = useAuth();
  const { addToast } = useToast();
  const updateRouteRegion = useMutation(api.dailyRoutes.updateRouteRegion);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);

  const meta = REGION_META[row.region];

  const openMenu = () => {
    const el = anchorRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    // Open downward when there's room; otherwise flip above so rows near the
    // bottom of the table keep all options reachable (any scroll closes the
    // menu, so it must never extend past the viewport).
    const MENU_HEIGHT = 150;
    const top =
      rect.bottom + 4 + MENU_HEIGHT > window.innerHeight
        ? Math.max(8, rect.top - MENU_HEIGHT - 4)
        : rect.bottom + 4;
    setMenuPos({ top, left: rect.left });
    setOpen(true);
  };

  // Close on outside click, on scroll (the menu is viewport-fixed, so any
  // table scroll would leave it misaligned), or on Escape.
  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      if (anchorRef.current && !anchorRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onScroll = () => setOpen(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onMouseDown);
    window.addEventListener("scroll", onScroll, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("scroll", onScroll, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const choose = async (region: string | null) => {
    setOpen(false);
    if ((region ?? "") === (row.region ?? "")) return;
    setSaving(true);
    try {
      await updateRouteRegion({ routeId: row.routeId as any, region: region as any, token });
    } catch (err) {
      console.error("Failed to update region:", err);
      addToast("Couldn't update the region — please try again.", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div ref={anchorRef} className={`px-2 ${row.region ? "py-1" : ""} flex items-center w-full h-full`}>
      {meta ? (
        <button
          onClick={openMenu}
          disabled={saving}
          title="Change region"
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold whitespace-nowrap ${meta.cls} transition-opacity ${
            saving ? "opacity-60 cursor-wait" : "cursor-pointer hover:opacity-85"
          }`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
          {meta.label}
          <ChevronDown size={12} className="opacity-60" strokeWidth={2.5} />
        </button>
      ) : (
        <button
          onClick={openMenu}
          disabled={saving}
          title="Assign region"
          className={`text-[var(--nav-text-color)] text-[11px] font-semibold px-2 py-1 rounded-full border border-dashed border-[var(--card-border)] transition-colors ${
            saving ? "opacity-60 cursor-wait" : "cursor-pointer hover:text-[var(--foreground)] hover:border-[#06B6D4]/50"
          }`}
        >
          — assign
        </button>
      )}

      {open && menuPos && (
        <div
          className="fixed z-[100] min-w-[180px] rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] shadow-xl backdrop-blur-xl py-1"
          style={{ top: menuPos.top, left: menuPos.left, backgroundColor: "var(--card-bg)" }}
        >
          {REGION_OPTIONS.map((opt) => {
            const active = (opt.value ?? "") === (row.region ?? "");
            return (
              <button
                key={opt.label}
                onClick={() => choose(opt.value)}
                className={`w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-left transition-colors ${
                  active
                    ? `bg-[rgba(6,182,212,0.1)] ${opt.cls}`
                    : "text-[var(--foreground)] hover:bg-[var(--card-border)]"
                }`}
              >
                {opt.dot ? (
                  <span className={`w-1.5 h-1.5 rounded-full ${opt.dot}`} />
                ) : (
                  <span className="w-1.5 h-1.5 rounded-full border border-[var(--card-border)]" />
                )}
                {opt.label}
                {active && <span className="ml-auto text-[#06B6D4]">✓</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ─── Region column for the spreadsheet table ────────────────────────────── */

const regionColumn: SpreadsheetExtraColumn = {
  key: "region",
  label: "Region",
  defaultWidth: 140,
  minWidth: 112,
  render: (row: SpreadsheetRow) => <RegionCell row={row} />,
};

/* ─── Minimal inline region stat pill ─────────────────────────────────────── */

function RegionStat({
  dot,
  label,
  value,
  sub,
  accent,
  active,
  onClick,
}: {
  dot?: string;
  label: string;
  value: number | string;
  sub?: string;
  accent?: boolean;
  /** True when this pill is the active region filter (teal ring). */
  active?: boolean;
  /** When provided the pill becomes a toggle button (click on/off as a filter). */
  onClick?: () => void;
}) {
  const inner = (
    <>
      {dot && <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />}
      <span
        className={`text-xs font-bold tabular-nums ${accent ? "text-[#06B6D4]" : "text-[var(--foreground)]"}`}
      >
        {value}
      </span>
      <span className="text-[11px] text-[var(--nav-text-color)]">{label}</span>
      {sub && (
        <span className="text-[11px] text-[var(--nav-text-color)] opacity-70 hidden xl:inline">({sub})</span>
      )}
    </>
  );
  const baseCls =
    "glass-card flex items-center gap-1.5 rounded-full px-3 py-1.5 whitespace-nowrap";
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        title={sub ? `${label} — ${sub} (click to filter)` : `${label} — click to filter`}
        className={`${baseCls} cursor-pointer transition-all ${
          active
            ? "ring-2 ring-[#06B6D4]/60 border-[#06B6D4]/50 shadow-[0_0_0_1px_rgba(6,182,212,0.4),0_4px_14px_rgba(6,182,212,0.18)]"
            : "hover:ring-1 hover:ring-[#06B6D4]/30 hover:border-[#06B6D4]/40 hover:-translate-y-px"
        }`}
      >
        {inner}
        {active && <span className="text-[#06B6D4] text-[11px] font-bold">✕</span>}
      </button>
    );
  }
  return (
    <div className={baseCls} title={sub ? `${label} — ${sub}` : label}>
      {inner}
    </div>
  );
}

/* ─── Date selector (Day / Month / Range) ─────────────────────────────────── */

type DateMode = "day" | "month" | "range";

const DATE_TABS: { id: DateMode; label: string }[] = [
  { id: "day", label: "Day" },
  { id: "month", label: "Month" },
  { id: "range", label: "Range" },
];

/* ─── Page ─────────────────────────────────────────────────────────────────── */

export default function AllRegionsPage() {
  const { user, token } = useAuth();
  const isAdmin = user?.role === "admin";

  // ── Date state (defaults to current month) ──
  const [dateMode, setDateMode] = useState<DateMode>("month");
  const [singleDate, setSingleDate] = useState(today());
  const [rangeStart, setRangeStart] = useState(() => monthRange(today().slice(0, 7)).start);
  const [rangeEnd, setRangeEnd] = useState(() => monthRange(today().slice(0, 7)).end);
  const [selectedMonth, setSelectedMonth] = useState(today().slice(0, 7));

  // ── Region filter — clicking the KPI pills toggles a region filter on/off ──
  const [regionFilter, setRegionFilter] = useState<"" | "garden_route" | "eastern_cape">("");

  const toggleRegionFilter = (region: "garden_route" | "eastern_cape") => {
    setRegionFilter((prev) => (prev === region ? "" : region));
  };

  const { startDate, endDate } = useMemo(() => {
    if (dateMode === "day") return { startDate: singleDate, endDate: singleDate };
    if (dateMode === "range") return { startDate: rangeStart, endDate: rangeEnd };
    const m = monthRange(selectedMonth);
    return { startDate: m.start, endDate: m.end };
  }, [dateMode, singleDate, rangeStart, rangeEnd, selectedMonth]);

  const rangeReversed = dateMode === "range" && rangeEnd < rangeStart;
  const datesReady = !!startDate && !!endDate && !rangeReversed;

  // ── Data: ALL regions, always (this page is the combined view).
  // Skipped for non-admins (the guard card renders instead) and when the
  // date range is invalid, so the page never fetches needlessly.
  const routes = useQuery(
    api.dailyRoutes.getForSheets,
    isAdmin && datesReady ? { startDate, endDate, token, region: undefined } : "skip"
  );
  const updateLoadFields = useMutation(api.dailyRoutes.updateLoadFields);

  // Region-filtered routes for the table (clicking the KPI pills toggles)
  const filteredRoutes = useMemo(() => {
    if (!regionFilter) return routes ?? [];
    return (routes ?? []).filter((r) => (r.region || "") === regionFilter);
  }, [routes, regionFilter]);

  // Region split summary, computed client-side from the fetched routes
  const regionSummary = useMemo(() => {
    const counts: Record<string, number> = {};
    let totalRevenue = 0;
    for (const r of routes ?? []) {
      const key = r.region || "unassigned";
      counts[key] = (counts[key] || 0) + 1;
      totalRevenue += Number((r as any).rate) || 0;
    }
    return {
      garden_route: counts.garden_route ?? 0,
      eastern_cape: counts.eastern_cape ?? 0,
      unassigned: counts.unassigned ?? 0,
      total: (routes ?? []).length,
      totalRevenue,
    };
  }, [routes]);

  // R / KM aggregate across every route in the selection — the weighted
  // average (total load revenue ÷ total kilometres), so it lines up with the
  // per-route R / KM column values in the table.
  const rkmSummary = useMemo(() => {
    let totalRevenue = 0;
    let totalKm = 0;
    for (const r of routes ?? []) {
      totalRevenue += routeRevenueOf(r);
      totalKm += Number(r.kilometers) || 0;
    }
    const avg = totalKm > 0 && totalRevenue > 0 ? Number((totalRevenue / totalKm).toFixed(2)) : 0;
    return { avg, totalKm, totalRevenue };
  }, [routes]);

  const loading = isAdmin && datesReady && !routes;

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 min-h-0 w-full flex flex-col gap-5 px-4 sm:px-6 py-4 sm:py-6 overflow-y-auto">
        {/* ── Header ── */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="flex items-center justify-center w-11 h-11 rounded-xl bg-gradient-to-br from-[#06B6D4] to-[#0891B2] shadow-md shadow-[rgba(6,182,212,0.3)]">
            <BarChart3 size={22} className="text-white" strokeWidth={2.5} />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight text-[var(--foreground)]">
              All Regions
            </h1>
            <p className="text-sm text-[var(--nav-text-color)] mt-0.5">
              Combined route table across Garden Route &amp; Eastern Cape
            </p>
          </div>
        </div>

        {!isAdmin ? (
          <div className="glass-card rounded-xl p-10 text-center">
            <p className="text-sm text-[var(--nav-text-color)]">
              This section is only available to administrators.
            </p>
          </div>
        ) : (
          <>
            {/* ── Date selector + region split — single minimal row ── */}
            <div className="shrink-0 flex flex-wrap items-center gap-3">
              <div className="glass-card flex rounded-xl p-1 gap-1">
                {DATE_TABS.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setDateMode(t.id)}
                    className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                      dateMode === t.id
                        ? "bg-gradient-to-br from-[#06B6D4] to-[#0891B2] text-white shadow-sm"
                        : "text-[var(--nav-text-color)] hover:text-[var(--foreground)]"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              <div className="glass-card flex items-center gap-2 rounded-xl px-3 py-1.5">
                {dateMode === "day" && (
                  <input
                    type="date"
                    value={singleDate}
                    onChange={(e) => setSingleDate(e.target.value)}
                    className="bg-transparent text-sm py-1.5 focus:outline-none text-[var(--foreground)]"
                  />
                )}
                {dateMode === "month" && (
                  <>
                    <button
                      type="button"
                      onClick={() => setSelectedMonth(shiftMonth(selectedMonth, -1))}
                      aria-label="Previous month"
                      className="w-8 h-8 flex items-center justify-center font-bold text-[var(--nav-text-color)] hover:text-[var(--foreground)]"
                    >
                      ‹
                    </button>
                    <span className="text-sm font-semibold min-w-[130px] text-center text-[var(--foreground)]">
                      {monthLabel(selectedMonth)}
                    </span>
                    <button
                      type="button"
                      onClick={() => setSelectedMonth(shiftMonth(selectedMonth, 1))}
                      aria-label="Next month"
                      className="w-8 h-8 flex items-center justify-center font-bold text-[var(--nav-text-color)] hover:text-[var(--foreground)]"
                    >
                      ›
                    </button>
                  </>
                )}
                {dateMode === "range" && (
                  <>
                    <input
                      type="date"
                      value={rangeStart}
                      onChange={(e) => setRangeStart(e.target.value)}
                      className="bg-transparent text-sm py-1.5 focus:outline-none text-[var(--foreground)]"
                    />
                    <span className="text-[var(--nav-text-color)]">→</span>
                    <input
                      type="date"
                      value={rangeEnd}
                      onChange={(e) => setRangeEnd(e.target.value)}
                      className="bg-transparent text-sm py-1.5 focus:outline-none text-[var(--foreground)]"
                    />
                  </>
                )}
              </div>

              {rangeReversed && (
                <p className="text-xs font-medium text-red-600">
                  End date cannot be before the start date.
                </p>
              )}

              {/* Region split — clickable KPI pills (toggle the table filter) */}
              {!loading && regionSummary.total > 0 && (
                <div className="ml-auto flex flex-wrap items-center gap-2">
                  <RegionStat
                    dot="bg-[#06B6D4]"
                    label="Garden Route"
                    value={regionSummary.garden_route}
                    active={regionFilter === "garden_route"}
                    onClick={() => toggleRegionFilter("garden_route")}
                  />
                  <RegionStat
                    dot="bg-purple-500"
                    label="Eastern Cape"
                    value={regionSummary.eastern_cape}
                    active={regionFilter === "eastern_cape"}
                    onClick={() => toggleRegionFilter("eastern_cape")}
                  />
                  <RegionStat
                    label="Total"
                    value={regionSummary.total}
                    sub={regionSummary.unassigned > 0 ? `${regionSummary.unassigned} unassigned` : "all regions"}
                    active={regionFilter !== ""}
                    onClick={() => setRegionFilter("")}
                  />
                  <RegionStat
                    accent
                    label="R / KM"
                    value={rkmSummary.avg > 0 ? formatZAR(rkmSummary.avg) : "—"}
                    sub={rkmSummary.totalKm > 0 ? `${rkmSummary.totalKm.toLocaleString()} km` : "no km"}
                  />
                </div>
              )}
            </div>

            {/* ── Table ── */}
            {rangeReversed ? (
              <EmptyState
                icon="calendar"
                title="Invalid date range"
                description="End date cannot be before the start date — pick a valid range to load the table."
              />
            ) : loading ? (
              <div className="space-y-3">
                <SkeletonKpiGrid count={3} />
                {Array.from({ length: 8 }).map((_, i) => (
                  <SkeletonLine key={i} className="w-full h-10" />
                ))}
              </div>
            ) : (routes ?? []).length === 0 ? (
              <EmptyState
                icon="calendar"
                title="No routes found"
                description={`No routes exist for ${startDate}${startDate !== endDate ? ` → ${endDate}` : ""}. Pick a different date range.`}
              />
            ) : filteredRoutes.length === 0 ? (
              <EmptyState
                icon="filter"
                title="No routes in this region"
                description={`No ${regionFilter === "garden_route" ? "Garden Route" : "Eastern Cape"} routes for ${startDate}${startDate !== endDate ? ` → ${endDate}` : ""}. Click the region pill again to clear the filter.`}
              />
            ) : (
              <div className="flex-1 min-h-0 glass-card rounded-xl overflow-hidden flex flex-col">
                <SpreadsheetDataTable
                  className="h-full min-h-0"
                  routes={filteredRoutes}
                  density="compact"
                  storageNamespace="allregions"
                  extraColumn={regionColumn}
                  updateLoadFields={({ routeId, loadIndex, patch }) =>
                    updateLoadFields({ routeId: routeId as any, loadIndex, patch, token })
                  }
                />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
