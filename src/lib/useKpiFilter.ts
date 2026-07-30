"use client";

import { useState, useCallback } from "react";

export type KpiFilter = "total" | "active" | "inactive";

/**
 * Manages KPI filter state ("total" | "active" | "inactive") synced to
 * the `?kpi=` query parameter in the URL. On mount the hook reads the
 * URL to restore the previous filter. The URL is updated via
 * `history.replaceState` so there is no re-render loop.
 */
export function useKpiFilter(initial?: KpiFilter) {
  const [filter, setFilterState] = useState<KpiFilter>(() => {
    // On first render, try reading from the actual browser URL
    if (typeof window !== "undefined") {
      const p = new URLSearchParams(window.location.search);
      const kpi = p.get("kpi");
      if (kpi === "active" || kpi === "inactive") return kpi;
    }
    return initial ?? "total";
  });

  const setFilter = useCallback((next: KpiFilter) => {
    setFilterState(next);

    // Sync to the URL via History API (no re-render)
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (next === "total") {
      params.delete("kpi");
    } else {
      params.set("kpi", next);
    }
    const qs = params.toString();
    window.history.replaceState(
      null,
      "",
      qs ? `${window.location.pathname}?${qs}` : window.location.pathname,
    );
  }, []);

  return [filter, setFilter] as const;
}
