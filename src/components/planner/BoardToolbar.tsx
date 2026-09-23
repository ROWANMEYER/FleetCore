import { Search } from "lucide-react";
import { type BoardStatusFilter } from "@/src/lib/planner/boardStats";
import { REGION_META } from "@/src/components/operations/daily-planner/RegionCell";

const FILTERS: { value: BoardStatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "planned", label: "Planned" },
  { value: "ready", label: "Ready" },
  { value: "available", label: "Available" },
  { value: "unavailable", label: "Unavailable" },
];

type BoardToolbarProps = {
  search: string;
  onSearchChange: (value: string) => void;
  status: BoardStatusFilter;
  onStatusChange: (status: BoardStatusFilter) => void;
  visibleTruckCount: number;
  totalTruckCount: number;
  region?: "garden_route" | "eastern_cape";
};

/**
 * Board toolbar: search + status filter chips + truck count + a subtle
 * effective-region label (read-only — region scoping stays server-enforced).
 * Presentation filters only; never touches backend queries.
 */
export default function BoardToolbar({
  search,
  onSearchChange,
  status,
  onStatusChange,
  visibleTruckCount,
  totalTruckCount,
  region,
}: BoardToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2 w-full flex-shrink-0">
      {/* Search */}
      <div className="relative flex-1 min-w-[180px] max-w-[340px]">
        <Search
          size={13}
          className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--nav-text-color)] pointer-events-none"
        />
        <input
          type="text"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search trucks, reg, driver..."
          className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)]/60 focus:border-[#06B6D4] focus:ring-1 focus:ring-[#06B6D4]/30 focus:outline-none text-[var(--foreground)]"
        />
      </div>

      {/* Visible / total truck count */}
      <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--nav-text-color)] whitespace-nowrap">
        {visibleTruckCount} / {totalTruckCount} trucks
      </span>

      {/* Status filters */}
      <div className="flex items-center gap-0.5 rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)]/60 p-0.5">
        {FILTERS.map((filter) => {
          const active = filter.value === status;
          return (
            <button
              key={filter.value}
              onClick={() => onStatusChange(filter.value)}
              className={`text-[11px] font-bold px-2 py-1 rounded transition-colors ${
                active
                  ? "text-white bg-gradient-to-br from-[#06B6D4] to-[#0891B2] shadow-sm shadow-[rgba(6,182,212,0.25)]"
                  : "text-[var(--nav-text-color)] hover:text-[var(--foreground)]"
              }`}
            >
              {filter.label}
            </button>
          );
        })}
      </div>

      {/* Effective region — read-only */}
      {region && (
        <span className="text-[10px] text-[var(--nav-text-color)] whitespace-nowrap ml-auto">
          {REGION_META[region]?.label ?? region}
        </span>
      )}
    </div>
  );
}