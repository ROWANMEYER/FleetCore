"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/src/components/auth/AuthProvider";
import { BarChart3, MapPin } from "lucide-react";
import SpreadsheetDataTable, {
  type SpreadsheetRow,
  type SpreadsheetExtraColumn,
} from "@/src/components/operations/daily-planner/SpreadsheetDataTable";
import { SkeletonLine, SkeletonKpiGrid } from "@/src/components/common/Skeleton";
import { EmptyState } from "@/src/components/common/EmptyState";

/* ─── helpers ─────────────────────────────────────────────────────────────── */

const today = () => new Date().toISOString().split("T")[0];

const monthRange = (ym: string) => {
  const [year, month] = ym.split("-").map(Number);
  const start = new Date(Date.UTC(year, month - 1, 1)).toISOString().split("T")[0];
  const end = new Date(Date.UTC(year, month, 0)).toISOString().split("T")[0];
  return { start, end };
};

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

/* ─── Region column for the spreadsheet table ────────────────────────────── */

const regionColumn: SpreadsheetExtraColumn = {
  key: "region",
  label: "Region",
  defaultWidth: 140,
  minWidth: 112,
  render: (row: SpreadsheetRow) => {
    const meta = REGION_META[row.region];
    return (
      <div className={`px-2 ${row.region ? "py-1" : ""} truncate flex items-center w-full h-full`}>
        {meta ? (
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold whitespace-nowrap ${meta.cls}`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
            {meta.label}
          </span>
        ) : (
          <span className="text-[var(--nav-text-color)]">—</span>
        )}
      </div>
    );
  },
};

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

  const loading = isAdmin && datesReady && !routes;

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-5">
        {/* ── Header ── */}
        <div className="flex items-center gap-3">
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
            {/* ── Date selector ── */}
            <div className="flex flex-wrap items-center gap-3">
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
                  <input
                    type="month"
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value || today().slice(0, 7))}
                    className="bg-transparent text-sm py-1.5 focus:outline-none text-[var(--foreground)]"
                  />
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
            </div>

            {/* ── Region split summary ── */}
            {!loading && regionSummary.total > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="glass-card rounded-xl p-4">
                  <div className="flex items-center gap-2 text-xs font-semibold text-[var(--nav-text-color)] uppercase tracking-wider mb-2">
                    <span className="w-2 h-2 rounded-full bg-[#06B6D4]" />
                    Garden Route
                  </div>
                  <div className="text-2xl font-black text-[var(--foreground)]">
                    {regionSummary.garden_route}
                  </div>
                  <div className="text-xs text-[var(--nav-text-color)] mt-0.5">routes</div>
                </div>
                <div className="glass-card rounded-xl p-4">
                  <div className="flex items-center gap-2 text-xs font-semibold text-[var(--nav-text-color)] uppercase tracking-wider mb-2">
                    <span className="w-2 h-2 rounded-full bg-purple-500" />
                    Eastern Cape
                  </div>
                  <div className="text-2xl font-black text-[var(--foreground)]">
                    {regionSummary.eastern_cape}
                  </div>
                  <div className="text-xs text-[var(--nav-text-color)] mt-0.5">routes</div>
                </div>
                <div className="col-span-2 sm:col-span-1 glass-card rounded-xl p-4">
                  <div className="flex items-center gap-2 text-xs font-semibold text-[var(--nav-text-color)] uppercase tracking-wider mb-2">
                    <MapPin size={12} />
                    Total
                  </div>
                  <div className="text-2xl font-black text-[var(--foreground)]">
                    {regionSummary.total}
                  </div>
                  <div className="text-xs text-[var(--nav-text-color)] mt-0.5">
                    routes · {regionSummary.unassigned > 0 ? `${regionSummary.unassigned} unassigned` : "all regions"}
                  </div>
                </div>
              </div>
            )}

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
            ) : (
              <div className="glass-card rounded-xl overflow-hidden">
                <SpreadsheetDataTable
                  routes={routes ?? []}
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
