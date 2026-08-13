"use client";

import { useState } from "react";
import { CloudOff, RefreshCw, Trash2, ChevronDown, ChevronUp, AlertTriangle } from "lucide-react";
import type { QueuedRoute } from "@/src/lib/offline/routeQueue";

interface Props {
  items: QueuedRoute[];
  syncing: boolean;
  online: boolean;
  onRetry: () => void;
  onDiscard: (id: string) => void;
}

function itemLabel(item: QueuedRoute): string {
  const p = item.payload;
  const truck = p.truckFleetNoStr || p.truckFleetNo || "—";
  const date = p.routeDate || "—";
  const driver = p.driverName || "";
  return `${truck} · ${date}${driver ? ` · ${driver}` : ""}`;
}

/**
 * Floating banner for routes saved while offline. Shows the pending count, a
 * retry button once a connection returns, and lets the user discard individual
 * queued routes (e.g. a mistake that shouldn't sync later).
 */
export default function PendingSyncBanner({ items, syncing, online, onRetry, onDiscard }: Props) {
  const [expanded, setExpanded] = useState(false);
  if (items.length === 0) return null;

  const needsAttention = items.some((i) => i.lastError);
  const summary = syncing
    ? "Syncing saved routes…"
    : online
      ? needsAttention
        ? "Some saved routes need attention"
        : "Saved offline — ready to sync"
      : "You're offline — saved routes will sync automatically";

  return (
    <div
      className={`glass-card rounded-xl border px-4 py-3 shadow-md ${
        needsAttention ? "border-amber-500/60" : "border-[var(--card-border)]"
      }`}
      style={{
        background: needsAttention
          ? "linear-gradient(to right, rgba(245,158,11,0.12), rgba(245,158,11,0.04))"
          : "var(--card-bg)",
      }}
    >
      <div className="flex items-center gap-3">
        {needsAttention ? (
          <AlertTriangle size={18} className="shrink-0 text-amber-500" />
        ) : (
          <CloudOff size={18} className="shrink-0 text-[#06B6D4]" />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[var(--foreground)]">
            {items.length} route{items.length === 1 ? "" : "s"} saved offline
          </p>
          <p className="text-xs text-[var(--nav-text-color)] truncate">{summary}</p>
        </div>

        {online && (
          <button
            onClick={onRetry}
            disabled={syncing}
            className="shrink-0 flex items-center gap-1.5 px-3 h-9 rounded-lg text-xs font-semibold text-white bg-gradient-to-br from-[#06B6D4] to-[#0891B2] hover:opacity-90 shadow-sm disabled:opacity-50 transition-all"
          >
            <RefreshCw size={13} className={syncing ? "animate-spin" : ""} />
            {syncing ? "Syncing…" : "Sync now"}
          </button>
        )}

        <button
          onClick={() => setExpanded((e) => !e)}
          aria-label={expanded ? "Hide queued routes" : "Show queued routes"}
          className="shrink-0 flex items-center justify-center w-8 h-8 rounded-lg text-[var(--nav-text-color)] hover:text-[var(--foreground)] hover:bg-[var(--card-border)] transition-colors"
        >
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
      </div>

      {expanded && (
        <ul className="mt-3 space-y-2 border-t border-[var(--card-border)] pt-3">
          {items.map((item) => (
            <li key={item.id} className="flex items-center gap-2 text-xs">
              <span className="min-w-0 flex-1 truncate text-[var(--foreground)]">{itemLabel(item)}</span>
              {item.lastError && (
                <span
                  className="shrink-0 text-amber-600 dark:text-amber-400 truncate max-w-[45%]"
                  title={item.lastError}
                >
                  {item.lastError}
                </span>
              )}
              <button
                onClick={() => onDiscard(item.id)}
                aria-label={`Discard queued route ${itemLabel(item)}`}
                className="shrink-0 flex items-center justify-center w-8 h-8 rounded-lg text-[var(--nav-text-color)] hover:text-red-600 hover:bg-red-100/50 dark:hover:bg-red-500/10 transition-colors"
              >
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
