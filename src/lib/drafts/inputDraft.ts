export const INPUT_DRAFT_WORKFLOW = "daily-planner:input";
export const INPUT_DRAFT_VERSION = 1;

export type InputDraftLoad = {
  id: string;
  clientName: string;
  fromLocations: string[];
  toLocations: string[];
  quantity: string;
  quantityType: string;
  rate: string;
  rateType: "per_unit" | "flat";
  sequence: number;
  kilometers?: number;
  subcontractorRate?: string;
  subcontractorRateType?: "per_unit" | "flat";
};

export type InputDraftForm = {
  clientName: string;
  fromLocations: string[];
  toLocations: string[];
  quantity: string;
  quantityType: string;
  rate: string;
  rateType: string;
  subcontractorRate: string;
  subcontractorRateType: string;
};

export type InputDraftData = {
  date: string;
  truckFleetNo: string;
  trailerFleetNo: string;
  driverName: string;
  routeKilometers: string;
  notes: string;
  region: string;
  isFleetMode: boolean;
  selectedSubId: string;
  detailsCollapsed: boolean;
  loads: InputDraftLoad[];
  draftLoad: InputDraftForm;
};

export type InputDraft = {
  step: number;
  data: InputDraftData;
};

export type StaleReference = {
  field: "truckFleetNo" | "trailerFleetNo" | "driverName" | "selectedSubId";
  label: string;
  value: string;
};

export type FleetAvailability = {
  truckFleetNos?: string[];
  trailerFleetNos?: string[];
  driverNames?: string[];
  subcontractorIds?: string[];
};

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [""];
  const strings = value.filter((entry): entry is string => typeof entry === "string");
  return strings.length > 0 ? strings : [""];
}

function asRateType(value: unknown): "per_unit" | "flat" {
  return value === "flat" ? "flat" : "per_unit";
}

function sanitizeDraftLoad(value: unknown): InputDraftForm {
  const source = value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
  return {
    clientName: asString(source.clientName),
    fromLocations: asStringArray(source.fromLocations),
    toLocations: asStringArray(source.toLocations),
    quantity: asString(source.quantity),
    quantityType: asString(source.quantityType, "tons"),
    rate: asString(source.rate),
    rateType: asRateType(source.rateType),
    subcontractorRate: asString(source.subcontractorRate),
    subcontractorRateType: asRateType(source.subcontractorRateType),
  };
}

function sanitizeLoad(value: unknown, index: number): InputDraftLoad | null {
  if (value === null || typeof value !== "object") return null;
  const source = value as Record<string, unknown>;
  return {
    id: asString(source.id, `restored-${index}`),
    clientName: asString(source.clientName),
    fromLocations: Array.isArray(source.fromLocations)
      ? source.fromLocations.filter((entry): entry is string => typeof entry === "string")
      : [],
    toLocations: Array.isArray(source.toLocations)
      ? source.toLocations.filter((entry): entry is string => typeof entry === "string")
      : [],
    quantity: asString(source.quantity),
    quantityType: asString(source.quantityType, "tons"),
    rate: asString(source.rate),
    rateType: asRateType(source.rateType),
    sequence: asNumber(source.sequence, index + 1),
    kilometers: typeof source.kilometers === "number" ? source.kilometers : undefined,
    subcontractorRate:
      typeof source.subcontractorRate === "string" ? source.subcontractorRate : undefined,
    subcontractorRateType: asRateType(source.subcontractorRateType),
  };
}

export function sanitizeInputDraft(value: unknown): InputDraft | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const data = source.data;
  if (data === null || typeof data !== "object" || Array.isArray(data)) return null;
  const fields = data as Record<string, unknown>;
  const loads = Array.isArray(fields.loads)
    ? fields.loads
        .map((entry, index) => sanitizeLoad(entry, index))
        .filter((entry): entry is InputDraftLoad => entry !== null)
    : [];

  return {
    step: Math.min(Math.max(Math.trunc(asNumber(source.step, 0)), 0), 6),
    data: {
      date: asString(fields.date),
      truckFleetNo: asString(fields.truckFleetNo),
      trailerFleetNo: asString(fields.trailerFleetNo),
      driverName: asString(fields.driverName),
      routeKilometers: asString(fields.routeKilometers),
      notes: asString(fields.notes),
      region: asString(fields.region),
      isFleetMode: asBoolean(fields.isFleetMode, true),
      selectedSubId: asString(fields.selectedSubId),
      detailsCollapsed: asBoolean(fields.detailsCollapsed, false),
      loads,
      draftLoad: sanitizeDraftLoad(fields.draftLoad),
    },
  };
}

const FIELD_LABELS: Record<StaleReference["field"], string> = {
  truckFleetNo: "Truck",
  trailerFleetNo: "Trailer",
  driverName: "Driver",
  selectedSubId: "Subcontractor",
};

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function findMissing(
  value: string,
  available: string[] | undefined
): boolean {
  if (!value.trim()) return false;
  if (!available) return false;
  const target = normalize(value);
  return !available.some((entry) => normalize(entry) === target);
}

export function pruneStaleInputDraft(
  draft: InputDraft,
  availability: FleetAvailability
): { draft: InputDraft; staleRefs: StaleReference[] } {
  const staleRefs: StaleReference[] = [];
  const data: InputDraftData = { ...draft.data };

  const checks: Array<[StaleReference["field"], string, string[] | undefined]> = [
    ["truckFleetNo", data.truckFleetNo, availability.truckFleetNos],
    ["trailerFleetNo", data.trailerFleetNo, availability.trailerFleetNos],
    ["driverName", data.driverName, availability.driverNames],
    ["selectedSubId", data.selectedSubId, availability.subcontractorIds],
  ];

  for (const [field, value, available] of checks) {
    if (!findMissing(value, available)) continue;
    staleRefs.push({ field, label: FIELD_LABELS[field], value });
    if (field === "selectedSubId") {
      data.isFleetMode = true;
    }
    data[field] = "";
  }

  return { draft: { step: draft.step, data }, staleRefs };
}

export function describeStaleReferences(refs: StaleReference[]): string {
  return refs.map((ref) => `${ref.label} "${ref.value}"`).join(", ");
}
