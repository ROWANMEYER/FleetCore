import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";

// 🏗️ FLEET SETUP & BASELINE STATE MANAGEMENT
//
// This file manages two things:
//
// 1️⃣ FLEET SETUP STATUS (legacy fleetSetupStatus):
//    - Simple boolean flag to track if initial setup is complete
//    - Used during fleet initialization
//
// 2️⃣ BASELINE STATE MUTATIONS (new fleetSetupBaseline):
//    - createFleetSetupBaseline: Snapshot current truck → trailer assignments
//    - lockFleetSetup: Prevent overwrites of baseline
//    - masterResetFleet: Restore operational state to baseline
//
// KEY ARCHITECTURE:
// ┌─────────────────────────────────────────────────┐
// │ BASELINE (fleetSetupBaseline)                   │
// │ - Immutable initial state (after locking)       │
// │ - ONE document only                             │
// │ - Never changes after locked=true               │
// └─────────────────────────────────────────────────┘
//           ↓ (restore via masterResetFleet)
// ┌─────────────────────────────────────────────────┐
// │ OPERATIONAL STATE (trucks.currentTrailerId)     │
// │ - Live current assignments (changes with swaps) │
// │ - Can diverge from baseline                     │
// │ - Restored to baseline only via masterResetFleet│
// └─────────────────────────────────────────────────┘
//           ↓ (recorded by swap mutations)
// ┌─────────────────────────────────────────────────┐
// │ HISTORY (trailerSwaps)                          │
// │ - Immutable log of all operations               │
// │ - Separate from baseline resets                 │
// │ - Complete audit trail                          │
// └─────────────────────────────────────────────────┘
//
// CRITICAL INVARIANTS:
// ✅ Only ONE baseline document can exist
// ✅ Baseline cannot be overwritten once locked
// ✅ masterResetFleet requires locked baseline
// ✅ Swap history is independent from baseline
// ✅ All changes are validation-wrapped to prevent partial writes

export const getStatus = query({
  args: {},
  handler: async (ctx) => {
    const status = await ctx.db.query("fleetSetupStatus").first();
    return status ?? { complete: false };
  },
});

/**
 * getBaseline
 * 
 * Fetches the current fleetSetupBaseline document.
 * Returns null if no baseline exists yet.
 */
export const getBaseline = query({
  args: {},
  handler: async (ctx) => {
    const baseline = await ctx.db.query("fleetSetupBaseline").first();
    return baseline ?? null;
  },
});

export const setIncomplete = mutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db.query("fleetSetupStatus").first();
    if (existing) {
      await ctx.db.patch(existing._id, { complete: false });
    } else {
      await ctx.db.insert("fleetSetupStatus", { complete: false });
    }
    return { success: true };
  },
});

export const setComplete = mutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db.query("fleetSetupStatus").first();
    if (existing) {
      await ctx.db.patch(existing._id, { complete: true });
    } else {
      await ctx.db.insert("fleetSetupStatus", { complete: true });
    }
    return { success: true };
  },
});

export const pairTruckAndTrailer = mutation({
  args: {
    truckId: v.id("trucks"),
    trailerId: v.id("trailers"),
  },
  handler: async (ctx, args) => {
    // 1) Fetch truck
    const truck = await ctx.db.get(args.truckId);
    if (!truck) {
      throw new Error("Document not found");
    }

    // 2) Fetch trailer to ensure it exists and get fleet number
    const trailer = await ctx.db.get(args.trailerId);
    if (!trailer) {
      throw new Error("Document not found");
    }

    const oldTrailerId = truck.currentTrailerId;

    // 3) Patch truck: currentTrailerId = trailerId
    await ctx.db.patch(args.truckId, {
      currentTrailerId: args.trailerId,
    });

    // 4) Insert into trailerSwaps (History Logging)
    // We record this as a "SETUP" or "MANUAL" swap to ensure history is complete.
    const now = new Date().toISOString();
    
    // Get old trailer details if it existed
    let oldTrailerFleetNoStr = "";
    if (oldTrailerId) {
       const oldT = await ctx.db.get(oldTrailerId as Id<"trailers">);
       if (!oldT) {
         throw new Error("Document not found");
       }
       oldTrailerFleetNoStr = oldT.trailerFleetNoStr;
    }

    await ctx.db.insert("trailerSwaps", {
      truckId: args.truckId,
      newTrailerId: args.trailerId,
      oldTrailerId: oldTrailerId,
      reason: "Fleet Setup Pair",
      swapType: "SETUP", 
      swapDate: now,
      createdAt: now,
      truckFleetNoStr: truck.truckFleetNo,
      trailerFleetNoStr: trailer.trailerFleetNoStr,
      oldTrailerFleetNoStr: oldTrailerFleetNoStr,
    });

    return { success: true };
  },
});

export const createFleetSetupBaseline = mutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db.query("fleetSetupBaseline").first();
    if (existing) {
      throw new Error("A baseline already exists. It cannot be overwritten.");
    }

    const trucks = await ctx.db.query("trucks").collect();
    const assignments = trucks
      .filter((truck) => truck.currentTrailerId)
      .map((truck) => ({
        truckId: truck._id,
        trailerId: truck.currentTrailerId as Id<"trailers">,
      }));

    await ctx.db.insert("fleetSetupBaseline", {
      setupDate: Date.now(),
      locked: false,
      assignments,
    });

    return { success: true };
  },
});

export const lockFleetSetup = mutation({
  args: {},
  handler: async (ctx) => {
    const baseline = await ctx.db.query("fleetSetupBaseline").first();
    if (!baseline) {
      throw new Error("No baseline exists to lock.");
    }

    await ctx.db.patch(baseline._id, { locked: true });
    return { success: true };
  },
});

export const masterResetFleet = mutation({
  args: {},
  handler: async (ctx) => {
    const baseline = await ctx.db.query("fleetSetupBaseline").first();
    if (!baseline) {
      throw new Error("No baseline exists to restore from.");
    }
    if (!baseline.locked) {
      throw new Error("The baseline is not locked. Cannot restore from an unlocked baseline.");
    }

    for (const assignment of baseline.assignments) {
      await ctx.db.patch(assignment.truckId, {
        currentTrailerId: assignment.trailerId,
      });
    }

    return { success: true };
  },
});
