"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { Cake, CalendarDays, ChevronDown, MessageCircle, Undo2, X } from "lucide-react";
import { useBirthdays } from "@/src/lib/useBirthdays";
import { ageThisYear, initialsOf, waWishLink } from "@/src/lib/birthdays";
import { useToast } from "@/src/components/common/Toast";

/**
 * Dashboard birthday card. Mirrors the dashboard's CollapsibleSection UX
 * (mobile-only toggle, always-open on desktop) and lists the same 7-day
 * window as the bell, minus anything this user dismissed for the current
 * year. Each driver has a ✕ (per-driver dismissal only) and a WhatsApp Wish.
 */
export function BirthdaysCard() {
  const { visible, hidden, todayBirthdays, dismiss, restore, restoreAll, loading } =
    useBirthdays();
  const { addToast } = useToast();
  const [open, setOpen] = useState(true);
  const [showHidden, setShowHidden] = useState(false);
  const bodyId = useId();

  const summary =
    visible.length > 0
      ? `${visible.length} upcoming · ${todayBirthdays.length} today`
      : "All caught up";

  const handleDismiss = async (driverId: string, name: string) => {
    const res = await dismiss(driverId);
    if (res.ok) {
      addToast(`Birthday reminder for ${name} hidden`, "success", {
        label: "Undo",
        onClick: () => {
          restore(driverId).then((res) => {
            if (!res.ok) addToast(res.error || "Could not restore", "error");
          });
        },
      });
    } else {
      addToast(res.error || "Could not dismiss", "error");
    }
  };

  const handleRestore = async (driverId: string, name: string) => {
    const res = await restore(driverId);
    if (res.ok) {
      // Collapse the list when nothing remains hidden (avoids a stale open state).
      if (hidden.length <= 1) setShowHidden(false);
      addToast(`Birthday reminder for ${name} restored`, "success");
    } else {
      addToast(res.error || "Could not restore", "error");
    }
  };

  const handleRestoreAll = async () => {
    const res = await restoreAll();
    if (res.ok) {
      addToast(`All ${hidden.length} hidden reminders restored`, "success");
      setShowHidden(false);
    } else {
      addToast(res.error || "Could not restore", "error");
    }
  };

  return (
    <section className="glass-card-lg rounded-xl overflow-hidden animate-fade-up">
      {/* Mobile-only toggle header */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={bodyId}
        className="lg:hidden w-full flex items-center justify-between gap-3 px-0 py-2 text-left transition-colors"
      >
        <span className="min-w-0">
          <span className="block text-sm font-bold text-[var(--nav-text-color)] uppercase tracking-widest">
            Birthdays
          </span>
          {!open && (
            <span className="block mt-0.5 text-sm font-semibold text-[var(--foreground)] truncate">
              {summary}
            </span>
          )}
        </span>
        <span className="flex items-center justify-center w-9 h-9 rounded-full shrink-0 text-[var(--nav-text-color)]">
          <ChevronDown size={20} className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
        </span>
      </button>

      {/* Desktop header — always open */}
      <div className="hidden lg:block px-5 pt-5">
        <h2 className="text-sm font-bold text-[var(--nav-text-color)] uppercase tracking-widest mb-3">
          Birthdays
        </h2>
      </div>

      {/* Body */}
      <div
        id={bodyId}
        role="region"
        aria-label="Birthdays"
        className={`${open ? "mt-1.5 lg:mt-0 animate-fade-up-sm" : "hidden lg:block"} px-0 pb-2 lg:px-5 lg:pb-5`}
      >
        {loading ? (
          <div className="px-2 py-4 space-y-3">
            <div className="skeleton-shimmer h-12 w-full rounded-lg" />
            <div className="skeleton-shimmer h-12 w-full rounded-lg" />
          </div>
        ) : (
          <>
            {visible.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Cake size={28} className="text-[#EC4899] mb-2 opacity-80" />
                <p className="text-sm font-semibold text-[var(--foreground)]">All caught up 🎂</p>
                <p className="text-xs text-[var(--nav-text-color)] mt-1">
                  No upcoming birthdays in the next 7 days.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-[var(--card-border)]">
                {visible.map((b) => (
                  <li key={b.driverId} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                    <span className="w-10 h-10 rounded-full bg-gradient-to-br from-[#F472B6] to-[#EC4899] text-white text-xs font-bold flex items-center justify-center shrink-0">
                      {initialsOf(b.name)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-[var(--foreground)] truncate">{b.name}</p>
                      <p className="text-xs text-[var(--nav-text-color)]">
                        {b.daysUntil === 0 ? (
                          <span className="text-[#EC4899] font-semibold">
                            Today 🎉 · turns {ageThisYear(b.birthYear)}
                          </span>
                        ) : (
                          `Turns ${ageThisYear(b.birthYear)} · in ${b.daysUntil} day${b.daysUntil === 1 ? "" : "s"}`
                        )}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {b.phoneNumber ? (
                        <a
                          href={waWishLink(b.phoneNumber, b.name)}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1.5 px-3 py-2.5 rounded-lg bg-[#25D366] hover:bg-[#128C7E] text-white text-xs font-semibold transition-colors"
                        >
                          <MessageCircle size={14} />
                          Wish
                        </a>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => handleDismiss(b.driverId, b.name)}
                        aria-label={`Dismiss ${b.name}`}
                        title="Dismiss"
                        className="flex items-center justify-center w-11 h-11 rounded-lg text-[var(--nav-text-color)] hover:text-red-400 hover:bg-red-500/10 transition-colors"
                      >
                        <X size={18} />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {/* Undo safety net — show what's hidden and let the user restore it */}
            {hidden.length > 0 && (
              <div className="mt-4 space-y-2">
                <div className="flex items-center justify-between gap-3 px-3 py-2 bg-[var(--card-bg)]/50 rounded-lg border border-[var(--card-border)]">
                  <span className="text-xs text-[var(--nav-text-color)]">
                    {hidden.length} hidden from this list
                  </span>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={handleRestoreAll}
                      className="flex items-center gap-1 text-xs font-semibold text-[#06B6D4] hover:text-[#0891B2] transition-colors"
                    >
                      <Undo2 size={13} />
                      Restore all
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowHidden((s) => !s)}
                      aria-expanded={showHidden}
                      className="text-xs font-semibold text-[#06B6D4] hover:text-[#0891B2] transition-colors"
                    >
                      {showHidden ? "Hide" : "Show"}
                    </button>
                  </div>
                </div>
                {showHidden && (
                  <ul className="divide-y divide-[var(--card-border)] rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)]/30 overflow-hidden">
                    {hidden.map((h) => (
                      <li key={h.driverId} className="flex items-center gap-3 py-2.5 px-3">
                        <span className="w-8 h-8 rounded-full bg-gradient-to-br from-[#F472B6] to-[#EC4899] text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                          {initialsOf(h.name)}
                        </span>
                        <span className="flex-1 min-w-0 text-left">
                          <span className="block text-sm font-medium text-[var(--foreground)] truncate">
                            {h.name}
                          </span>
                          <span className="block text-[11px] text-[var(--nav-text-color)]">
                            {h.daysUntil === 0 ? (
                              <span className="text-[#EC4899] font-semibold">Today 🎉</span>
                            ) : (
                              `Turns ${ageThisYear(h.birthYear)} · in ${h.daysUntil} day${h.daysUntil === 1 ? "" : "s"}`
                            )}
                          </span>
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRestore(h.driverId, h.name)}
                          className="flex items-center gap-1 text-xs font-semibold text-[#06B6D4] hover:text-[#0891B2] transition-colors shrink-0"
                        >
                          <Undo2 size={13} />
                          Restore
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </>
        )}

        <div className="mt-4 pt-3 border-t border-[var(--card-border)] flex justify-end">
          <Link
            href="/calendar"
            className="flex items-center gap-1.5 text-sm font-semibold text-[#06B6D4] hover:text-[#0891B2] transition-colors py-1"
          >
            <CalendarDays size={16} />
            View calendar
          </Link>
        </div>
      </div>
    </section>
  );
}
