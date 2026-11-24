import type { CeramicShipment } from "./parser";

const normalize = (value: string) => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim().replace(/\s+/g, " ");
const aliases: Record<string, readonly string[]> = {
  "MOSSEL BAY": ["MOSSEL BAY", "MOSSELBAY", "MOSSELBAAI", "MBAAI"],
  "GEORGE": ["GEORGE", "GEO"],
  "PLETTENBERG BAY": ["PLETTENBERG BAY", "PLETT"],
  "PORT ELIZABETH": ["PORT ELIZABETH", "GQEBERHA", "PE"],
  "VOORBAAI": ["VOORBAAI", "VOOR BAY", "DIE VOOR BAY"],
  "BABELEGI": ["BABELEGI", "BABALEGI"],
  "OUDTSHOORN": ["OUDTSHOORN"],
};
/** Deliberate aliases only: a similar spelling never silently becomes a tariff match. */
export function ceramicTownName(value: string): string {
  const key = normalize(value);
  return Object.entries(aliases).find(([, names]) => names.includes(key))?.[0] ?? key;
}
export function ceramicTownNames(values: string[]): string[] {
  return [...new Set(values.map(ceramicTownName).filter(Boolean))].sort();
}
export function ceramicTownInput(value: string): string[] {
  return ceramicTownNames(value.split(/[,;|]/).map(town => town.trim()).filter(Boolean));
}
export function ceramicLaneTowns(destination: string, explicit?: string[]): string[] {
  return ceramicTownNames(explicit?.length ? explicit : destination.replace(/\(SP\)/ig, "").split(/\s*[/+]\s*/));
}
type Destination = CeramicShipment["destinations"][number];
function matchesTown(destination: Destination, town: string): boolean {
  const terms = aliases[town] ?? [town], name = normalize(destination.name);
  return terms.some(term => (` ${name} `).includes(` ${term} `) || destination.addressLines.some(line => {
    const address = normalize(line).replace(/\b\d{4}\b/g, "").trim();
    // Street names and contact lines are not delivery towns.
    return address === term;
  }));
}
export function ceramicDestinationMatches(destination: Destination, lane: string, explicit?: string[]): boolean {
  return ceramicLaneTowns(lane, explicit).some(town => matchesTown(destination, town));
}
export type CeramicDestinationCheck = { destination: string; towns: string[]; matched: boolean; tariffs: string[] };
export function ceramicDestinationChecks(snapshot: CeramicShipment, choices: { destination: string; destinationTowns?: string[] }[], knownTowns: string[] = []): CeramicDestinationCheck[] {
  const towns = ceramicTownNames([...Object.keys(aliases), ...knownTowns, ...choices.flatMap(choice => ceramicLaneTowns(choice.destination, choice.destinationTowns))]);
  return snapshot.destinations.map(destination => {
    const tariffs = [...new Set(choices.filter(choice => ceramicDestinationMatches(destination, choice.destination, choice.destinationTowns)).map(choice => choice.destination))];
    return { destination: destination.name, towns: towns.filter(town => matchesTown(destination, town)), matched: tariffs.length > 0, tariffs };
  });
}
/** Old confirmed Mossel Bay bills need explicit review after the spelling correction. */
export const CERAMIC_DESTINATION_MATCH_VERSION = 1;
export function ceramicDestinationRuleIssues(snapshot: CeramicShipment, billing?: { automation?: { status: string; destinationMatchVersion?: number } }): string[] {
  if (billing?.automation?.status !== "confirmed" || billing.automation.destinationMatchVersion === CERAMIC_DESTINATION_MATCH_VERSION) return [];
  return snapshot.destinations.some(destination => matchesTown(destination, "MOSSEL BAY"))
    ? ["Review saved billing: Mossel Bay tariff matching was corrected. Recheck all delivery towns and reconfirm; saved amounts are retained."] : [];
}
