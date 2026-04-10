import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";

// 🔴 LIVE OPERATIONAL STATE
// 
// This file manages trucks.currentTrailerId - the CURRENT assignment of trailers to trucks.
// This field CHANGES whenever a swap occurs.
//
// ⏰ BASELINE STATE: fleetSetupBaseline collection
//    - Immutable snapshot of initial truck → trailer assignments
//    - Created once and locked to prevent overwrites
//    - Used to restore operational state via masterResetFleet()
//
// 📝 SWAP HISTORY: trailerSwaps collection
//    - Complete log of all trailer swap operations
//    - Separate from baseline and current operational state
//    - Used for audit trail and analytics
//
// SUMMARY:
// - trucks.currentTrailerId = TODAY'S operational state
// - fleetSetupBaseline = INITIAL baseline snapshot
// - trailerSwaps = HISTORICAL record of all changes

export const assignTrailer = mutation({
  args: {
    truckId: v.string(),
    trailerId: v.optional(v.id("trailers")),
  },
  handler: async (ctx, args) => {
    // 1️⃣ Remove trailer from any other truck
    const truckUsingTrailer = await ctx.db
      .query("trucks")
      .withIndex("by_currentTrailerId", (q) => q.eq("currentTrailerId", args.trailerId))
      .first();

    if (truckUsingTrailer) {
      await ctx.db.patch(truckUsingTrailer._id, {
        currentTrailerId: undefined,
      });
    }

    // 2️⃣ Clear existing trailer from selected truck (if any)
    const truckId = args.truckId as Id<"trucks">;
    const selectedTruck = await ctx.db.get(truckId);

    if (!selectedTruck) {
      throw new Error("Document not found");
    }

    if (selectedTruck.currentTrailerId) {
      await ctx.db.patch(selectedTruck._id, {
        currentTrailerId: undefined,
      });
    }

    // 3️⃣ Assign trailer to selected truck
    await ctx.db.patch(selectedTruck._id, {
      currentTrailerId: args.trailerId,
    });
  }
});

export const updateTruckTrailer = mutation({
  args: {
    truckId: v.id("trucks"),
    trailerId: v.optional(v.id("trailers")),
  },
  handler: async (ctx, args) => {
    const truck = await ctx.db.get(args.truckId);
    if (!truck) {
      throw new Error("Document not found");
    }

    await ctx.db.patch(args.truckId, {
      currentTrailerId: args.trailerId,
    });

    const updatedDoc = await ctx.db.get(args.truckId);
    if (!updatedDoc) {
      throw new Error("Document not found");
    }
    return updatedDoc;
  },
});

export const getAll = query({
  args: {},
  handler: async (ctx) => {
    const trucks = await ctx.db.query("trucks").collect();
    return trucks.map((t) => ({
      ...t,
      // number: t.truckFleetNo, // DEPRECATED: Use truckFleetNo directly
    }));
  },
});

export const getWithTrailers = query({
  args: {},
  handler: async (ctx) => {
    const trucks = await ctx.db.query("trucks").collect();
    const trailers = await ctx.db.query("trailers").collect();

    const trailerMap = Object.fromEntries(
      trailers.map(t => [t._id, t.trailerFleetNoStr])
    );

    return trucks.map(t => ({
      _id: t._id,
      truckFleetNo: t.truckFleetNo, // Canonical
      truckFleetNoStr: t.truckFleetNo, // Legacy support (temporarily kept if needed, but prefer canonical)
      trailerFleetNoStr: t.currentTrailerId ? (trailerMap[t.currentTrailerId] ?? null) : null
    }));
  },
});

export const getWithoutTrailers = query({
  args: {},
  handler: async (ctx) => {
    const trucks = await ctx.db.query("trucks").collect();
    return trucks.filter(
      (t) => t.currentTrailerId === undefined || t.currentTrailerId === null
    );
  },
});

export const getAllWithTrailer = query({
  args: {},
  handler: async (ctx) => {
    const trucks = await ctx.db.query("trucks").collect();
    const trailers = await ctx.db.query("trailers").collect();

    const trailerMap = Object.fromEntries(
      trailers.map(t => [t._id, t.trailerFleetNoStr])
    );

    return trucks
      .filter(t => t.currentTrailerId)
      .map(t => ({
        _id: t._id,
        truckFleetNo: t.truckFleetNo, // Canonical
        truckFleetNoStr: t.truckFleetNo, // Legacy
        trailerFleetNoStr: trailerMap[t.currentTrailerId!] ?? ""
      }));
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("trucks").collect();

    return rows;
  },
});

export const migrateTruckTrailerIds = mutation({
  args: {},
  handler: async (ctx) => {
    const trucks = await ctx.db.query("trucks").collect();
    const trailers = await ctx.db.query("trailers").collect();
    
    // Create maps for quick lookup
    const trailerById = new Map<string | Id<"trailers">, (typeof trailers)[number]>(trailers.map(t => [t._id, t]));
    const trailerByFleetNo = new Map(trailers.map(t => [t.trailerFleetNoStr, t]));
    
    let updated = 0;
    let cleared = 0;
    let unchanged = 0;
    const unmatchedValues: string[] = [];
    
    for (const truck of trucks) {
      if (!truck.currentTrailerId) {
        unchanged++;
        continue;
      }
      
      const currentValue = truck.currentTrailerId;
      
      // Check if it's already a valid trailer ID
      if (trailerById.has(currentValue)) {
        unchanged++;
        continue;
      }
      
      // Check if it matches a trailer fleet number
      const matchedTrailer = trailerByFleetNo.get(currentValue);
      if (matchedTrailer) {
        // Update to use the actual trailer ID
        await ctx.db.patch(truck._id, { currentTrailerId: matchedTrailer._id });
        updated++;
        continue;
      }
      
      // No match found - clear the invalid value
      await ctx.db.patch(truck._id, { currentTrailerId: undefined });
      cleared++;
      unmatchedValues.push(currentValue);
    }
    
    return {
      totalTrucks: trucks.length,
      updated,
      cleared,
      unchanged,
      unmatchedValues,
    };
  },
});

export const patchByFleetNo = mutation({
  args: {
    truckFleetNo: v.string(),
    patch: v.object({
      licenseExpiryDate: v.optional(v.string()),
      serviceDueDate: v.optional(v.string()),
      serviceDueKm: v.optional(v.float64()),
      currentKm: v.optional(v.float64()),
    }),
  },
  handler: async (ctx, args) => {
    const truck = await ctx.db
      .query("trucks")
      .withIndex("by_truckFleetNo", (q) => q.eq("truckFleetNo", args.truckFleetNo))
      .first();
    if (!truck) throw new Error("Truck not found");
    await ctx.db.patch(truck._id, args.patch);
  },
});
