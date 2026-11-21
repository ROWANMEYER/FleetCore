/**
 * Pure parser for Ceramic Tiles SAP "LOADING / SHIPMENT PLAN" text.
 * The PDF reader supplies extracted text; this code does not parse PDF bytes.
 */
export type CeramicOrder = {
  deliveryNumber: string;
  orderNumber: string;
  weightKg: number;
  collectFrom: string;
  palletsEstimate: number | null;
};
export type CeramicDestination = {
  name: string;
  addressLines: string[];
  orders: CeramicOrder[];
};
export type CeramicShipment = {
  shipmentNumber: string;
  version: number;
  totalWeightKg: number | null;
  totalPallets: number | null;
  transporter: string | null;
  plannedLoadingDate: string | null;
  plannedDeliveryDate: string | null;
  destinations: CeramicDestination[];
  warnings: string[];
};
export type CeramicParseResult =
  | { ok: true; shipment: CeramicShipment }
  | { ok: false; errors: string[] };

const SHIPMENT = /\bSHIPMENT\s+(SH\d+)\s+([\d,.]+)\s*KG\b/i;
const VERSION = /\bVersion\s*:\s*(\d+)\b/i;
const DESTINATION = /^\s*DELIVER\s+TO\s*:\s*(.+?)\s*$/i;
const ORDER = /^\s*Delivery\s*:\s*(\d+)\s+Order\s+No\.\s*:\s*(.*?)\s+([\d,.]+)\s*KG\s*$/i;
const COLLECTION = /^\s*Collect\s*@\s*(.+?)\s*$/i;
const DATE = /^\s*Planned\s+(Loading|Delivery)\s+date\s*:\s*(\d{2})\.(\d{2})\.(\d{4})/i;
const PRODUCT_PALLETS = /\b(\d+(?:\.\d+)?)\s+PAL\s*$/i;
const PAGE_HEADER = /^(?:Page\s+\d+\s+of|LOADING\s*\/\s*SHIPMENT\s+PLAN|SHIPMENT\s+SH\d+|Transporter\s*:|Version\s*:|\d+(?:\.\d+)?\s+PAL\s*$)/i;
const parseNumber = (text?: string): number | null => {
  if (!text) return null;
  const value = Number(text.replace(/,/g, ""));
  return Number.isFinite(value) ? value : null;
};
const normalizeDate = (day: string, month: string, year: string): string | null => {
  const date = new Date(Date.UTC(+year, +month - 1, +day));
  if (date.getUTCFullYear() !== +year || date.getUTCMonth() !== +month - 1 || date.getUTCDate() !== +day) return null;
  return `${year}-${month}-${day}`;
};
const isDivider = (line: string) => /^_{8,}\s*$/.test(line.trim());
const isSectionStart = (line: string) =>
  DESTINATION.test(line) || ORDER.test(line) || DATE.test(line) ||
  PAGE_HEADER.test(line.trim()) || isDivider(line);

/**
 * Recompute warnings from the CURRENT reviewed values. Without this, an operator
 * can fix a field and still see its old warning, or edit a correct weight into a
 * mismatch without receiving a new warning.
 */
export function withCeramicReviewWarnings(shipment: CeramicShipment): CeramicShipment {
  const isLiveWarning = (warning: string) =>
    warning.startsWith("Shipment weight ") ||
    warning.startsWith("Repeated delivery number ") ||
    warning.startsWith("Invalid planned loading date.") ||
    warning.startsWith("Invalid planned delivery date.") ||
    warning === "One or more delivery addresses are missing; review before assignment." ||
    warning === "Some collection points could not be read; review the affected orders." ||
    warning === "Planned loading or delivery date is missing.";

  const warnings = shipment.warnings.filter((warning) => !isLiveWarning(warning));
  const orders = shipment.destinations.flatMap((destination) => destination.orders);
  if (shipment.destinations.some((destination) => !destination.addressLines.some((line) => line.trim()))) {
    warnings.push("One or more delivery addresses are missing; review before assignment.");
  }
  if (orders.some((order) => !order.collectFrom.trim())) {
    warnings.push("Some collection points could not be read; review the affected orders.");
  }
  if (!shipment.plannedLoadingDate || !shipment.plannedDeliveryDate) {
    warnings.push("Planned loading or delivery date is missing.");
  }
  if (shipment.totalWeightKg !== null) {
    const orderWeight = orders.reduce((sum, order) => sum + order.weightKg, 0);
    if (Number.isFinite(orderWeight) && Math.abs(shipment.totalWeightKg - orderWeight) > 0.1) {
      warnings.push(`Shipment weight ${shipment.totalWeightKg.toFixed(2)} kg differs from delivery order total ${orderWeight.toFixed(2)} kg; review this document.`);
    }
  }
  const deliveryNumbers = new Set<string>();
  for (const order of orders) {
    if (deliveryNumbers.has(order.deliveryNumber)) {
      warnings.push(`Repeated delivery number ${order.deliveryNumber}; review the shipment.`);
    }
    deliveryNumbers.add(order.deliveryNumber);
  }
  return { ...shipment, warnings: [...new Set(warnings)] };
}

/** Extracts shipment data, keeping orders under each delivery address (including across page breaks). */
export function parseCeramicShipmentText(raw: string): CeramicParseResult {
  const lines = raw.replace(/\r\n?/g, "\n").replace(/\f/g, "\n").split("\n").map((line) => line.trimEnd());
  const fullText = lines.join("\n");
  const header = fullText.match(SHIPMENT);
  const version = fullText.match(VERSION);
  const errors: string[] = [];
  if (!header) errors.push("Shipment number and weight not found (expected SH... in a LOADING / SHIPMENT PLAN).");
  if (!version) errors.push("Shipment version not found.");
  if (errors.length || !header || !version) return { ok: false, errors };

  // A file can contain repeated headers across pages. All headers must refer
  // to exactly the same shipment and version. Mixed shipment documents must
  // be split before import or their orders could be assigned to the wrong truck.
  const headerNumbers = Array.from(fullText.matchAll(/\bSHIPMENT\s+(SH\d+)\s+[\d,.]+\s*KG\b/gi), (match) => match[1].toUpperCase());
  const versions = Array.from(fullText.matchAll(/\bVersion\s*:\s*(\d+)\b/gi), (match) => Number(match[1]));
  if (headerNumbers.some((number) => number !== header[1].toUpperCase())) {
    return { ok: false, errors: ["This PDF contains multiple shipment numbers. Split the PDF and import each shipment separately."] };
  }
  if (versions.some((number) => number !== Number(version[1]))) {
    return { ok: false, errors: ["This PDF contains inconsistent shipment versions. Verify the pages before importing."] };
  }
  const destinations: CeramicDestination[] = [];
  const warnings: string[] = [];
  let active: CeramicDestination | null = null;
  let currentOrder: CeramicOrder | null = null;
  let lastDeliveryLine = -1;
  let loadingDate: string | null = null;
  let deliveryDate: string | null = null;
  let transporter: string | null = null;
  let totalPallets: number | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const transporterMatch = line.match(/^Transporter\s*:\s*(.+)$/i);
    if (transporterMatch && !transporter) transporter = transporterMatch[1].trim();
    if (totalPallets === null && /^\d+(?:\.\d+)?\s+PAL\s*$/i.test(line)) {
      totalPallets = parseNumber(line.match(/^[\d.]+/)?.[0]);
    }
    const dateMatch = line.match(DATE);
    if (dateMatch) {
      const parsed = normalizeDate(dateMatch[2], dateMatch[3], dateMatch[4]);
      if (!parsed) warnings.push(`Invalid planned ${dateMatch[1].toLowerCase()} date.`);
      if (dateMatch[1].toLowerCase() === "loading") loadingDate = parsed;
      else deliveryDate = parsed;
      continue;
    }
    const destinationMatch = line.match(DESTINATION);
    if (destinationMatch) {
      currentOrder = null;
      const addressLines: string[] = [];
      let j = i + 1;
      while (j < lines.length && !isSectionStart(lines[j]) && addressLines.length < 12) {
        const address = lines[j].trim();
        if (address) addressLines.push(address);
        j++;
      }
      active = { name: destinationMatch[1].trim(), addressLines, orders: [] };
      destinations.push(active);
      i = j - 1;
      continue;
    }
    const orderMatch = line.match(ORDER);
    if (orderMatch) {
      if (!active) {
        active = { name: "Destination not specified", addressLines: [], orders: [] };
        destinations.push(active);
        warnings.push(`Delivery ${orderMatch[1]} has no preceding DELIVER TO section; review destination.`);
      }
      const weight = parseNumber(orderMatch[3]);
      if (weight === null) {
        warnings.push(`Delivery ${orderMatch[1]} has an unreadable weight.`);
        continue;
      }
      currentOrder = {
        deliveryNumber: orderMatch[1],
        orderNumber: orderMatch[2].trim(),
        weightKg: weight,
        collectFrom: "",
        palletsEstimate: null,
      };
      active.orders.push(currentOrder);
      lastDeliveryLine = i;
      continue;
    }
    const collectionMatch = line.match(COLLECTION);
    if (collectionMatch && currentOrder) {
      const parts = [collectionMatch[1].trim()];
      const next = lines[i + 1]?.trim() ?? "";
      if (next && !isSectionStart(next) && !PRODUCT_PALLETS.test(next) &&
          !/^\d+(?:\.\d+)?\s+(?:PC|EA|BOX|M2)\b/.test(next) && i - lastDeliveryLine < 5) {
        parts.push(next);
        i++;
      }
      currentOrder.collectFrom = parts.join(", ");
      continue;
    }
    // Ignore repeated page headers such as "27.731 PAL": they are shipment totals,
    // not pallets from a product line within the preceding delivery.
    if (currentOrder && !PAGE_HEADER.test(line)) {
      const match = line.match(PRODUCT_PALLETS);
      if (match) currentOrder.palletsEstimate = (currentOrder.palletsEstimate ?? 0) + Number(match[1]);
    }
  }
  const orders = destinations.flatMap((d) => d.orders);
  if (!orders.length) return { ok: false, errors: [`Shipment ${header[1]} contains no recognisable delivery orders.`] };
  if (destinations.some((d) => !d.addressLines.length)) warnings.push("One or more delivery addresses are missing; review before assignment.");
  if (orders.some((order) => !order.collectFrom)) warnings.push("Some collection points could not be read; review the affected orders.");
  if (!loadingDate || !deliveryDate) warnings.push("Planned loading or delivery date is missing.");
  // A mismatch may indicate a truncated PDF, missed delivery lines or a source
  // document issue. Flag it, but let dispatch review/correct before import.
  const declaredWeight = parseNumber(header[2]);
  const orderWeight = orders.reduce((sum, order) => sum + order.weightKg, 0);
  if (declaredWeight !== null && Math.abs(declaredWeight - orderWeight) > 0.1) {
    warnings.push(`Shipment weight ${declaredWeight.toFixed(2)} kg differs from delivery order total ${orderWeight.toFixed(2)} kg; review this document.`);
  }
  const seen = new Set<string>();
  for (const order of orders) {
    if (seen.has(order.deliveryNumber)) warnings.push(`Repeated delivery number ${order.deliveryNumber}; review the shipment.`);
    seen.add(order.deliveryNumber);
  }
  return { ok: true, shipment: withCeramicReviewWarnings({
    shipmentNumber: header[1].toUpperCase(),
    version: Number(version[1]),
    totalWeightKg: parseNumber(header[2]),
    totalPallets,
    transporter,
    plannedLoadingDate: loadingDate,
    plannedDeliveryDate: deliveryDate,
    destinations,
    warnings: [...new Set(warnings)],
  }) };
}
