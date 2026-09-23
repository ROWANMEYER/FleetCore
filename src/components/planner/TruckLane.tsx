"use client";

import { useState, useCallback } from "react";
import { useDroppable } from "@dnd-kit/core";
import { api } from "@/convex/_generated/api";
import { useMutation } from "convex/react";
import { useAuth } from "@/src/components/auth/AuthProvider";
import {
  type BoardTruck,
  isBoardManaged,
  getCompleteRouteIds,
} from "@/src/lib/planner/boardHelpers";
import {
  type TruckDropTargetData,
  resolveUnallocatedDropDecision,
  toTruckTargetId,
} from "@/src/lib/planner/dndPlanning";
import { type Id } from "@/convex/_generated/dataModel";
import RouteCard from "./RouteCard";
import TruckAvatar from "./TruckAvatar";

type TruckLaneProps = {
  boardTruck: BoardTruck;
  boardDate: string;
};

const statusStyles = {
  available: "bg-green-50 text-green-700 border-green-200 dark:bg-green-500/15 dark:text-green-400 dark:border-green-500/20",
  planned: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/15 dark:text-blue-400 dark:border-blue-500/20",
  completed: "bg-slate-50 text-slate-500 border-slate-200 dark:bg-slate-500/15 dark:text-slate-400 dark:border-slate-500/20",
  unavailable: "bg-red-50 text-red-600 border-red-200 dark:bg-red-500/15 dark:text-red-400 dark:border-red-500/20",
} as const;

const statusLabels = {
  available: "Available",
  planned: "Planned",
  completed: "Completed",
  unavailable: "Unavailable",
} as const;

/**
 * Truck card on the Planner Board grid.
 *
 * Header shows TRUCK-LEVEL information only: fleet number, registration,
 * physical trailer (trucks.currentTrailerId), truck planning status and
 * readiness. Route-level driver / planned trailer live on RouteCard, never here.
 */
export default function TruckLane({ boardTruck, boardDate }: TruckLaneProps) {
  const { token } = useAuth();
  const { truck, routes, physicalTrailerFleetNo, readiness, status } = boardTruck;
  const [isReordering, setIsReordering] = useState(false);
  const [reorderError, setReorderError] = useState<string | null>(null);
  const [isReorderSubmitting, setIsReorderSubmitting] = useState(false);

  const reorderRoutes = useMutation(api.planningLoads.reorderRoutes);

  const boardRoutes = routes.filter((r) => isBoardManaged(r));
  const hasPlannedBoardRoutes = boardRoutes.some(
    (r) => (r.status ?? "planned") === "planned"
  );

  const handleReorder = useCallback(
    async (routeId: string, direction: "up" | "down") => {
      setReorderError(null);
      const orderedIds = getCompleteRouteIds(boardRoutes);
      const idx = orderedIds.indexOf(routeId);
      if (idx === -1) return;

      if (direction === "up" && idx > 0) {
        [orderedIds[idx - 1], orderedIds[idx]] = [orderedIds[idx], orderedIds[idx - 1]];
      } else if (direction === "down" && idx < orderedIds.length - 1) {
        [orderedIds[idx], orderedIds[idx + 1]] = [orderedIds[idx + 1], orderedIds[idx]];
      } else return;

      setIsReorderSubmitting(true);
      try {
        await reorderRoutes({
          routeDate: boardDate,
          truckFleetNoStr: truck.truckFleetNo || "",
          orderedRouteIds: orderedIds as Id<"dailyRoutes">[],
          token,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Reorder failed";
        setReorderError(msg);
      } finally {
        setIsReorderSubmitting(false);
      }
    },
    [boardRoutes, boardDate, truck.truckFleetNo, token, reorderRoutes]
  );

  const fullyReady =
    readiness.totalRoutes > 0 && readiness.readyRoutes === readiness.totalRoutes;

  /* DnD drop target — every rendered truck is droppable; validity is
     classified by the shared decision helper and surfaced visually.
     The backend remains the final authority on any drop. */
  const fleetNo = truck.truckFleetNo || "";
  const dropDecision = resolveUnallocatedDropDecision(boardTruck);
  const acceptsDrop = dropDecision.kind !== "no_action";
  const { isOver, setNodeRef: setDroppableRef } = useDroppable({
    id: toTruckTargetId(fleetNo),
    data: {
      targetType: "truck",
      truckFleetNoStr: fleetNo,
      decision: dropDecision,
    } satisfies TruckDropTargetData,
  });

  return (
    <div
      ref={setDroppableRef}
      className={`rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)]/40 overflow-hidden transition-all ${
        isOver && acceptsDrop
          ? "border-[#06B6D4]/70 ring-1 ring-[#06B6D4]/30 shadow-[0_0_16px_rgba(6,182,212,0.22)]"
          : isOver
            ? "opacity-70"
            : ""
      }`}
    >
      {isOver && acceptsDrop && (
        <div className="px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider text-white bg-gradient-to-r from-[#06B6D4] to-[#0891B2]">
          Drop to add this load
        </div>
      )}
      {/* Card header — truck-level only */}
      <div className="px-2.5 py-2 border-b border-[var(--card-border)] bg-[var(--card-bg)]/50">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <TruckAvatar fleetNo={truck.truckFleetNo} />
            <div className="min-w-0">
              <div className="text-sm font-bold text-[var(--foreground)] leading-tight truncate">
                {truck.truckFleetNo || "\u2014"}
              </div>
              {truck.registration ? (
                <div className="text-[10px] leading-tight text-[var(--nav-text-color)] truncate">
                  {truck.registration}
                </div>
              ) : null}
            </div>
          </div>
          <span
            className={`text-[9px] font-semibold px-1.5 py-0.5 rounded border ${statusStyles[status]}`}
          >
            {statusLabels[status]}
          </span>
        </div>

        <div className="mt-1 flex items-center justify-between gap-2 pl-10">
          <span className="text-[10px] leading-tight text-[var(--nav-text-color)] truncate">
            Physical {physicalTrailerFleetNo || "\u2014"}
          </span>
          {readiness.totalRoutes > 0 && (
            <span
              className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${
                fullyReady
                  ? "bg-green-50 text-green-700 dark:bg-green-500/15 dark:text-green-400"
                  : "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400"
              }`}
            >
              {readiness.readyRoutes}/{readiness.totalRoutes}
            </span>
          )}
        </div>
      </div>

      {/* Reorder error */}
      {reorderError && (
        <div className="px-3 py-1.5 text-[10px] text-red-600 bg-red-50 dark:bg-red-500/10 border-b border-red-200 dark:border-red-500/20">
          {reorderError}
        </div>
      )}

      {/* Routes — displayed in authoritative order from buildBoardTrucks */}
      {routes.length > 0 ? (
        <div className="p-1.5 space-y-1.5">
          {routes.map((route, idx) => (
            <div
              key={route._id}
              className="rounded-md border border-[var(--card-border)]/70 bg-[var(--card-bg)]/20"
            >
              <RouteCard
                route={route}
                boardDate={boardDate}
                routeNumber={idx + 1}
                isReordering={isReordering}
                onReorder={handleReorder}
                isReorderSubmitting={isReorderSubmitting}
                isLast={idx === routes.length - 1}
                physicalTrailerFleetNo={physicalTrailerFleetNo}
              />
            </div>
          ))}
        </div>
      ) : (
        <div className="px-3 py-3.5 text-center text-[10px] text-[var(--nav-text-color)]">
          No routes planned
        </div>
      )}

      {/* Reorder control (Board-managed routes only) */}
      {hasPlannedBoardRoutes && boardRoutes.length > 1 && (
        <div className="flex items-center gap-1 px-2 py-1.5 border-t border-[var(--card-border)] bg-[var(--card-bg)]/30">
          <button
            onClick={() => {
              setIsReordering(!isReordering);
              setReorderError(null);
            }}
            disabled={isReorderSubmitting}
            className={`text-[10px] font-semibold px-2 py-1 rounded transition-colors ${
              isReordering
                ? "bg-[#06B6D4] text-white"
                : "text-[var(--nav-text-color)] hover:text-[var(--foreground)] hover:bg-[var(--card-bg)]"
            } disabled:opacity-50`}
          >
            {isReordering ? "Done" : "Reorder Routes"}
          </button>
        </div>
      )}
    </div>
  );
}