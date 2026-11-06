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

function ageOnDate(birthYear: number, month: number, day: number, today: Date): number {
  let age = today.getFullYear() - birthYear;
  const birthdayHasPassed = today.getMonth() + 1 > month || (today.getMonth() + 1 === month && today.getDate() >= day);
  if (!birthdayHasPassed) age -= 1;
  return age;
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
      photoUrl: string;
      photoOriginalUrl: string;
    }[] = [];

    for (const d of drivers) {
      // Only active drivers get birthday reminders (convention: "inactive" is
      // the sole inactive status; undefined/anything else counts as active).
      if ((d as any).status === "inactive") continue;
      const bd = getBirthdayFromSAID((d as any).idNumber ?? "");
      if (!bd) continue;
      const daysUntil = daysUntilBirthday(bd.month, bd.day, today);
      if (daysUntil <= windowDays) {
        const storageId = d.photoStorageId ? ctx.db.system.normalizeId("_storage", d.photoStorageId) : null;
        const storedPhoto = storageId ? await ctx.storage.getUrl(storageId) : null;
        const photoUrl = storedPhoto || d.photoUrl || d.photoOriginalUrl || "";
        out.push({
          driverId: String(d._id),
          name: toName(d),
          phoneNumber: (d as any).phone ?? "",
          month: bd.month,
          day: bd.day,
          daysUntil,
          birthdayDate: occurrenceDate(bd.month, bd.day, today),
          birthYear: bd.year,
          photoUrl,
          photoOriginalUrl: d.photoOriginalUrl || photoUrl,
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
      photoUrl: string;
      photoOriginalUrl: string;
      day: number;
      birthYear: number;
    }[] = [];

    for (const d of drivers) {
      // Calendar shows active drivers only, matching the bell/dashboard card.
      if ((d as any).status === "inactive") continue;
      const bd = getBirthdayFromSAID((d as any).idNumber ?? "");
      if (!bd || bd.month !== args.month) continue;
      const storageId = d.photoStorageId ? ctx.db.system.normalizeId("_storage", d.photoStorageId) : null;
      const storedPhoto = storageId ? await ctx.storage.getUrl(storageId) : null;
      const photoUrl = storedPhoto || d.photoUrl || d.photoOriginalUrl || "";
      out.push({
        driverId: String(d._id),
        name: toName(d),
        phoneNumber: (d as any).phone ?? "",
        photoUrl,
        photoOriginalUrl: d.photoOriginalUrl || photoUrl,
        day: bd.day,
        birthYear: bd.year,
      });
    }

    out.sort((a, b) => a.day - b.day);
    return out;
  },
});

/** Live age distribution for the active drivers shown on the birthday screen. */
export const getDriverAgeStats = query({
  args: {},
  returns: v.object({
    totalDrivers: v.number(),
    driversWithAge: v.number(),
    driversWithoutAge: v.number(),
    averageAge: v.union(v.number(), v.null()),
    age60Plus: v.number(),
    ageBands: v.array(v.object({ label: v.string(), count: v.number() })),
    oldest: v.array(v.object({ driverId: v.string(), name: v.string(), age: v.number() })),
  }),
  handler: async (ctx) => {
    const drivers = await ctx.db.query("drivers").withIndex("by_driverName").take(5000);
    const today = new Date();
    const bands = [
      { label: "Under 30", count: 0 },
      { label: "30–39", count: 0 },
      { label: "40–49", count: 0 },
      { label: "50–59", count: 0 },
      { label: "60+", count: 0 },
    ];
    const ages: { driverId: string; name: string; age: number }[] = [];
    let driversWithoutAge = 0;

    for (const driver of drivers) {
      if ((driver as any).status === "inactive") continue;
      const birthday = getBirthdayFromSAID((driver as any).idNumber ?? "");
      if (!birthday) {
        driversWithoutAge += 1;
        continue;
      }
      const age = ageOnDate(birthday.year, birthday.month, birthday.day, today);
      ages.push({ driverId: String(driver._id), name: toName(driver), age });
      if (age < 30) bands[0]!.count += 1;
      else if (age < 40) bands[1]!.count += 1;
      else if (age < 50) bands[2]!.count += 1;
      else if (age < 60) bands[3]!.count += 1;
      else bands[4]!.count += 1;
    }

    ages.sort((a, b) => b.age - a.age || a.name.localeCompare(b.name));
    const totalAge = ages.reduce((sum, driver) => sum + driver.age, 0);
    return {
      totalDrivers: drivers.filter((driver) => (driver as any).status !== "inactive").length,
      driversWithAge: ages.length,
      driversWithoutAge,
      averageAge: ages.length ? Math.round((totalAge / ages.length) * 10) / 10 : null,
      age60Plus: bands[4]!.count,
      ageBands: bands,
      oldest: ages.slice(0, 3),
    };
  },
});

/** All active driver birthdays for the dashboard directory. */
export const getAllDriverBirthdays = query({
  args: {},
  returns: v.array(v.object({
    driverId: v.string(),
    name: v.string(),
    phoneNumber: v.string(),
    month: v.number(),
    day: v.number(),
    age: v.number(),
    photoUrl: v.string(),
    photoOriginalUrl: v.string(),
  })),
  handler: async (ctx) => {
    const drivers = await ctx.db.query("drivers").withIndex("by_driverName").take(5000);
    const today = new Date();
    const rows = [];
    for (const driver of drivers) {
      if ((driver as any).status === "inactive") continue;
      const birthday = getBirthdayFromSAID((driver as any).idNumber ?? "");
      if (!birthday) continue;
      const storageId = driver.photoStorageId ? ctx.db.system.normalizeId("_storage", driver.photoStorageId) : null;
      const storedPhoto = storageId ? await ctx.storage.getUrl(storageId) : null;
      const photoUrl = storedPhoto || driver.photoUrl || driver.photoOriginalUrl || "";
      rows.push({
        driverId: String(driver._id),
        name: toName(driver),
        phoneNumber: driver.phone || "",
        month: birthday.month,
        day: birthday.day,
        age: ageOnDate(birthday.year, birthday.month, birthday.day, today),
        photoUrl,
        photoOriginalUrl: driver.photoOriginalUrl || photoUrl,
      });
    }
    return rows.sort((a, b) => a.month - b.month || a.day - b.day || a.name.localeCompare(b.name));
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
