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

/** Two-letter initials for avatar circles, e.g. "JOHN OELF" -> "JO". */
export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => (w[0] ?? "").toUpperCase())
    .join("");
}
