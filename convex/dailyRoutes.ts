 
import { mutation, query, action, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { calculateLoadAmount } from "./utils";
import { resolveUserScope, resolveEffectiveRegion } from "./userSessions";

// Helper to Centralize logic 
function deriveTripAggregates(loads: any[]) {
  // Defensive defaults 
  if (!loads || loads.length === 0) {
    return {
      client: "",
      rate: 0,
      fromLocations: [],
      toLocations: [],
    };
  }

  let totalRevenue = 0;
  const fromSet = new Set<string>();
  const toSet = new Set<string>();

  for (const load of loads) {
    // Revenue 
    // Defensive parsing: replace comma with dot before parsing 
    const rateStr = String(load.rate || "").replace(",", ".");
    const qtyStr = String(load.quantity || "").replace(",", ".");

    const r = parseFloat(rateStr) || 0;
    const q = parseFloat(qtyStr) || 0;

    totalRevenue += calculateLoadAmount(q, r, load.rateType);

    // Locations 
    if (Array.isArray(load.fromLocations)) {
      load.fromLocations.forEach((l: string) => fromSet.add(l));
    }

    if (Array.isArray(load.toLocations)) {
      load.toLocations.forEach((l: string) => toSet.add(l));
    }
  }

  // Fallback if empty locations 
  const fromLocs = Array.from(fromSet);
  const toLocs = Array.from(toSet);

  return {
    client: loads[0]?.client ?? "",
    rate: totalRevenue,
    fromLocations: fromLocs.length > 0 ? fromLocs : ["Unknown"],
    toLocations: toLocs.length > 0 ? toLocs : ["Unknown"],
  };
}

// Helper: Auto-complete Logic
// Helper: Generate auto-notes for subcontractor routes
async function generateSubNotes(
  ctx: any,
  subcontractorId: string | undefined,
  truckFleetNoStr: string | undefined,
  driverName: string | undefined,
  loads?: any[]
): Promise<string | undefined> {
  if (!subcontractorId) return undefined;

  const parts: string[] = [];

  // Look up subcontractor company name
  const sub = await ctx.db.get(subcontractorId);
  if (sub?.companyName) parts.push(sub.companyName);

  // Look up truck registration by fleet number string
  if (truckFleetNoStr) {
    const truck = await ctx.db
      .query("trucks")
      .filter((q: any) => q.eq(q.field("truckFleetNoStr"), truckFleetNoStr))
      .first();
    if (truck?.registration) parts.push(truck.registration);
  }

  // Look up driver phone
  if (driverName) {
    const driver = await ctx.db
      .query("drivers")
      .filter((q: any) => q.eq(q.field("driverName"), driverName))
      .first();
    if (driver?.phone) parts.push(driver.phone);
  }

  // Calculate total subcontractor cost from loads
  if (loads && loads.length > 0) {
    let totalSubCost = 0;
    for (const load of loads) {
      if (load.subcontractorRate) {
        const q = parseFloat(load.quantity) || 0;
        const r = parseFloat(load.subcontractorRate) || 0;
        const rateType = load.subcontractorRateType || "per_unit";
        totalSubCost += calculateLoadAmount(q, r, rateType);
      }
    }
    if (totalSubCost > 0) {
      // Use simple ZAR formatting (avoid toLocaleString which can be unreliable in Convex runtime)
      const formatted = `R ${totalSubCost.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, " ")}`;
      parts.push(`Sub cost: ${formatted}`);
    }
  }

  if (parts.length === 0) return undefined;
  return parts.join(" / ").toUpperCase();
}

function shouldAutoComplete(loads: any[]) {
  if (!loads || loads.length === 0) return false;

  return loads.every((load) => {
    const hasClient = load.client && load.client.trim().length > 0;
    const hasFrom =
      load.fromLocations &&
      load.fromLocations.length > 0 &&
      load.fromLocations[0].trim().length > 0;
    const hasTo =
      load.toLocations &&
      load.toLocations.length > 0 &&
      load.toLocations[0].trim().length > 0;

    const r = parseFloat(load.rate || "0");
    const q = parseFloat(load.quantity || "0");
    const amount = calculateLoadAmount(q, r, load.rateType);

    // We consider it filled if it has basic details and non-zero value
    return hasClient && hasFrom && hasTo && amount > 0;
  });
}

export const listAllRoutes = query({
  args: {
    token: v.optional(v.union(v.string(), v.null())),
    region: v.optional(v.union(v.literal("garden_route"), v.literal("eastern_cape"))),
  },
  handler: async (ctx, args) => {
    const region = await resolveEffectiveRegion(ctx, args.token, args.region);
    const routes = await ctx.db.query("dailyRoutes").collect();
    return region ? routes.filter((r) => r.region === region) : routes;
  },
});

export const createDailyRoute = mutation({
  args: {
    routeDate: v.string(),
    driverName: v.string(),
    region: v.optional(v.union(v.literal("garden_route"), v.literal("eastern_cape"))),
    token: v.optional(v.union(v.string(), v.null())),
    // fromLocations/toLocations removed from args, calculated from loads 
    kilometers: v.number(),
    routeKilometers: v.optional(v.number()), // New route-level KM
    notes: v.optional(v.string()),
    subcontractorId: v.optional(v.id("subcontractors")),
    truckFleetNo: v.optional(v.string()), // Canonical
    truckFleetNoStr: v.optional(v.string()), // Legacy
    trailerFleetNoStr: v.optional(v.string()),

    // New: multiple loads 
    loads: v.array(
      v.object({
        client: v.string(),
        quantity: v.string(),
        quantityType: v.string(),
        rate: v.string(),
        rateType: v.string(),
        fromLocations: v.array(v.string()),
        toLocations: v.array(v.string()),
        kilometers: v.optional(v.number()),
        loadId: v.optional(v.string()),
        subcontractorRate: v.optional(v.string()),
        subcontractorRateType: v.optional(v.string()),
      })
    ),

    // Legs (Physical Journey Segments)
    legs: v.optional(v.array(
      v.object({
        from: v.string(),
        to: v.string(),
        kilometers: v.number(),
        order: v.number(),
      })
    )),
  },
  handler: async (ctx, args) => {
    console.log("📥 MUTATION HIT", args); // DEBUG LOG 

    const scope = await resolveUserScope(ctx, args.token);
    // Regional users are forced to their own region (never trusted from client)
    const region = scope?.role === "regional" ? (scope.region ?? "garden_route") : (args.region ?? "garden_route");

    const truckIdentifier = args.truckFleetNo ?? args.truckFleetNoStr;
    if (!truckIdentifier || truckIdentifier.trim().length === 0) {
      throw new Error("truckFleetNo must be a non-empty string");
    }

    // Normalize Loads: Enforce Flat Rate Logic (Qty 0 -> 1)
    // REMOVED: We now support explicit rateType "flat" or "per_unit"
    // Quantity is kept as is (informational for flat rates)
    const normalizedLoads = args.loads;

    const now = Date.now();
    const aggregates = deriveTripAggregates(normalizedLoads);

    // Auto-calculate kilometers (Priority: Route KM > Legs > Max Load KM > Legacy Input)
    let finalKilometers = args.kilometers;
    
    // Check Max Load KM
    const maxLoadKm = normalizedLoads.reduce((max, load) => Math.max(max, load.kilometers || 0), 0);
    if (maxLoadKm > 0) finalKilometers = maxLoadKm;

    // Check Legs
    if (args.legs && args.legs.length > 0) {
      finalKilometers = args.legs.reduce((sum, leg) => sum + leg.kilometers, 0);
    }

    // Check Explicit Route KM (Highest Priority)
    if (args.routeKilometers !== undefined) {
      finalKilometers = args.routeKilometers;
    }

    // Safe Fleet Number Logic 
    const rawFleetNo = Number(truckIdentifier);
    const safeFleetNo = Number.isFinite(rawFleetNo) ? rawFleetNo : undefined;

    const id = await ctx.db.insert("dailyRoutes", {
      routeDate: args.routeDate,
      driverName: args.driverName,
      region,

      // 🔐 derived, never trusted from UI 
      client: aggregates.client,
      rate: aggregates.rate,
      fromLocations: aggregates.fromLocations,
      toLocations: aggregates.toLocations,

      subcontractorId: args.subcontractorId,
      kilometers: finalKilometers,
      routeKilometers: args.routeKilometers,
      notes: args.notes ?? "",
      truckFleetNoStr: truckIdentifier,
      trailerFleetNoStr: args.trailerFleetNoStr,

      loads: normalizedLoads,
      legs: args.legs,

      createdAt: now,
      fromLocation: aggregates.fromLocations[0], // Single location legacy field 
      truckFleetNo: safeFleetNo,
      trailerFleetNo: args.trailerFleetNoStr
        ? Number(args.trailerFleetNoStr)
        : 0,
      
      // Auto-complete if all loads are valid
      status: shouldAutoComplete(normalizedLoads) ? "completed" : "planned",
    });

    // Auto-generate notes for subcontractor routes (only if not manually set and autoSubNotes enabled)
    if (args.subcontractorId && !args.notes) {
      const appSettings = await ctx.db.query("appSettings").first();
      const autoSubNotes = (appSettings as any)?.autoSubNotes;
      if (autoSubNotes !== false) {
        const subNotes = await generateSubNotes(ctx, args.subcontractorId, truckIdentifier, args.driverName, normalizedLoads);
        if (subNotes) {
          await ctx.db.patch(id, { notes: subNotes });
        }
      }
    }

    return id;
  },
});

export const createBulkDailyRoutes = mutation({
  args: {
    region: v.optional(v.union(v.literal("garden_route"), v.literal("eastern_cape"))),
    token: v.optional(v.union(v.string(), v.null())),
    routes: v.array(
      v.object({
        routeDate: v.string(),
        driverName: v.string(),
        kilometers: v.number(),
        routeKilometers: v.optional(v.number()),
        notes: v.optional(v.string()),
        truckFleetNo: v.optional(v.string()),
        truckFleetNoStr: v.optional(v.string()),
        trailerFleetNoStr: v.optional(v.string()),
        isSplit: v.optional(v.boolean()),
        loads: v.array(
          v.object({
            client: v.string(),
            quantity: v.string(),
            quantityType: v.string(),
            rate: v.string(),
            rateType: v.string(),
            fromLocations: v.array(v.string()),
            toLocations: v.array(v.string()),
            kilometers: v.optional(v.number()),
            loadId: v.optional(v.string()),
          })
        ),
      })
    ),
  },
  handler: async (ctx, args) => {
    const scope = await resolveUserScope(ctx, args.token);
    // Regional users are forced to their own region (never trusted from client).
    // Admins must always pass an explicit region — silently defaulting to
    // garden_route would save loads to the wrong region.
    let region: "garden_route" | "eastern_cape";
    if (scope?.role === "regional") {
      region = scope.region ?? "garden_route";
    } else {
      if (!args.region) throw new Error("Region is required when importing as admin.");
      region = args.region;
    }
    const now = Date.now();
    const createdIds = [];

    for (const route of args.routes) {
      const truckIdentifier = route.truckFleetNo ?? route.truckFleetNoStr;
      if (!truckIdentifier || truckIdentifier.trim().length === 0) {
        continue; // Skip invalid rows
      }

      const normalizedLoads = route.loads;
      const aggregates = deriveTripAggregates(normalizedLoads);

      let finalKilometers = route.kilometers;
      const maxLoadKm = normalizedLoads.reduce((max, load) => Math.max(max, load.kilometers || 0), 0);
      if (maxLoadKm > 0) finalKilometers = maxLoadKm;
      if (route.routeKilometers !== undefined) finalKilometers = route.routeKilometers;

      const rawFleetNo = Number(truckIdentifier);
      const safeFleetNo = Number.isFinite(rawFleetNo) ? rawFleetNo : undefined;

      const id = await ctx.db.insert("dailyRoutes", {
        routeDate: route.routeDate,
        driverName: route.driverName,
        region,
        client: aggregates.client,
        rate: aggregates.rate,
        fromLocations: aggregates.fromLocations,
        toLocations: aggregates.toLocations,
        kilometers: finalKilometers,
        routeKilometers: route.routeKilometers,
        notes: route.notes ?? "",
        truckFleetNoStr: truckIdentifier,
        trailerFleetNoStr: route.trailerFleetNoStr,
        loads: normalizedLoads,
        legs: [],
        createdAt: now,
        fromLocation: aggregates.fromLocations[0],
        truckFleetNo: safeFleetNo,
        trailerFleetNo: route.trailerFleetNoStr ? Number(route.trailerFleetNoStr) : 0,
        status: shouldAutoComplete(normalizedLoads) ? "completed" : "planned",
      });
      createdIds.push(id);
    }
    return createdIds;
  },
});

export const getRoutesByDate = query({
  args: {
    routeDate: v.string(),
    token: v.optional(v.union(v.string(), v.null())), region: v.optional(v.union(v.literal("garden_route"), v.literal("eastern_cape"))),
  },
  handler: async (ctx, args) => {
    const region = await resolveEffectiveRegion(ctx, args.token, args.region);
    const routes = await ctx.db
      .query("dailyRoutes")
      .withIndex("by_routeDate_truckFleetNoStr", (q) =>
        q.eq("routeDate", args.routeDate)
      )
      .collect();

    // Filter out deleted routes + region scope
    const activeRoutes = routes.filter((r) => !(r as any).isDeleted && (!region || r.region === region));

    activeRoutes.sort((a, b) => {
      const aTruck = a.truckFleetNoStr ?? "";
      const bTruck = b.truckFleetNoStr ?? "";
      const truckCompare = aTruck.localeCompare(bTruck);
      if (truckCompare !== 0) {
        return truckCompare;
      }
      return a.createdAt - b.createdAt;
    });

    return activeRoutes;
  },
});

export const getForSheets = query({
  args: {
    startDate: v.string(),
    endDate: v.string(),
    token: v.optional(v.union(v.string(), v.null())), region: v.optional(v.union(v.literal("garden_route"), v.literal("eastern_cape"))),
  },
  handler: async (ctx, args) => {
    const region = await resolveEffectiveRegion(ctx, args.token, args.region);
    const routes = await ctx.db
      .query("dailyRoutes")
      .withIndex("by_routeDate_truckFleetNoStr", (q) =>
        q.gte("routeDate", args.startDate).lte("routeDate", args.endDate)
      )
      .collect();

    // Filter out deleted routes + region scope
    const activeRoutes = routes.filter((r) => !(r as any).isDeleted && (!region || r.region === region));

    // Sort by Date -> Truck -> CreatedAt
    activeRoutes.sort((a, b) => {
      const dateCompare = a.routeDate.localeCompare(b.routeDate);
      if (dateCompare !== 0) return dateCompare;

      const aTruck = a.truckFleetNoStr ?? "";
      const bTruck = b.truckFleetNoStr ?? "";
      const truckCompare = aTruck.localeCompare(bTruck);
      if (truckCompare !== 0) {
        return truckCompare;
      }
      return a.createdAt - b.createdAt;
    });

    return activeRoutes;
  },
});

export const getById = query({
  args: { id: v.id("dailyRoutes"), token: v.optional(v.union(v.string(), v.null())), region: v.optional(v.union(v.literal("garden_route"), v.literal("eastern_cape"))) },
  handler: async (ctx, args) => {
    const region = await resolveEffectiveRegion(ctx, args.token, args.region);
    const doc = await ctx.db.get(args.id);
    if (!doc) {
      throw new Error("Document not found");
    }
    // Regional users can only read routes in their own region
    if (region && doc.region !== region) {
      throw new Error("Document not found");
    }
    return doc;
  },
});

export const getRoutesByTruckAndDate = query({
  args: {
    routeDate: v.string(),
    truckFleetNoStr: v.optional(v.string()),
    truckFleetNo: v.optional(v.string()),
    token: v.optional(v.union(v.string(), v.null())), region: v.optional(v.union(v.literal("garden_route"), v.literal("eastern_cape"))),
  },
  handler: async (ctx, args) => {
    const region = await resolveEffectiveRegion(ctx, args.token, args.region);
    const truckIdentifier = args.truckFleetNo ?? args.truckFleetNoStr;
    if (!truckIdentifier) {
      // If neither is provided, return empty list (or handle error)
      return [];
    }

    const routes = await ctx.db
      .query("dailyRoutes")
      .withIndex("by_routeDate_truckFleetNoStr", (q) =>
        q
          .eq("routeDate", args.routeDate)
          .eq("truckFleetNoStr", truckIdentifier)
      )
      .collect();

    // Filter out deleted routes + region scope
    const activeRoutes = routes.filter((r) => !(r as any).isDeleted && (!region || r.region === region));

    activeRoutes.sort((a, b) => a.createdAt - b.createdAt);

    return activeRoutes;
  },
});

export const listRecentRoutes = query({
  args: { limit: v.optional(v.number()), token: v.optional(v.union(v.string(), v.null())), region: v.optional(v.union(v.literal("garden_route"), v.literal("eastern_cape"))) },
  handler: async (ctx, args) => {
    const region = await resolveEffectiveRegion(ctx, args.token, args.region);
    const limit = args.limit ?? 50;
    const routes = await ctx.db
      .query("dailyRoutes")
      .order("desc")
      .take(limit * 4); // over-fetch so regional filtering doesn't starve the limit

    // Filter out deleted routes + region scope
    return routes
      .filter((r) => !(r as any).isDeleted && (!region || r.region === region))
      .slice(0, limit);
  },
});


export const markRouteCompleted = mutation({
  args: { id: v.id("dailyRoutes"), token: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, args) => {
    const route = await ctx.db.get(args.id);
    if (!route) {
      throw new Error("Route not found");
    }

    const scope = await resolveUserScope(ctx, args.token);
    if (scope?.role === "regional" && route.region !== scope.region) {
      throw new Error("Route not found");
    }

    // Default to "planned" if no status (backward compatibility)
    const currentStatus = (route as any).status || "planned";

    if (currentStatus !== "planned") {
      throw new Error(
        `Cannot mark as completed. Current status is '${currentStatus}', expected 'planned'.`
      );
    }

    await ctx.db.patch(args.id, {
      status: "completed",
    });
  },
});

export const lockRoute = mutation({
  args: { id: v.id("dailyRoutes"), token: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, args) => {
    const route = await ctx.db.get(args.id);
    if (!route) {
      throw new Error("Route not found");
    }

    const scope = await resolveUserScope(ctx, args.token);
    if (scope?.role === "regional" && route.region !== scope.region) {
      throw new Error("Route not found");
    }

    const currentStatus = (route as any).status;

    if (currentStatus !== "completed") {
      throw new Error(
        `Cannot lock route. Current status is '${currentStatus}', expected 'completed'.`
      );
    }

    await ctx.db.patch(args.id, {
      status: "locked",
    });
  },
});


export const updateDailyRoute = mutation({
  args: {
    id: v.id("dailyRoutes"),
    routeDate: v.string(),
    driverName: v.string(),
    region: v.optional(v.union(v.literal("garden_route"), v.literal("eastern_cape"))),
    token: v.optional(v.union(v.string(), v.null())),
    kilometers: v.number(),
    routeKilometers: v.optional(v.number()), // New route-level KM
    notes: v.optional(v.string()),
    subcontractorId: v.optional(v.id("subcontractors")),
    truckFleetNo: v.optional(v.string()), // Canonical
    truckFleetNoStr: v.string(),
    trailerFleetNoStr: v.optional(v.string()),
    loads: v.array(
      v.object({
        client: v.string(),
        quantity: v.string(),
        quantityType: v.string(),
        rate: v.string(),
        rateType: v.string(),
        fromLocations: v.array(v.string()),
        toLocations: v.array(v.string()),
        kilometers: v.optional(v.number()),
        loadId: v.optional(v.string()),
        subcontractorRate: v.optional(v.string()),
        subcontractorRateType: v.optional(v.string()),
      })
    ),
    legs: v.optional(v.array(
      v.object({
        from: v.string(),
        to: v.string(),
        kilometers: v.number(),
        order: v.number(),
      })
    )),
  },
  handler: async (ctx, args) => {
    if (args.truckFleetNoStr.trim().length === 0) {
      throw new Error("truckFleetNoStr must be a non-empty string");
    }

    if (args.loads.length === 0) {
      throw new Error("At least one load is required");
    }

    // Fetch existing route to check status
    const existingRoute = await ctx.db.get(args.id);
    if (!existingRoute) {
      throw new Error("Route not found");
    }

    const scope = await resolveUserScope(ctx, args.token);
    // Regional users can only edit routes in their own region; region is immutable for them
    if (scope?.role === "regional" && existingRoute.region !== scope.region) {
      throw new Error("Route not found");
    }
    const region = scope?.role === "regional" ? existingRoute.region : (args.region ?? existingRoute.region ?? "garden_route");

    const currentStatus = (existingRoute as any).status || "planned";
    if (currentStatus === "locked") {
      throw new Error("Cannot edit a locked route.");
    }

    // Normalize Loads: Enforce Flat Rate Logic (Qty 0 -> 1)
    // REMOVED: We now support explicit rateType "flat" or "per_unit"
    const normalizedLoads = args.loads;

    // Auto-complete Logic
    // If all loads are valid -> completed
    // If ANY load is invalid -> planned (reverts manual completion if data is bad)
    const newStatus = shouldAutoComplete(normalizedLoads) ? "completed" : "planned";

    const aggregates = deriveTripAggregates(normalizedLoads);

    // Auto-calculate kilometers (Priority: Route KM > Legs > Max Load KM > Legacy Input)
    let finalKilometers = args.kilometers;
    
    // Check Max Load KM
    const maxLoadKm = normalizedLoads.reduce((max, load) => Math.max(max, load.kilometers || 0), 0);
    if (maxLoadKm > 0) finalKilometers = maxLoadKm;

    // Check Legs
    if (args.legs && args.legs.length > 0) {
      finalKilometers = args.legs.reduce((sum, leg) => sum + leg.kilometers, 0);
    }

    // Check Explicit Route KM (Highest Priority)
    if (args.routeKilometers !== undefined) {
      finalKilometers = args.routeKilometers;
    }

    // Safe Fleet Number Logic
    const truckIdentifier = args.truckFleetNo ?? args.truckFleetNoStr;
    const rawFleetNo = Number(truckIdentifier);
    const safeFleetNo = Number.isFinite(rawFleetNo) ? rawFleetNo : undefined;

    await ctx.db.patch(args.id, {
      routeDate: args.routeDate,
      driverName: args.driverName,
      region,
      client: aggregates.client,
      rate: aggregates.rate,
      fromLocations: aggregates.fromLocations,
      toLocations: aggregates.toLocations,
      subcontractorId: args.subcontractorId,
      kilometers: finalKilometers,
      routeKilometers: args.routeKilometers,
      notes: args.notes ?? "",
      truckFleetNoStr: args.truckFleetNoStr,
      truckFleetNo: safeFleetNo,
      trailerFleetNoStr: args.trailerFleetNoStr,
      trailerFleetNo: args.trailerFleetNoStr ? Number(args.trailerFleetNoStr) : 0,
      loads: normalizedLoads,
      legs: args.legs,
      fromLocation: aggregates.fromLocations[0],
      status: newStatus,
    });

    // Auto-generate notes for subcontractor routes (only if not manually set and autoSubNotes enabled)
    if (args.subcontractorId && !args.notes) {
      const appSettings = await ctx.db.query("appSettings").first();
      const autoSubNotes = (appSettings as any)?.autoSubNotes;
      if (autoSubNotes !== false) {
        const subNotes = await generateSubNotes(ctx, args.subcontractorId, args.truckFleetNoStr, args.driverName, normalizedLoads);
        if (subNotes) {
          await ctx.db.patch(args.id, { notes: subNotes });
        }
      }
    }
  },
});

export const deleteDailyRoute = mutation({
  args: { id: v.id("dailyRoutes"), token: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, args) => {
    const route = await ctx.db.get(args.id);
    if (!route) {
      throw new Error("Route not found");
    }

    const scope = await resolveUserScope(ctx, args.token);
    if (scope?.role === "regional" && route.region !== scope.region) {
      throw new Error("Route not found");
    }

    const status = (route as any).status;
    if (status === "locked") {
      throw new Error("Cannot delete a locked route.");
    }

    await ctx.db.delete(args.id);
  },
});

export const deleteBulkDailyRoutes = mutation({
  args: { ids: v.array(v.id("dailyRoutes")), token: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, args) => {
    const scope = await resolveUserScope(ctx, args.token);
    for (const id of args.ids) {
      const route = await ctx.db.get(id);
      if (!route) continue;
      if (scope?.role === "regional" && route.region !== scope.region) continue;

      const status = (route as any).status;
      if (status === "locked") {
        throw new Error(`Cannot delete locked route ${id}. Operation aborted.`);
      }

      await ctx.db.delete(id);
    }
  },
});

export const unlockRoute = mutation({
  args: { id: v.id("dailyRoutes"), token: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, args) => {
    const route = await ctx.db.get(args.id);
    if (!route) {
      throw new Error("Route not found");
    }

    const scope = await resolveUserScope(ctx, args.token);
    if (scope?.role === "regional" && route.region !== scope.region) {
      throw new Error("Route not found");
    }

    const currentStatus = (route as any).status;
    if (currentStatus !== "locked") {
      throw new Error("Route is not locked.");
    }

    // Unlocking reverts status to completed
    await ctx.db.patch(args.id, {
      status: "completed",
    });
  },
});

export const getLoadsForEmailReport = query({
  args: {
    startDate: v.string(),
    endDate: v.string(),
    token: v.optional(v.union(v.string(), v.null())), region: v.optional(v.union(v.literal("garden_route"), v.literal("eastern_cape"))),
  },
  handler: async (ctx, args) => {
    const region = await resolveEffectiveRegion(ctx, args.token, args.region);
    // 1) Fetch routes where date >= startDate AND date <= endDate
    // Using index "by_routeDate_truckFleetNoStr"
    const routes = await ctx.db
      .query("dailyRoutes")
      .withIndex("by_routeDate_truckFleetNoStr", (q) =>
        q.gte("routeDate", args.startDate).lte("routeDate", args.endDate)
      )
      .collect();

    // 2) Filter and Flatten
    // We manually collect items because we need to flatten the loads array
    // and also filter by status which is not in the index.
    const flattenedLoads: any[] = [];

    for (const route of routes) {
      // Exclude deleted routes + out-of-region routes
      if ((route as any).isDeleted) continue;
      if (region && route.region !== region) continue;

      // Check Status: Must be "completed" or "locked"
      const status = (route as any).status || "planned";
      if (status !== "completed" && status !== "locked") {
        continue;
      }

      // Check Loads
      if (route.loads && Array.isArray(route.loads)) {
        route.loads.forEach((load, index) => {
          if (!load) return;

          // Calculate Amount using shared logic
          const q = parseFloat(load.quantity) || 0;
          const r = parseFloat(load.rate) || 0;
          const amountVal = calculateLoadAmount(q, r, load.rateType);
          const amount = amountVal.toFixed(2);

          flattenedLoads.push({
            routeDate: route.routeDate,
            truckFleetNo: route.truckFleetNoStr,
            driverName: route.driverName,
            clientName: load.client,
            fromLocation: load.fromLocations?.[0] || "",
            toLocation: load.toLocations?.[0] || "",
            quantity: load.quantity,
            rate: load.rate,
            amount: amount,
            loadId: `${route._id}_${index}`,
            distance: route.kilometers, // Add route distance to load

            // Internal fields for sorting
            _routeId: route._id,
            _sequence: index + 1,
          });
        });
      }
    }

    // 4) Sort results
    // routeDate ASC, routeId ASC, load.sequence ASC
    flattenedLoads.sort((a, b) => {
      // 1. routeDate
      const dateCompare = a.routeDate.localeCompare(b.routeDate);
      if (dateCompare !== 0) return dateCompare;

      // 2. routeId
      const idCompare = a._routeId.localeCompare(b._routeId);
      if (idCompare !== 0) return idCompare;

      // 3. sequence
      return a._sequence - b._sequence;
    });

    // Remove internal fields before returning
    return flattenedLoads.map(({ _routeId, _sequence, ...rest }) => rest);
  },
});

export const getQuickSendReport = query({
  args: {
    startDate: v.string(),
    endDate: v.string(),
    completedOnly: v.optional(v.boolean()),
    token: v.optional(v.union(v.string(), v.null())), region: v.optional(v.union(v.literal("garden_route"), v.literal("eastern_cape"))),
  },
  handler: async (ctx, args) => {
    const region = await resolveEffectiveRegion(ctx, args.token, args.region);
    // 1. Validation (MANDATORY)
    const isValidDate = (d: string) => !isNaN(Date.parse(d));
    if (!isValidDate(args.startDate) || !isValidDate(args.endDate)) {
      throw new Error("Invalid date format provided. Please use YYYY-MM-DD.");
    }
    if (args.startDate > args.endDate) {
      throw new Error("Start date cannot be after end date.");
    }

    const routes = await ctx.db
      .query("dailyRoutes")
      .withIndex("by_routeDate_truckFleetNoStr", (q) =>
        q.gte("routeDate", args.startDate).lte("routeDate", args.endDate)
      )
      .collect();

    const loads: any[] = [];
    let totalRevenue = 0;
    let totalKm = 0;
    const processedRouteIds = new Set<string>();

    for (const route of routes) {
      // Exclude deleted routes + out-of-region routes
      if ((route as any).isDeleted) continue;
      if (region && route.region !== region) continue;

      const status = (route as any).status || "planned";

      // Filter based on completedOnly toggle
      // Default to TRUE (strict mode) if not specified, to preserve legacy behavior
      const completedOnly = args.completedOnly ?? true;
      
      if (completedOnly && status !== "completed" && status !== "locked") {
        continue;
      }

      // Kilometers are calculated per route and deduplicated by route ID.
      // If a route contains multiple loads, its distance is only counted once.
      if (!processedRouteIds.has(route._id)) {
        totalKm += route.kilometers || 0;
        processedRouteIds.add(route._id);
      }

      // Process Loads
      if (route.loads && Array.isArray(route.loads)) {
        route.loads.forEach((load, index) => {
          if (!load) return;

          const q = parseFloat(load.quantity) || 0;
          const r = parseFloat(load.rate) || 0;
          const amountVal = calculateLoadAmount(q, r, load.rateType);

          totalRevenue += amountVal;

          loads.push({
            routeDate: route.routeDate,
            truckFleetNo: route.truckFleetNoStr,
            trailerFleetNo: route.trailerFleetNoStr ?? route.trailerFleetNo?.toString() ?? "-",
            driverName: route.driverName,
            clientName: load.client,
            fromLocation: load.fromLocations || [],
            toLocation: load.toLocations || [],
            quantity: load.quantity,
            quantityType: load.quantityType,
            rate: load.rate,
            rateType: load.rateType,
            amount: amountVal, // Return number, formatting in UI/Email
            status: (route as any).status || "planned",
            notes: route.notes || "",
            _routeId: route._id,
            _sequence: index,
          });
        });
      }
    }

    // Sort: Date -> Truck -> Sequence
    loads.sort((a, b) => {
      const dateCompare = a.routeDate.localeCompare(b.routeDate);
      if (dateCompare !== 0) return dateCompare;

      const truckCompare = (a.truckFleetNo || "").localeCompare(b.truckFleetNo || "");
      if (truckCompare !== 0) return truckCompare;

      return a._sequence - b._sequence;
    });

    return {
      loads: loads.map(({ _routeId, _sequence, ...rest }) => rest),
      summary: {
        totalLoads: loads.length,
        totalKm: totalKm,
        totalRevenue: totalRevenue, // Return number
      },
    };
  },
});

export const getRecentRoutesByTruck = query({
  args: {
    truckFleetNoStr: v.string(),
    limit: v.optional(v.number()),
    token: v.optional(v.union(v.string(), v.null())), region: v.optional(v.union(v.literal("garden_route"), v.literal("eastern_cape"))),
  },
  handler: async (ctx, args) => {
    const region = await resolveEffectiveRegion(ctx, args.token, args.region);
    const limit = args.limit ?? 7;
    const all = await ctx.db
      .query("dailyRoutes")
      .withIndex("by_routeDate_truckFleetNoStr")
      .order("desc")
      .collect();

    return all
      .filter(
        (r) =>
          !(r as any).isDeleted &&
          r.truckFleetNoStr === args.truckFleetNoStr &&
          (!region || r.region === region)
      )
      .slice(0, limit)
      .reverse(); // oldest first for chart
  },
});

export const updateLoadFields = mutation({
  args: {
    routeId: v.id("dailyRoutes"),
    loadIndex: v.number(),
    token: v.optional(v.union(v.string(), v.null())),
    patch: v.object({
      client: v.optional(v.string()),
      quantity: v.optional(v.string()),
      rate: v.optional(v.string()),
      fromLocations: v.optional(v.array(v.string())),
      toLocations: v.optional(v.array(v.string())),
    }),
  },
  handler: async (ctx, args) => {
    const route = await ctx.db.get(args.routeId);
    if (!route) {
      throw new Error("Route not found");
    }

    const scope = await resolveUserScope(ctx, args.token);
    if (scope?.role === "regional" && route.region !== scope.region) {
      throw new Error("Route not found");
    }

    const currentStatus = (route as any).status || "planned";
    if (currentStatus === "locked") {
      throw new Error("Cannot edit a locked route.");
    }

    const loads = [...(route.loads || [])];
    if (args.loadIndex < 0 || args.loadIndex >= loads.length) {
      throw new Error("Invalid load index");
    }

    // Update the specific load
    loads[args.loadIndex] = {
      ...loads[args.loadIndex],
      ...args.patch,
    };

    // Recalculate aggregates
    const aggregates = deriveTripAggregates(loads);

    await ctx.db.patch(args.routeId, {
      loads,
      client: aggregates.client,
      rate: aggregates.rate,
      fromLocations: aggregates.fromLocations,
      toLocations: aggregates.toLocations,
      fromLocation: aggregates.fromLocations[0],
    });
  },
});
