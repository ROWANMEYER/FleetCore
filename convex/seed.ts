import { mutation } from "./_generated/server";

export const seedRequiredSetupData = mutation({
  args: {},
  handler: async (ctx) => {
    // 1. Truck 87
    const existingTruck = await ctx.db
      .query("trucks")
      .withIndex("by_truckFleetNo", (q) => q.eq("truckFleetNo", "87"))
      .first();

    if (!existingTruck) {
      await ctx.db.insert("trucks", {
        truckFleetNo: "87",
        registration: "CA 123-456",
        make: "Mercedes-Benz",
        model: "Actros",
      });
      console.log("Inserted Truck 87");
    } else {
      const needsUpdate =
        !existingTruck.registration ||
        !existingTruck.make ||
        !existingTruck.model;

      if (needsUpdate) {
        await ctx.db.patch(existingTruck._id, {
          registration: existingTruck.registration || "CA 123-456",
          make: existingTruck.make || "Mercedes-Benz",
          model: existingTruck.model || "Actros",
        });
        console.log("Updated Truck 87 with missing fields");
      }
    }

    // 2. Trailer 87
    const existingTrailer = await ctx.db
      .query("trailers")
      .withIndex("by_trailerFleetNoStr", (q) => q.eq("trailerFleetNoStr", "87"))
      .first();

    if (!existingTrailer) {
      await ctx.db.insert("trailers", {
        trailerFleetNo: 87,
        trailerFleetNoStr: "87",
        type: "Flatbed",
        trailers: [{ length: "6m", registration: "TR 999-999" }],
      });
      console.log("Inserted Trailer 87");
    } else {
      const needsUpdate =
        !existingTrailer.trailerFleetNoStr ||
        !existingTrailer.type ||
        !existingTrailer.trailers ||
        existingTrailer.trailers.length === 0;

      if (needsUpdate) {
        await ctx.db.patch(existingTrailer._id, {
          trailerFleetNoStr: existingTrailer.trailerFleetNoStr || "87",
          type: existingTrailer.type || "Flatbed",
          trailers:
            existingTrailer.trailers && existingTrailer.trailers.length > 0
              ? existingTrailer.trailers
              : [{ length: "6m", registration: "TR 999-999" }],
        });
        console.log("Updated Trailer 87 with missing fields");
      }
    }

    // 3. Driver JOHN OELF
    // Scan for driver by name
    const existingDriver = await ctx.db
      .query("drivers")
      .filter((q) => q.eq(q.field("driverName"), "JOHN OELF"))
      .first();

    if (!existingDriver) {
      await ctx.db.insert("drivers", {
        driverId: "D_87_JOHN",
        driverName: "JOHN OELF",
        idNumber: "8001015009087",
        phone: "0821234567",
        status: "active",
      });
      console.log("Inserted Driver JOHN OELF");
    } else {
      const needsUpdate =
        !existingDriver.driverId ||
        !existingDriver.idNumber ||
        !existingDriver.phone ||
        existingDriver.status !== "active";

      if (needsUpdate) {
        await ctx.db.patch(existingDriver._id, {
          driverId: existingDriver.driverId || "D_87_JOHN",
          idNumber: existingDriver.idNumber || "8001015009087",
          phone: existingDriver.phone || "0821234567",
          status: "active",
        });
        console.log("Updated Driver JOHN OELF");
      }
    }

    return "Seed complete";
  },
});
