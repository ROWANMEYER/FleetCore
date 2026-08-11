/**
 * Build a wa.me click-to-chat link for a driver birthday wish.
 * Converts a local SA number (e.g. "0821234567") to international format
 * (27821234567) so WhatsApp can reach it.
 */
export function waWishLink(phone: string, name: string): string {
  const firstName = (name.split(/\s+/)[0] || name || "there").trim();
  const message = `Happy birthday, ${firstName}! 🎉 Wishing you a fantastic day from the FleetCore team.`;
  const digits = (phone || "").replace(/\D/g, "");
  const international = digits.startsWith("0") ? `27${digits.slice(1)}` : digits;
  return `https://wa.me/${international}?text=${encodeURIComponent(message)}`;
}

/** Age the driver turns this year, derived from their birth year. */
export function ageThisYear(birthYear: number): number {
  // Defensive: never render NaN if a stale query result lacks birthYear.
  if (!Number.isFinite(birthYear)) return 0;
  return new Date().getFullYear() - birthYear;
}

/** Two-letter initials for avatar circles, e.g. "JOHN OELF" -> "JO". */
export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => (w[0] ?? "").toUpperCase())
    .join("");
}

/**
 * Client-safe copy of convex/birthdays.ts getBirthdayFromSAID: the first 6
 * digits of a South African ID number encode YYMMDD. Two-digit years at or
 * below (currentYY - 16) map to 20xx, everything else to 19xx. Returns null
 * for IDs that can't encode a valid date.
 */
export function getBirthdayFromSAID(
  idNumber?: string,
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
