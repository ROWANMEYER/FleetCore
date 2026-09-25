"use client";

import { useState, useCallback } from "react";
import { useDraggable } from "@dnd-kit/core";
import { api } from "@/convex/_generated/api";
import { useMutation } from "convex/react";
import { useAuth } from "@/src/components/auth/AuthProvider";
import {
  type TruckRoute,
  type AssignmentState,
} from "@/src/lib/planner/boardHelpers";
import {
  isAllocatedLoadDraggable,
  isRouteReorderDraggable,
  toRouteDragId,
  type AllocatedLoadDragData,
  type RouteDragData,
} from "@/src/lib/planner/dndPlanning";
import { type Id } from "@/convex/_generated/dataModel";
import MoveLoadDialog from "./MoveLoadDialog";
import EditAssignmentDialog from "./EditAssignmentDialog";

type RouteCardProps = {
  route: TruckRoute;
  boardDate: string;
  routeNumber: number;
  isReordering: boolean;
  onReorder: (routeId: string, direction: "up" | "down") => void;
  isReorderSubmitting: boolean;
  routeReorderPaused?: boolean;
  isLast: boolean;
  physicalTrailerFleetNo?: string;
  pendingLoadId?: string;
};

const statusBadge = (status?: string) => {
  const s = status || "planned";
  if (s === "completed")
    return "bg-green-50 text-green-700 border-green-200 dark:bg-green-500/15 dark:text-green-400 dark:border-green-500/20";
  if (s === "locked")
    return "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/15 dark:text-amber-400 dark:border-amber-500/20";
  return "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/15 dark:text-blue-400 dark:border-blue-500/20";
};

const assignmentLabel: Record<AssignmentState, string> = {
  ready_match: "Ready",
  ready_mismatch: "Trailer mismatch",
  ready_physical_unpaired: "Ready",
  missing_driver: "Missing driver",
  missing_planned_trailer: "Missing planned trailer",
  missing_driver_and_planned_trailer: "Missing driver + trailer",
};

const assignmentVisual: Record<AssignmentState, { dot: string; text: string }> = {
  ready_match: { dot: "bg-green-500", text: "text-green-600 dark:text-green-400" },
  ready_mismatch: { dot: "bg-amber-500", text: "text-amber-600 dark:text-amber-400" },
  ready_physical_unpaired: { dot: "bg-green-500", text: "text-green-600 dark:text-green-400" },
  missing_driver: { dot: "bg-red-500", text: "text-red-600 dark:text-red-400" },
  missing_planned_trailer: { dot: "bg-red-500", text: "text-red-600 dark:text-red-400" },
  missing_driver_and_planned_trailer: { dot: "bg-red-500", text: "text-red-600 dark:text-red-400" },
};

export default function RouteCard({
  route,
  boardDate,
  routeNumber,
  isReordering,
  onReorder,
  isReorderSubmitting,
  routeReorderPaused = false,
  isLast,
  physicalTrailerFleetNo,
  pendingLoadId,
}: RouteCardProps) {
  const { token } = useAuth();
  const [showMoveLoad, setShowMoveLoad] = useState<string | null>(null);
  const [showEditAssignment, setShowEditAssignment] = useState(false);

  const deallocateLoad = useMutation(api.planningLoads.deallocateLoad);
  const [deallocating, setDeallocating] = useState(false);
  const [deallocError, setDeallocError] = useState<string | null>(null);

  const isEditable = (route.status ?? "planned") === "planned";
  const hasDriver = Boolean(route.driverName && route.driverName.trim().length > 0);
  const hasPlannedTrailer = Boolean(
    route.trailerFleetNoStr && route.trailerFleetNoStr.trim().length > 0
  );

  const assignmentState = isEditable
    ? (route.assignmentState as AssignmentState | undefined)
    : null;

  const visual = assignmentState ? assignmentVisual[assignmentState] : null;
  const isMismatch = assignmentState === "ready_mismatch";

  const trailerLabel = hasPlannedTrailer
    ? `Planned trailer ${route.trailerFleetNoStr}`
    : "No planned trailer";
  const trailerSuffix =
    isMismatch && physicalTrailerFleetNo
      ? ` · Physical ${physicalTrailerFleetNo}`
      : "";

  /* 6.3C — dedicated ROUTE drag grip on the header. Only the grip initiates a
     route drag; the card, buttons and load grips never do. disabled while a
     reorder is in flight for this truck.
     The grip BUTTON is the draggable node: setNodeRef must be attached to the
     node that carries the pointer listeners so dnd-kit measures a real rect
     (this is what both 6.3A/6.3B handles do). Without it the drag would be
     registered but never initialise. */
  const routeEligible = isRouteReorderDraggable(route);
  const routeGrip = useDraggable({
    id: toRouteDragId(route._id),
    disabled: routeReorderPaused || !routeEligible,
    data: {
      sourceType: "route",
      routeId: route._id,
      sourceTruckFleetNoStr: route.truckFleetNoStr || "",
      routeNumber,
      loadCount: route.loads.length,
      driverName: route.driverName ?? "",
    } satisfies RouteDragData,
  });

  const handleDeallocate = useCallback(
    async (planningLoadId: Id<"planningLoads">) => {
      if (!confirm("Return this load to Unallocated?")) return;
      setDeallocError(null);
      setDeallocating(true);
      try {
        await deallocateLoad({ planningLoadId, token });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Deallocate failed";
        setDeallocError(msg);
      } finally {
        setDeallocating(false);
      }
    },
    [deallocateLoad, token]
  );

  return (
    <div className="px-2 py-2">
      {/* Route header — establishes the Route as a distinct object */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          {isReordering && isEditable && (
            <div className="flex flex-col -ml-1 shrink-0">
              <button
                onClick={() => onReorder(route._id, "up")}
                disabled={routeNumber === 1 || isReorderSubmitting || routeReorderPaused}
                className="text-[8px] text-[var(--nav-text-color)] hover:text-[var(--foreground)] disabled:opacity-30 leading-none"
              >
                &#9650;
              </button>
              <button
                onClick={() => onReorder(route._id, "down")}
                disabled={isLast || isReorderSubmitting || routeReorderPaused}
                className="text-[8px] text-[var(--nav-text-color)] hover:text-[var(--foreground)] disabled:opacity-30 leading-none"
              >
                &#9660;
              </button>
            </div>
          )}
          {routeEligible && (
            <button
              ref={routeGrip.setNodeRef}
              {...routeGrip.attributes}
              {...routeGrip.listeners}
              disabled={routeReorderPaused}
              aria-label={`Drag Route ${routeNumber} to reorder`}
              title={routeReorderPaused ? "Reorder in progress" : "Drag Route to reorder"}
              className="shrink-0 w-5 flex items-center justify-center text-[var(--nav-text-color)] hover:text-[var(--foreground)] hover:bg-[var(--card-bg)] rounded cursor-grab active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-40 touch-none select-none"
            >
              <span aria-hidden className="text-[10px] leading-none">
                &#x283F;
              </span>
            </button>
          )}
          <span className="text-[10px] font-bold uppercase tracking-wide text-[var(--foreground)] whitespace-nowrap">
            Route {routeNumber}
          </span>
        </div>
        <span
          className={`text-[9px] font-semibold px-1.5 py-0.5 rounded border whitespace-nowrap ${statusBadge(
            route.status
          )}`}
        >
          {(route.status ?? "planned").toUpperCase()}
        </span>
      </div>

      {/* Assignment block — driver + planned trailer + assignment state */}
      <div className="mt-1.5 rounded-md border border-[var(--card-border)]/60 bg-[var(--card-bg)]/40 px-2 py-1.5">
        <div
          className={`text-[11px] leading-tight truncate ${
            hasDriver
              ? "font-medium text-[var(--foreground)]"
              : "italic text-[var(--nav-text-color)]"
          }`}
          title={hasDriver ? route.driverName : undefined}
        >
          {hasDriver ? route.driverName : "No driver"}
        </div>
        <div
          className={`mt-0.5 text-[10px] leading-tight truncate ${
            isMismatch
              ? "text-amber-600 dark:text-amber-400"
              : hasPlannedTrailer
                ? "text-[var(--nav-text-color)]"
                : "italic text-[var(--nav-text-color)]"
          }`}
        >
          {trailerLabel}
          {trailerSuffix}
        </div>

        <div className="mt-1 flex items-center justify-between gap-2 border-t border-[var(--card-border)]/50 pt-1">
          {assignmentState && visual ? (
            <span
              className={`flex items-center gap-1.5 text-[10px] font-semibold ${visual.text}`}
            >
              <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${visual.dot}`} />
              {assignmentLabel[assignmentState]}
            </span>
          ) : (
            <span className="text-[10px] text-[var(--nav-text-color)]">
              Not editable
            </span>
          )}
          {isEditable && (
            <button
              onClick={() => setShowEditAssignment(true)}
              className="text-[10px] font-semibold text-[#06B6D4] hover:text-[#0891B2] px-1.5 py-0.5 rounded hover:bg-[var(--card-bg)] transition-colors shrink-0"
            >
              Edit Assignment
            </button>
          )}
        </div>
      </div>

      {/* Deallocate error */}
      {deallocError && (
        <div className="mt-1.5 text-[10px] text-red-600 bg-red-50 dark:bg-red-500/10 px-2 py-1 rounded">
          {deallocError}
        </div>
      )}

      {/* Loads — child rows of the Route */}
      {route.loads.length > 0 ? (
        <div className="mt-1.5 space-y-1">
          {route.loads.map((load) => (
            <RouteLoadRow
              key={load.loadId || load.client}
              load={load}
              route={route}
              routeNumber={routeNumber}
              isEditable={isEditable}
              disabled={pendingLoadId !== undefined && pendingLoadId === load.loadId}
              deallocating={deallocating}
              onMove={() => setShowMoveLoad(load.loadId!)}
              onReturn={() => handleDeallocate(load.loadId as Id<"planningLoads">)}
            />
          ))}
        </div>
      ) : (
        <div className="mt-1.5 text-[10px] text-[var(--nav-text-color)] italic px-2 py-0.5">
          Empty route
        </div>
      )}

      {showMoveLoad && (
        <MoveLoadDialog
          planningLoadId={showMoveLoad}
          currentRouteId={route._id}
          currentTruckFleetNo={route.truckFleetNoStr || ""}
          boardDate={boardDate}
          onClose={() => setShowMoveLoad(null)}
        />
      )}

      {showEditAssignment && (
        <EditAssignmentDialog
          routeId={route._id as Id<"dailyRoutes">}
          currentDriverName={route.driverName}
          currentTrailerFleetNoStr={route.trailerFleetNoStr}
          onClose={() => setShowEditAssignment(false)}
        />
      )}
    </div>
  );
}

type RouteLoadRowProps = {
  load: TruckRoute["loads"][number];
  route: TruckRoute;
  routeNumber: number;
  isEditable: boolean;
  disabled: boolean;
  deallocating: boolean;
  onMove: () => void;
  onReturn: () => void;
};

/* One load inside a route. The drag HANDLE only is draggable — the Move and
   Return buttons are normal buttons that never start a drag (same pattern as
   the Unallocated Load row). Eligibility: the load must carry a planning
   loadId (Board-managed) AND the route must be editable ("planned"). On an
   editable route a valid-loadId load is draggable; legacy no-loadId loads and
   completed/locked routes get no handle — they display normally. */
function RouteLoadRow({
  load,
  route,
  routeNumber,
  isEditable,
  disabled,
  deallocating,
  onMove,
  onReturn,
}: RouteLoadRowProps) {
  const loadId = load.loadId;
  const draggable = isAllocatedLoadDraggable(route.status, loadId);

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `allocated-load:${loadId ?? ""}`,
    disabled: disabled || !draggable,
    data: {
      sourceType: "allocated-load",
      planningLoadId: loadId ?? "",
      sourceRouteId: route._id,
      sourceTruckFleetNoStr: route.truckFleetNoStr || "",
      sourceRouteNumber: routeNumber,
      client: load.client,
      fromLocations: load.fromLocations || [],
      toLocations: load.toLocations || [],
    } satisfies AllocatedLoadDragData,
  });

  return (
    <div
      ref={setNodeRef}
      className={`flex items-center gap-1.5 rounded-md bg-[var(--card-bg)]/30 border border-[var(--card-border)]/50 px-1.5 py-1 transition-opacity ${
        isDragging ? "opacity-40" : ""
      }`}
    >
      {/* Dedicated drag handle — grip left of the client name */}
      {draggable && (
        <button
          {...attributes}
          {...listeners}
          disabled={disabled}
          aria-label={`Drag ${load.client} to another truck or route`}
          title={disabled ? "Move in progress" : "Drag to another truck or route"}
          className="self-stretch shrink-0 w-5 flex items-center justify-center text-[var(--nav-text-color)] hover:text-[var(--foreground)] hover:bg-[var(--card-bg)] rounded cursor-grab active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-40 touch-none select-none"
        >
          <span className="text-[12px] leading-none" aria-hidden>
            &#x282F;
          </span>
        </button>
      )}

      <div className="min-w-0 flex-1">
        <div
          className="text-[11px] font-semibold leading-tight text-[var(--foreground)] truncate"
          title={load.client}
        >
          {load.client}
        </div>
        <div className="text-[10px] leading-snug text-[var(--nav-text-color)]">
          {load.fromLocations?.join(" + ") || "\u2014"}
          <span className="mx-1">&#8594;</span>
          {load.toLocations?.join(" + ") || "\u2014"}
        </div>
      </div>

      {isEditable && load.loadId && (
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            onClick={onMove}
            className="text-[10px] font-semibold text-[#06B6D4] hover:text-[#0891B2] px-1.5 py-0.5 rounded hover:bg-[var(--card-bg)] transition-colors"
          >
            Move
          </button>
          <button
            onClick={onReturn}
            disabled={deallocating}
            className="text-[10px] font-semibold text-red-500 hover:text-red-700 px-1.5 py-0.5 rounded hover:bg-red-50 transition-colors disabled:opacity-50"
          >
            Return
          </button>
        </div>
      )}
    </div>
  );
}