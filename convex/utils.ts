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
