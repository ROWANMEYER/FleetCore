import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { resolveEffectiveRegion, resolveUserScope } from "./userSessions";
import { calculateLoadAmount } from "./utils";

// ── Validation helpers ──────────────────────────────────────────────────────

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export function isValidDateString(dateStr: string): boolean {
  if (!DATE_REGEX.test(dateStr)) return false;
  const [year, month, day] = dateStr.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

export type TrimValidateInput = {
  client: string;
  fromLocations: string[];
  toLocations: string[];
  loadDate: string;
};

export function trimAndValidate(load: TrimValidateInput): { valid: true } | { valid: false; error: string } {
  if (!load.client.trim()) {
    return { valid: false, error: "Client name must contain non-whitespace text" };
  }
  const trimmedFroms = load.fromLocations.map((l) => l.trim());
  if (trimmedFroms.every((l) => !l)) {
    return { valid: false, error: "At least one non-empty from location is required" };
  }
  const trimmedTos = load.toLocations.map((l) => l.trim());
  if (trimmedTos.every((l) => !l)) {
    return { valid: false, error: "At least one non-empty to location is required" };
  }
  if (!isValidDateString(load.loadDate)) {
    return { valid: false, error: `Invalid date format: ${load.loadDate}. Expected YYYY-MM-DD` };
  }
  return { valid: true };
}

// ── Mutations ───────────────────────────────────────────────────────────────

export const createPlanningLoad = mutation({
  args: {
    loadDate: v.string(),
    client: v.string(),
    fromLocations: v.array(v.string()),
    toLocations: v.array(v.string()),
    region: v.union(v.literal("garden_route"), v.literal("eastern_cape")),
    token: v.optional(v.union(v.string(), v.null())),
    quantity: v.optional(v.string()),
    quantityType: v.optional(v.string()),
    rate: v.optional(v.string()),
    rateType: v.optional(v.string()),
    kilometers: v.optional(v.float64()),
    notes: v.optional(v.string()),
    batchKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Resolve region via existing enforcement
    const scope = await resolveUserScope(ctx, args.token);
    const region =
      scope?.role === "regional"
        ? (scope.region ?? "garden_route")
        : args.region;

    // Validate date
    if (!isValidDateString(args.loadDate)) {
      throw new Error(
        `Invalid date format: ${args.loadDate}. Expected YYYY-MM-DD`
      );
    }

    // Validate required fields
    const trimmedClient = args.client.trim();
    if (!trimmedClient) {
      throw new Error("Client name must contain non-whitespace text");
    }

    const trimmedFroms = args.fromLocations.map((l) => l.trim());
    if (trimmedFroms.every((l) => !l)) {
      throw new Error(
        "At least one non-empty from location is required"
      );
    }

    const trimmedTos = args.toLocations.map((l) => l.trim());
    if (trimmedTos.every((l) => !l)) {
      throw new Error(
        "At least one non-empty to location is required"
      );
    }

    const id = await ctx.db.insert("planningLoads", {
      loadDate: args.loadDate,
      region,
      client: trimmedClient,
      fromLocations: trimmedFroms.filter((l) => l),
      toLocations: trimmedTos.filter((l) => l),
      quantity: args.quantity,
      quantityType: args.quantityType,
      rate: args.rate,
      rateType: args.rateType,
      kilometers: args.kilometers,
      notes: args.notes,
      status: "unallocated",
      createdAt: Date.now(),
      createdBy: scope ? `${scope.role}:${scope.region ?? "all"}` : undefined,
      batchKey: args.batchKey,
    });

    return id;
  },
});

export const createBulkPlanningLoads = mutation({
  args: {
    region: v.union(v.literal("garden_route"), v.literal("eastern_cape")),
    token: v.optional(v.union(v.string(), v.null())),
    batchKey: v.string(),
    loads: v.array(
      v.object({
        loadDate: v.string(),
        client: v.string(),
        fromLocations: v.array(v.string()),
        toLocations: v.array(v.string()),
        quantity: v.optional(v.string()),
        quantityType: v.optional(v.string()),
        rate: v.optional(v.string()),
        rateType: v.optional(v.string()),
        kilometers: v.optional(v.float64()),
        notes: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    // Resolve region via existing enforcement
    const scope = await resolveUserScope(ctx, args.token);
    const region =
      scope?.role === "regional"
        ? (scope.region ?? "garden_route")
        : args.region;

    if (args.loads.length === 0) {
      throw new Error("At least one load is required");
    }

    // ── Idempotency: check for existing batch ──────────────────────────────
    const existing = await ctx.db
      .query("planningLoads")
      .withIndex("by_batchKey", (q) => q.eq("batchKey", args.batchKey))
      .collect();
    const existingInRegion = existing.filter((l) => l.region === region);
    if (existingInRegion.length > 0) {
      return {
        created: false,
        ids: existingInRegion.map((l) => l._id),
      };
    }

    // Validate ALL loads before creating any (all-or-nothing)
    const now = Date.now();
    const records = [];

    for (let i = 0; i < args.loads.length; i++) {
      const load = args.loads[i];
      const result = trimAndValidate({
        client: load.client,
        fromLocations: load.fromLocations,
        toLocations: load.toLocations,
        loadDate: load.loadDate,
      });
      if (!result.valid) {
        throw new Error(`Load ${i + 1}: ${result.error}`);
      }

      records.push({
        loadDate: load.loadDate,
        region,
        client: load.client.trim(),
        fromLocations: load.fromLocations.map((l) => l.trim()).filter((l) => l),
        toLocations: load.toLocations.map((l) => l.trim()).filter((l) => l),
        quantity: load.quantity,
        quantityType: load.quantityType,
        rate: load.rate,
        rateType: load.rateType,
        kilometers: load.kilometers,
        notes: load.notes,
        status: "unallocated" as const,
        createdAt: now,
        createdBy: scope
          ? `${scope.role}:${scope.region ?? "all"}`
          : undefined,
        batchKey: args.batchKey,
      });
    }

    // All valid — insert atomically (Convex transactions guarantee all-or-nothing)
    const ids = [];
    for (const record of records) {
      ids.push(await ctx.db.insert("planningLoads", record));
    }

    return { created: true, ids };
  },
});

// ── Queries ─────────────────────────────────────────────────────────────────

export const getById = query({
  args: {
    id: v.id("planningLoads"),
    token: v.optional(v.union(v.string(), v.null())),
    region: v.optional(
      v.union(v.literal("garden_route"), v.literal("eastern_cape"))
    ),
  },
  handler: async (ctx, args) => {
    const region = await resolveEffectiveRegion(ctx, args.token, args.region);
    const doc = await ctx.db.get(args.id);
    if (!doc) {
      throw new Error("Planning load not found");
    }
    // Regional users can only read loads in their own region
    if (region && doc.region !== region) {
      throw new Error("Planning load not found");
    }
    return doc;
  },
});

export const getByDate = query({
  args: {
    loadDate: v.string(),
    token: v.optional(v.union(v.string(), v.null())),
    region: v.optional(
      v.union(v.literal("garden_route"), v.literal("eastern_cape"))
    ),
    includeCancelled: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const region = await resolveEffectiveRegion(ctx, args.token, args.region);

    let loads;
    if (region) {
      loads = await ctx.db
        .query("planningLoads")
        .withIndex("by_loadDate_region", (q) =>
          q.eq("loadDate", args.loadDate).eq("region", region)
        )
        .collect();
    } else {
      loads = await ctx.db
        .query("planningLoads")
        .withIndex("by_loadDate_region", (q) =>
          q.eq("loadDate", args.loadDate)
        )
        .collect();
    }

    if (!args.includeCancelled) {
      return loads.filter((l) => l.status !== "cancelled");
    }
    return loads;
  },
});

export const getUnallocatedByDate = query({
  args: {
    loadDate: v.string(),
    token: v.optional(v.union(v.string(), v.null())),
    region: v.optional(
      v.union(v.literal("garden_route"), v.literal("eastern_cape"))
    ),
  },
  handler: async (ctx, args) => {
    const region = await resolveEffectiveRegion(ctx, args.token, args.region);

    if (region) {
      return await ctx.db
        .query("planningLoads")
        .withIndex("by_loadDate_region_status", (q) =>
          q
            .eq("loadDate", args.loadDate)
            .eq("region", region)
            .eq("status", "unallocated")
        )
        .collect();
    }

    const loads = await ctx.db
      .query("planningLoads")
      .withIndex("by_loadDate_region", (q) =>
        q.eq("loadDate", args.loadDate)
      )
      .collect();
    return loads.filter((l) => l.status === "unallocated");
  },
});

// ── Cancellation ────────────────────────────────────────────────────────────

export const cancelPlanningLoad = mutation({
  args: {
    id: v.id("planningLoads"),
    token: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.id);
    if (!doc) {
      throw new Error("Planning load not found");
    }

    const scope = await resolveUserScope(ctx, args.token);
    if (scope?.role === "regional" && doc.region !== scope.region) {
      throw new Error("Planning load not found");
    }

    if (doc.status === "allocated") {
      throw new Error(
        "Cannot cancel an allocated planning load. Deallocate it first."
      );
    }

    if (doc.status === "cancelled") {
      throw new Error("Planning load is already cancelled.");
    }

    await ctx.db.patch(args.id, {
      status: "cancelled",
      cancelledAt: Date.now(),
      cancelledBy: scope
        ? `${scope.role}:${scope.region ?? "all"}`
        : undefined,
    });
  },
});

export const cancelBulkPlanningLoads = mutation({
  args: {
    ids: v.array(v.id("planningLoads")),
    token: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const scope = await resolveUserScope(ctx, args.token);
    const now = Date.now();

    for (const id of args.ids) {
      const doc = await ctx.db.get(id);
      if (!doc) {
        throw new Error(`Planning load ${id} not found. Operation aborted.`);
      }
      if (scope?.role === "regional" && doc.region !== scope.region) {
        throw new Error(
          `Planning load ${id} not found. Operation aborted.`
        );
      }
      if (doc.status === "allocated") {
        throw new Error(
          `Cannot cancel allocated planning load ${id}. Deallocate it first. Operation aborted.`
        );
      }
      if (doc.status === "cancelled") {
        throw new Error(
          `Planning load ${id} is already cancelled. Operation aborted.`
        );
      }
    }

    for (const id of args.ids) {
      await ctx.db.patch(id, {
        status: "cancelled",
        cancelledAt: now,
        cancelledBy: scope
          ? `${scope.role}:${scope.region ?? "all"}`
          : undefined,
      });
    }

    return { cancelled: args.ids.length };
  },
});

// ── Conversion Helper ───────────────────────────────────────────────────────

/**
 * Convert a planningLoad into the dailyRoutes.loads[] sub-object shape.
 *
 * Required fields (client, fromLocations, toLocations) come directly from the
 * planning load. Optional fields (quantity, rate, etc.) use compatibility values
 * where the existing schema demands strings — empty string "" is the least
 * misleading representation because:
 *   - calculateLoadAmount(qty=0, rate=0, rateType="flat") → 0 (safe, no NaN)
 *   - deriveTripAggregates sees rate "0" → revenue 0 (correct for unknown)
 *   - shouldAutoComplete sees amount 0 → returns false (route stays "planned")
 *
 * We do NOT pretend unknown data is known.
 */
export function planningLoadToRouteLoad(planningLoad: {
  client: string;
  fromLocations: string[];
  toLocations: string[];
  quantity?: string;
  quantityType?: string;
  rate?: string;
  rateType?: string;
  kilometers?: number;
  notes?: string;
  _id: string;
}) {
  return {
    client: planningLoad.client,
    fromLocations: planningLoad.fromLocations,
    toLocations: planningLoad.toLocations,
    quantity: planningLoad.quantity ?? "",
    quantityType: planningLoad.quantityType ?? "",
    rate: planningLoad.rate ?? "",
    rateType: planningLoad.rateType ?? "flat",
    kilometers: planningLoad.kilometers,
    notes: planningLoad.notes,
    loadId: String(planningLoad._id),
  };
}

// ── Internal Helpers ────────────────────────────────────────────────────────

/** Derive route-level aggregates from loads[] (same logic as dailyRoutes.ts). */
function deriveTripAggregates(loads: any[]) {
  if (!loads || loads.length === 0) {
    return { client: "", rate: 0, fromLocations: [], toLocations: [] };
  }
  let totalRevenue = 0;
  const fromSet = new Set<string>();
  const toSet = new Set<string>();
  for (const load of loads) {
    const rateStr = String(load.rate || "").replace(",", ".");
    const qtyStr = String(load.quantity || "").replace(",", ".");
    const r = parseFloat(rateStr) || 0;
    const q = parseFloat(qtyStr) || 0;
    totalRevenue += calculateLoadAmount(q, r, load.rateType);
    if (Array.isArray(load.fromLocations)) load.fromLocations.forEach((l: string) => fromSet.add(l));
    if (Array.isArray(load.toLocations)) load.toLocations.forEach((l: string) => toSet.add(l));
  }
  const fromLocs = Array.from(fromSet);
  const toLocs = Array.from(toSet);
  return {
    client: loads[0]?.client ?? "",
    rate: totalRevenue,
    fromLocations: fromLocs.length > 0 ? fromLocs : [],
    toLocations: toLocs.length > 0 ? toLocs : [],
  };
}

/**
 * Assert that a route's effective status is "planned" (editable).
 *
 * V1 rule for Board planning mutations: only "planned" routes may be modified.
 * undefined status means "planned" per legacy convention (confirmed throughout
 * codebase: `status || "planned"` is used in 14+ places).
 *
 * Explicitly rejects: completed, locked, and any other non-planned status.
 * Does NOT alter existing non-Board daily planner behavior globally — this
 * check is only used by planning lifecycle mutations.
 */
function assertEditableForPlanning(route: any) {
  const status = route.status || "planned";
  if (status !== "planned") {
    throw new Error(
      `Cannot modify route: status is "${status}", expected "planned". Board planning mutations require a planned route.`
    );
  }
}

/** Verify caller has region access to a document. */
function assertRegionAccess(
  scope: { role: string; region: string | null } | null,
  docRegion: string | undefined
) {
  if (scope?.role === "regional" && docRegion !== scope.region) {
    throw new Error("Access denied.");
  }
}

/**
 * Enforce same-region invariant: planningLoad.region MUST equal route.region.
 * Applies even to admin users who can access both regions.
 */
function assertSameRegion(
  planningLoadRegion: string,
  routeRegion: string | undefined,
  label: string
) {
  if (routeRegion !== planningLoadRegion) {
    throw new Error(
      `Cross-region allocation rejected: planning load is in "${planningLoadRegion}" but ${label} route is in "${routeRegion ?? "unassigned"}".`
    );
  }
}

/**
 * Safely parse a fleet number string into a number or undefined.
 * Returns undefined for empty, non-numeric, or NaN values.
 */
function safeFleetNo(str: string | undefined): number | undefined {
  if (!str || str.trim().length === 0) return undefined;
  const n = Number(str);
  return Number.isFinite(n) ? n : undefined;
}

/** Find the next routeOrder for a truck on a date. */
async function nextRouteOrder(
  ctx: any,
  routeDate: string,
  truckFleetNoStr: string
): Promise<number> {
  const existing = await ctx.db
    .query("dailyRoutes")
    .withIndex("by_routeDate_truckFleetNoStr", (q: any) =>
      q.eq("routeDate", routeDate).eq("truckFleetNoStr", truckFleetNoStr)
    )
    .collect();
  const ordered = existing
    .filter((r: any) => r.routeOrder != null && !(r as any).isDeleted)
    .map((r: any) => r.routeOrder as number);
  return ordered.length > 0 ? Math.max(...ordered) + 1 : 1;
}

/**
 * Remove a Board-created planned route and resequence sibling routeOrders.
 *
 * Returns true if the route was actually deleted, false if it was retained.
 *
 * Deletion conditions (all must hold):
 *   - planningSource === "board"
 *   - effective status === "planned"
 *   - route has zero loads
 *
 * Manual routes (planningSource !== "board") are never auto-deleted.
 * Locked/completed Board routes are never auto-deleted.
 */
async function removeEmptyBoardRoute(ctx: any, route: any): Promise<boolean> {
  if (route.planningSource !== "board") return false;
  const status = route.status || "planned";
  if (status !== "planned") return false;

  await ctx.db.delete(route._id);

  // Resequence remaining Board routes for this truck/date
  if (route.truckFleetNoStr && route.routeDate) {
    const remaining = await ctx.db
      .query("dailyRoutes")
      .withIndex("by_routeDate_truckFleetNoStr", (q: any) =>
        q.eq("routeDate", route.routeDate).eq("truckFleetNoStr", route.truckFleetNoStr)
      )
      .collect();
    const boardRoutes = remaining
      .filter((r: any) => r.planningSource === "board" && !(r as any).isDeleted && r.routeOrder != null)
      .sort((a: any, b: any) => (a.routeOrder ?? 0) - (b.routeOrder ?? 0));
    for (let i = 0; i < boardRoutes.length; i++) {
      const newOrder = i + 1;
      if (boardRoutes[i].routeOrder !== newOrder) {
        await ctx.db.patch(boardRoutes[i]._id, { routeOrder: newOrder });
      }
    }
  }

  return true;
}

/**
 * Reset route aggregates to a safe empty state.
 *
 * Used when a Board-managed load is removed and a manual route becomes empty.
 * We do NOT leave stale aggregates (old client, old revenue, old locations)
 * while loads = []. Instead, we reset to the zero values matching an empty
 * loads array — consistent with deriveTripAggregates([]).
 *
 * "Unknown" sentinel values are NOT used here because they would make empty
 * manual routes look like they have data. The empty array / zero values are
 * the honest representation.
 */
function resetAggregatesToEmpty() {
  return {
    client: "",
    rate: 0,
    fromLocations: [],
    toLocations: [],
    fromLocation: undefined,
  };
}

// ── Allocation Mutations ────────────────────────────────────────────────────

export const allocateToNewRoute = mutation({
  args: {
    planningLoadId: v.id("planningLoads"),
    truckFleetNoStr: v.string(),
    token: v.optional(v.union(v.string(), v.null())),
    driverName: v.optional(v.string()),
    trailerFleetNoStr: v.optional(v.string()),
    kilometers: v.optional(v.float64()),
    routeKilometers: v.optional(v.float64()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const scope = await resolveUserScope(ctx, args.token);

    // 1. Load planningLoad
    const planningLoad = await ctx.db.get(args.planningLoadId);
    if (!planningLoad) throw new Error("Planning load not found");

    // 2. Region access
    assertRegionAccess(scope, planningLoad.region);

    // 3. Must be unallocated
    if (planningLoad.status !== "unallocated") {
      throw new Error("Planning load is not unallocated.");
    }
    if (planningLoad.allocatedRouteId) {
      throw new Error("Planning load already allocated.");
    }

    // 4. Route region = planningLoad.region (not args.region)
    //    Regional users are already locked to their region via resolveUserScope.
    //    Admin users: the planning load's region is authoritative.
    const region = planningLoad.region;

    // 5. Convert planning load to route load
    const routeLoad = planningLoadToRouteLoad(planningLoad);

    // 6. Calculate aggregates
    const aggregates = deriveTripAggregates([routeLoad]);

    // 7. Calculate kilometers
    const finalKilometers = args.routeKilometers ?? args.kilometers ?? 0;

    // 8. Next routeOrder
    const routeOrder = await nextRouteOrder(
      ctx,
      planningLoad.loadDate,
      args.truckFleetNoStr
    );

    // 9. Safe fleet numbers
    const truckFleetNo = safeFleetNo(args.truckFleetNoStr);
    const trailerFleetNo = safeFleetNo(args.trailerFleetNoStr);

    // 10. Insert route
    const routeId = await ctx.db.insert("dailyRoutes", {
      routeDate: planningLoad.loadDate,
      driverName: args.driverName,
      region,
      client: aggregates.client,
      rate: aggregates.rate,
      fromLocations: aggregates.fromLocations,
      toLocations: aggregates.toLocations,
      kilometers: finalKilometers,
      routeKilometers: args.routeKilometers,
      notes: args.notes ?? "",
      truckFleetNoStr: args.truckFleetNoStr,
      truckFleetNo,
      trailerFleetNoStr: args.trailerFleetNoStr,
      trailerFleetNo,
      loads: [routeLoad],
      legs: [],
      createdAt: Date.now(),
      fromLocation: aggregates.fromLocations[0],
      status: "planned",
      routeOrder,
      planningSource: "board",
    });

    // 11. Update planningLoad
    await ctx.db.patch(args.planningLoadId, {
      status: "allocated",
      allocatedRouteId: routeId,
    });

    return { routeId, planningLoadId: args.planningLoadId, routeOrder };
  },
});

export const allocateToExistingRoute = mutation({
  args: {
    planningLoadId: v.id("planningLoads"),
    routeId: v.id("dailyRoutes"),
    token: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const scope = await resolveUserScope(ctx, args.token);

    // 1. Load planningLoad
    const planningLoad = await ctx.db.get(args.planningLoadId);
    if (!planningLoad) throw new Error("Planning load not found");

    // 2. Region access on planning load
    assertRegionAccess(scope, planningLoad.region);

    // 3. Must be unallocated
    if (planningLoad.status !== "unallocated") {
      throw new Error("Planning load is not unallocated.");
    }
    if (planningLoad.allocatedRouteId) {
      throw new Error("Planning load already allocated.");
    }

    // 4. Load destination route
    const route = await ctx.db.get(args.routeId);
    if (!route) throw new Error("Destination route not found.");

    // 5. Route region access
    assertRegionAccess(scope, route.region);

    // 6. Same-region invariant
    assertSameRegion(planningLoad.region, route.region, "destination");

    // 7. Date must match
    if (route.routeDate !== planningLoad.loadDate) {
      throw new Error("Route date does not match planning load date.");
    }

    // 8. Route must be editable (planned)
    assertEditableForPlanning(route);

    // 9. Check for duplicate loadId
    const loadId = String(planningLoad._id);
    const existing = (route.loads || []).find((l: any) => l.loadId === loadId);
    if (existing) {
      throw new Error("Planning load is already on this route.");
    }

    // 10. Convert and append
    const routeLoad = planningLoadToRouteLoad(planningLoad);
    const newLoads = [...(route.loads || []), routeLoad];
    const aggregates = deriveTripAggregates(newLoads);

    await ctx.db.patch(args.routeId, {
      loads: newLoads,
      client: aggregates.client,
      rate: aggregates.rate,
      fromLocations: aggregates.fromLocations,
      toLocations: aggregates.toLocations,
      fromLocation: aggregates.fromLocations[0],
    });

    // 11. Update planningLoad
    await ctx.db.patch(args.planningLoadId, {
      status: "allocated",
      allocatedRouteId: args.routeId,
    });

    return { routeId: args.routeId, planningLoadId: args.planningLoadId };
  },
});

export const deallocateLoad = mutation({
  args: {
    planningLoadId: v.id("planningLoads"),
    token: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const scope = await resolveUserScope(ctx, args.token);

    // 1. Load planningLoad
    const planningLoad = await ctx.db.get(args.planningLoadId);
    if (!planningLoad) throw new Error("Planning load not found");

    // 2. Region access
    assertRegionAccess(scope, planningLoad.region);

    // 3. Must be allocated
    if (planningLoad.status !== "allocated") {
      throw new Error("Planning load is not allocated.");
    }
    if (!planningLoad.allocatedRouteId) {
      throw new Error("Consistency error: allocated but no allocatedRouteId.");
    }

    // 4. Load route
    const route = await ctx.db.get(planningLoad.allocatedRouteId);
    if (!route) {
      // Route was deleted externally — reset planningLoad
      await ctx.db.patch(args.planningLoadId, {
        status: "unallocated",
        allocatedRouteId: undefined,
      });
      return { routeId: null, planningLoadId: args.planningLoadId, routeRemoved: false };
    }

    // 5. Route region access
    assertRegionAccess(scope, route.region);

    // 6. Route must be editable (planned)
    assertEditableForPlanning(route);

    // 7. Verify allocatedRouteId actually matches this route
    if (planningLoad.allocatedRouteId !== route._id) {
      throw new Error(
        `Consistency error: planningLoad.allocatedRouteId does not match route.`
      );
    }

    // 8. Find and remove load by loadId (NOT by index)
    const loadId = String(planningLoad._id);
    const loadIndex = (route.loads || []).findIndex((l: any) => l.loadId === loadId);
    if (loadIndex === -1) {
      throw new Error(
        "Consistency error: route does not contain a load with this planning load ID."
      );
    }

    const newLoads = (route.loads || []).filter((l: any) => l.loadId !== loadId);

    // 9. Handle empty route
    let routeRemoved = false;
    if (newLoads.length === 0) {
      // removeEmptyBoardRoute returns true if deleted, false if retained
      routeRemoved = await removeEmptyBoardRoute(ctx, route);

      // If route was retained (manual route), reset stale aggregates
      if (!routeRemoved) {
        const emptyAgg = resetAggregatesToEmpty();
        await ctx.db.patch(route._id, {
          loads: [],
          ...emptyAgg,
        });
      }
    } else {
      const aggregates = deriveTripAggregates(newLoads);
      await ctx.db.patch(planningLoad.allocatedRouteId, {
        loads: newLoads,
        client: aggregates.client,
        rate: aggregates.rate,
        fromLocations: aggregates.fromLocations,
        toLocations: aggregates.toLocations,
        fromLocation: aggregates.fromLocations[0],
      });
    }

    // 10. Update planningLoad
    await ctx.db.patch(args.planningLoadId, {
      status: "unallocated",
      allocatedRouteId: undefined,
    });

    return {
      routeId: planningLoad.allocatedRouteId,
      planningLoadId: args.planningLoadId,
      routeRemoved,
    };
  },
});

export const moveLoadBetweenRoutes = mutation({
  args: {
    planningLoadId: v.id("planningLoads"),
    destinationRouteId: v.id("dailyRoutes"),
    token: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const scope = await resolveUserScope(ctx, args.token);

    // 1. Load planningLoad
    const planningLoad = await ctx.db.get(args.planningLoadId);
    if (!planningLoad) throw new Error("Planning load not found");
    assertRegionAccess(scope, planningLoad.region);

    // 2. Must be allocated
    if (planningLoad.status !== "allocated") {
      throw new Error("Planning load is not allocated.");
    }
    if (!planningLoad.allocatedRouteId) {
      throw new Error("Consistency error: allocated but no allocatedRouteId.");
    }

    // 3. Same route — no-op
    if (planningLoad.allocatedRouteId === args.destinationRouteId) {
      return {
        sourceRouteId: args.destinationRouteId,
        destinationRouteId: args.destinationRouteId,
        planningLoadId: args.planningLoadId,
        sourceRemoved: false,
      };
    }

    // 4. Load source route
    const sourceRoute = await ctx.db.get(planningLoad.allocatedRouteId);
    if (!sourceRoute) {
      throw new Error("Source route not found.");
    }
    assertRegionAccess(scope, sourceRoute.region);
    assertEditableForPlanning(sourceRoute);

    // 5. Same-region: source route must match planningLoad region
    assertSameRegion(planningLoad.region, sourceRoute.region, "source");

    // 6. Load destination route
    const destRoute = await ctx.db.get(args.destinationRouteId);
    if (!destRoute) throw new Error("Destination route not found.");
    assertRegionAccess(scope, destRoute.region);
    assertEditableForPlanning(destRoute);

    // 7. Same-region: destination must match planningLoad region
    assertSameRegion(planningLoad.region, destRoute.region, "destination");

    // 8. Date must match
    if (destRoute.routeDate !== planningLoad.loadDate) {
      throw new Error("Destination route date does not match planning load date.");
    }

    // 9. Find load in source by loadId
    const loadId = String(planningLoad._id);
    const sourceLoad = (sourceRoute.loads || []).find((l: any) => l.loadId === loadId);
    if (!sourceLoad) {
      throw new Error(
        "Consistency error: source route does not contain a load with this planning load ID."
      );
    }

    // 10. Check destination doesn't already have it
    const destDuplicate = (destRoute.loads || []).find((l: any) => l.loadId === loadId);
    if (destDuplicate) {
      throw new Error("Planning load is already on the destination route.");
    }

    // 11. Remove from source
    const newSourceLoads = (sourceRoute.loads || []).filter((l: any) => l.loadId !== loadId);

    // 12. Append to destination
    const newDestLoads = [...(destRoute.loads || []), sourceLoad];

    // 13. Handle empty source
    let sourceRemoved = false;
    if (newSourceLoads.length === 0) {
      sourceRemoved = await removeEmptyBoardRoute(ctx, sourceRoute);

      // If source was retained (manual route), reset stale aggregates
      if (!sourceRemoved) {
        const emptyAgg = resetAggregatesToEmpty();
        await ctx.db.patch(sourceRoute._id, {
          loads: [],
          ...emptyAgg,
        });
      }
    } else {
      const sourceAggregates = deriveTripAggregates(newSourceLoads);
      await ctx.db.patch(sourceRoute._id, {
        loads: newSourceLoads,
        client: sourceAggregates.client,
        rate: sourceAggregates.rate,
        fromLocations: sourceAggregates.fromLocations,
        toLocations: sourceAggregates.toLocations,
        fromLocation: sourceAggregates.fromLocations[0],
      });
    }

    // 14. Recalculate destination
    const destAggregates = deriveTripAggregates(newDestLoads);
    await ctx.db.patch(destRoute._id, {
      loads: newDestLoads,
      client: destAggregates.client,
      rate: destAggregates.rate,
      fromLocations: destAggregates.fromLocations,
      toLocations: destAggregates.toLocations,
      fromLocation: destAggregates.fromLocations[0],
    });

    // 15. Update planningLoad reference
    await ctx.db.patch(args.planningLoadId, {
      allocatedRouteId: args.destinationRouteId,
    });

    return {
      sourceRouteId: sourceRoute._id,
      destinationRouteId: destRoute._id,
      planningLoadId: args.planningLoadId,
      sourceRemoved,
    };
  },
});

export const moveLoadToNewRoute = mutation({
  args: {
    planningLoadId: v.id("planningLoads"),
    truckFleetNoStr: v.string(),
    token: v.optional(v.union(v.string(), v.null())),
    driverName: v.optional(v.string()),
    trailerFleetNoStr: v.optional(v.string()),
    kilometers: v.optional(v.float64()),
    routeKilometers: v.optional(v.float64()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const scope = await resolveUserScope(ctx, args.token);

    // 1. Load planningLoad
    const planningLoad = await ctx.db.get(args.planningLoadId);
    if (!planningLoad) throw new Error("Planning load not found");
    assertRegionAccess(scope, planningLoad.region);

    // 2. Must be allocated
    if (planningLoad.status !== "allocated") {
      throw new Error("Planning load is not allocated.");
    }
    if (!planningLoad.allocatedRouteId) {
      throw new Error("Consistency error: allocated but no allocatedRouteId.");
    }

    // 3. Load source route
    const sourceRoute = await ctx.db.get(planningLoad.allocatedRouteId);
    if (!sourceRoute) {
      throw new Error("Source route not found.");
    }
    assertRegionAccess(scope, sourceRoute.region);
    assertEditableForPlanning(sourceRoute);

    // 4. Same-region: source must match planningLoad region
    assertSameRegion(planningLoad.region, sourceRoute.region, "source");

    // 5. Find load in source
    const loadId = String(planningLoad._id);
    const sourceLoad = (sourceRoute.loads || []).find((l: any) => l.loadId === loadId);
    if (!sourceLoad) {
      throw new Error(
        "Consistency error: source route does not contain a load with this planning load ID."
      );
    }

    // 6. Remove from source
    const newSourceLoads = (sourceRoute.loads || []).filter((l: any) => l.loadId !== loadId);

    // 7. Handle empty source
    let sourceRemoved = false;
    if (newSourceLoads.length === 0) {
      sourceRemoved = await removeEmptyBoardRoute(ctx, sourceRoute);

      // If source was retained (manual route), reset stale aggregates
      if (!sourceRemoved) {
        const emptyAgg = resetAggregatesToEmpty();
        await ctx.db.patch(sourceRoute._id, {
          loads: [],
          ...emptyAgg,
        });
      }
    } else {
      const sourceAggregates = deriveTripAggregates(newSourceLoads);
      await ctx.db.patch(sourceRoute._id, {
        loads: newSourceLoads,
        client: sourceAggregates.client,
        rate: sourceAggregates.rate,
        fromLocations: sourceAggregates.fromLocations,
        toLocations: sourceAggregates.toLocations,
        fromLocation: sourceAggregates.fromLocations[0],
      });
    }

    // 8. Create new route — region = planningLoad.region (authoritative)
    const region = planningLoad.region;

    const routeOrder = await nextRouteOrder(
      ctx,
      planningLoad.loadDate,
      args.truckFleetNoStr
    );

    const truckFleetNo = safeFleetNo(args.truckFleetNoStr);
    const trailerFleetNo = safeFleetNo(args.trailerFleetNoStr);

    const destAggregates = deriveTripAggregates([sourceLoad]);
    const finalKilometers = args.routeKilometers ?? args.kilometers ?? 0;

    const destRouteId = await ctx.db.insert("dailyRoutes", {
      routeDate: planningLoad.loadDate,
      driverName: args.driverName,
      region,
      client: destAggregates.client,
      rate: destAggregates.rate,
      fromLocations: destAggregates.fromLocations,
      toLocations: destAggregates.toLocations,
      kilometers: finalKilometers,
      routeKilometers: args.routeKilometers,
      notes: args.notes ?? "",
      truckFleetNoStr: args.truckFleetNoStr,
      truckFleetNo,
      trailerFleetNoStr: args.trailerFleetNoStr,
      trailerFleetNo,
      loads: [sourceLoad],
      legs: [],
      createdAt: Date.now(),
      fromLocation: destAggregates.fromLocations[0],
      status: "planned",
      routeOrder,
      planningSource: "board",
    });

    // 9. Update planningLoad
    await ctx.db.patch(args.planningLoadId, {
      allocatedRouteId: destRouteId,
    });

    return {
      sourceRouteId: sourceRoute._id,
      destinationRouteId: destRouteId,
      planningLoadId: args.planningLoadId,
      sourceRemoved,
      routeOrder,
    };
  },
});

export const reorderRoutes = mutation({
  args: {
    routeDate: v.string(),
    truckFleetNoStr: v.string(),
    orderedRouteIds: v.array(v.id("dailyRoutes")),
    token: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const scope = await resolveUserScope(ctx, args.token);

    if (args.orderedRouteIds.length === 0) {
      throw new Error("At least one route ID is required.");
    }

    // Check for duplicates in input
    const uniqueIds = new Set(args.orderedRouteIds.map(String));
    if (uniqueIds.size !== args.orderedRouteIds.length) {
      throw new Error("Duplicate route IDs in reorder list.");
    }

    // ── Full-set validation: query the actual eligible Board routes ─────────
    const allRoutesForTruckDate = await ctx.db
      .query("dailyRoutes")
      .withIndex("by_routeDate_truckFleetNoStr", (q: any) =>
        q.eq("routeDate", args.routeDate).eq("truckFleetNoStr", args.truckFleetNoStr)
      )
      .collect();

    // Filter to eligible routes: Board source, not deleted, planned status
    const eligibleRoutes = allRoutesForTruckDate.filter((r: any) => {
      if ((r as any).isDeleted) return false;
      if (r.planningSource !== "board") return false;
      const status = r.status || "planned";
      if (status !== "planned") return false;
      return true;
    });

    const eligibleIds = new Set(eligibleRoutes.map((r: any) => String(r._id)));
    const inputIds = new Set(args.orderedRouteIds.map(String));

    // Reject if an eligible route is missing from input
    for (const eligibleId of eligibleIds) {
      if (!inputIds.has(eligibleId)) {
        throw new Error(
          `Incomplete reorder set: eligible route ${eligibleId} is missing from the reorder list. Supply all Board routes for this truck/date.`
        );
      }
    }

    // Reject if input contains an extra route not in the eligible set
    for (const inputId of inputIds) {
      if (!eligibleIds.has(inputId)) {
        throw new Error(
          `Invalid route ${inputId} in reorder list: not an eligible Board route for this truck/date.`
        );
      }
    }

    // Load and validate all routes (access, region, non-Board rejection)
    const routes = [];
    for (const id of args.orderedRouteIds) {
      const route = await ctx.db.get(id);
      if (!route) throw new Error(`Route ${id} not found.`);
      assertRegionAccess(scope, route.region);
      if (route.planningSource !== "board") {
        throw new Error(`Route ${id} is not a Board-created route.`);
      }
      assertEditableForPlanning(route);
      routes.push(route);
    }

    // Assign new sequential routeOrder (no duplicates possible — set enforced above)
    for (let i = 0; i < routes.length; i++) {
      const newOrder = i + 1;
      if (routes[i].routeOrder !== newOrder) {
        await ctx.db.patch(routes[i]._id, { routeOrder: newOrder });
      }
    }

    return { reordered: routes.length };
  },
});
