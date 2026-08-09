"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Bell, CalendarDays, MessageCircle, Cake } from "lucide-react";
import { useBirthdays } from "@/src/lib/useBirthdays";
import { ageThisYear, initialsOf, waWishLink } from "@/src/lib/birthdays";

const PANEL_W = 320;
const PANEL_H = 420; // upper bound (header + list + footer) for viewport clamping

/**
 * Birthday notification bell. Badge = number of driver birthdays in the next
 * 7 days. Clicking opens a dropdown listing each driver (avatar, name,
 * "Today"/"In N days") with a one-click WhatsApp "Wish" button and a link to
 * the calendar. The bell intentionally ignores dismissals — it always shows
 * the full 7-day window (per spec).
 */
export function BirthdayBell({ compact = false }: { compact?: boolean }) {
  const { all, loading } = useBirthdays();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  const count = all.length;

  const toggle = () => {
    if (open) {
      setOpen(false);
      return;
    }
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    // Pin the panel near the button but keep it inside the viewport. In the
    // narrow desktop sidebar this opens over the content; on the mobile top
    // bar it right-aligns under the bell.
    const left = Math.max(12, Math.min(r.left, window.innerWidth - PANEL_W - 12));
    // Keep the panel inside the viewport vertically too (e.g. a bell near the
    // bottom edge would otherwise open off-screen).
    const top = Math.max(12, Math.min(r.bottom + 8, window.innerHeight - PANEL_H - 12));
    setPos({ top, left });
    setOpen(true);
  };

  return (
    <div className="relative">
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={`Upcoming birthdays: ${count}`}
        className={`relative flex items-center justify-center rounded-xl text-[var(--nav-text-color)] hover:text-[var(--nav-text-active-color)] hover:bg-[var(--card-bg)] transition-all duration-150 active:scale-95 ${
          compact ? "w-9 h-9" : "w-11 h-11"
        }`}
      >
        <Bell size={compact ? 16 : 20} strokeWidth={1.75} />
        {count > 0 && (
          <span className="absolute top-1 right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-gradient-to-br from-[#F43F5E] to-[#E11D48] text-white text-[10px] font-bold flex items-center justify-center shadow-sm">
            {count > 9 ? "9+" : count}
          </span>
        )}
      </button>

      {/* Portal to document.body: the sidebar/top-bar carry backdrop-filter +
          transforms which hijack position:fixed's containing block (the panel
          would be positioned relative to the sidebar, not the viewport). */}
      {open &&
        pos &&
        createPortal(
          <>
          {/* Blurred + dimmed backdrop — makes the panel the focal point and
              keeps the list readable (the glass card is translucent). */}
          <div
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <div
            role="dialog"
            aria-label="Upcoming birthdays"
            className="fixed z-[60] w-[320px] max-h-[calc(100vh-24px)] glass-card bg-[var(--card-bg)]/95 rounded-2xl overflow-hidden shadow-2xl animate-fade-up-sm"
            style={{ top: pos.top, left: pos.left }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--card-border)]">
              <div className="flex items-center gap-2">
                <Cake size={16} className="text-[#EC4899]" />
                <span className="text-sm font-bold text-[var(--foreground)]">Birthdays</span>
              </div>
              <span className="text-[11px] font-semibold text-[var(--nav-text-color)]">
                next 7 days
              </span>
            </div>

            {/* List */}
            {loading ? (
              <div className="px-4 py-6 space-y-3">
                <div className="skeleton-shimmer h-10 w-full rounded-lg" />
                <div className="skeleton-shimmer h-10 w-full rounded-lg" />
              </div>
            ) : all.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <p className="text-sm font-semibold text-[var(--foreground)]">No birthdays 🎂</p>
                <p className="text-xs text-[var(--nav-text-color)] mt-1">
                  Nothing in the next 7 days.
                </p>
              </div>
            ) : (
              <ul className="max-h-80 overflow-y-auto divide-y divide-[var(--card-border)]">
                {all.map((b) => (
                  <li key={b.driverId} className="flex items-center gap-3 px-4 py-3">
                    <span className="w-9 h-9 rounded-full bg-gradient-to-br from-[#F472B6] to-[#EC4899] text-white text-[11px] font-bold flex items-center justify-center shrink-0">
                      {initialsOf(b.name)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-[var(--foreground)] truncate">
                        {b.name}
                      </p>
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
                    {b.phoneNumber ? (
                      <a
                        href={waWishLink(b.phoneNumber, b.name)}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#25D366] hover:bg-[#128C7E] text-white text-xs font-semibold transition-colors shrink-0"
                      >
                        <MessageCircle size={14} />
                        Wish
                      </a>
                    ) : (
                      <span className="text-[10px] text-[var(--nav-text-color)] shrink-0">no phone</span>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {/* Footer */}
            <Link
              href="/calendar"
              onClick={() => setOpen(false)}
              className="flex items-center justify-center gap-2 px-4 py-3 text-sm font-semibold text-[#06B6D4] hover:text-[#0891B2] bg-[var(--card-bg)]/60 hover:bg-[var(--card-bg)] transition-colors border-t border-[var(--card-border)]"
            >
              <CalendarDays size={16} />
              View birthday calendar
            </Link>
          </div>
          </>,
          document.body
        )}
    </div>
  );
}
