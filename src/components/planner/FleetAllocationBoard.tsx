"use client";

import { useMemo } from "react";
import { api } from "@/convex/_generated/api";
import { useQuery } from "convex/react";
import { useAuth, useRegionArg } from "@/src/components/auth/AuthProvider";
import { usePersistentDraft } from "@/src/hooks/usePersistentDraft";
import { resolveDraftRegion } from "@/src/lib/drafts/draftKey";
import {
  BOARD_FILTERS_WORKFLOW,
  DEFAULT_BOARD_FILTERS,
  sanitizeBoardFilters,
} from "@/src/lib/drafts/boardFilters";
import { buildBoardTrucks } from "@/src/lib/planner/boardHelpers";
import {
  computeBoardKpis,
  filterBoardTrucks,
} from "@/src/lib/planner/boardStats";
import type { RouteInsert } from "@/src/lib/planner/dndPlanning";
import BoardKpiStrip from "./BoardKpiStrip";
import BoardToolbar from "./BoardToolbar";
import TruckLane from "./TruckLane";

type FleetAllocationBoardProps = {
  boardDate: string;
  unallocatedCount?: number;
  pendingLoadId?: string;
  activeSourceRouteId?: string;
  activeRouteId?: string;
  routeInsert?: RouteInsert | null;
  routeReorderPendingTruck?: string;
};

export default function FleetAllocationBoard({
  boardDate,
  unallocatedCount = 0,
  pendingLoadId,
  activeSourceRouteId,
  activeRouteId,
  routeInsert,
  routeReorderPendingTruck,
}: FleetAllocationBoardProps) {
  const { user, token } = useAuth();
  const region = useRegionArg();
  const {
    value: filters,
    setValue: setFilters,
  } = usePersistentDraft({
    workflow: BOARD_FILTERS_WORKFLOW,
    defaultValue: DEFAULT_BOARD_FILTERS,
    userId: user?._id ?? null,
    region: resolveDraftRegion(user, region),
    validate: sanitizeBoardFilters,
  });
  const search = filters.search;
  const status = filters.status;

  const trucks = useQuery(api.fleet.getTrucks, { includeInactive: false });
  const routes = useQuery(api.dailyRoutes.getRoutesByDate, {
    routeDate: boardDate,
    token,
    region,
  });
  const availability = useQuery(api.dailyAvailability.getByDay, {
    dayKey: boardDate,
  });
  const trailers = useQuery(api.fleet.getTrailers, { includeInactive: false });

  const boardTrucks = useMemo(() => {
    if (!trucks || !routes) return [];
    return buildBoardTrucks(
      trucks,
      routes,
      availability ?? undefined,
      trailers ?? undefined
    );
  }, [trucks, routes, availability, trailers]);

  const kpis = useMemo(
    () => computeBoardKpis(boardTrucks, unallocatedCount),
    [boardTrucks, unallocatedCount]
  );

  const filteredTrucks = useMemo(
    () => filterBoardTrucks(boardTrucks, search, status),
    [boardTrucks, search, status]
  );

  const loading = !trucks || !routes || !trailers;

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center text-xs text-[var(--nav-text-color)]">
        Loading fleet data...
      </div>
    );
  }

  return (
    <div className="w-full flex-1 min-w-0 h-full flex flex-col min-h-0 gap-2.5">
      <BoardKpiStrip kpis={kpis} />

      <BoardToolbar
        search={search}
        onSearchChange={(value) => setFilters((previous) => ({ ...previous, search: value }))}
        status={status}
        onStatusChange={(value) => setFilters((previous) => ({ ...previous, status: value }))}
        visibleTruckCount={filteredTrucks.length}
        totalTruckCount={boardTrucks.length}
        region={region}
      />

      {filteredTrucks.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-xs text-[var(--nav-text-color)]">
          {search.trim() || status !== "all"
            ? "No trucks match your search or filters."
            : "No trucks available."}
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-fleet pr-0.5">
          <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] items-start gap-2.5">
            {filteredTrucks.map((bt) => (
              <TruckLane
                key={bt.truck._id}
                boardTruck={bt}
                boardDate={boardDate}
                pendingLoadId={pendingLoadId}
                activeSourceRouteId={activeSourceRouteId}
                activeRouteId={activeRouteId}
                routeInsert={routeInsert}
                routeReorderPendingTruck={routeReorderPendingTruck}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}