"use client";

import { useState, useMemo, useCallback } from "react";
import { api } from "@/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { useAuth, useRegionArg } from "@/src/components/auth/AuthProvider";
import { type Id } from "@/convex/_generated/dataModel";

type MoveLoadDialogProps = {
  planningLoadId: string;
  currentRouteId: string;
  currentTruckFleetNo: string;
  boardDate: string;
  onClose: () => void;
};

export default function MoveLoadDialog({
  planningLoadId,
  currentRouteId,
  currentTruckFleetNo,
  boardDate,
  onClose,
}: MoveLoadDialogProps) {
  const { token } = useAuth();
  const region = useRegionArg();

  const [selectedTruck, setSelectedTruck] = useState<string | null>(null);
  const [selectedRoute, setSelectedRoute] = useState<string | null>(null);
  const [createNew, setCreateNew] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const trucks = useQuery(api.fleet.getTrucks, { includeInactive: false });
  const routes = useQuery(
    api.dailyRoutes.getRoutesByDate,
    selectedTruck ? { routeDate: boardDate, token, region } : "skip"
  );

  const moveBetweenRoutes = useMutation(api.planningLoads.moveLoadBetweenRoutes);
  const moveToNewRoute = useMutation(api.planningLoads.moveLoadToNewRoute);

  const truckRoutes = useMemo(() => {
    if (!routes || !selectedTruck) return [];
    return routes.filter(
      (r) =>
        r.truckFleetNoStr === selectedTruck &&
        r._id !== currentRouteId &&
        (r.status || "planned") === "planned"
    );
  }, [routes, selectedTruck, currentRouteId]);

  const selectedTruckInfo = useMemo(() => {
    if (!trucks || !selectedTruck) return null;
    return trucks.find((t) => t.truckFleetNo === selectedTruck) || null;
  }, [trucks, selectedTruck]);

  const handleSubmit = useCallback(async () => {
    if (!selectedTruck) return;
    setError("");
    setIsSubmitting(true);

    try {
      if (createNew || (selectedTruck !== currentTruckFleetNo && truckRoutes.length === 0)) {
        await moveToNewRoute({
          planningLoadId: planningLoadId as Id<"planningLoads">,
          truckFleetNoStr: selectedTruck,
          token,
        });
      } else if (selectedRoute) {
        await moveBetweenRoutes({
          planningLoadId: planningLoadId as Id<"planningLoads">,
          destinationRouteId: selectedRoute as Id<"dailyRoutes">,
          token,
        });
      } else {
        setError("Select a destination route or Create New Route");
        setIsSubmitting(false);
        return;
      }
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Move failed";
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  }, [
    selectedTruck,
    createNew,
    currentTruckFleetNo,
    truckRoutes.length,
    selectedRoute,
    planningLoadId,
    token,
    moveToNewRoute,
    moveBetweenRoutes,
    onClose,
  ]);

  const canSubmit = selectedTruck && (createNew || selectedRoute);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-[var(--background)] rounded-xl shadow-xl w-full max-w-md mx-4 flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--card-border)]">
          <h3 className="text-base font-bold text-[var(--foreground)]">Move Load</h3>
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
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Step 1: Destination truck */}
          <div>
            <label className="text-xs font-bold text-[var(--foreground)] mb-1.5 block">
              1. Destination Truck
            </label>
            {!trucks ? (
              <div className="text-xs text-[var(--nav-text-color)]">Loading...</div>
            ) : (
              <div className="max-h-48 overflow-y-auto border border-[var(--card-border)] rounded-lg divide-y divide-[var(--card-border)]">
                {trucks.map((truck) => {
                  const isCurrent = truck.truckFleetNo === currentTruckFleetNo;
                  return (
                    <button
                      key={truck._id}
                      onClick={() => {
                        setSelectedTruck(truck.truckFleetNo || null);
                        setSelectedRoute(null);
                        setCreateNew(false);
                      }}
                      className={`w-full text-left px-3 py-2 text-xs transition-colors ${
                        selectedTruck === truck.truckFleetNo
                          ? "bg-[#06B6D4]/10 border-l-2 border-l-[#06B6D4]"
                          : "hover:bg-[var(--card-bg)]"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-[var(--foreground)]">
                          {truck.truckFleetNo || "—"}
                        </span>
                        {truck.registration && (
                          <span className="text-[var(--nav-text-color)]">
                            {truck.registration}
                          </span>
                        )}
                        {isCurrent && (
                          <span className="text-[10px] text-[var(--nav-text-color)]">
                            (current)
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Selected truck details */}
          {selectedTruckInfo && (
            <div className="text-[10px] text-[var(--nav-text-color)] px-1 space-y-0.5">
              {selectedTruckInfo.registration && (
                <div>Reg: {selectedTruckInfo.registration}</div>
              )}
              {selectedTruckInfo.make && (
                <div>Vehicle: {selectedTruckInfo.make} {selectedTruckInfo.model || ""}</div>
              )}
            </div>
          )}

          {/* Step 2: Destination route */}
          {selectedTruck && (
            <div>
              <label className="text-xs font-bold text-[var(--foreground)] mb-1.5 block">
                2. Destination Route
              </label>
              {truckRoutes.length === 0 ? (
                <div className="text-xs text-[var(--nav-text-color)] py-2">
                  No existing routes on this truck — will create a new one.
                </div>
              ) : (
                <div className="space-y-1 border border-[var(--card-border)] rounded-lg divide-y divide-[var(--card-border)]">
                  {truckRoutes.map((route, idx) => (
                    <button
                      key={route._id}
                      onClick={() => {
                        setSelectedRoute(route._id);
                        setCreateNew(false);
                      }}
                      className={`w-full text-left px-3 py-2 text-xs transition-colors ${
                        selectedRoute === route._id
                          ? "bg-[#06B6D4]/10 border-l-2 border-l-[#06B6D4]"
                          : "hover:bg-[var(--card-bg)]"
                      }`}
                    >
                      <span className="font-medium text-[var(--foreground)]">
                        Route {idx + 1}
                      </span>
                      <div className="text-[10px] text-[var(--nav-text-color)] mt-0.5">
                        {route.loads.map((l) => l.client).join(", ") || "Empty"}
                      </div>
                    </button>
                  ))}
                </div>
              )}

              <button
                onClick={() => {
                  setCreateNew(true);
                  setSelectedRoute(null);
                }}
                className={`w-full mt-1.5 text-xs px-3 py-2 rounded-lg border transition-colors ${
                  createNew
                    ? "bg-[#06B6D4]/10 border-[#06B6D4] text-[#06B6D4]"
                    : "border-[var(--card-border)] text-[var(--nav-text-color)] hover:bg-[var(--card-bg)]"
                }`}
              >
                + Create New Route
              </button>
            </div>
          )}

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
            onClick={handleSubmit}
            disabled={!canSubmit || isSubmitting}
            className="px-4 py-2 text-xs font-bold text-white bg-gradient-to-br from-[#06B6D4] to-[#0891B2] rounded-lg shadow-md shadow-[rgba(6,182,212,0.2)] hover:opacity-90 disabled:opacity-40 disabled:shadow-none disabled:cursor-not-allowed transition-all"
          >
            {isSubmitting ? "Moving..." : "Move"}
          </button>
        </div>
      </div>
    </div>
  );
}
