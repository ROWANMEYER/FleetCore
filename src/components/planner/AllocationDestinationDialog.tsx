"use client";

import { useState, useMemo, useCallback } from "react";
import { api } from "@/convex/_generated/api";
import { useQuery } from "convex/react";
import { useAuth, useRegionArg } from "@/src/components/auth/AuthProvider";
import { type Id } from "@/convex/_generated/dataModel";
import { isBoardManaged } from "@/src/lib/planner/boardHelpers";
import { type DestinationChoice } from "@/src/lib/planner/dndPlanning";

type AllocationDestinationDialogProps = {
  planningLoadId: Id<"planningLoads">;
  client: string;
  truckFleetNoStr: string;
  boardDate: string;
  onSubmit: (choice: DestinationChoice) => Promise<void>;
  onClose: () => void;
};

/**
 * Compact destination chooser opened when an unallocated load is dropped
 * onto a truck that already has eligible planned routes.
 *
 * The dispatcher must explicitly pick a destination — the system never
 * guesses which route the load belongs on. Create New Route / existing
 * routes are the exact same choices the AllocateLoadDialog offers, and the
 * mutations are executed by the parent through `onSubmit` so duplicate-drop
 * protection stays in one place.
 */
export default function AllocationDestinationDialog({
  planningLoadId,
  client,
  truckFleetNoStr,
  boardDate,
  onSubmit,
  onClose,
}: AllocationDestinationDialogProps) {
  const { token } = useAuth();
  const region = useRegionArg();

  const [choice, setChoice] = useState<DestinationChoice | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const routes = useQuery(
    api.dailyRoutes.getRoutesByDate,
    boardDate ? { routeDate: boardDate, token, region } : "skip"
  );

  const truckRoutes = useMemo(() => {
    if (!routes) return [];
    return routes.filter(
      (r) =>
        r.truckFleetNoStr === truckFleetNoStr &&
        (r.status ?? "planned") === "planned"
    );
  }, [routes, truckFleetNoStr]);

  const handleConfirm = useCallback(async () => {
    if (!choice) {
      setError("Select a route or choose Create New Route");
      return;
    }
    setError("");
    setIsSubmitting(true);
    try {
      await onSubmit(choice);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Allocation failed";
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  }, [choice, onSubmit, onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={`Add ${client} to Truck ${truckFleetNoStr}`}
      data-planning-load-id={planningLoadId}
    >
      <div className="bg-[var(--background)] rounded-xl shadow-xl w-full max-w-sm mx-4 flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--card-border)]">
          <div>
            <h3 className="text-base font-bold text-[var(--foreground)]">
              Add {client} to Truck {truckFleetNoStr}
            </h3>
            <p className="text-xs text-[var(--nav-text-color)] mt-0.5">
              Choose the destination route
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-[var(--nav-text-color)] hover:text-[var(--foreground)] p-1"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-1.5">
          {truckRoutes.map((route, idx) => {
            const board = isBoardManaged(route);
            const summary =
              route.loads.map((l) => l.client).join(", ") || "Empty";
            return (
              <button
                key={route._id}
                onClick={() => setChoice({ kind: "existing_route", routeId: route._id })}
                className={`w-full text-left px-3 py-2 rounded-lg border text-xs transition-colors ${
                  choice?.kind === "existing_route" && choice.routeId === route._id
                    ? "bg-[#06B6D4]/10 border-[#06B6D4] text-[#06B6D4]"
                    : "border-[var(--card-border)] hover:bg-[var(--card-bg)] text-[var(--foreground)]"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className={`w-3 h-3 rounded-full border ${choice?.kind === "existing_route" && choice.routeId === route._id ? "border-[#06B6D4] bg-[#06B6D4]" : "border-[var(--nav-text-color)]"}`} />
                  <span className="font-semibold">
                    Route {idx + 1}
                  </span>
                  {!board && (
                    <span className="text-[var(--nav-text-color)] italic">(manual)</span>
                  )}
                </div>
                <div className="mt-0.5 pl-5 text-[10px] text-[var(--nav-text-color)] truncate">
                  {summary}
                </div>
              </button>
            );
          })}

          <button
            onClick={() => setChoice({ kind: "new_route" })}
            className={`w-full text-left px-3 py-2 rounded-lg border text-xs transition-colors ${
              choice?.kind === "new_route"
                ? "bg-[#06B6D4]/10 border-[#06B6D4] text-[#06B6D4]"
                : "border-[var(--card-border)] hover:bg-[var(--card-bg)] text-[var(--foreground)]"
            }`}
          >
            <div className="flex items-center gap-2">
              <span className={`w-3 h-3 rounded-full border ${choice?.kind === "new_route" ? "border-[#06B6D4] bg-[#06B6D4]" : "border-[var(--nav-text-color)]"}`} />
              <span className="font-semibold">+ Create New Route</span>
            </div>
          </button>

          {error && (
            <div className="text-xs text-[var(--danger-text)] bg-[var(--danger-surface)] border border-[var(--danger-border)] px-3 py-2 rounded-lg">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-[var(--card-border)]">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-[var(--nav-text-color)] hover:text-[var(--foreground)] rounded-lg hover:bg-[var(--card-bg)] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!choice || isSubmitting}
            className="px-4 py-2 text-xs font-bold text-white bg-gradient-to-br from-[#06B6D4] to-[#0891B2] rounded-lg shadow-md shadow-[rgba(6,182,212,0.2)] hover:opacity-90 disabled:opacity-40 disabled:shadow-none disabled:cursor-not-allowed transition-all"
          >
            {isSubmitting ? "Allocating..." : "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}