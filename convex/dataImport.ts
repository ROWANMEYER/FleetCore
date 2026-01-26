import { mutation } from "./_generated/server";
import { v } from "convex/values";

export const importDrivers = mutation({
  args: {
    drivers: v.array(
      v.object({
        driverId: v.string(),
        driverName: v.string(),
        idNumber: v.string(),
        phone: v.string(),
        status: v.string(),
      })
    ),
  },
  handler: async (ctx, args) => {
    let count = 0;
    for (const driver of args.drivers) {
      // Check if driver exists by driverId
      // Note: Scanning without index is slow for large datasets, 
      // but fine for typical import sizes.
      const existing = await ctx.db
        .query("drivers")
        .filter((q) => q.eq(q.field("driverId"), driver.driverId))
        .first();

      if (existing) {
        await ctx.db.patch(existing._id, driver);
      } else {
        await ctx.db.insert("drivers", driver);
      }
      count++;
    }
    return `Successfully processed ${count} drivers`;
  },
});

export const importTrucks = mutation({
  args: {
    trucks: v.array(
      v.object({
        truckFleetNo: v.string(),
        registration: v.string(),
        make: v.string(),
        model: v.string(),
      })
    ),
  },
  handler: async (ctx, args) => {
    let count = 0;
    for (const truck of args.trucks) {
      // Check by truckFleetNo using index
      const existing = await ctx.db
        .query("trucks")
        .withIndex("by_truckFleetNo", (q) => q.eq("truckFleetNo", truck.truckFleetNo))
        .first();

      if (existing) {
        await ctx.db.patch(existing._id, truck);
      } else {
        await ctx.db.insert("trucks", truck);
      }
      count++;
    }
    return `Successfully processed ${count} trucks`;
  },
});

export const importTrailers = mutation({
  args: {
    trailers: v.array(
      v.object({
        trailerFleetNo: v.number(),
        type: v.string(),
        trailerFleetNoStr: v.optional(v.string()),
        trailers: v.array(
            v.object({
                length: v.string(),
                registration: v.string()
            })
        )
      })
    ),
  },
  handler: async (ctx, args) => {
    let count = 0;
    for (const trailer of args.trailers) {
      // Check by trailerFleetNo using index
      const existing = await ctx.db
        .query("trailers")
        .withIndex("by_trailerFleetNo", (q) => q.eq("trailerFleetNo", trailer.trailerFleetNo))
        .first();
      
      if (existing) {
        await ctx.db.patch(existing._id, trailer);
      } else {
        await ctx.db.insert("trailers", trailer);
      }
      count++;
    }
    return `Successfully processed ${count} trailers`;
  },
});
