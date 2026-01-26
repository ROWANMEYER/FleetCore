import { mutation, query, action, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { calculateLoadAmount } from "./utils";

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

export const createDailyRoute = mutation({
  args: {
    routeDate: v.string(),
    driverName: v.string(),
    // fromLocations/toLocations removed from args, calculated from loads 
    kilometers: v.number(),
    notes: v.optional(v.string()),
    truckFleetNoStr: v.string(),
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
    if (args.truckFleetNoStr.trim().length === 0) {
      throw new Error("truckFleetNoStr must be a non-empty string");
    }

    // Normalize Loads: Enforce Flat Rate Logic (Qty 0 -> 1)
    // REMOVED: We now support explicit rateType "flat" or "per_unit"
    // Quantity is kept as is (informational for flat rates)
    const normalizedLoads = args.loads;

    const now = Date.now();
    const aggregates = deriveTripAggregates(normalizedLoads);

    // Auto-calculate kilometers if legs are provided
    let finalKilometers = args.kilometers;
    if (args.legs && args.legs.length > 0) {
      finalKilometers = args.legs.reduce((sum, leg) => sum + leg.kilometers, 0);
    }

    // Safe Fleet Number Logic 
    const rawFleetNo = Number(args.truckFleetNoStr);
    const safeFleetNo = Number.isFinite(rawFleetNo) ? rawFleetNo : undefined;

    const id = await ctx.db.insert("dailyRoutes", {
      routeDate: args.routeDate,
      driverName: args.driverName,

      // 🔐 derived, never trusted from UI 
      client: aggregates.client,
      rate: aggregates.rate,
      fromLocations: aggregates.fromLocations,
      toLocations: aggregates.toLocations,

      kilometers: finalKilometers,
      notes: args.notes ?? "",
      truckFleetNoStr: args.truckFleetNoStr,
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

    return id;
  },
});

export const getRoutesByDate = query({
  args: {
    routeDate: v.string(),
  },
  handler: async (ctx, args) => {
    const routes = await ctx.db
      .query("dailyRoutes")
      .withIndex("by_routeDate_truckFleetNoStr", (q) =>
        q.eq("routeDate", args.routeDate)
      )
      .collect();

    // Filter out deleted routes
    const activeRoutes = routes.filter((r) => !(r as any).isDeleted);

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
  },
  handler: async (ctx, args) => {
    const routes = await ctx.db
      .query("dailyRoutes")
      .withIndex("by_routeDate_truckFleetNoStr", (q) =>
        q.gte("routeDate", args.startDate).lte("routeDate", args.endDate)
      )
      .collect();

    // Filter out deleted routes
    const activeRoutes = routes.filter((r) => !(r as any).isDeleted);

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
  args: { id: v.id("dailyRoutes") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const getRoutesByTruckAndDate = query({
  args: {
    routeDate: v.string(),
    truckFleetNoStr: v.string(),
  },
  handler: async (ctx, args) => {
    const routes = await ctx.db
      .query("dailyRoutes")
      .withIndex("by_routeDate_truckFleetNoStr", (q) =>
        q
          .eq("routeDate", args.routeDate)
          .eq("truckFleetNoStr", args.truckFleetNoStr)
      )
      .collect();

    // Filter out deleted routes
    const activeRoutes = routes.filter((r) => !(r as any).isDeleted);

    activeRoutes.sort((a, b) => a.createdAt - b.createdAt);

    return activeRoutes;
  },
});

export const listRecentRoutes = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;
    const routes = await ctx.db
      .query("dailyRoutes")
      .order("desc")
      .take(limit);

    // Filter out deleted routes
    return routes.filter((r) => !(r as any).isDeleted);
  },
});


export const markRouteCompleted = mutation({
  args: { id: v.id("dailyRoutes") },
  handler: async (ctx, args) => {
    const route = await ctx.db.get(args.id);
    if (!route) {
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
  args: { id: v.id("dailyRoutes") },
  handler: async (ctx, args) => {
    const route = await ctx.db.get(args.id);
    if (!route) {
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
    kilometers: v.number(),
    notes: v.optional(v.string()),
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

    // Auto-calculate kilometers if legs are provided
    let finalKilometers = args.kilometers;
    if (args.legs && args.legs.length > 0) {
      finalKilometers = args.legs.reduce((sum, leg) => sum + leg.kilometers, 0);
    }

    // Safe Fleet Number Logic
    const rawFleetNo = Number(args.truckFleetNoStr);
    const safeFleetNo = Number.isFinite(rawFleetNo) ? rawFleetNo : undefined;

    await ctx.db.patch(args.id, {
      routeDate: args.routeDate,
      driverName: args.driverName,
      client: aggregates.client,
      rate: aggregates.rate,
      fromLocations: aggregates.fromLocations,
      toLocations: aggregates.toLocations,
      kilometers: finalKilometers,
      notes: args.notes ?? "",
      truckFleetNoStr: args.truckFleetNoStr,
      trailerFleetNoStr: args.trailerFleetNoStr,
      loads: normalizedLoads,
      legs: args.legs,
      fromLocation: aggregates.fromLocations[0],
      truckFleetNo: safeFleetNo,
      trailerFleetNo: args.trailerFleetNoStr ? Number(args.trailerFleetNoStr) : 0,
      status: newStatus,
    });
  },
});

export const deleteDailyRoute = mutation({
  args: { id: v.id("dailyRoutes") },
  handler: async (ctx, args) => {
    const route = await ctx.db.get(args.id);
    if (!route) {
      throw new Error("Route not found");
    }

    const status = (route as any).status;
    if (status === "locked") {
      throw new Error("Cannot delete a locked route.");
    }

    // Soft Delete
    await ctx.db.patch(args.id, {
      isDeleted: true,
      deletedAt: Date.now(),
    });
  },
});

export const deleteBulkDailyRoutes = mutation({
  args: { ids: v.array(v.id("dailyRoutes")) },
  handler: async (ctx, args) => {
    const now = Date.now();
    for (const id of args.ids) {
      const route = await ctx.db.get(id);
      if (!route) continue;

      const status = (route as any).status;
      if (status === "locked") {
        throw new Error(`Cannot delete locked route ${id}. Operation aborted.`);
      }

      // Soft Delete
      await ctx.db.patch(id, {
        isDeleted: true,
        deletedAt: now,
      });
    }
  },
});

export const undoBulkDelete = mutation({
  args: { ids: v.array(v.id("dailyRoutes")) },
  handler: async (ctx, args) => {
    for (const id of args.ids) {
      const route = await ctx.db.get(id);
      if (!route) continue;

      // Check permission if needed (Role check can be here in future)

      await ctx.db.patch(id, {
        isDeleted: false,
        // We leave deletedAt as is or clear it if strictness required, 
        // but checking isDeleted=false is sufficient for queries.
      });
    }
  },
});

export const unlockRoute = mutation({
  args: { id: v.id("dailyRoutes") },
  handler: async (ctx, args) => {
    const route = await ctx.db.get(args.id);
    if (!route) {
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
  },
  handler: async (ctx, args) => {
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
      // Exclude deleted routes
      if ((route as any).isDeleted) continue;

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
  },
  handler: async (ctx, args) => {
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
      // Exclude deleted routes
      if ((route as any).isDeleted) continue;

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
