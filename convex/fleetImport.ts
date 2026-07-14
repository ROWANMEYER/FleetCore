import { mutation } from "./_generated/server";
import { v } from "convex/values";

export const bulkImportFleetData = mutation({
  args: {
    trucks: v.array(
      v.object({
        truckFleetNo: v.string(),
        registration: v.string(),
      })
    ),
    trailers: v.array(
      v.object({
        trailerFleetNo: v.number(),
        type: v.string(),
        trailers: v.array(
          v.object({
            length: v.string(),
            registration: v.string(),
          })
        ),
      })
    ),
    drivers: v.array(
      v.object({
        driverName: v.string(),
        idNumber: v.string(),
        phone: v.string(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const result = { trucks: { created: 0, updated: 0, skipped: 0 }, trailers: { created: 0, updated: 0, skipped: 0 }, drivers: { created: 0, updated: 0, skipped: 0 } };

    // ── Trucks ──
    for (const truck of args.trucks) {
      const fleetNo = truck.truckFleetNo?.trim();
      if (!fleetNo) {
        result.trucks.skipped++;
        continue;
      }
      const existing = await ctx.db
        .query("trucks")
        .withIndex("by_truckFleetNo", (q) => q.eq("truckFleetNo", fleetNo))
        .first();

      if (existing) {
        await ctx.db.patch(existing._id, {
          truckFleetNo: fleetNo,
          registration: truck.registration,
        });
        result.trucks.updated++;
      } else {
        await ctx.db.insert("trucks", {
          truckFleetNo: fleetNo,
          registration: truck.registration,
          status: "active",
        });
        result.trucks.created++;
      }
    }

    // ── Trailers ──
    for (const trailer of args.trailers) {
      if (trailer.trailerFleetNo === undefined || trailer.trailerFleetNo === null) {
        result.trailers.skipped++;
        continue;
      }
      const fleetNoStr = String(trailer.trailerFleetNo).trim();
      if (!fleetNoStr) {
        result.trailers.skipped++;
        continue;
      }
      const existing = await ctx.db
        .query("trailers")
        .withIndex("by_trailerFleetNoStr", (q) => q.eq("trailerFleetNoStr", fleetNoStr))
        .first();

      // Only include registration entries that have a value
      const trailerUnits = trailer.trailers.filter((t) => t.registration.trim().length > 0);

      if (existing) {
        await ctx.db.patch(existing._id, {
          trailerFleetNo: trailer.trailerFleetNo,
          trailerFleetNoStr: fleetNoStr,
          type: trailer.type,
          trailers: trailerUnits,
        });
        result.trailers.updated++;
      } else {
        await ctx.db.insert("trailers", {
          trailerFleetNo: trailer.trailerFleetNo,
          trailerFleetNoStr: fleetNoStr,
          type: trailer.type,
          trailers: trailerUnits,
          status: "active",
        });
        result.trailers.created++;
      }
    }

    // ── Drivers ──
    for (const driver of args.drivers) {
      const normalizedId = driver.idNumber?.trim();
      if (!normalizedId) {
        result.drivers.skipped++;
        continue;
      }
      const existing = await ctx.db
        .query("drivers")
        .withIndex("by_driverId", (q) => q.eq("driverId", normalizedId))
        .first();

      if (existing) {
        await ctx.db.patch(existing._id, {
          driverName: driver.driverName,
          idNumber: normalizedId,
          phone: driver.phone,
        });
        result.drivers.updated++;
      } else {
        await ctx.db.insert("drivers", {
          driverId: normalizedId,
          driverName: driver.driverName,
          idNumber: normalizedId,
          phone: driver.phone,
          status: "active",
        });
        result.drivers.created++;
      }
    }

    return result;
  },
});
