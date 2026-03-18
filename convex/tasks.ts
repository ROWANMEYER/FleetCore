import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

// ============================================================================
// HELPER: DATE CALCULATIONS
// ============================================================================

function getDaysDiff(targetDateStr: string) {
  if (!targetDateStr) return 999;
  const target = new Date(targetDateStr).getTime();
  const now = Date.now();
  const diffTime = target - now;
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
}

function getPriority(daysDiff: number): "critical" | "warning" | "normal" {
  if (daysDiff < 0) return "critical"; // Overdue
  if (daysDiff <= 30) return "warning"; // Due soon
  return "normal";
}

// ============================================================================
// QUERIES
// ============================================================================

export const getMyDayTasks = query({
  handler: async (ctx) => {
    const now = Date.now();
    const todayStr = new Date().toISOString().slice(0, 10);

    // Snoozes and resolutions (unchanged)
    const snoozes = await ctx.db
      .query("taskSnoozes")
      .filter((q) => q.gt(q.field("snoozeUntil"), now))
      .collect();
    const snoozedIds = new Set(snoozes.map((s) => s.refId));

    const resolutions = await ctx.db.query("taskResolutions").collect();
    const resolvedMap = new Map();
    resolutions.forEach((r) => resolvedMap.set(r.refId, r.expiryDate));

    // Manual tasks (unchanged)
    const manualTasks = await ctx.db
      .query("tasks")
      .withIndex("by_completed", (q) => q.eq("completed", false))
      .collect();

    // Fetch all fleet data
    const drivers = await ctx.db.query("drivers").collect();
    const trucks = await ctx.db.query("trucks").collect();
    const trailers = await ctx.db.query("trailers").collect();
    const pdpApps = await ctx.db.query("pdpApplications").collect();
    const truckRenewals = await ctx.db.query("truckRenewals").collect();
    const trailerRenewals = await ctx.db.query("trailerRenewals").collect();

    // Fetch today's availability record
    const availabilityRecords = await ctx.db
      .query("dailyAvailability")
      .withIndex("by_date", (q) => q.eq("date", todayStr))
      .collect();

    // Build sets of available asset identifiers
    // dailyAvailability stores driver names,
    // truck fleet nos, trailer fleet nos as strings
    const availableDriverNames = new Set<string>();
    const availableTruckFleetNos = new Set<string>();
    const availableTrailerFleetNos = new Set<string>();

    availabilityRecords.forEach((rec) => {
      rec.drivers.forEach((d) => availableDriverNames.add(d.toString().trim().toLowerCase()));
      rec.trucks.forEach((t) => availableTruckFleetNos.add(t.toString().trim().toLowerCase()));
      rec.trailers.forEach((t) => availableTrailerFleetNos.add(t.toString().trim().toLowerCase()));
    });

    const hasAvailability = availabilityRecords.length > 0;

    const generatedTasks: any[] = [];

    // DRIVERS — only if available today
    drivers.forEach((d) => {
      const nameKey = (d.driverName ?? "").trim().toLowerCase();
      if (hasAvailability && !availableDriverNames.has(nameKey)) return;

      // Licence expiry
      if (d.licenseExpiryDate) {
        const diff = getDaysDiff(d.licenseExpiryDate);
        if (diff <= 90) {
          const id = `driver-license-${d._id}`;
          if (
            !snoozedIds.has(id) &&
            resolvedMap.get(id) !== new Date(d.licenseExpiryDate).toISOString()
          ) {
            generatedTasks.push({
              id,
              title: `Renew Driver Licence: ${d.driverName}`,
              assetName: d.driverName,
              assetField: "Licence",
              description: `Expires ${d.licenseExpiryDate}`,
              priority: getPriority(diff),
              dueDate: new Date(d.licenseExpiryDate).toISOString(),
              completed: false,
              createdAt: now,
              type: "fleet",
              referenceType: "driver",
              referenceId: d._id,
            });
          }
        }
      }

      // PDP expiry
      if (d.pdpExpiryDate) {
        const diff = getDaysDiff(d.pdpExpiryDate);
        if (diff <= 90) {
          const id = `driver-prdp-${d._id}`;
          if (
            !snoozedIds.has(id) &&
            resolvedMap.get(id) !== new Date(d.pdpExpiryDate).toISOString()
          ) {
            generatedTasks.push({
              id,
              title: `Renew PDP: ${d.driverName}`,
              assetName: d.driverName,
              assetField: "PDP",
              description: `Expires ${d.pdpExpiryDate}`,
              priority: getPriority(diff),
              dueDate: new Date(d.pdpExpiryDate).toISOString(),
              completed: false,
              createdAt: now,
              type: "fleet",
              referenceType: "driver",
              referenceId: d._id,
            });
          }
        }
      }

      // Active PDP application
      const activePdp = pdpApps.find((a: any) => {
        if (a.driverId !== d._id) return false;
        const s = ((a.status ?? "") as string).toUpperCase();
        return !s.includes("COMPLETE") && !s.includes("COMPLETED") && !a.expiry?.expiryDate;
      });
      if (activePdp) {
        const id = `driver-pdpapp-${d._id}`;
        if (!snoozedIds.has(id)) {
          generatedTasks.push({
            id,
            title: `PDP Application: ${d.driverName}`,
            assetName: d.driverName,
            assetField: "PDP Application",
            description: `Status: ${activePdp.status ?? ""}`,
            priority: "warning",
            dueDate: new Date().toISOString(),
            completed: false,
            createdAt: now,
            type: "fleet",
            referenceType: "driver",
            referenceId: d._id,
          });
        }
      }
    });

    // TRUCKS — only if available today
    trucks.forEach((t) => {
      const fleetKey = (t.truckFleetNo ?? "").toString().trim().toLowerCase();
      if (hasAvailability && !availableTruckFleetNos.has(fleetKey)) return;

      // Licence expiry
      if (t.licenseExpiryDate) {
        const diff = getDaysDiff(t.licenseExpiryDate);
        if (diff <= 90) {
          const id = `truck-license-${t._id}`;
          if (
            !snoozedIds.has(id) &&
            resolvedMap.get(id) !== new Date(t.licenseExpiryDate).toISOString()
          ) {
            generatedTasks.push({
              id,
              title: `Renew Truck Licence: ${t.truckFleetNo}`,
              assetName: `Truck ${t.truckFleetNo}`,
              assetField: "Licence",
              description: `Expires ${t.licenseExpiryDate}`,
              priority: getPriority(diff),
              dueDate: new Date(t.licenseExpiryDate).toISOString(),
              completed: false,
              createdAt: now,
              type: "fleet",
              referenceType: "truck",
              referenceId: t._id,
            });
          }
        }
      }

      // Service due
      if (t.serviceDueDate) {
        const diff = getDaysDiff(t.serviceDueDate);
        if (diff <= 30) {
          const id = `truck-service-${t._id}`;
          if (!snoozedIds.has(id) && resolvedMap.get(id) !== new Date(t.serviceDueDate).toISOString()) {
            generatedTasks.push({
              id,
              title: `Truck Service Due: ${t.truckFleetNo}`,
              assetName: `Truck ${t.truckFleetNo}`,
              assetField: "Service",
              description: `Service due on ${t.serviceDueDate}`,
              priority: getPriority(diff),
              dueDate: new Date(t.serviceDueDate).toISOString(),
              completed: false,
              createdAt: now,
              type: "fleet",
              referenceType: "truck",
              referenceId: t._id,
            });
          }
        }
      }

      // Renewal in progress
      const activeRenewal = truckRenewals.find((r) => r.truckId === t._id && r.status === "initiated");
      if (activeRenewal) {
        const id = `truck-renewal-${t._id}`;
        if (!snoozedIds.has(id)) {
          generatedTasks.push({
            id,
            title: `Licence Renewal In Progress: Truck ${t.truckFleetNo}`,
            assetName: `Truck ${t.truckFleetNo}`,
            assetField: "Renewal",
            description: "Renewal initiated — awaiting completion",
            priority: "warning",
            dueDate: new Date().toISOString(),
            completed: false,
            createdAt: now,
            type: "fleet",
            referenceType: "truck",
            referenceId: t._id,
          });
        }
      }
    });

    // TRAILERS — only if available today
    trailers.forEach((t) => {
      const fleetKey = (t.trailerFleetNoStr ?? "").toString().trim().toLowerCase();
      if (hasAvailability && !availableTrailerFleetNos.has(fleetKey)) return;

      // Licence expiry
      if (t.licenseExpiryDate) {
        const diff = getDaysDiff(t.licenseExpiryDate);
        if (diff <= 90) {
          const id = `trailer-license-${t._id}`;
          if (
            !snoozedIds.has(id) &&
            resolvedMap.get(id) !== new Date(t.licenseExpiryDate).toISOString()
          ) {
            const regs = t.trailers.map((tr) => tr.registration).join(", ");
            generatedTasks.push({
              id,
              title: `Renew Trailer Licence: ${t.trailerFleetNoStr}`,
              assetName: `Trailer ${t.trailerFleetNoStr}`,
              assetField: "Licence",
              description: regs
                ? `${regs} — expires ${t.licenseExpiryDate}`
                : `Expires ${t.licenseExpiryDate}`,
              priority: getPriority(diff),
              dueDate: new Date(t.licenseExpiryDate).toISOString(),
              completed: false,
              createdAt: now,
              type: "fleet",
              referenceType: "trailer",
              referenceId: t._id,
            });
          }
        }
      }

      // Service due
      if (t.serviceDueDate) {
        const diff = getDaysDiff(t.serviceDueDate);
        if (diff <= 30) {
          const id = `trailer-service-${t._id}`;
          if (!snoozedIds.has(id) && resolvedMap.get(id) !== new Date(t.serviceDueDate).toISOString()) {
            generatedTasks.push({
              id,
              title: `Trailer Service Due: ${t.trailerFleetNoStr}`,
              assetName: `Trailer ${t.trailerFleetNoStr}`,
              assetField: "Service",
              description: `Service due on ${t.serviceDueDate}`,
              priority: getPriority(diff),
              dueDate: new Date(t.serviceDueDate).toISOString(),
              completed: false,
              createdAt: now,
              type: "fleet",
              referenceType: "trailer",
              referenceId: t._id,
            });
          }
        }
      }

      // Renewal in progress
      const activeRenewal = trailerRenewals.find((r) => r.trailerId === t._id && r.status === "initiated");
      if (activeRenewal) {
        const id = `trailer-renewal-${t._id}`;
        if (!snoozedIds.has(id)) {
          generatedTasks.push({
            id,
            title: `Licence Renewal In Progress: Trailer ${t.trailerFleetNoStr}`,
            assetName: `Trailer ${t.trailerFleetNoStr}`,
            assetField: "Renewal",
            description: "Renewal initiated — awaiting completion",
            priority: "warning",
            dueDate: new Date().toISOString(),
            completed: false,
            createdAt: now,
            type: "fleet",
            referenceType: "trailer",
            referenceId: t._id,
          });
        }
      }
    });

    // Merge and sort
    const activeManualTasks = manualTasks.filter((t) => !snoozedIds.has(t._id));

    const allTasks = [
      ...activeManualTasks.map((t) => ({
        ...t,
        type: "manual",
        id: t._id,
      })),
      ...generatedTasks,
    ];

    const priorityOrder = {
      critical: 0,
      warning: 1,
      normal: 2,
    };

    return allTasks.sort((a, b) => {
      const pA = priorityOrder[a.priority as keyof typeof priorityOrder] ?? 2;
      const pB = priorityOrder[b.priority as keyof typeof priorityOrder] ?? 2;
      return pA - pB;
    });
  },
});

// ============================================================================
// MUTATIONS
// ============================================================================

export const completeManualTask = mutation({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.taskId, { completed: true });
  },
});

export const resolveFleetTask = mutation({
  args: {
    refId: v.string(),
    refType: v.string(),
    expiryDate: v.optional(v.string()), // The date being resolved
  },
  handler: async (ctx, args) => {
    // Check if already resolved?
    // Just insert
    await ctx.db.insert("taskResolutions", {
      refId: args.refId,
      refType: args.refType,
      expiryDate: args.expiryDate,
      resolvedAt: Date.now(),
      resolvedBy: "user", // TODO: Get user from auth
    });
  },
});

export const snoozeTask = mutation({
  args: {
    refId: v.string(),
    durationMs: v.number(), // e.g. 24 * 60 * 60 * 1000
  },
  handler: async (ctx, args) => {
    const snoozeUntil = Date.now() + args.durationMs;
    await ctx.db.insert("taskSnoozes", {
      refId: args.refId,
      snoozeUntil,
      snoozedBy: "user",
    });
  },
});

export const addManualTask = mutation({
  args: {
    title: v.string(),
    description: v.optional(v.string()),
    priority: v.string(),
    dueDate: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("tasks", {
      ...args,
      completed: false,
      createdAt: Date.now(),
    });
  },
});

// Note: Fleet Tasks cannot be "completed" directly via a generic mutation
// because they reflect the state of the fleet.
// The user must update the underlying record (e.g., set new expiry date).
