import type { CeramicDestination, CeramicShipment } from "./parser";

export type CeramicLocalLeg = {
  key: string; kind: "collection" | "delivery"; name: string; address: string;
  deliveryNumbers: string[]; weightKg: number; pallets: number | null;
};

export function ceramicPlanningDate(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Johannesburg", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
export function validCeramicDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}
function localCustomer(name: string, addressLines: string[] = []): boolean {
  if (/\bCASH\s*BUILD\b/i.test(name)) return true;
  // George can be part of the store name or a separate town/postcode address line.
  // A street called George in another town is not a George store.
  return /\bITALTILE\b/i.test(name) && (/\bGEORGE\b/i.test(name) || addressLines.some(line => /^(?:GEORGE(?:\s+\d{4})?|\d{4}\s+GEORGE)$/i.test(line.trim())));
}
function pallets(orders: CeramicDestination["orders"]): number | null {
  return orders.every(order => order.palletsEstimate !== null) ? orders.reduce((n, order) => n + (order.palletsEstimate ?? 0), 0) : null;
}
/** One row per physical source stop; distinct deliveries with the same name stay distinct. */
export function ceramicLocalLegs(snapshot: CeramicShipment): CeramicLocalLeg[] {
  const legs: CeramicLocalLeg[] = [];
  const pickups = new Map<string, CeramicDestination["orders"]>();
  for (const destination of snapshot.destinations) {
    if (localCustomer(destination.name, destination.addressLines)) {
      const deliveries = destination.orders.map(order => order.deliveryNumber).sort();
      legs.push({ key: `delivery:${JSON.stringify(deliveries)}`, kind: "delivery", name: destination.name,
        address: destination.addressLines.join(", "), deliveryNumbers: deliveries,
        weightKg: destination.orders.reduce((n, order) => n + order.weightKg, 0), pallets: pallets(destination.orders) });
    }
    for (const order of destination.orders) if (localCustomer(order.collectFrom)) {
      const key = order.collectFrom.trim().replace(/\s+/g, " ").toUpperCase();
      pickups.set(key, [...(pickups.get(key) ?? []), order]);
    }
  }
  for (const [name, orders] of pickups) legs.push({ key: `collection:${name}`, kind: "collection", name, address: "",
    deliveryNumbers: orders.map(order => order.deliveryNumber).sort(), weightKg: orders.reduce((n, order) => n + order.weightKg, 0), pallets: pallets(orders) });
  return legs;
}

/** A single main load containing all shipment deliveries. Locals never create Planner loads. */
export function ceramicMainLoad(snapshot: CeramicShipment, shipmentId: string) {
  const orders = snapshot.destinations.flatMap(destination => destination.orders);
  return {
    loadId: `ceramic:${shipmentId}`, client: "CERAMIC TILE MARKETING",
    fromLocations: [...new Set(orders.map(order => order.collectFrom.trim()).filter(Boolean))],
    toLocations: snapshot.destinations.map(destination => [destination.name, ...destination.addressLines].filter(Boolean).join(", ")),
    quantity: snapshot.totalWeightKg === null ? "" : String(snapshot.totalWeightKg / 1000),
    quantityType: "tons", rate: "", rateType: "per_unit",
    notes: `${snapshot.shipmentNumber} v${snapshot.version} | Deliveries: ${orders.map(order => order.deliveryNumber).join(", ")} | Rate and kilometres need review.`,
  };
}

/** Convex may return object keys in a different order; comparisons must ignore key order. */
export function ceramicEqual(a: unknown, b: unknown): boolean {
  const encode = (value: unknown) => JSON.stringify(value, (_key, entry) =>
    entry && typeof entry === "object" && !Array.isArray(entry) ? Object.fromEntries(Object.entries(entry).sort(([a], [b]) => a.localeCompare(b))) : entry);
  return encode(a) === encode(b);
}
