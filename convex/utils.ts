export const calculateLoadAmount = (quantity: number, rate: number, rateType: string) => {
  if (rateType === "flat" || rateType === "full") {
    return rate;
  }
  return quantity * rate;
};

/**
 * Normalized identity of an imported load for duplicate detection.
 *
 * Exact-match rule: the same Date + Truck + Trailer + Client + Amount is
 * treated as the same load. The amount is normalized numerically (strip R /
 * thousands spaces / comma decimals) so "R18 500,00" and "18500.00" match.
 * Used by both the import modal (preview flagging) and the backend
 * (authoritative skip), so the two always agree.
 */
export const loadFingerprint = (
  routeDate: unknown,
  truck: unknown,
  trailer: unknown,
  client: unknown,
  rate: unknown
): string => {
  const norm = (v: unknown) => String(v ?? "").trim().toUpperCase();
  const cleaned = String(rate ?? "")
    .replace(/R/gi, "")
    .replace(/\s+/g, "")
    .replace(/,/g, ".");
  const n = parseFloat(cleaned);
  const rateKey = Number.isNaN(n) ? norm(cleaned) : n.toFixed(2);
  return [norm(routeDate), norm(truck), norm(trailer), norm(client), rateKey].join("|");
};

/**
 * Coerce an unknown value into a number - strips currency letters, whitespace,
 * and comma decimals so "R 1 234,56" -> 1234.56. Returns 0 for null/NaN.
 * Shared by the sheets export, the mobile route cards and the route summary
 * so every surface parses the same way.
 */
export const parseNumberSafe = (value: unknown): number => {
  if (value == null) return 0;
  const cleaned = String(value)
    .replace(/[A-Za-z]/g, "")
    .replace(/\s+/g, "")
    .replace(/,/g, ".");
  const n = parseFloat(cleaned);
  return Number.isNaN(n) ? 0 : n;
};

/**
 * Route revenue - the sum of load amounts, or the route-level rate when the
 * route has no loads. Shared by the spreadsheet export rows, the mobile route
 * cards and the aggregate route summary so what is shown is exactly what gets
 * exported.
 */
export const routeRevenue = (route: {
  rate?: unknown;
  loads?: Array<{ quantity?: unknown; rate?: unknown; rateType?: string }>;
}): number => {
  const loads = route.loads ?? [];
  if (loads.length === 0) return Number(route.rate) || 0;
  return loads.reduce((sum: number, l) => {
    return (
      sum +
      calculateLoadAmount(
        parseNumberSafe(l.quantity),
        parseNumberSafe(l.rate),
        l.rateType || "per_unit"
      )
    );
  }, 0);
};

