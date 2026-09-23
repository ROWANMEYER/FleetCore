/* Pure presentation helpers for the Planner Board left rail.
   No React, no Convex, no browser dependencies. */

export const ACCENT_PALETTE = [
  "#06B6D4", // cyan
  "#0EA5E9", // sky
  "#6366F1", // indigo
  "#8B5CF6", // violet
  "#14B8A6", // teal
  "#10B981", // emerald
  "#3B82F6", // blue
] as const;

/* Minimal shape of an unallocated load row. */
export type LoadLike = {
  _id?: unknown;
  client: string;
  fromLocations?: string[];
  toLocations?: string[];
};

/* Whether the specified accent colour should be treated as "warm" —
   used to pick a readable foreground tint for the strip. */
const WARM_ACCENTS = new Set<string>([ACCENT_PALETTE[5]]);

function hashString(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash;
}

/* Deterministic accent colour derived from a stable identifier
   (the load `_id`, falling back to its list position). Purely
   presentational — never persisted. */
export function accentColorFor(seed: string | unknown, fallbackIndex = 0): string {
  const key = String(seed ?? "");
  if (!key) {
    return ACCENT_PALETTE[fallbackIndex % ACCENT_PALETTE.length];
  }
  return ACCENT_PALETTE[hashString(key) % ACCENT_PALETTE.length];
}

export function isWarmAccent(accent: string): boolean {
  return WARM_ACCENTS.has(accent);
}

/* Case-insensitive client-side search across client, from and to. */
export function filterUnallocatedLoads<T extends LoadLike>(
  loads: T[],
  query: string
): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return loads;
  return loads.filter((load) => {
    const client = load.client.toLowerCase();
    const from = (load.fromLocations ?? []).join(" ").toLowerCase();
    const to = (load.toLocations ?? []).join(" ").toLowerCase();
    return client.includes(q) || from.includes(q) || to.includes(q);
  });
}

const QUANTITY_UNITS: Record<string, string> = {
  tonne: "t",
  tonnes: "t",
  ton: "t",
  tons: "t",
  t: "t",
  kilogram: "kg",
  kilograms: "kg",
  kilo: "kg",
  kg: "kg",
  pallet: "plt",
  pallets: "plt",
  plt: "plt",
};

/* Format a real quantity + unit into a compact label such as "34 t".
   Returns null when either half is missing — callers must render a dash
   in that case, never a fabricated value. */
export function formatQuantity(
  quantity?: string | null,
  quantityType?: string | null
): string | null {
  const q = quantity?.trim();
  const type = quantityType?.trim().toLowerCase();
  if (!q || !type) return null;

  const unit = QUANTITY_UNITS[type] ?? type;
  return `${q} ${unit}`;
}

/* "1 Load" vs "4 Loads" — used by the Parsed Loads header and the
   Add Loads button label. */
export function planningLoadsCountLabel(count: number): string {
  return `${count} Load${count === 1 ? "" : "s"}`;
}

export function addLoadsButtonLabel(count: number): string {
  return `Add ${planningLoadsCountLabel(count)}`;
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

/* Format "YYYY-MM-DD" as e.g. "09 Sep 2026". */
export function formatBoardDateLabel(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  if (!y || !m || !d || m < 1 || m > 12) return date;
  const day = String(d).padStart(2, "0");
  return `${day} ${MONTHS[m - 1]} ${y}`;
}