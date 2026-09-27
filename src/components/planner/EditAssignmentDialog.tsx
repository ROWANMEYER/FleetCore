"use client";

import { useState } from "react";
import { api } from "@/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { useAuth } from "@/src/components/auth/AuthProvider";
import { type Id } from "@/convex/_generated/dataModel";

function uniqueById<T extends { _id: string }>(items: readonly T[] | undefined): T[] {
  const seen = new Set<string>();
  const unique: T[] = [];
  for (const item of items ?? []) {
    if (!seen.has(item._id)) {
      seen.add(item._id);
      unique.push(item);
    }
  }
  return unique;
}

type EditAssignmentDialogProps = {
  routeId: Id<"dailyRoutes">;
  currentDriverName?: string;
  currentTrailerFleetNoStr?: string;
  onClose: () => void;
};

export default function EditAssignmentDialog({
  routeId,
  currentDriverName,
  currentTrailerFleetNoStr,
  onClose,
}: EditAssignmentDialogProps) {
  const { token } = useAuth();
  const updateRouteAssignment = useMutation(api.dailyRoutes.updateRouteAssignment);

  const drivers = useQuery(api.fleet.getDrivers, { includeInactive: false });
  const trailers = useQuery(api.fleet.getTrailers, { includeInactive: false });

  const [driverName, setDriverName] = useState(currentDriverName || "");
  const [trailerFleetNoStr, setTrailerFleetNoStr] = useState(currentTrailerFleetNoStr || "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasChanges =
    driverName !== (currentDriverName || "") ||
    trailerFleetNoStr !== (currentTrailerFleetNoStr || "");

  const handleSubmit = async () => {
    if (!hasChanges) return;
    setIsSubmitting(true);
    setError(null);
    try {
      // Clear-safe contract: an empty selection is sent as null (clear the
      // field); omitted/undefined would be interpreted as "leave unchanged".
      await updateRouteAssignment({
        routeId,
        driverName: driverName.trim() ? driverName.trim() : null,
        trailerFleetNoStr: trailerFleetNoStr.trim() ? trailerFleetNoStr.trim() : null,
        token,
      });
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Update failed";
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  // getTrailers returns one row per physical trailer component (the
  // "trailers" array on a trailer document), so the same _id can appear
  // multiple times. The selector needs one option per logical trailer
  // document — dedupe by stable identity before rendering.
  const driverOptions = uniqueById(drivers);
  const trailerOptions = uniqueById(trailers);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-[var(--background)] border border-[var(--card-border)] rounded-lg shadow-lg w-[340px] max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--card-border)]">
          <h3 className="text-sm font-bold text-[var(--foreground)]">Edit Assignment</h3>
          <button
            onClick={onClose}
            className="text-[var(--nav-text-color)] hover:text-[var(--foreground)] text-xs"
          >
            &#10005;
          </button>
        </div>

        <div className="px-4 py-3 space-y-3">
          {/* Error */}
          {error && (
            <div className="text-[11px] text-[var(--danger-text)] bg-[var(--danger-surface)] border border-[var(--danger-border)] px-3 py-2 rounded">
              {error}
            </div>
          )}

          {/* Driver selector */}
          <div>
            <label className="block text-[11px] font-medium text-[var(--nav-text-color)] mb-1">
              Driver
            </label>
            <select
              value={driverName}
              onChange={(e) => setDriverName(e.target.value)}
              className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)]/60 focus:border-[#06B6D4] focus:ring-1 focus:ring-[#06B6D4]/30 focus:outline-none text-[var(--foreground)]"
            >
              <option value="">No driver</option>
              {driverOptions.map((d) => (
                <option key={d._id} value={d.driverName || d.name || ""}>
                  {d.driverName || d.name || "Unknown"}
                </option>
              ))}
            </select>
          </div>

          {/* Trailer selector */}
          <div>
            <label className="block text-[11px] font-medium text-[var(--nav-text-color)] mb-1">
              Planned Trailer
            </label>
            <select
              value={trailerFleetNoStr}
              onChange={(e) => setTrailerFleetNoStr(e.target.value)}
              className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)]/60 focus:border-[#06B6D4] focus:ring-1 focus:ring-[#06B6D4]/30 focus:outline-none text-[var(--foreground)]"
            >
              <option value="">No trailer</option>
              {trailerOptions.map((t) => (
                <option key={t._id} value={t.trailerFleetNoStr || ""}>
                  {t.trailerFleetNoStr}{t.type ? ` (${t.type})` : ""}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-[var(--card-border)]">
          <button
            onClick={onClose}
            className="text-[11px] px-3 py-1.5 rounded border border-[var(--card-border)] text-[var(--nav-text-color)] hover:bg-[var(--card-bg)] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!hasChanges || isSubmitting}
            className="text-[11px] px-3 py-1.5 rounded bg-[#06B6D4] text-white hover:bg-[#0891B2] transition-colors disabled:opacity-50"
          >
            {isSubmitting ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
