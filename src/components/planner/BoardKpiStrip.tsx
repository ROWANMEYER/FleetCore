import { type BoardKpis } from "@/src/lib/planner/boardStats";

type BoardKpiStripProps = {
  kpis: BoardKpis;
};

const KPI_DEFS: { key: keyof BoardKpis; label: string; highlightWhenNonZero?: boolean }[] = [
  { key: "totalLoads", label: "Total Loads" },
  { key: "plannedTrucks", label: "Planned Trucks" },
  { key: "readyRoutes", label: "Ready Routes" },
  { key: "availableTrucks", label: "Available Trucks" },
  { key: "unallocated", label: "Unallocated", highlightWhenNonZero: true },
];

/**
 * Compact horizontal KPI strip for the Planner Board.
 * Values are all derived from authoritative Board data (see computeBoardKpis).
 */
export default function BoardKpiStrip({ kpis }: BoardKpiStripProps) {
  return (
    <div className="grid grid-cols-5 gap-2 min-w-0">
      {KPI_DEFS.map((def) => {
        const value = kpis[def.key];
        const highlighted = def.highlightWhenNonZero && value > 0;
        return (
          <div
            key={def.key}
            className="rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)]/60 px-2.5 py-2 min-w-0"
          >
            <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--nav-text-color)]">
              {def.label}
            </div>
            <div
              className={`text-lg font-black leading-tight ${
                highlighted ? "text-amber-500 dark:text-amber-400" : "text-[var(--foreground)]"
              }`}
            >
              {value}
            </div>
          </div>
        );
      })}
    </div>
  );
}