import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";

// 📝 SWAP HISTORY LOG
//
// This file manages trailerSwaps - the COMPLETE HISTORY of all trailer swap operations.
// Each swap record is immutable once created.
//
// ⏰ BASELINE STATE: fleetSetupBaseline collection
//    - Immutable snapshot of initial truck → trailer assignments
//    - Created once and locked to prevent overwrites
//    - Used to restore operational state via masterResetFleet()
//    - NOTE: Swap history is NOT affected by baseline resets
//
// 🔴 LIVE OPERATIONAL STATE: trucks.currentTrailerId
//    - Current assignment of trailers to trucks (changes with swaps)
//    - Updated by swaps but INDEPENDENT from baseline
//    - Can be restored to baseline without modifying swap history
//
// SUMMARY:
// - trailerSwaps = HISTORICAL record (immutable audit trail)
// - trucks.currentTrailerId = TODAY'S operational state (mutable via swaps)
// - fleetSetupBaseline = INITIAL baseline snapshot (immutable after lock)
// - Swaps do NOT modify baseline, baseline resets do NOT modify swaps

export const getDashboardData = query({
  handler: async (ctx) => {
    const swaps = await ctx.db.query("trailerSwaps").collect();
    const trucks = await ctx.db.query("trucks").collect();
    const trailers = await ctx.db.query("trailers").collect();

    console.log("SWAPS:", swaps.length);
    console.log("TRUCKS:", trucks.length);

    const totalSwaps = swaps.filter(s => s.swapType && s.swapType.toUpperCase() === "SWAP").length;
    const totalUnpairs = swaps.filter(s => s.swapType && s.swapType.toUpperCase() === "UNPAIR").length;

    const pairedTrucks = trucks.filter(t => t.currentTrailerId).length;
    const unpairedTrucks = trucks.filter(t => !t.currentTrailerId).length;

    const pairedTrailerIds = new Set(
      trucks
        .map(t => t.currentTrailerId)
        .filter((id): id is Id<"trailers"> => !!id)
    );
    const unpairedTrailers = trailers.filter(t => !pairedTrailerIds.has(t._id)).length;

    return {
      pairedTrucks,
      totalSwaps,
      totalUnpairs,
      unpairedTrucks,
      unpairedTrailers,
    };
  },
});

// ---------------------------------------------------------
// MUTATIONS
// ---------------------------------------------------------



export const pairTruckAndTrailer = mutation({
  args: {
    truckId: v.id("trucks"),
    trailerId: v.id("trailers"),
  },
  handler: async (ctx, args) => {
    // 1. Fetch truck by truckId
    const truck = await ctx.db.get(args.truckId);
    if (!truck) {
      throw new Error("Document not found");
    }
    // If truck.currentTrailerId exists: throw Error
    if (truck.currentTrailerId) {
      throw new Error("Truck already paired");
    }

    // 2. Fetch trailer by trailerId
    const trailer = await ctx.db.get(args.trailerId);
    if (!trailer) {
      throw new Error("Document not found");
    }

    // If trailer.currentTruckId exists (Simulated by checking if ANY truck holds this trailer)
    const truckWithTrailer = await ctx.db
      .query("trucks")
      .withIndex("by_currentTrailerId", (q) => q.eq("currentTrailerId", args.trailerId))
      .first();

    if (truckWithTrailer) {
      throw new Error("Trailer already paired");
    }

    const now = new Date().toISOString();

    // 3. Patch truck: currentTrailerId = trailerId
    await ctx.db.patch(args.truckId, {
      currentTrailerId: args.trailerId,
    });

    // 4. Insert record into trailerSwaps table
    await ctx.db.insert("trailerSwaps", {
      truckId: args.truckId,
      newTrailerId: args.trailerId, // Maps to schema field
      reason: "Manual Pair",        // Required by schema
      swapType: "SWAP",             // Updated to "SWAP" as per request
      swapDate: now,                // Required by schema
      createdAt: now,               // Schema requires string (ISO)
    });

    return { success: true };
  },
});

export const unpairByTruck = mutation({
  args: {
    truckId: v.id("trucks"),
  },
  handler: async (ctx, args) => {
    // 1) Fetch truck
    const truck = await ctx.db.get(args.truckId);
    if (!truck) {
      throw new Error("Document not found");
    }

    // 2) Get truck.currentTrailerId -> trailerId
    const trailerId = truck.currentTrailerId;
    const now = new Date().toISOString();

    // 3) Patch truck: currentTrailerId = null (undefined)
    await ctx.db.patch(args.truckId, {
      currentTrailerId: undefined,
    });

    // 4) Insert record into trailerSwaps table (swapType: "UNPAIR")
    await ctx.db.insert("trailerSwaps", {
      truckId: args.truckId,
      oldTrailerId: trailerId,      // Capture the removed trailer
      reason: "Manual Unpair",
      swapType: "UNPAIR",
      swapDate: now,
      createdAt: now,
    });

    return { success: true };
  },
});

export const unpairByTrailer = mutation({
  args: {
    trailerId: v.id("trailers"),
  },
  handler: async (ctx, args) => {
    // 1) Fetch trailer
    const trailer = await ctx.db.get(args.trailerId);
    if (!trailer) throw new Error("Trailer not found");

    // 2) Get trailer.currentTruckId -> truckId
    // Implemented via reverse lookup as schema lacks currentTruckId
    const truck = await ctx.db
      .query("trucks")
      .withIndex("by_currentTrailerId", (q) => q.eq("currentTrailerId", args.trailerId))
      .first();

    const now = new Date().toISOString();

    // 3) Patch trailer: currentTruckId = null
    // Skipped: trailers table schema does not have currentTruckId

    // 4) If truckId exists: Patch truck: currentTrailerId = null
    if (truck) {
      await ctx.db.patch(truck._id, {
        currentTrailerId: undefined,
      });

      // Insert record into trailerSwaps table (swapType: "UNPAIR")
      await ctx.db.insert("trailerSwaps", {
        truckId: truck._id,
        oldTrailerId: args.trailerId, // Capture the removed trailer
        reason: "Manual Unpair",
        swapType: "UNPAIR",
        swapDate: now,
        createdAt: now,
      });
    }

    return { success: true };
  },
});

export const recordTrailerSwap = mutation({
  args: {
    truckId: v.id("trucks"),
    newTrailerId: v.optional(v.id("trailers")),
    reason: v.string(),
    notes: v.optional(v.string()),
    swapDate: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const truck = await ctx.db.get(args.truckId);
    if (!truck) {
      throw new Error("Document not found");
    }
    
    const oldTrailerId = truck.currentTrailerId;
    if (args.newTrailerId === oldTrailerId) throw new Error("New trailer is same as current");

    let newTrailerFleetNoStr = "";
    // Check existing assignments and validate trailer exists
    if (args.newTrailerId) {
      // Validate trailer exists
      const trailer = await ctx.db.get(args.newTrailerId as Id<"trailers">);
      if (!trailer) {
         throw new Error("Document not found");
      }
      newTrailerFleetNoStr = trailer.trailerFleetNoStr;

      const existingAssignment = await ctx.db
        .query("trucks")
        .withIndex("by_currentTrailerId", (q) => q.eq("currentTrailerId", args.newTrailerId))
        .first();
      
      if (existingAssignment && existingAssignment._id !== args.truckId) {
        throw new Error(`Trailer ${trailer.trailerFleetNoStr} is already assigned to truck ${existingAssignment.truckFleetNo}`);
      }
    }

    // Get old trailer details for history
    let oldTrailerFleetNoStr = "";
    if (oldTrailerId) {
      const oldTrailer = await ctx.db.get(oldTrailerId as Id<"trailers">);
      if (!oldTrailer) {
        throw new Error("Document not found");
      }
      oldTrailerFleetNoStr = oldTrailer.trailerFleetNoStr;
    }

    await ctx.db.patch(args.truckId, { currentTrailerId: args.newTrailerId || undefined });

    const createdAtIso = new Date().toISOString();
    const swapDateIso = args.swapDate ? new Date(args.swapDate).toISOString() : createdAtIso;
    const swapDateMs = args.swapDate ?? new Date(createdAtIso).getTime();

    const swapPayload: any = {
      truckId: args.truckId,
      reason: args.reason,
      swapType: "MANUAL",
      swapDate: swapDateIso,
      swapDateMs,
      createdAt: createdAtIso,
      truckFleetNoStr: truck.truckFleetNo,
    };
    if (oldTrailerId) {
      swapPayload.oldTrailerId = oldTrailerId;
      swapPayload.oldTrailerFleetNoStr = oldTrailerFleetNoStr;
    }
    if (args.newTrailerId) {
      swapPayload.newTrailerId = args.newTrailerId;
      swapPayload.trailerFleetNoStr = newTrailerFleetNoStr;
    }
    if (args.notes) swapPayload.notes = args.notes;

    await ctx.db.insert("trailerSwaps", swapPayload);
  },
});

export const swapTwoTrucks = mutation({
  args: {
    truckAId: v.id("trucks"),
    truckBId: v.id("trucks"),
    reason: v.string(),
    swapDate: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const truckA = await ctx.db.get(args.truckAId);
    if (!truckA) {
      throw new Error("Document not found");
    }
    const truckB = await ctx.db.get(args.truckBId);
    if (!truckB) {
      throw new Error("Document not found");
    }

    const oldTrailerAId = truckA.currentTrailerId;
    const oldTrailerBId = truckB.currentTrailerId;
    
    const effectiveSwapDate = args.swapDate ?? Date.now();
    const swapDateIso = new Date(effectiveSwapDate).toISOString();
    const createdAtIso = new Date().toISOString();
    
    const swapType = "SWAP";
    const reason = args.reason;

    // Fetch trailer details for denormalization
    let trailerAFleetNoStr = "";
    if (oldTrailerAId) {
        const t = await ctx.db.get(oldTrailerAId as Id<"trailers">);
        if (!t) {
          throw new Error("Document not found");
        }
        trailerAFleetNoStr = t.trailerFleetNoStr;
    }
    let trailerBFleetNoStr = "";
    if (oldTrailerBId) {
        const t = await ctx.db.get(oldTrailerBId as Id<"trailers">);
        if (!t) {
          throw new Error("Document not found");
        }
        trailerBFleetNoStr = t.trailerFleetNoStr;
    }

    // Perform atomic updates
    await ctx.db.patch(args.truckAId, { currentTrailerId: oldTrailerBId });
    await ctx.db.patch(args.truckBId, { currentTrailerId: oldTrailerAId });

    // Record swap for Truck A (gets B's trailer)
    const payloadA: any = {
      truckId: args.truckAId,
      swapType,
      reason,
      swapDate: swapDateIso,
      swapDateMs: effectiveSwapDate,
      createdAt: createdAtIso,
      truckFleetNoStr: truckA.truckFleetNo,
    };
    if (oldTrailerAId) {
        payloadA.oldTrailerId = oldTrailerAId;
        payloadA.oldTrailerFleetNoStr = trailerAFleetNoStr;
    }
    if (oldTrailerBId) {
        payloadA.newTrailerId = oldTrailerBId;
        payloadA.trailerFleetNoStr = trailerBFleetNoStr;
    }

    // Record swap for Truck B (gets A's trailer)
    const payloadB: any = {
      truckId: args.truckBId,
      swapType,
      reason,
      swapDate: swapDateIso,
      swapDateMs: effectiveSwapDate,
      createdAt: createdAtIso,
      truckFleetNoStr: truckB.truckFleetNo,
    };
    if (oldTrailerBId) {
        payloadB.oldTrailerId = oldTrailerBId;
        payloadB.oldTrailerFleetNoStr = trailerBFleetNoStr;
    }
    if (oldTrailerAId) {
        payloadB.newTrailerId = oldTrailerAId;
        payloadB.trailerFleetNoStr = trailerAFleetNoStr;
    }

    await ctx.db.insert("trailerSwaps", payloadA);
    await ctx.db.insert("trailerSwaps", payloadB);
  },
});

// ---------------------------------------------------------
// QUERIES
// ---------------------------------------------------------

export const getAll = query({
  handler: async (ctx) => {
    const swaps = await ctx.db
      .query("trailerSwaps")
      .order("desc")
      .collect();

    const trucks = await ctx.db.query("trucks").collect();
    const trailers = await ctx.db.query("trailers").collect();

    const truckMap = Object.fromEntries(
      trucks.map(t => [t._id, t.truckFleetNo])
    );

    const trailerMap = Object.fromEntries(
      trailers.map(t => [t._id, t.trailerFleetNoStr])
    );

    return swaps.map(s => ({
      _id: s._id,
      createdAt: s._creationTime,
      truckFleetNoStr: truckMap[s.truckId] ?? "UNKNOWN",
      trailerFleetNoStr: s.newTrailerId ? (trailerMap[s.newTrailerId] ?? "UNKNOWN") : "",
      oldTrailerFleetNoStr: s.oldTrailerId ? (trailerMap[s.oldTrailerId] ?? "UNKNOWN") : "",
      reason: s.reason ?? "Other",
      truckId: s.truckId ?? "",
      swapType: s.swapType ?? "MANUAL",
      notes: s.notes ?? "",
      newTrailerId: s.newTrailerId ?? "",
      oldTrailerId: s.oldTrailerId ?? "",
    }));
  },
});

export const getAllSwaps = query({
  handler: async (ctx) => {
    const swaps = await ctx.db
      .query("trailerSwaps")
      .order("desc")
      .collect();

    const trucks = await ctx.db.query("trucks").collect();
    const trailers = await ctx.db.query("trailers").collect();

    const truckMap = Object.fromEntries(
      trucks.map(t => [t._id, t.truckFleetNo])
    );

    const trailerLabelMap = Object.fromEntries(
      trailers.map(t => [t._id, t.trailerFleetNoStr || String(t.trailerFleetNo)])
    );

    return swaps.map(s => {
      const truckNumber = s.truckFleetNoStr ?? truckMap[s.truckId] ?? "";
      const oldTrailerNumber =
        s.oldTrailerFleetNoStr ??
        (s.oldTrailerId ? trailerLabelMap[s.oldTrailerId] ?? "" : "");
      const newTrailerNumber =
        s.trailerFleetNoStr ??
        (s.newTrailerId ? trailerLabelMap[s.newTrailerId] ?? "" : "");

      return {
        _id: s._id,
        truckId: s.truckId,
        truckNumber,
        swapDate: s.swapDate,
        createdAt: s.createdAt,
        swapType: s.swapType,
        reason: s.reason,
        notes: s.notes ?? "",
        oldTrailerId: s.oldTrailerId ?? "",
        newTrailerId: s.newTrailerId ?? "",
        oldTrailerNumber,
        newTrailerNumber,
      };
    });
  },
});

export const getStats = query({
  handler: async (ctx) => {
    const swaps = await ctx.db
      .query("trailerSwaps")
      .collect();

    const total = swaps.length;
    const swapCount = swaps.filter(s => s.swapType === "SWAP").length;
    const unpairCount = swaps.filter(s => s.swapType === "UNPAIR").length;

    const todayStr = new Date().toDateString();
    const todayCount = swaps.filter(s => {
      const dateVal = s.createdAt || s._creationTime;
      return new Date(dateVal).toDateString() === todayStr;
    }).length;

    return {
      total,
      swaps: swapCount,
      unpairs: unpairCount,
      today: todayCount,
    };
  },
});

export const getMonthlySwapCountByTruck = query({
  args: {
    truckNumber: v.string(),
  },
  handler: async (ctx, args) => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const truck = await ctx.db
      .query("trucks")
      .withIndex("by_truckFleetNo", q => q.eq("truckFleetNo", args.truckNumber))
      .first();

    if (!truck) {
      return 0;
    }

    const swaps = await ctx.db
      .query("trailerSwaps")
      .filter(q => q.eq(q.field("truckId"), truck._id))
      .collect();

    const count = swaps.filter(s => {
      const dateVal = s.swapDate || s.createdAt;
      if (!dateVal) return false;
      const d = new Date(dateVal);
      return d >= start && d < end;
    }).length;

    return count;
  },
});

export const getMonthlySwapCountByTrailer = query({
  args: {
    trailerNumber: v.string(),
  },
  handler: async (ctx, args) => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const trailer = await ctx.db
      .query("trailers")
      .withIndex("by_trailerFleetNoStr", q => q.eq("trailerFleetNoStr", args.trailerNumber))
      .first();

    if (!trailer) {
      return 0;
    }

    const swaps = await ctx.db
      .query("trailerSwaps")
      .collect();

    const count = swaps.filter(s => {
      const involved =
        s.newTrailerId === trailer._id ||
        s.oldTrailerId === trailer._id;
      if (!involved) return false;
      const dateVal = s.swapDate || s.createdAt;
      if (!dateVal) return false;
      const d = new Date(dateVal);
      return d >= start && d < end;
    }).length;

    return count;
  },
});

export const getCurrentCombinations = query({
  handler: async (ctx) => {
    const trucks = await ctx.db.query("trucks").collect();
    const trailers = await ctx.db.query("trailers").collect();
    const swaps = await ctx.db.query("trailerSwaps").collect();

    const trailerLabelMap = Object.fromEntries(
      trailers.map(t => [t._id, t.trailerFleetNoStr || String(t.trailerFleetNo)])
    );

    return trucks.map(truck => {
      const trailerId = truck.currentTrailerId;

      let lastSwapDate: string | null = null;

      if (trailerId) {
        const relevantSwaps = swaps.filter(s => {
          const matchesTruck = s.truckId === truck._id;
          const matchesTrailer =
            s.newTrailerId === trailerId ||
            s.oldTrailerId === trailerId;
          return matchesTruck && matchesTrailer;
        });

        if (relevantSwaps.length > 0) {
          let latest = 0;
          for (const s of relevantSwaps) {
            const dateVal = s.swapDate || s.createdAt;
            if (!dateVal) continue;
            const ts = new Date(dateVal).getTime();
            if (ts > latest) {
              latest = ts;
            }
          }
          if (latest > 0) {
            lastSwapDate = new Date(latest).toISOString();
          }
        }
      }

      return {
        truckId: truck._id,
        trailerId: trailerId ?? null,
        truckNumber: truck.truckFleetNo,
        trailerNumber: trailerId ? (trailerLabelMap[trailerId] ?? "") : null,
        lastSwapDate,
      };
    });
  },
});

export const getConflicts = query({
  handler: async (ctx) => {
    const conflicts = await ctx.db
      .query("trailerSwaps")
      .filter((q) => q.eq(q.field("reason"), "Conflict"))
      .order("desc")
      .collect();

    return conflicts.map(c => ({
      ...c,
      truckFleetNoStr: c.truckFleetNoStr ?? "",
      trailerFleetNoStr: c.trailerFleetNoStr ?? "",
      oldTrailerFleetNoStr: c.oldTrailerFleetNoStr ?? "",
      oldTrailerId: c.oldTrailerId ?? "",
      newTrailerId: c.newTrailerId ?? "",
      notes: c.notes ?? "",
    }));
  },
});

export const getGroupedByTruck = query({
  handler: async (ctx) => {
    const swaps = await ctx.db.query("trailerSwaps").collect();
    const trucks = await ctx.db.query("trucks").collect();

    const truckMap = Object.fromEntries(
      trucks.map(t => [t._id, t.truckFleetNo])
    );

    const counts: Record<string, number> = {};

    swaps.forEach(s => {
      counts[s.truckId] = (counts[s.truckId] || 0) + 1;
    });

    return Object.entries(counts).map(([truckId, count]) => ({
      truckFleetNoStr: truckMap[truckId] ?? "",
      count
    }));
  },
});

export const getGroupedByTrailer = query({
  handler: async (ctx) => {
    const swaps = await ctx.db.query("trailerSwaps").collect();
    const trailers = await ctx.db.query("trailers").collect();

    const trailerMap = Object.fromEntries(
      trailers.map(t => [t._id, t.trailerFleetNoStr])
    );

    const counts: Record<string, number> = {};

    swaps.forEach(s => {
      if (s.newTrailerId) {
        counts[s.newTrailerId] = (counts[s.newTrailerId] || 0) + 1;
      }
    });

    return Object.entries(counts).map(([trailerId, count]) => ({
      trailerFleetNoStr: trailerMap[trailerId] ?? "",
      count
    }));
  },
});
