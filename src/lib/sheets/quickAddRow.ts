import { calculateLoadAmount, parseNumberSafe } from "@/convex/utils";

/**
 * Manual sheet entry — the pure part of the Excel-style "type a row into the
 * Sheets tab" feature.
 *
 * One typed row becomes one daily route holding a single load, so it flows into
 * the dashboard, sheets, email reports, invoices and the board exactly like a
 * route created through the input wizard. The Amount cell is the load total:
 * typing into it back-solves the rate from the quantity (see amountToRate),
 * which keeps the Amount column users read identical to what gets stored.
 */

export type RateType = "per_unit" | "flat";

export interface QuickAddDraft {
  date: string;
  truck: string;
  trailer: string;
  driver: string;
  origin: string;
  destination: string;
  client: string;
  qty: string;
  unit: string;
  rate: string;
  rateType: RateType;
  km: string;
  notes: string;
}

export const emptyQuickAddDraft = (date: string): QuickAddDraft => ({
  date,
  truck: "",
  trailer: "",
  driver: "",
  origin: "",
  destination: "",
  client: "",
  // Quantity 1 keeps the Amount cell a straight total until the user types a
  // real quantity in the details strip.
  qty: "1",
  unit: "tons",
  rate: "",
  rateType: "per_unit",
  km: "",
  notes: "",
});

/** Load total as shown in the sheet's Amount column. */
export const quickAddAmount = (draft: QuickAddDraft): number =>
  calculateLoadAmount(parseNumberSafe(draft.qty), parseNumberSafe(draft.rate), draft.rateType);

/** Revenue per kilometre, or 0 while the distance is unknown. */
export const quickAddRPerKm = (draft: QuickAddDraft): number => {
  const km = parseNumberSafe(draft.km);
  return km > 0 ? quickAddAmount(draft) / km : 0;
};

/**
 * Rate that turns a typed Amount into the stored rate. Per-unit rows divide by
 * the quantity (so 12 500 over 25t is R 500/t); flat rows and rows without a
 * quantity store the total as-is.
 */
export const amountToRate = (amountInput: string, draft: QuickAddDraft): string => {
  const qty = parseNumberSafe(draft.qty);
  if (draft.rateType === "flat" || qty <= 0) return amountInput;
  return String(parseNumberSafe(amountInput) / qty);
};

/** Field names still missing before the row can be saved (empty = ready). */
export const quickAddMissingFields = (draft: QuickAddDraft): string[] => {
  const missing: string[] = [];
  if (!draft.date) missing.push("date");
  if (!draft.truck.trim()) missing.push("truck");
  if (!draft.client.trim()) missing.push("client");
  return missing;
};

export interface QuickAddPayload {
  routeDate: string;
  driverName: string;
  truckFleetNo: string;
  truckFleetNoStr: string;
  trailerFleetNoStr?: string;
  kilometers: number;
  routeKilometers: number;
  notes: string;
  loads: [
    {
      client: string;
      quantity: string;
      quantityType: string;
      rate: string;
      rateType: RateType;
      fromLocations: string[];
      toLocations: string[];
    },
  ];
}

/**
 * The `createDailyRoute` arguments for one typed row. Empty locations are left
 * out rather than sent as blanks — the backend falls back to "Unknown" and the
 * route then shows as incomplete, same as a wizard save with a location missing.
 */
export const buildQuickAddPayload = (draft: QuickAddDraft): QuickAddPayload => {
  const km = parseNumberSafe(draft.km);
  return {
    routeDate: draft.date,
    driverName: draft.driver.trim(),
    truckFleetNo: draft.truck.trim(),
    truckFleetNoStr: draft.truck.trim(),
    trailerFleetNoStr: draft.trailer.trim() || undefined,
    kilometers: km,
    routeKilometers: km,
    notes: draft.notes.trim(),
    loads: [
      {
        client: draft.client.trim(),
        quantity: String(parseNumberSafe(draft.qty)),
        quantityType: draft.unit,
        rate: String(parseNumberSafe(draft.rate)),
        rateType: draft.rateType,
        fromLocations: draft.origin.trim() ? [draft.origin.trim()] : [],
        toLocations: draft.destination.trim() ? [draft.destination.trim()] : [],
      },
    ],
  };
};
