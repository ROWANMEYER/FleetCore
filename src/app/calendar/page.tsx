"use client";

import { useState } from "react";
import { Cake, ChevronLeft, ChevronRight } from "lucide-react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { ageThisYear, waWishLink } from "@/src/lib/birthdays";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

type BirthdayBadge = {
  driverId: string;
  name: string;
  phoneNumber: string;
  day: number;
  birthYear: number;
};

export default function CalendarPage() {
  const [tab, setTab] = useState<"birthdays" | "tasks">("birthdays");
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() + 1 };
  });

  const birthdays = useQuery(api.birthdays.getBirthdaysForMonth, {
    year: cursor.year,
    month: cursor.month,
  });

  const daysInMonth = new Date(cursor.year, cursor.month, 0).getDate();
  const firstWeekday = new Date(cursor.year, cursor.month - 1, 1).getDay();

  const today = new Date();
  const todayDay =
    today.getFullYear() === cursor.year && today.getMonth() + 1 === cursor.month
      ? today.getDate()
      : null;

  const byDay: Record<number, BirthdayBadge[]> = {};
  (birthdays ?? []).forEach((b) => {
    (byDay[b.day] ??= []).push(b as BirthdayBadge);
  });

  const shift = (delta: number) => {
    const d = new Date(cursor.year, cursor.month - 1 + delta, 1);
    setCursor({ year: d.getFullYear(), month: d.getMonth() + 1 });
  };

  const cells: (number | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  return (
    <div className="flex-1 overflow-y-auto bg-[var(--card-bg)] transition-colors duration-300">
      <div className="w-full px-4 sm:px-6 py-6 sm:py-8 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-[var(--foreground)]">
              Calendar
            </h1>
            <p className="text-sm text-[var(--nav-text-color)] mt-1">
              Driver birthdays, at a glance.
            </p>
          </div>

          {/* Tabs */}
          <div className="glass-card flex rounded-xl p-1 gap-1 self-start">
            <button
              type="button"
              onClick={() => setTab("birthdays")}
              className={`px-4 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                tab === "birthdays"
                  ? "bg-gradient-to-br from-[#06B6D4] to-[#0891B2] text-white shadow-sm"
                  : "text-[var(--nav-text-color)] hover:text-[var(--foreground)]"
              }`}
            >
              Birthdays
            </button>
            <button
              type="button"
              disabled
              title="Coming soon"
              className="px-4 py-2.5 rounded-lg text-sm font-semibold text-[var(--nav-text-color)] opacity-50 cursor-not-allowed relative"
            >
              Tasks
              <span className="ml-1.5 text-[10px] font-bold uppercase tracking-wide text-[#06B6D4]">
                soon
              </span>
            </button>
          </div>
        </div>

        {/* Month nav */}
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => shift(-1)}
            aria-label="Previous month"
            className="flex items-center justify-center w-11 h-11 rounded-xl text-[var(--nav-text-color)] hover:text-[var(--foreground)] hover:bg-[var(--card-bg)] border border-[var(--card-border)] transition-colors"
          >
            <ChevronLeft size={20} />
          </button>
          <h2 className="text-lg font-bold text-[var(--foreground)]">
            {MONTHS[cursor.month - 1]} {cursor.year}
          </h2>
          <button
            type="button"
            onClick={() => shift(1)}
            aria-label="Next month"
            className="flex items-center justify-center w-11 h-11 rounded-xl text-[var(--nav-text-color)] hover:text-[var(--foreground)] hover:bg-[var(--card-bg)] border border-[var(--card-border)] transition-colors"
          >
            <ChevronRight size={20} />
          </button>
        </div>

        {/* Grid */}
        <div className="glass-card rounded-2xl p-3 sm:p-4">
          <div className="grid grid-cols-7 gap-1 mb-1">
            {WEEKDAYS.map((w) => (
              <div
                key={w}
                className="text-center text-[11px] font-bold uppercase tracking-wider text-[var(--nav-text-color)] py-1.5"
              >
                {w}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {cells.map((day, i) =>
              day === null ? (
                <div key={`blank-${i}`} className="min-h-[64px] sm:min-h-[84px] rounded-lg" />
              ) : (
                <div
                  key={day}
                  className={`min-h-[64px] sm:min-h-[84px] rounded-lg border p-1 flex flex-col gap-1 transition-colors ${
                    todayDay === day
                      ? "border-[#06B6D4] bg-[#06B6D4]/5"
                      : "border-[var(--card-border)] bg-[var(--card-bg)]/50"
                  }`}
                >
                  <span
                    className={`text-xs font-bold leading-none ${
                      todayDay === day ? "text-[#06B6D4]" : "text-[var(--nav-text-color)]"
                    }`}
                  >
                    {day}
                  </span>
                  <div className="flex flex-col gap-1 overflow-hidden">
                    {(byDay[day] ?? []).map((b) =>
                      b.phoneNumber ? (
                        <a
                          key={b.driverId}
                          href={waWishLink(b.phoneNumber, b.name)}
                          target="_blank"
                          rel="noreferrer"
                          title={`Wish ${b.name} a happy birthday`}
                          className="flex items-center gap-1 px-1.5 py-1 rounded-md bg-gradient-to-br from-[#F472B6]/15 to-[#EC4899]/15 text-[#EC4899] hover:from-[#F472B6] hover:to-[#EC4899] hover:text-white text-[10px] font-semibold transition-colors"
                        >
                          <Cake size={10} className="shrink-0" />
                          <span className="min-w-0 flex-1 truncate">{b.name.split(" ")[0]}</span>
                          <span className="shrink-0">· {ageThisYear(b.birthYear)}</span>
                        </a>
                      ) : (
                        <span
                          key={b.driverId}
                          title={`${b.name} — no phone number`}
                          className="flex items-center gap-1 px-1.5 py-1 rounded-md bg-gradient-to-br from-[#F472B6]/15 to-[#EC4899]/15 text-[#EC4899] text-[10px] font-semibold"
                        >
                          <Cake size={10} className="shrink-0" />
                          <span className="min-w-0 flex-1 truncate">{b.name.split(" ")[0]}</span>
                          <span className="shrink-0">· {ageThisYear(b.birthYear)}</span>
                        </span>
                      )
                    )}
                  </div>
                </div>
              )
            )}
          </div>
        </div>

        {/* Footnote */}
        <p className="text-xs text-[var(--nav-text-color)] text-center">
          Tap a birthday badge to wish the driver via WhatsApp 🎉
        </p>
      </div>
    </div>
  );
}
