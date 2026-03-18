import { query } from "./_generated/server";

type Tier = "expired" | "critical" | "warning" | "notice" | "open" | "current_month";

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function isCurrentMonth(dateStr: string): boolean {
    if (!dateStr) return false;
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return false;
    const now = new Date();
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

function daysUntil(dateStr: string): number {
  try {
    const target = new Date(dateStr + 'T00:00:00');
    const now = new Date();
    return Math.floor((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function tierFor(days: number, s1: number, s2: number, s3: number): Tier | null {
  if (Number.isNaN(days)) return null;
  if (days < 0) return 'expired';
  if (days <= s1) return 'critical';
  if (days <= s2) return 'warning';
  if (days <= s3) return 'notice';
  return null;
}

export const getDailyOpsSnapshot = query({
  args: {},
  handler: async (ctx) => {
    const dayKey = todayKey();

    const availability = await ctx.db
      .query("dailyAvailability")
      .withIndex("by_day", (q) => q.eq("dayKey", dayKey))
      .first();
    // if (!availability) return null; // Removed early return to allow listing monthly items even if no daily ops

    // Fetch app settings thresholds
    const appSettings = (await ctx.db.query('appSettings').collect())[0] || {};
    const stage1AlertDays = Number(appSettings.stage1AlertDays ?? 3);
    const stage2AlertDays = Number(appSettings.stage2AlertDays ?? 7);
    const stage3AlertDays = Number(appSettings.stage3AlertDays ?? 14);

    const driverKeys: string[] = availability && Array.isArray(availability.drivers) ? availability.drivers : [];
    const truckKeys: string[] = availability && Array.isArray(availability.trucks) ? availability.trucks : [];
    const trailerKeys: string[] = availability && Array.isArray(availability.trailers) ? availability.trailers : [];

    // Preload tables (no indexes assumed)
    const allDrivers = await ctx.db.query('drivers').collect();
    const allTrucks = await ctx.db.query('trucks').collect();
    const allTrailers = await ctx.db.query('trailers').collect();
    const allDamageLogs = await ctx.db.query('damageLogs').collect();

    // Helper finders to "inspect" identifier formats at runtime
    const findDriver = (key: string) => {
      return (
        allDrivers.find((d: any) => d.driverName === key) ||
        allDrivers.find((d: any) => d.idNumber === key) ||
        allDrivers.find((d: any) => d.driverId === key) ||
        null
      );
    };

    const findTruck = (key: string) => {
      return (
        allTrucks.find((t: any) => t.fleetNo === key) ||
        allTrucks.find((t: any) => t.truckFleetNo === key) ||
        allTrucks.find((t: any) => t.registration === key) ||
        null
      );
    };

    const findTrailer = (key: string) => {
      return (
        allTrailers.find((t: any) => t.fleetNoStr === key) ||
        allTrailers.find((t: any) => t.trailerFleetNoStr === key) ||
        allTrailers.find((t: any) => t.registration === key) ||
        null
      );
    };

    const driversOut: Array<{
      driverId: string;
      driverName: string;
      idNumber: string;
      docType: 'License' | 'PDP';
      expiryDate: string;
      daysUntilExpiry: number;
      tier: Tier;
    }> = [];

    const processedDriverKeys = new Set<string>();

    const addDriver = (d: any, docType: 'License' | 'PDP', date: string, tier: Tier, du: number) => {
        const id = String(d.driverId ?? d.id ?? d._id ?? '');
        const key = `${id}-${docType}`;
        if (processedDriverKeys.has(key)) return;
        driversOut.push({
            driverId: id,
            driverName: String(d.driverName ?? ''),
            idNumber: String(d.idNumber ?? ''),
            docType,
            expiryDate: date,
            daysUntilExpiry: du,
            tier,
        });
        processedDriverKeys.add(key);
    };

    // 1. Daily Ops Drivers
    for (const k of driverKeys) {
      const d: any = findDriver(k);
      if (!d) continue;

      const checks: Array<{ docType: 'License' | 'PDP'; date?: string }> = [
        { docType: 'License', date: d.licenseExpiryDate },
        { docType: 'PDP', date: d.pdpExpiryDate },
      ];
      for (const c of checks) {
        if (!c.date) continue;
        const du = daysUntil(c.date);
        const t = tierFor(du, stage1AlertDays, stage2AlertDays, 90);
        if (t) {
            addDriver(d, c.docType, c.date, t, du);
        }
      }
    }

    // Sort drivers by urgency
    driversOut.sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);


    const trucksOut: Array<{
      truckFleetNo: string;
      registration: string;
      issueType: 'License' | 'Service' | 'Damage';
      expiryDate?: string;
      loggedDate?: string;
      daysUntilExpiry?: number;
      tier: Tier;
    }> = [];

    const processedTruckKeys = new Set<string>();

    const addTruck = (t: any, issueType: 'License' | 'Service' | 'Damage', tier: Tier, expiryDate?: string, loggedDate?: string, du?: number) => {
        const id = String(t.truckFleetNo ?? t.fleetNo ?? '');
        const key = `${id}-${issueType}-${expiryDate ?? loggedDate}`; // Unique key including date for multiple damages
        if (processedTruckKeys.has(key)) return;
        
        trucksOut.push({
            truckFleetNo: id,
            registration: String(t.registration ?? ''),
            issueType,
            expiryDate,
            loggedDate,
            daysUntilExpiry: du,
            tier,
        });
        processedTruckKeys.add(key);
    };

    // 1. Daily Ops Trucks
    for (const k of truckKeys) {
      const t: any = findTruck(k);
      if (!t) continue;

      // License
      if (t.licenseExpiryDate) {
        const du = daysUntil(t.licenseExpiryDate);
        const tier = tierFor(du, stage1AlertDays, stage2AlertDays, 90);
        if (tier) addTruck(t, 'License', tier, t.licenseExpiryDate, undefined, du);
      }
      // Service
      if (t.serviceDueDate) {
        const du = daysUntil(t.serviceDueDate);
        const tier = tierFor(du, stage1AlertDays, stage2AlertDays, 90);
        if (tier) addTruck(t, 'Service', tier, t.serviceDueDate, undefined, du);
      }
      // Damage
      const unitKey = String(t.truckFleetNo ?? t.fleetNo ?? t.registration ?? '');
      const openDamages = allDamageLogs.filter(
        (dl: any) => dl.assetType === 'truck' && dl.assetUnit === unitKey && dl.status !== 'closed',
      );
      for (const dl of openDamages) {
         addTruck(t, 'Damage', 'open', undefined, String((dl as any).date ?? dayKey));
      }
    }

    trucksOut.sort((a, b) => (a.daysUntilExpiry ?? 0) - (b.daysUntilExpiry ?? 0));


    const trailersOut: Array<{
      trailerFleetNoStr: string;
      issueType: 'License' | 'Service' | 'Damage';
      expiryDate?: string;
      loggedDate?: string;
      daysUntilExpiry?: number;
      tier: Tier;
    }> = [];

    const processedTrailerKeys = new Set<string>();

    const addTrailer = (t: any, issueType: 'License' | 'Service' | 'Damage', tier: Tier, expiryDate?: string, loggedDate?: string, du?: number) => {
        const id = String(t.trailerFleetNoStr ?? t.fleetNoStr ?? '');
        const key = `${id}-${issueType}-${expiryDate ?? loggedDate}`;
        if (processedTrailerKeys.has(key)) return;

        trailersOut.push({
            trailerFleetNoStr: id,
            issueType,
            expiryDate,
            loggedDate,
            daysUntilExpiry: du,
            tier,
        });
        processedTrailerKeys.add(key);
    };

    // 1. Daily Ops Trailers
    for (const k of trailerKeys) {
      const t: any = findTrailer(k);
      if (!t) continue;

      if (t.licenseExpiryDate) {
        const du = daysUntil(t.licenseExpiryDate);
        const tier = tierFor(du, stage1AlertDays, stage2AlertDays, 90);
        if (tier) addTrailer(t, 'License', tier, t.licenseExpiryDate, undefined, du);
      }
      if (t.serviceDueDate) {
        const du = daysUntil(t.serviceDueDate);
        const tier = tierFor(du, stage1AlertDays, stage2AlertDays, 90);
        if (tier) addTrailer(t, 'Service', tier, t.serviceDueDate, undefined, du);
      }
      const unitKey = String(t.trailerFleetNoStr ?? t.fleetNoStr ?? t.registration ?? '');
      const openDamages = allDamageLogs.filter(
        (dl: any) => dl.assetType === 'trailer' && dl.assetUnit === unitKey && dl.status !== 'closed',
      );
      for (const dl of openDamages) {
        addTrailer(t, 'Damage', 'open', undefined, String((dl as any).date ?? dayKey));
      }
    }

    trailersOut.sort((a, b) => (a.daysUntilExpiry ?? 0) - (b.daysUntilExpiry ?? 0));

    return {
      date: dayKey,
      drivers: driversOut,
      trucks: trucksOut,
      trailers: trailersOut,
    };
  },
});
