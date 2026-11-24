import { cents, compositionEffect, percentChange } from "../../../convex/fuelPriceFields";
import { DEFAULT_FUEL_COMPOSITION, validDay, type AgreementType } from "../../../convex/rateSheetFields";
type FuelPeriod = { effectiveDate: string; pricePerLitre: number; compositionPercent?: number };
import type { CeramicShipment } from "./parser";
import { billingNormalize } from "./billing";
export type CeramicTariffState = { sheetId: string; revision: number; recordedAt: number; effectiveDate?: string; defaultPricingUnit: string; agreementType?: AgreementType; fuelCompositionPercent?: number; lanes: { id: string; loadingPoint: string; destination: string; rate: number; date?: string; pricingUnit?: string; sortOrder: number }[] };
export type CeramicTariffChoice = { key: string; sheetId: string; revision: number; laneId: string; loadingPoint: string; destination: string; effectiveDate: string; ratePerTon: number; variant: "standard" | "sp"; matchedDestinations: string[] };
/** Same composition arithmetic as Customer Rates, bounded by the exact planning day. */
export function ceramicRateOnDate(base: number, baseDay: string, day: string, fuel: FuelPeriod[], agreement: { agreementType?: AgreementType; fuelCompositionPercent?: number } = {}): number | null {
  if (!validDay(baseDay) || !validDay(day) || baseDay > day || !Number.isFinite(base) || base < 0) return null;
  if (agreement.agreementType === "fixed") return cents(base);
  const history = [...fuel].sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate));
  if (!history.some(row => row.effectiveDate <= day)) return null;
  let value = cents(base);
  for (let i = 0; i < history.length; i++) {
    const row = history[i]; if (row.effectiveDate <= baseDay || row.effectiveDate > day) continue;
    const composition = agreement.agreementType === "fuel_linked" ? agreement.fuelCompositionPercent ?? DEFAULT_FUEL_COMPOSITION : row.compositionPercent;
    if (composition !== undefined && (!Number.isFinite(composition) || composition < 0 || composition > 100)) return null;
    const effect = compositionEffect(percentChange(row.pricePerLitre, history[i - 1]?.pricePerLitre ?? null), composition);
    if (effect === null || !Number.isFinite(effect)) return null;
    value = cents(value * (1 + effect / 100));
  }
  return value;
}
const aliases: Record<string, string[]> = { "PLETT": ["PLETTENBERG BAY", "PLETT"], "GEO": ["GEORGE"], "MBAAI": ["MOSSEL BAY", "MOSSELBAAI"], "MOSSELBAAI": ["MOSSEL BAY", "MOSSELBAAI"], "PE": ["PORT ELIZABETH", "GQEBERHA"], "PORT ELIZABETH": ["PORT ELIZABETH", "GQEBERHA"], "BABALEGI": ["BABALEGI", "BABELEGI"] };
const phrase = (text: string, term: string) => (` ${text} `).includes(` ${term} `);
function destinationMatches(destination: CeramicShipment["destinations"][number], lane: string) {
  const terms = lane.replace(/\(SP\)/ig, "").split(/\s*[/+]\s*/).map(billingNormalize).filter(Boolean).flatMap(term => aliases[term] ?? [term]);
  const name = billingNormalize(destination.name);
  return terms.some(term => phrase(name, term) || destination.addressLines.some(line => { const address = billingNormalize(line); return address === term || address.replace(/\b\d{4}\b/g, "").trim() === term; }));
}
export function ceramicTariffChoices(states: CeramicTariffState[], snapshot: CeramicShipment, day: string, fuel: FuelPeriod[]): CeramicTariffChoice[] {
  const pickups = snapshot.destinations.flatMap(d => d.orders.map(o => billingNormalize(o.collectFrom).replaceAll("BABELEGI", "BABALEGI")));
  const hasBabalegi = pickups.some(p => phrase(p, "BABALEGI"));
  const knownOrigin = pickups.some(p => /\b(KRUGERSDORP|VEREENIGING|BABALEGI)\b/.test(p));
  if (!knownOrigin) return [];
  const laneKey = (lane: CeramicTariffState["lanes"][number]) => `${billingNormalize(lane.loadingPoint).replaceAll("BABELEGI", "BABALEGI")}|${billingNormalize(lane.destination)}`;
  const memberships = states.map(state => ({ state, identities: new Set(state.lanes.map(laneKey)) }));
  const versions = new Map<string, { state: CeramicTariffState; lane: CeramicTariffState["lanes"][number]; date: string }>();
  for (const state of states) for (const lane of state.lanes) {
    const date = lane.date || state.effectiveDate || ""; if (!validDay(date) || date > day) continue;
    const key = laneKey(lane), current = versions.get(key);
    if (!current || date > current.date || date === current.date && (state.recordedAt > current.state.recordedAt || state.recordedAt === current.state.recordedAt && state.revision > current.state.revision)) versions.set(key, { state, lane, date });
  }
  const choices: CeramicTariffChoice[] = [];
  for (const [identity, { state, lane, date }] of versions) {
    if (memberships.some(({ state: newer, identities }) => newer.recordedAt > state.recordedAt && newer.effectiveDate && newer.effectiveDate <= day && !identities.has(identity))) continue;
    if ((lane.pricingUnit || state.defaultPricingUnit) !== "ton") continue;
    const origin = billingNormalize(lane.loadingPoint).replaceAll("BABELEGI", "BABALEGI");
    if (phrase(origin, "BABALEGI") !== hasBabalegi || !phrase(origin, "KRUGERSDORP") || !phrase(origin, "VEREENIGING")) continue;
    const matched = snapshot.destinations.filter(destination => destinationMatches(destination, lane.destination)).map(d => d.name);
    if (!matched.length) continue;
    const rate = ceramicRateOnDate(lane.rate, date, day, fuel, state); if (rate === null) continue;
    choices.push({ key: `${state.sheetId}:${state.revision}:${lane.id}:${date}`, sheetId: state.sheetId, revision: state.revision, laneId: lane.id, loadingPoint: lane.loadingPoint, destination: lane.destination, effectiveDate: date, ratePerTon: rate, variant: /\bSP\b/i.test(lane.destination) ? "sp" : "standard", matchedDestinations: matched });
  }
  return choices.sort((a, b) => b.ratePerTon - a.ratePerTon || a.destination.localeCompare(b.destination) || a.key.localeCompare(b.key));
}
