"use client";

import { useState, useRef, useEffect } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useAuth } from "@/src/components/auth/AuthProvider";
import { useToast } from "@/src/components/common/Toast";
import { ChevronDown } from "lucide-react";

/* ─── Region badge metadata — shared by the All Regions and Sheets tables ─── */

export const REGION_META: Record<string, { label: string; cls: string; dot: string }> = {
  garden_route: {
    label: "Garden Route",
    cls: "bg-[rgba(6,182,212,0.12)] text-[#06B6D4] dark:text-[#22D3EE]",
    dot: "bg-[#06B6D4]",
  },
  eastern_cape: {
    label: "Eastern Cape",
    cls: "bg-[rgba(168,85,247,0.12)] text-purple-600 dark:text-purple-400",
    dot: "bg-purple-500",
  },
};

type RegionValue = "garden_route" | "eastern_cape" | null;

const REGION_OPTIONS: { value: RegionValue; label: string; dot: string | null; cls: string }[] = [
  { value: "garden_route", label: "Garden Route", dot: "bg-[#06B6D4]", cls: "text-[#06B6D4] dark:text-[#22D3EE]" },
  { value: "eastern_cape", label: "Eastern Cape", dot: "bg-purple-500", cls: "text-purple-600 dark:text-purple-400" },
  { value: null, label: "Unassigned", dot: null, cls: "text-[var(--nav-text-color)]" },
];

/* ─── Region cell with inline dropdown (change region right from the table) ── */

/**
 * What the region control needs from a row — deliberately minimal so the same
 * component works in the desktop spreadsheet tables (SpreadsheetRow is
 * structurally compatible) and the mobile route cards.
 */
export interface RegionRow {
  routeId: string;
  region: string;
}

/**
 * Editable region badge for spreadsheet rows. Admins get the inline dropdown
 * (calls `updateRouteRegion` — the admin-only mutation the All Regions table
 * uses). Regional users get the badge read-only: the backend hard-locks them
 * to their own region and rejects region reassignment outright. The trigger
 * stops click propagation so it can nest inside a tappable card (mobile).
 */
export function RegionCell({ row }: { row: RegionRow }) {
  const { user, token } = useAuth();
  const isAdmin = user?.role === "admin";
  const { addToast } = useToast();
  const updateRouteRegion = useMutation(api.dailyRoutes.updateRouteRegion);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);

  const meta = REGION_META[row.region];

  // Close on outside click, on scroll (the menu is viewport-fixed, so any
  // table scroll would leave it misaligned), or on Escape. Hook is declared
  // before the non-admin early return so hook order never changes per render.
  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      if (anchorRef.current && !anchorRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onScroll = () => setOpen(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onMouseDown);
    window.addEventListener("scroll", onScroll, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("scroll", onScroll, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Read-only badge for non-admins (no dropdown).
  if (!isAdmin) {
    return (
      <div className="px-2 flex items-center w-full h-full">
        {meta ? (
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold whitespace-nowrap ${meta.cls}`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
            {meta.label}
          </span>
        ) : (
          <span className="text-[var(--nav-text-color)] text-[11px]">—</span>
        )}
      </div>
    );
  }

  const openMenu = () => {
    const el = anchorRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    // Open downward when there's room; otherwise flip above so rows near the
    // bottom of the table keep all options reachable (any scroll closes the
    // menu, so it must never extend past the viewport).
    const MENU_HEIGHT = 150;
    const top =
      rect.bottom + 4 + MENU_HEIGHT > window.innerHeight
        ? Math.max(8, rect.top - MENU_HEIGHT - 4)
        : rect.bottom + 4;
    setMenuPos({ top, left: rect.left });
    setOpen(true);
  };

  const choose = async (region: RegionValue) => {
    setOpen(false);
    if ((region ?? "") === (row.region ?? "")) return;
    setSaving(true);
    try {
      await updateRouteRegion({ routeId: row.routeId as Id<"dailyRoutes">, region, token });
    } catch (err) {
      console.error("Failed to update region:", err);
      // Surface the real reason (e.g. "Cannot edit a locked route.") instead
      // of a generic message, like the email-send toasts do.
      addToast(
        err instanceof Error && err.message
          ? err.message
          : "Couldn't update the region — please try again.",
        "error"
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div ref={anchorRef} className={`px-2 ${row.region ? "py-1" : ""} flex items-center w-full h-full`}>
      {meta ? (
        <button
          onClick={(e) => {
            e.stopPropagation();
            openMenu();
          }}
          disabled={saving}
          title="Change region"
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold whitespace-nowrap ${meta.cls} transition-opacity ${
            saving ? "opacity-60 cursor-wait" : "cursor-pointer hover:opacity-85"
          }`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
          {meta.label}
          <ChevronDown size={12} className="opacity-60" strokeWidth={2.5} />
        </button>
      ) : (
        <button
          onClick={(e) => {
            e.stopPropagation();
            openMenu();
          }}
          disabled={saving}
          title="Assign region"
          className={`text-[var(--nav-text-color)] text-[11px] font-semibold px-2 py-1 rounded-full border border-dashed border-[var(--card-border)] transition-colors ${
            saving ? "opacity-60 cursor-wait" : "cursor-pointer hover:text-[var(--foreground)] hover:border-[#06B6D4]/50"
          }`}
        >
          — assign
        </button>
      )}

      {open && menuPos && (
        <div
          className="fixed z-[100] min-w-[180px] rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] shadow-xl backdrop-blur-xl py-1"
          style={{ top: menuPos.top, left: menuPos.left, backgroundColor: "var(--card-bg)" }}
        >
          {REGION_OPTIONS.map((opt) => {
            const active = (opt.value ?? "") === (row.region ?? "");
            return (
              <button
                key={opt.label}
                onClick={(e) => {
                  e.stopPropagation();
                  choose(opt.value);
                }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-left transition-colors ${
                  active
                    ? `bg-[rgba(6,182,212,0.1)] ${opt.cls}`
                    : "text-[var(--foreground)] hover:bg-[var(--card-border)]"
                }`}
              >
                {opt.dot ? (
                  <span className={`w-1.5 h-1.5 rounded-full ${opt.dot}`} />
                ) : (
                  <span className="w-1.5 h-1.5 rounded-full border border-[var(--card-border)]" />
                )}
                {opt.label}
                {active && <span className="ml-auto text-[#06B6D4]">✓</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
