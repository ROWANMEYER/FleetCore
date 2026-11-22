import type { CeramicBilling } from "./monthlyReport";

/** One delivery location is one stop, regardless of its number of orders. */
export function ceramicDeliveryStops(locations: readonly string[]): string[] {
  const stops = new Map<string, string>();
  for (const location of locations) {
    const label = location.trim().replace(/\s+/g, " ");
    if (label && !stops.has(label.toUpperCase())) stops.set(label.toUpperCase(), label);
  }
  return [...stops.values()];
}

/** Main edits preserve local amounts and inactive historical cross-border notes. */
export function ceramicMainBilling(original: CeramicBilling, inputs: {
  ratePerTon: number | null; stopCharge: number | null; stopChargeChanged: boolean; load: string;
}, currentLocalKeys: readonly string[]): CeramicBilling {
  return {
    ...original,
    ratePerTon: inputs.ratePerTon,
    load: inputs.load,
    ...(inputs.stopChargeChanged ? { stops: inputs.stopCharge, drops: inputs.stopCharge === null ? null : 0 } : {}),
    locals: original.locals.filter(local => currentLocalKeys.includes(local.key)),
  };
}
