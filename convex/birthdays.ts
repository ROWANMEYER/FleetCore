import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// ============================================================================
// Pure helpers — unit-tested in convex/birthdays.test.ts
// ============================================================================

/**
 * Derive a birthdate from a South African ID number: the first 6 digits are
 * YYMMDD. Century: two-digit years at or below (currentYY - 16) map to 20xx,
 * everything else to 19xx (matching the driver-birthdays spec).
 * Returns null for IDs that can't encode a valid date.
 */
export function getBirthdayFromSAID(
  idNumber: string,
  referenceYear = new Date().getFullYear()
): { month: number; day: number; year: number } | null {
  const digits = (idNumber || "").replace(/\D/g, "");
  if (digits.length < 6) return null;
  const yy = Number(digits.slice(0, 2));
  const month = Number(digits.slice(2, 4));
  const day = Number(digits.slice(4, 6));
  if (!(month >= 1 && month <= 12)) return null;
  const centuryCutoff = referenceYear - 2000 - 16;
  const year = yy > centuryCutoff ? 1900 + yy : 2000 + yy;
  // Reject impossible dates (e.g. Apr 31); Feb 29 only valid in leap years.
  const daysInMonth = new Date(year, month, 0).getDate();
  if (!(day >= 1 && day <= daysInMonth)) return null;
  return { month, day, year };
}

/**
 * Days from `reference` (start of its day) until the next occurrence of the
 * given month/day. A birthday today returns 0; a birthday earlier this year
 * rolls over to next year (e.g. Dec -> Jan wrap).
 */
export function daysUntilBirthday(
  month: number,
  day: number,
  reference = new Date()
): number {
  const today = new Date(reference.getFullYear(), reference.getMonth(), reference.getDate());
  const thisYear = new Date(reference.getFullYear(), month - 1, day);
  let diff = Math.round((thisYear.getTime() - today.getTime()) / 86_400_000);
  if (diff < 0) {
    const nextYear = new Date(reference.getFullYear() + 1, month - 1, day);
    diff = Math.round((nextYear.getTime() - today.getTime()) / 86_400_000);
  }
  return diff;
}

/** This year's occurrence of a birthday as an ISO date string, e.g. "2026-08-04". */
export function occurrenceDate(
  month: number,
  day: number,
  reference = new Date()
): string {
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${reference.getFullYear()}-${mm}-${dd}`;
}

// ============================================================================
// Auth — resolve the signed-in user from a session token (null when absent)
// ============================================================================

async function resolveUserId(ctx: any, token?: string | null) {
  if (!token) return null;
  const session = await ctx.db
    .query("sessions")
    .withIndex("by_token", (q: any) => q.eq("token", token))
    .first();
  if (!session || session.expiresAt < Date.now()) return null;
  return session.userId;
}

function toName(d: any): string {
  return d.driverName || d.name || "Driver";
}

// ============================================================================
// Queries
// ============================================================================

/**
 * Upcoming driver birthdays within `windowDays` (default 7), sorted by soonest
 * first. Powers the notification bell, the dashboard card and the "Today"
 * panel (which filters to daysUntil === 0 client-side). Birthdates are derived
 * from each driver's SA ID number; drivers without a valid ID are skipped.
 */
export const upcomingBirthdays = query({
  args: {
    windowDays: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const windowDays = args.windowDays ?? 7;
    const today = new Date();
    const drivers = await ctx.db.query("drivers").collect();

    const out: {
      driverId: string;
      name: string;
      phoneNumber: string;
      month: number;
      day: number;
      daysUntil: number;
      birthdayDate: string;
      birthYear: number;
    }[] = [];

    for (const d of drivers) {
      // Only active drivers get birthday reminders (convention: "inactive" is
      // the sole inactive status; undefined/anything else counts as active).
      if ((d as any).status === "inactive") continue;
      const bd = getBirthdayFromSAID((d as any).idNumber ?? "");
      if (!bd) continue;
      const daysUntil = daysUntilBirthday(bd.month, bd.day, today);
      if (daysUntil <= windowDays) {
        out.push({
          driverId: String(d._id),
          name: toName(d),
          phoneNumber: (d as any).phone ?? "",
          month: bd.month,
          day: bd.day,
          daysUntil,
          birthdayDate: occurrenceDate(bd.month, bd.day, today),
          birthYear: bd.year,
        });
      }
    }

    out.sort((a, b) => a.daysUntil - b.daysUntil);
    return out;
  },
});

/** Every driver birthday falling in a given month — powers the /calendar grid. */
export const getBirthdaysForMonth = query({
  args: {
    year: v.number(),
    month: v.number(), // 1-12
  },
  handler: async (ctx, args) => {
    const drivers = await ctx.db.query("drivers").collect();

    const out: {
      driverId: string;
      name: string;
      phoneNumber: string;
      day: number;
      birthYear: number;
    }[] = [];

    for (const d of drivers) {
      // Calendar shows active drivers only, matching the bell/dashboard card.
      if ((d as any).status === "inactive") continue;
      const bd = getBirthdayFromSAID((d as any).idNumber ?? "");
      if (!bd || bd.month !== args.month) continue;
      out.push({
        driverId: String(d._id),
        name: toName(d),
        phoneNumber: (d as any).phone ?? "",
        day: bd.day,
        birthYear: bd.year,
      });
    }

    out.sort((a, b) => a.day - b.day);
    return out;
  },
});

/** Driver ids this user dismissed for the current year (dashboard card filter). */
export const getDismissedBirthdays = query({
  args: { token: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, args) => {
    const userId = await resolveUserId(ctx, args.token);
    if (!userId) return { driverIds: [] };
    const currentYear = String(new Date().getFullYear());
    const rows = await ctx.db
      .query("dismissedBirthdayAlerts")
      .withIndex("by_userId_driverId", (q) => q.eq("userId", userId))
      .collect();
    const driverIds = rows
      .filter((r) => r.birthdayDate.startsWith(currentYear))
      .map((r) => String(r.driverId));
    return { driverIds };
  },
});

// ============================================================================
// Mutations
// ============================================================================

/** Dismiss a driver's birthday reminder for this year (per user, per driver, per year). */
export const dismissBirthday = mutation({
  args: {
    token: v.string(),
    driverId: v.id("drivers"),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserId(ctx, args.token);
    if (!userId) throw new Error("Not authenticated — cannot dismiss");
    const driver = await ctx.db.get(args.driverId);
    if (!driver) throw new Error("Driver not found");
    const bd = getBirthdayFromSAID((driver as any).idNumber ?? "");
    if (!bd) throw new Error("Driver has no valid ID number");

    const birthdayDate = occurrenceDate(bd.month, bd.day);
    const existing = await ctx.db
      .query("dismissedBirthdayAlerts")
      .withIndex("by_userId_driverId", (q) =>
        q.eq("userId", userId).eq("driverId", args.driverId)
      )
      .filter((q) => q.eq(q.field("birthdayDate"), birthdayDate))
      .first();

    if (!existing) {
      await ctx.db.insert("dismissedBirthdayAlerts", {
        userId,
        driverId: args.driverId,
        birthdayDate,
      });
    }
  },
});

/** Undo a dismissal — restores one driver's birthday reminder for this year. */
export const restoreBirthday = mutation({
  args: {
    token: v.string(),
    driverId: v.id("drivers"),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserId(ctx, args.token);
    if (!userId) throw new Error("Not authenticated — cannot restore");
    const driver = await ctx.db.get(args.driverId);
    if (!driver) return; // nothing to restore
    const bd = getBirthdayFromSAID((driver as any).idNumber ?? "");
    if (!bd) return;
    const birthdayDate = occurrenceDate(bd.month, bd.day);
    const existing = await ctx.db
      .query("dismissedBirthdayAlerts")
      .withIndex("by_userId_driverId", (q) =>
        q.eq("userId", userId).eq("driverId", args.driverId)
      )
      .filter((q) => q.eq(q.field("birthdayDate"), birthdayDate))
      .first();
    if (existing) await ctx.db.delete(existing._id);
  },
});

/** Undo ALL dismissals for the current year — restores every hidden reminder. */
export const restoreAllBirthdays = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const userId = await resolveUserId(ctx, args.token);
    if (!userId) throw new Error("Not authenticated — cannot restore");
    const currentYear = String(new Date().getFullYear());
    const rows = await ctx.db
      .query("dismissedBirthdayAlerts")
      .withIndex("by_userId_driverId", (q) => q.eq("userId", userId))
      .collect();
    for (const r of rows) {
      if (r.birthdayDate.startsWith(currentYear)) await ctx.db.delete(r._id);
    }
  },
});
