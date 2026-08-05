"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useAuth } from "@/src/components/auth/AuthProvider";

export type UpcomingBirthday = {
  driverId: string;
  name: string;
  phoneNumber: string;
  month: number;
  day: number;
  daysUntil: number;
  birthdayDate: string;
  birthYear: number;
};

/**
 * Shared birthday data for the bell, the dashboard card and the "Today" panel.
 * - `all`        — the full 7-day window (bell shows everything, no dismissals)
 * - `visible`    — 7-day window minus this user's dismissals for this year (card)
 * - `todayBirthdays` — exact-today entries (Today panel)
 */
export function useBirthdays() {
  const { token } = useAuth();
  const upcoming = useQuery(api.birthdays.upcomingBirthdays, { windowDays: 7 });
  const dismissed = useQuery(api.birthdays.getDismissedBirthdays, {
    token: token ?? undefined,
  });
  const dismissMutation = useMutation(api.birthdays.dismissBirthday);

  const all = (upcoming ?? []) as UpcomingBirthday[];
  const dismissedIds = new Set(dismissed?.driverIds ?? []);
  const visible = all.filter((b) => !dismissedIds.has(b.driverId));
  const todayBirthdays = all.filter((b) => b.daysUntil === 0);

  const dismiss = async (driverId: string) => {
    if (!token) return { ok: false, error: "Not signed in" };
    try {
      await dismissMutation({ token, driverId: driverId as Id<"drivers"> });
      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: e?.message || String(e) };
    }
  };

  return {
    all,
    visible,
    dismissedIds,
    todayBirthdays,
    dismiss,
    loading: upcoming === undefined || dismissed === undefined,
  };
}
