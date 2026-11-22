import type { CeramicShipment } from "./parser";

export const CERAMIC_WAREHOUSES = [
  { code: "1100", label: "BETTA(1100)", weightColumn: "I", amountColumn: "J" },
  { code: "1600", label: "VITRO(1600)", weightColumn: "K", amountColumn: "L" },
  { code: "3000", label: "SAMCA 1(3000)", weightColumn: "M", amountColumn: "N" },
  { code: "2100", label: "SAMCA 2(2100)", weightColumn: "O", amountColumn: "P" },
  { code: "1900", label: "PEGASUS(1900)", weightColumn: "Q", amountColumn: "R" },
  { code: "1200", label: "Cedar and Pivical 1200/1201", weightColumn: "S", amountColumn: "T" },
  { code: "1500", label: "Beta Baths(1500)", weightColumn: "U", amountColumn: "V" },
  { code: "1700", label: "Gryphon (1700)", weightColumn: "W", amountColumn: "X" },
] as const;
export type CeramicBilling = {
  ratePerTon: number | null; stops: number | null; drops: number | null; crossBorder: string; load: string;
  locals: { key: string; from: string; to: string; price: number | null }[];
};
export const emptyCeramicBilling = (): CeramicBilling => ({ ratePerTon: null, stops: null, drops: null, crossBorder: "", load: "", locals: [] });
/** Stops and drops are one charge; unknown legacy amounts remain unknown. */
export function ceramicStopsCharge(billing?: CeramicBilling): number | null {
  if (!billing || billing.stops === null || billing.drops === null) return null;
  return billing.stops + billing.drops;
}

export function ceramicWarehouseWeights(snapshot: CeramicShipment) {
  const weights = Object.fromEntries(CERAMIC_WAREHOUSES.map(w => [w.code, 0])) as Record<string, number>;
  const unmapped = new Map<string, number>();
  for (const destination of snapshot.destinations) for (const order of destination.orders) {
    const match = order.collectFrom.trim().match(/^(1100|1600|3000|2100|1900|1200|1201|1500|1700)\b/);
    if (match) weights[match[1] === "1201" ? "1200" : match[1]] += order.weightKg;
    else unmapped.set(order.collectFrom, (unmapped.get(order.collectFrom) ?? 0) + order.weightKg);
  }
  return { weights: CERAMIC_WAREHOUSES.map(w => ({ code: w.code, weightKg: weights[w.code] })),
    unmapped: [...unmapped].map(([name, weightKg]) => ({ name, weightKg })) };
}
export function ceramicMonthlyAmounts(weights: { code: string; weightKg: number }[], billing?: CeramicBilling) {
  const loadedWeight = weights.reduce((sum, w) => sum + w.weightKg, 0);
  const ready = !!billing && [billing.ratePerTon, billing.stops, billing.drops].every(value => value !== null && Number.isFinite(value)) && loadedWeight > 0;
  if (!ready) return { loadedWeight, freight: null, total: null, ratePerKg: null, invoicePrice: null, variance: null, allocated: weights.map(w => ({ ...w, amount: null })) };
  const freight = billing.ratePerTon! * 34;
  const total = freight + billing.stops! + billing.drops!;
  const ratePerKg = total / loadedWeight;
  const allocated = weights.map(w => ({ ...w, amount: w.weightKg * ratePerKg }));
  const invoicePrice = allocated.reduce((sum, w) => sum + w.amount, 0);
  return { loadedWeight, freight, total, ratePerKg, allocated, invoicePrice, variance: invoicePrice - total };
}
