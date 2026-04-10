import { query } from "./_generated/server";

// Helper to calculate days until a given date string
function calcDaysUntil(expiryDateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiry = new Date(`${expiryDateStr}T00:00:00`);
  return Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

// Helper to determine the tier based on days remaining
function getTier(days: number): string {
  if (days <= 0) return "expired";
  if (days <= 7) return "critical";
  if (days <= 30) return "warning";
  if (days <= 60) return "notice";
  if (days <= 90) return "current_month";
  return "ok";
}

// Main query to get a snapshot of daily operations issues
export const getDailyOpsSnapshot = query({
  args: {},
  handler: async (ctx) => {
    // Step 1: Get today's date string in "YYYY-MM-DD" format
    const d = new Date();
    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    // Step 2: Query for today's availability
    const avail = await ctx.db
      .query("dailyAvailability")
      .withIndex("by_day", q => q.eq("dayKey", today))
      .first();

    // If no availability record or status is not "available", return an empty structure
    if (!avail || avail.status !== "available") {
      return { date: today, hasAvailability: false, drivers: [], trucks: [], trailers: [] };
    }

    // Step 3: Create sets for efficient lookups of available assets
    const availDriverIds = new Set(avail.drivers);
    const availTruckNos = new Set(avail.trucks);
    const availTrailerNos = new Set(avail.trailers);

    // Step 4: Fetch all asset and damage log tables
    const [allDrivers, allTrucks, allTrailers, allDamageLogs] = await Promise.all([
      ctx.db.query("drivers").collect(),
      ctx.db.query("trucks").collect(),
      ctx.db.query("trailers").collect(),
      ctx.db.query("damageLogs").collect(),
    ]);

    // Filter down to only the assets marked as available for today
    const drivers = allDrivers.filter(d => availDriverIds.has(d.driverId));
    const trucks = allTrucks.filter(t => availTruckNos.has(t.truckFleetNo));
    const trailers = allTrailers.filter(t => availTrailerNos.has(t.trailerFleetNoStr));
    const openDamageLogs = allDamageLogs.filter(d => d.status === "open");

    // Step 7: Build driver-related todos
    const driverTodos: any[] = [];
    for (const driver of drivers) {
      if (driver.licenseExpiryDate) {
        const daysUntilExpiry = calcDaysUntil(driver.licenseExpiryDate);
        const tier = getTier(daysUntilExpiry);
        if (tier !== "ok") {
          driverTodos.push({
            driverId: driver.driverId,
            driverName: driver.driverName,
            idNumber: driver.idNumber,
            docType: "License",
            expiryDate: driver.licenseExpiryDate,
            daysUntilExpiry,
            tier,
          });
        }
      }
      if (driver.pdpExpiryDate) {
        const daysUntilExpiry = calcDaysUntil(driver.pdpExpiryDate);
        const tier = getTier(daysUntilExpiry);
        if (tier !== "ok") {
          driverTodos.push({
            driverId: driver.driverId,
            driverName: driver.driverName,
            idNumber: driver.idNumber,
            docType: "PDP",
            expiryDate: driver.pdpExpiryDate,
            daysUntilExpiry,
            tier,
          });
        }
      }
    }

    // Step 8: Build truck-related todos
    const truckTodos: any[] = [];
    for (const truck of trucks) {
      if (truck.licenseExpiryDate) {
        const daysUntilExpiry = calcDaysUntil(truck.licenseExpiryDate);
        const tier = getTier(daysUntilExpiry);
        if (tier !== "ok") {
          truckTodos.push({
            truckFleetNo: truck.truckFleetNo,
            registration: truck.registration,
            issueType: "License",
            expiryDate: truck.licenseExpiryDate,
            daysUntilExpiry,
            tier,
          });
        }
      }
      if (truck.serviceDueDate) {
        const daysUntilExpiry = calcDaysUntil(truck.serviceDueDate);
        const tier = getTier(daysUntilExpiry);
        if (tier !== "ok") {
          truckTodos.push({
            truckFleetNo: truck.truckFleetNo,
            registration: truck.registration,
            issueType: "Service",
            expiryDate: truck.serviceDueDate,
            daysUntilExpiry,
            tier,
          });
        }
      }
    }
    // Add open damage logs for available trucks
    for (const dmg of openDamageLogs) {
      if (dmg.assetType === "truck" && availTruckNos.has(dmg.assetUnit)) {
        const truck = trucks.find(t => t.truckFleetNo === dmg.assetUnit);
        if (truck) {
          truckTodos.push({
            truckFleetNo: truck.truckFleetNo,
            registration: truck.registration,
            issueType: "Damage",
            loggedDate: dmg.date,
            tier: "open"
          });
        }
      }
    }

    // Step 9: Build trailer-related todos
    const trailerTodos: any[] = [];
    for (const trailer of trailers) {
      if (trailer.licenseExpiryDate) {
        const daysUntilExpiry = calcDaysUntil(trailer.licenseExpiryDate);
        const tier = getTier(daysUntilExpiry);
        if (tier !== "ok") {
          trailerTodos.push({
            trailerFleetNoStr: trailer.trailerFleetNoStr,
            registration: trailer.trailers[0]?.registration ?? trailer.trailerFleetNoStr,
            issueType: "License",
            expiryDate: trailer.licenseExpiryDate,
            daysUntilExpiry,
            tier,
          });
        }
      }
      if (trailer.serviceDueDate) {
        const daysUntilExpiry = calcDaysUntil(trailer.serviceDueDate);
        const tier = getTier(daysUntilExpiry);
        if (tier !== "ok") {
          trailerTodos.push({
            trailerFleetNoStr: trailer.trailerFleetNoStr,
            registration: trailer.trailers[0]?.registration ?? trailer.trailerFleetNoStr,
            issueType: "Service",
            expiryDate: trailer.serviceDueDate,
            daysUntilExpiry,
            tier,
          });
        }
      }
    }
    // Add open damage logs for available trailers
    for (const dmg of openDamageLogs) {
      if (dmg.assetType === "trailer" && availTrailerNos.has(dmg.assetUnit)) {
        const trailer = trailers.find(t => t.trailerFleetNoStr === dmg.assetUnit);
        if (trailer) {
          trailerTodos.push({
            trailerFleetNoStr: trailer.trailerFleetNoStr,
            registration: trailer.trailers[0]?.registration ?? trailer.trailerFleetNoStr,
            issueType: "Damage",
            loggedDate: dmg.date,
            tier: "open"
          });
        }
      }
    }

    // Step 10: Sort all todo lists by urgency
    const tierOrder: Record<string, number> = {
      expired: 0, open: 0, critical: 1, warning: 2, notice: 3, current_month: 4
    };
    const sortFn = (a: any, b: any) => {
      const tierA = tierOrder[a.tier];
      const tierB = tierOrder[b.tier];
      if (tierA !== tierB) {
        return tierA - tierB;
      }
      const daysA = a.daysUntilExpiry ?? Number.POSITIVE_INFINITY;
      const daysB = b.daysUntilExpiry ?? Number.POSITIVE_INFINITY;
      return daysA - daysB;
    };

    driverTodos.sort(sortFn);
    truckTodos.sort(sortFn);
    trailerTodos.sort(sortFn);

    // Step 11: Return the final structured data
    return {
      date: today,
      hasAvailability: true,
      drivers: driverTodos,
      trucks: truckTodos,
      trailers: trailerTodos,
    };
  },
});
