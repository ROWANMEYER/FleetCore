import { calculateLoadAmount, parseNumberSafe } from "@/convex/utils";

/**
 * Pure transform from Convex `dailyRoutes` documents to the flattened
 * spreadsheet rows the Sheets / All-Regions tables render.
 *
 * Route/load hierarchy rules (see ARCHITECTURE_LOCK):
 * - One dailyRoute = one ROUTE identity; a route with N loads produces N LOAD
 *   rows that all share that same route identity (routeId + routeLabel).
 * - ROUTE label is derived from `routeOrder` for Board-created routes; legacy
 *   routes that predate `routeOrder` get a deterministic per-truck fallback
 *   number that never collides with an existing routeOrder label.
 * - LOAD NO is the position within `route.loads` (1..N, reset per route). The
 *   raw Convex `loadId` is never displayed; it is carried internally on the
 *   row so consumers that need it (e.g. navigation) still have it.
 * - `route.loads[]` order is authoritative and stable (allocation and moves
 *   append; reordering patch only touches routeOrder, never loads) — so the
 *   display sequence always matches the authoritative backend order.
 */

export interface SheetLoadInput {
  client?: string;
  fromLocations?: string[];
  toLocations?: string[];
  quantity?: number | string;
  rate?: number | string;
  rateType?: string;
  notes?: string;
  loadId?: string;
}

export interface SheetRouteInput {
  _id: string;
  routeDate?: string;
  truckFleetNoStr?: string;
  truckFleetNo?: number | string;
  trailerFleetNoStr?: string;
  trailerFleetNo?: number | string;
  driverName?: string;
  driverPhotoUrl?: string;
  driverPhotoOriginalUrl?: string;
  fromLocations?: string[];
  toLocations?: string[];
  client?: string;
  rate?: number | string;
  kilometers?: number | string;
  notes?: string;
  region?: string;
  routeOrder?: number;
  planningSource?: string;
  loads?: SheetLoadInput[];
}

export interface SheetRow {
  routeId: string;
  loadIndex: number;
  /** Route identity label, identical for every load row of the same route. */
  routeLabel: string;
  /** Authoritative Board route order when present (legacy routes omit it). */
  routeOrder?: number;
  truckNo: string;
  trailerNo: string;
  /** Display load number: position within the route (1..N). Never a raw ID. */
  loadNo: string;
  /** Internal Convex load ID — available for consumers, never rendered. */
  loadId?: string;
  date: string;
  dateIso: string;
  driverName: string;
  driverPhotoUrl?: string;
  driverPhotoOriginalUrl?: string;
  origin: string;
  destination: string;
  customer: string;
  amount: number;
  rkm: number;
  notes: string;
  region: string;
}

export function formatSheetDate(isoDate: string | undefined): string {
  if (!isoDate) return "";
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return "";
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = String(d.getFullYear()).padStart(4, "0");
  return `${day} ${month} ${year}`;
}

function truckKey(route: SheetRouteInput): string {
  return route.truckFleetNoStr || route.truckFleetNo != null ? String(route.truckFleetNo) : "";
}

/**
 * Assign a route label to every route in the list.
 *
 * Board routes use their authoritative `routeOrder` → "R1", "R2", ...
 * Legacy routes without `routeOrder` get the next free positive integer in
 * their truck+date group (stable given the input order), so a truck that has
 * both R1 (Board) and a legacy route lands the legacy route at R2 without
 * colliding. Routes with no identifiable truck simply fall back to the next
 * free number overall.
 */
export function assignRouteLabels(routes: SheetRouteInput[]): Map<string, string> {
  const labels = new Map<string, string>();
  const used = new Map<string, Set<number>>();

  for (const route of routes) {
    const id = String(route._id);
    let order = route.routeOrder;
    if (order == null || !Number.isFinite(order) || order <= 0) {
      const group = `${route.routeDate || ""}|${truckKey(route)}`;
      let usedSet = used.get(group);
      if (!usedSet) {
        usedSet = new Set<number>();
        used.set(group, usedSet);
      }
      // Collect authoritative routeOrder values already seen in this group so
      // the legacy fallback never collides with a Board label.
      for (const r of routes) {
        if (r.routeOrder != null && Number.isFinite(r.routeOrder) && r.routeOrder > 0) {
          if (r.routeDate === route.routeDate && truckKey(r) === truckKey(route)) {
            usedSet.add(r.routeOrder);
          }
        }
      }
      let next = 1;
      while (usedSet.has(next)) next += 1;
      order = next;
      usedSet.add(next);
      labels.set(id, `R${order}`);
    } else {
      labels.set(id, `R${order}`);
    }
  }

  return labels;
}

/**
 * Flatten `dailyRoutes` documents into spreadsheet rows.
 *
 * Mirrors the historical per-load flattening exactly (route-level amount/km
 * shared across the route's rows, per-load origin/destination/client/notes,
 * empty routes render as a single summary row) but:
 * - exposes `routeLabel`/`routeOrder` so the UI can show route identity, and
 * - sets `loadNo` to the in-route position instead of the raw Convex `loadId`.
 */
export function buildSheetRows(routes: SheetRouteInput[]): SheetRow[] {
  if (!routes || routes.length === 0) return [];

  const labels = assignRouteLabels(routes);
  const result: SheetRow[] = [];

  for (const route of routes) {
    const loads = route.loads || [];
    const routeLabel = labels.get(String(route._id)) || "";
    const routeOrder =
      route.routeOrder != null && Number.isFinite(route.routeOrder) && route.routeOrder > 0
        ? route.routeOrder
        : undefined;

    // Route-level metrics shared by every load row: revenue = sum of load
    // amounts (or the route rate when there are no loads), and R / KM =
    // revenue ÷ kilometres (0 when KM or revenue is missing).
    const routeKm = Number(route.kilometers) || 0;
    const routeRevenue =
      loads.length === 0
        ? Number(route.rate) || 0
        : loads.reduce(
            (sum: number, l) => sum + calculateLoadAmount(parseNumberSafe(l.quantity), parseNumberSafe(l.rate), l.rateType || "per_unit"),
            0
          );
    const routeRkm = routeKm > 0 && routeRevenue > 0 ? Number((routeRevenue / routeKm).toFixed(2)) : 0;

    const base = {
      routeId: String(route._id),
      truckNo: route.truckFleetNoStr || String(route.truckFleetNo ?? ""),
      trailerNo: route.trailerFleetNoStr || String(route.trailerFleetNo ?? ""),
      driverName: (route.driverName || "").toUpperCase(),
      driverPhotoUrl: route.driverPhotoUrl || "",
      driverPhotoOriginalUrl: route.driverPhotoOriginalUrl || "",
      region: route.region || "",
      routeLabel,
      routeOrder,
    };

    if (loads.length === 0) {
      // Route with no loads — show as one summary row (no load number).
      result.push({
        ...base,
        loadIndex: -1,
        loadNo: "",
        date: formatSheetDate(route.routeDate),
        dateIso: route.routeDate || "",
        origin: (route.fromLocations ?? []).join(", ").toUpperCase(),
        destination: (route.toLocations ?? []).join(", ").toUpperCase(),
        customer: route.client || "",
        amount: Number(route.rate) || 0,
        rkm: routeRkm,
        notes: route.notes || "",
      });
    } else {
      loads.forEach((load, index) => {
        const amount = calculateLoadAmount(parseNumberSafe(load.quantity), parseNumberSafe(load.rate), load.rateType || "per_unit");
        result.push({
          ...base,
          loadIndex: index,
          // Position within the route (1..N). Route identity comes from
          // routeId + routeLabel, never from the load number.
          loadNo: String(index + 1),
          loadId: load.loadId,
          date: formatSheetDate(route.routeDate),
          dateIso: route.routeDate || "",
          origin: (load.fromLocations ?? []).join(", ").toUpperCase(),
          destination: (load.toLocations ?? []).join(", ").toUpperCase(),
          customer: (load.client || "").toUpperCase(),
          amount,
          rkm: routeRkm,
          // Notes are per-load; fall back to the route-wide note so existing
          // routes keep showing their notes on every row.
          notes: (load.notes ?? route.notes) || "",
        });
      });
    }
  }

  return result;
}

/**
 * Total load count across routes — the LOADS KPI counts loads (not routes), a
 * route with 5 loads contributes 5 regardless of how many routes exist.
 */
export function countSheetLoads(routes: SheetRouteInput[]): number {
  return (routes || []).reduce((sum, route) => sum + (route.loads?.length || 0), 0);
}