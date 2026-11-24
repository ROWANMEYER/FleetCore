import type { CeramicDestination, CeramicShipment } from "./parser";
import { ceramicCollectionTown } from "./collectionTown";

export type CeramicStopOrder = { pickupTowns: string[]; pickupWarehouses: string[]; offloads: string[] };
export type CeramicStop = { id: string; label: string; detail?: string };
export type CeramicPickupTown = CeramicStop & { warehouses: CeramicStop[] };

function collectionLabel(value: string): { town: string; warehouse: string } {
  const place = value.trim().replace(/^\d+\s*-\s*/, "");
  const town = ceramicCollectionTown(place);
  const townMatch = place.match(/\b(Krugersdorp|Vereeniging|Babalegi|Babelegi|Hammanskraal)\b/i);
  if (!town || !townMatch) return { town: "COLLECTION TOWN TO BE CONFIRMED", warehouse: place.toUpperCase() || "COLLECTION POINT TO BE CONFIRMED" };
  const warehouse = place.slice(0, townMatch.index).replace(/[,\s-]+$/, "").replace(/^Betta Sanitaryware$/i, "BETTA");
  return { town, warehouse: warehouse.toUpperCase() || place.toUpperCase() };
}
function offloadLabel(destination: CeramicDestination): string {
  const name = destination.name.trim().replace(/^[A-Z]*\d+\s*-\s*/i, "");
  const trading = name.split(/\bT\/A\b/i);
  if (trading.length > 1) {
    const label = trading[1].trim() || destination.addressLines[0]?.trim();
    if (label && !/^(?:TEL|\d)/i.test(label)) return label.toUpperCase();
  }
  return name.toUpperCase() || "DESTINATION TO BE CONFIRMED";
}

/** Stable stop identities survive source reordering; same-name deliveries stay separate. */
export function ceramicStops(shipment: CeramicShipment) {
  const towns = new Map<string, CeramicPickupTown>();
  for (const destination of shipment.destinations) for (const order of destination.orders) {
    const { town, warehouse } = collectionLabel(order.collectFrom);
    if (!towns.has(town)) towns.set(town, { id: town, label: town, warehouses: [] });
    const group = towns.get(town)!;
    const id = JSON.stringify([town, warehouse]);
    if (!group.warehouses.some(stop => stop.id === id)) group.warehouses.push({ id, label: warehouse });
  }
  const offloads = shipment.destinations.map(destination => ({
    id: JSON.stringify(destination.orders.map(order => order.deliveryNumber).sort()),
    label: offloadLabel(destination),
    detail: destination.addressLines.join(", "),
  }));
  return { pickups: [...towns.values()], offloads };
}

function reconcile(current: string[], saved: string[] = []): string[] {
  const allowed = new Set(current);
  return [...new Set([...saved.filter(id => allowed.has(id)), ...current])];
}
/** Removed stops fall away and new revision stops append without hiding any stop. */
export function resolveCeramicStopOrder(shipment: CeramicShipment, saved?: CeramicStopOrder): CeramicStopOrder {
  const stops = ceramicStops(shipment);
  return {
    pickupTowns: reconcile(stops.pickups.map(town => town.id), saved?.pickupTowns),
    pickupWarehouses: reconcile(stops.pickups.flatMap(town => town.warehouses.map(stop => stop.id)), saved?.pickupWarehouses),
    offloads: reconcile(stops.offloads.map(stop => stop.id), saved?.offloads),
  };
}
function ordered<T extends CeramicStop>(stops: T[], ids: string[]): T[] {
  const ranks = new Map(ids.map((id, index) => [id, index]));
  return [...stops].sort((a, b) => ranks.get(a.id)! - ranks.get(b.id)!);
}
export function orderedCeramicStops(shipment: CeramicShipment, saved?: CeramicStopOrder) {
  const stops = ceramicStops(shipment);
  const order = resolveCeramicStopOrder(shipment, saved);
  return {
    pickups: ordered(stops.pickups, order.pickupTowns).map(town => ({ ...town, warehouses: ordered(town.warehouses, order.pickupWarehouses) })),
    offloads: ordered(stops.offloads, order.offloads),
  };
}
export function moveCeramicStop(ids: string[], id: string, direction: -1 | 1): string[] {
  const index = ids.indexOf(id), next = index + direction;
  if (index < 0 || next < 0 || next >= ids.length) return ids;
  const result = [...ids];
  [result[index], result[next]] = [result[next], result[index]];
  return result;
}
/** Validate a complete permutation on the server: no omitted, repeated or foreign stops. */
export function assertCeramicStopOrder(shipment: CeramicShipment, order: CeramicStopOrder): void {
  const expected = resolveCeramicStopOrder(shipment);
  for (const key of ["pickupTowns", "pickupWarehouses", "offloads"] as const) {
    const allowed = new Set(expected[key]);
    if (order[key].length !== allowed.size || new Set(order[key]).size !== allowed.size || order[key].some(id => !allowed.has(id))) {
      throw new Error("Shipment stops changed or the stop order is invalid. Reopen instructions and review all stops before saving.");
    }
  }
}

/** Move a dragged stop to the target position, preserving all other stop identities. */
export function reorderCeramicStop(ids: string[], source: string, target: string): string[] {
  const from = ids.indexOf(source), to = ids.indexOf(target);
  if (from < 0 || to < 0 || from === to) return ids;
  const result = [...ids];
  result.splice(from, 1);
  result.splice(to, 0, source);
  return result;
}
