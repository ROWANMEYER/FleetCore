import { formatCurrency } from "../../pdf/formatters";
import type { CeramicShipment } from "./parser";
import { ceramicLocalLegs, ceramicMainLoad, CERAMIC_LOCAL_TOWN } from "./planning";
import { ceramicDeliveryStops } from "./reportEditing";
export const DEFAULT_CERAMIC_BILLING = { defaultTons: 34, extraStopPrice: 750, localSmallPrice: 2700, localLargePrice: 5400, localMaxWeightKg: 12000, localMaxPallets: 12, billingStartDay: 25 };
export type CeramicBillingRules = typeof DEFAULT_CERAMIC_BILLING;
export const billingMoney = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
export const billingNormalize = (s: string) => s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim().replace(/\s+/g, " ");
export function ceramicBillingCalculation(snapshot: CeramicShipment, ratePerTon: number | null, chargeableTons = 34, rules: CeramicBillingRules = DEFAULT_CERAMIC_BILLING) {
  const issues: string[] = [];
  if (!Number.isFinite(chargeableTons) || chargeableTons <= 0 || chargeableTons > 1000) issues.push("Enter chargeable tons above zero and at most 1,000.");
  const pickups = new Set(snapshot.destinations.flatMap(d => d.orders.map(o => billingNormalize(o.collectFrom))).filter(Boolean)).size;
  const deliveries = ceramicDeliveryStops(snapshot.destinations.map(d => [d.name, ...d.addressLines].join(", "))).length;
  if (snapshot.destinations.some(d => d.orders.some(o => !o.collectFrom.trim()))) issues.push("A collection warehouse is missing from the PDF. Review its orders before confirming billing.");
  const extraPickups = Math.max(0, pickups - 2), extraDrops = Math.max(0, deliveries - 2);
  const pickupCharge = billingMoney(extraPickups * rules.extraStopPrice), dropCharge = billingMoney(extraDrops * rules.extraStopPrice);
  const locals = ceramicLocalLegs(snapshot).map(leg => {
    const valid = Number.isFinite(leg.weightKg) && leg.weightKg >= 0 && leg.pallets !== null && Number.isFinite(leg.pallets) && leg.pallets >= 0;
    if (!valid) issues.push(`${leg.name}: review its actual local weight and pallet count before billing.`);
    return { ...leg, from: CERAMIC_LOCAL_TOWN, to: CERAMIC_LOCAL_TOWN, price: valid ? leg.weightKg <= rules.localMaxWeightKg && leg.pallets! <= rules.localMaxPallets ? rules.localSmallPrice : rules.localLargePrice : null };
  });
  if (ratePerTon === null || !Number.isFinite(ratePerTon) || ratePerTon < 0) issues.push("Rate needs review: no applicable Ceramic tariff is selected.");
  const freight = ratePerTon !== null && Number.isFinite(ratePerTon) && ratePerTon >= 0 && Number.isFinite(chargeableTons) && chargeableTons > 0 ? billingMoney(ratePerTon * chargeableTons) : null;
  const mainTotal = freight === null ? null : billingMoney(freight + pickupCharge + dropCharge);
  const localTotal = locals.some(leg => leg.price === null) ? null : billingMoney(locals.reduce((sum, leg) => sum + (leg.price ?? 0), 0));
  return { chargeableTons, pickups, deliveries, extraPickups, extraDrops, pickupCharge, dropCharge, freight, mainTotal, localTotal, combinedTotal: mainTotal === null || localTotal === null ? null : billingMoney(mainTotal + localTotal), locals, issues };
}
export function ceramicBillingFingerprint(value: unknown): string {
  const source = JSON.stringify(value, (_key, entry) => entry && typeof entry === "object" && !Array.isArray(entry) ? Object.fromEntries(Object.entries(entry).sort(([a], [b]) => a.localeCompare(b))) : entry);
  let a = 2166136261, b = 5381;
  for (let i = 0; i < source.length; i++) { a = Math.imul(a ^ source.charCodeAt(i), 16777619); b = Math.imul(b, 33) ^ source.charCodeAt(i); }
  return `${(a >>> 0).toString(16)}:${(b >>> 0).toString(16)}`;
}

/** One priced main load: local transport never contributes to this flat Planner amount. */
export function ceramicBilledMainLoad(snapshot: CeramicShipment, shipmentId: string, tons: number, mainTotal: number, breakdown?: { ratePerTon: number; extraStops: number }) {
  const load = ceramicMainLoad(snapshot, shipmentId);
  return { ...load, quantity: String(tons), rate: String(mainTotal), rateType: "flat", notes: load.notes.replace("Rate and kilometres need review.", breakdown ? `${tons} t at ${formatCurrency(breakdown.ratePerTon)}/t; extra pickups/drops ${formatCurrency(breakdown.extraStops)}; main total ${formatCurrency(mainTotal)}. Local transport excluded; kilometres need review.` : "Main billing confirmed; kilometres need review.") };
}
