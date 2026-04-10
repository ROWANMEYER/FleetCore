import { internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";

const PDP_STATUS = {
  IN_PROGRESS: "IN PROGRESS",
  DOCS_SUBMITTED: "DOCS SUBMITTED",
  BLOCKED_MEDICAL: "BLOCKED — MEDICAL",
  FLAGGED_RETRY: "FLAGGED — RETRY",
  ON_HOLD_SERVICES: "ON HOLD — SERVICES",
  ON_HOLD_FINE: "ON HOLD — FINE",
  COMPLETE: "COMPLETE",
} as const;

type PdpStatus = (typeof PDP_STATUS)[keyof typeof PDP_STATUS];

const CONTINGENCY_REASON_TO_STATUS: Record<string, PdpStatus> = {
  "High Blood Pressure": PDP_STATUS.BLOCKED_MEDICAL,
  "Failed Eye Test": PDP_STATUS.FLAGGED_RETRY,
  "Services Offline": PDP_STATUS.ON_HOLD_SERVICES,
  "Outstanding Fine on Driver's Name": PDP_STATUS.ON_HOLD_FINE,
};

function nowIso() {
  return new Date().toISOString();
}

async function requireDriver(ctx: any, driverId: Id<"drivers">) {
  const doc = await ctx.db.get(driverId);
  if (!doc) {
    throw new Error("Document not found");
  }
  return doc;
}

async function upsertApplicationForDriver(ctx: any, driverId: Id<"drivers">) {
  const existing = await ctx.db
    .query("pdpApplications")
    .withIndex("by_driverId", (q: any) => q.eq("driverId", driverId))
    .first();

  if (existing) return existing;

  const now = Date.now();
  const applicationId = await ctx.db.insert("pdpApplications", {
    driverId,
    status: PDP_STATUS.IN_PROGRESS,
    createdAt: now,
    updatedAt: now,
  });
  console.log("Inserted pdpApplication with driverId:", driverId);

  const doc = await ctx.db.get(applicationId);
  if (!doc) {
    throw new Error("Document not found");
  }
  return doc;
}

async function appendLog(ctx: any, args: {
  applicationId: Id<"pdpApplications">;
  driverId: Id<"drivers">;
  action: string;
  performedBy: string;
  notes?: string;
}) {
  await ctx.db.insert("pdpApplicationLogs", {
    applicationId: args.applicationId,
    driverId: args.driverId,
    action: args.action,
    timestamp: nowIso(),
    performedBy: args.performedBy,
    notes: args.notes,
  });
}

export const getApplicationByDriver = query({
  args: { driverId: v.id("drivers") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("pdpApplications")
      .withIndex("by_driverId", (q) => q.eq("driverId", args.driverId))
      .first();
  },
});

export const getApplicationLogsByDriver = query({
  args: { driverId: v.id("drivers") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("pdpApplicationLogs")
      .withIndex("by_driverId", (q) => q.eq("driverId", args.driverId))
      .collect();
  },
});

export const getActiveApplications = internalQuery({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("pdpApplications").collect();
    const filtered = all.filter((a: any) => {
      const statusUpper = (a.status ?? "").toString().toUpperCase();
      const done = statusUpper.includes("COMPLETE") || statusUpper.includes("COMPLETED") || !!a.expiry?.expiryDate;
      return !done;
    });
    
    // Log any found with empty driverId
    filtered.forEach(a => {
        if (!a.driverId || a.driverId.trim() === "") {
            console.error("Found active application with invalid driverId:", a);
        }
    });
    
    return filtered;
  },
});

export const markDeparted = mutation({
  args: {
    driverId: v.id("drivers"),
    pdpType: v.string(),
    performedBy: v.string(),
    departedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    console.log("markDeparted called with driverId:", args.driverId);
    const driver = await requireDriver(ctx, args.driverId);
    if (!driver) throw new Error("Driver not found");

    const existing = await ctx.db
      .query("pdpApplications")
      .withIndex("by_driverId", (q) => q.eq("driverId", args.driverId))
      .first();

    const now = Date.now();
    const ts = args.departedAt ?? now;
    const applicationId: Id<"pdpApplications"> = existing
      ? (existing._id as any)
      : await ctx.db.insert("pdpApplications", {
          driverId: args.driverId,
          status: PDP_STATUS.IN_PROGRESS,
          createdAt: now,
          updatedAt: now,
        });

    await ctx.db.patch(applicationId, {
      status: PDP_STATUS.IN_PROGRESS,
      pdpType: args.pdpType,
      departedAt: ts,
      updatedAt: now,
      contingency: undefined,
    });

    await appendLog(ctx, {
      applicationId,
      driverId: args.driverId,
      action: "departed",
      performedBy: args.performedBy,
      notes: `PDP type: ${args.pdpType}`,
    });

    const doc = await ctx.db.get(applicationId);
    if (!doc) {
      throw new Error("Document not found");
    }
    return doc;
  },
});

export const submitDocs = mutation({
  args: {
    driverId: v.id("drivers"),
    performedBy: v.string(),
    notes: v.optional(v.string()),
    attachmentIds: v.optional(v.array(v.id("attachments"))),
    returnAt: v.optional(v.number()),
    contingency: v.optional(
      v.object({
        reason: v.string(),
        resolutionNote: v.string(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const driver = await requireDriver(ctx, args.driverId);
    if (!driver) throw new Error("Driver not found");

    const app = await upsertApplicationForDriver(ctx, args.driverId);
    if (!app) throw new Error("Failed to create application");

    const now = Date.now();
    const ts = args.returnAt ?? now;
    const contingency = args.contingency;

    if (contingency && !contingency.resolutionNote.trim()) {
      throw new Error("Resolution note is required when a contingency is selected");
    }

    let nextStatus: PdpStatus = PDP_STATUS.DOCS_SUBMITTED;
    if (contingency) {
      const mapped = CONTINGENCY_REASON_TO_STATUS[contingency.reason];
      if (!mapped) {
        throw new Error("Invalid contingency reason");
      }
      nextStatus = mapped;
    }

    await ctx.db.patch(app._id, {
      returnAt: ts,
      docsNotes: args.notes,
      docAttachmentIds: args.attachmentIds,
      contingency: contingency ? { reason: contingency.reason, resolutionNote: contingency.resolutionNote } : undefined,
      status: nextStatus,
      updatedAt: now,
    });

    await appendLog(ctx, {
      applicationId: app._id,
      driverId: args.driverId,
      action: contingency ? "contingency_flagged" : "docs_submitted",
      performedBy: args.performedBy,
      notes: contingency ? contingency.resolutionNote : args.notes,
    });

    const doc = await ctx.db.get(app._id);
    if (!doc) {
      throw new Error("Document not found");
    }
    return doc;
  },
});

export const submitCardCopy = mutation({
  args: {
    driverId: v.id("drivers"),
    performedBy: v.string(),
    cardNumber: v.string(),
    frontAttachmentId: v.optional(v.id("attachments")),
    backAttachmentId: v.optional(v.id("attachments")),
    collectedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const driver = await requireDriver(ctx, args.driverId);
    if (!driver) throw new Error("Driver not found");
    const app = await upsertApplicationForDriver(ctx, args.driverId);
    if (!app) throw new Error("Failed to create application");

    const now = Date.now();
    const ts = args.collectedAt ?? now;
    await ctx.db.patch(app._id, {
      card: {
        frontAttachmentId: args.frontAttachmentId,
        backAttachmentId: args.backAttachmentId,
        cardNumber: args.cardNumber,
        collectedAt: ts,
      },
      updatedAt: now,
    });

    await appendLog(ctx, {
      applicationId: app._id,
      driverId: args.driverId,
      action: "card_collected",
      performedBy: args.performedBy,
      notes: `Card number: ${args.cardNumber}`,
    });

    const doc = await ctx.db.get(app._id);
    if (!doc) {
      throw new Error("Document not found");
    }
    return doc;
  },
});


export const setExpiryAndComplete = mutation({
  args: {
    driverId: v.id("drivers"),
    performedBy: v.string(),
    expiryDate: v.string(), // YYYY-MM-DD
    reminderNotificationIds: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const driver = await requireDriver(ctx, args.driverId);
    if (!driver) throw new Error("Driver not found");
    const app = await upsertApplicationForDriver(ctx, args.driverId);
    if (!app) throw new Error("Failed to create application");

    const now = Date.now();
    await ctx.db.patch(app._id, {
      expiry: {
        expiryDate: args.expiryDate,
        reminderNotificationIds: args.reminderNotificationIds,
        setAt: now,
      },
      status: PDP_STATUS.COMPLETE,
      updatedAt: now,
    });

    await ctx.db.patch(args.driverId, {
      pdpExpiryDate: args.expiryDate,
    });

    await appendLog(ctx, {
      applicationId: app._id,
      driverId: args.driverId,
      action: "expiry_set",
      performedBy: args.performedBy,
      notes: `Expiry: ${args.expiryDate}`,
    });

    await appendLog(ctx, {
      applicationId: app._id,
      driverId: args.driverId,
      action: "completed",
      performedBy: args.performedBy,
    });

    const doc = await ctx.db.get(app._id);
    if (!doc) {
      throw new Error("Document not found");
    }
    return doc;
  },
});

export const logContingencyAndReset = mutation({
  args: {
    driverId: v.id("drivers"),
    performedBy: v.string(),
    reasons: v.array(v.string()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const driver = await requireDriver(ctx, args.driverId);
    if (!driver) throw new Error("Driver not found");
    const app = await upsertApplicationForDriver(ctx, args.driverId);
    if (!app) throw new Error("Failed to create application");

    const now = Date.now();
    const prevCount = (app as any).retryCount ?? 0;
    const prevList: any[] = (app as any).contingencies ?? [];

    await ctx.db.patch(app._id, {
      status: PDP_STATUS.IN_PROGRESS,
      departedAt: undefined,
      returnAt: undefined,
      docsNotes: undefined,
      docAttachmentIds: undefined,
      contingency: undefined,
      retryCount: prevCount + 1,
      contingencies: [
        ...prevList,
        {
          reasons: args.reasons,
          note: args.note,
          timestamp: nowIso(),
          performedBy: args.performedBy,
        },
      ],
      updatedAt: now,
    });

    await appendLog(ctx, {
      applicationId: app._id,
      driverId: args.driverId,
      action: "contingency_logged_and_reset",
      performedBy: args.performedBy,
      notes: args.reasons.join(", ") + (args.note ? ` — ${args.note}` : ""),
    });

    const doc = await ctx.db.get(app._id);
    if (!doc) {
      throw new Error("Document not found");
    }
    return doc;
  },
});

export const undoStage = mutation({
  args: {
    driverId: v.id("drivers"),
    performedBy: v.string(),
    targetStage: v.union(v.literal("expiry"), v.literal("card"), v.literal("docs"), v.literal("departed")),
    clearData: v.boolean(),
  },
  handler: async (ctx, args) => {
    console.log("pdp.undoStage", args);
    const driver = await requireDriver(ctx, args.driverId);
    if (!driver) throw new Error("Driver not found");
    const app = await upsertApplicationForDriver(ctx, args.driverId);
    if (!app) throw new Error("Failed to create application");

    const now = Date.now();
    const patch: any = {
      status: (app.status as PdpStatus) ?? PDP_STATUS.IN_PROGRESS,
      updatedAt: now,
    };

    if (args.targetStage === "expiry") {
      if ((patch.status as string).toUpperCase().includes("COMPLETE")) patch.status = PDP_STATUS.DOCS_SUBMITTED;
      patch.expiry = undefined;
      if (args.clearData) {
        patch.expiry = undefined;
      }
    } else if (args.targetStage === "card") {
      if ((patch.status as string).toUpperCase().includes("COMPLETE")) patch.status = PDP_STATUS.DOCS_SUBMITTED;
      patch.expiry = undefined;
      if (args.clearData) {
        patch.card = undefined;
      } else if ((app as any).card) {
        patch.card = { ...(app as any).card, collectedAt: undefined };
      }
    } else if (args.targetStage === "docs") {
      patch.status = PDP_STATUS.IN_PROGRESS;
      patch.returnAt = undefined;
      patch.contingency = undefined;
      patch.card = undefined;
      patch.expiry = undefined;
      if (args.clearData) {
        patch.docsNotes = undefined;
        patch.docAttachmentIds = undefined;
      }
    } else if (args.targetStage === "departed") {
      if (args.clearData) {
        await ctx.db.delete(app._id);
        return null;
      }
      patch.status = PDP_STATUS.IN_PROGRESS;
      patch.departedAt = undefined;
      patch.returnAt = undefined;
      patch.docsNotes = undefined;
      patch.docAttachmentIds = undefined;
      patch.contingency = undefined;
      patch.card = undefined;
      patch.expiry = undefined;
    }

    await ctx.db.patch(app._id, patch);

    await appendLog(ctx, {
      applicationId: app._id,
      driverId: args.driverId,
      action: "undo_stage",
      performedBy: args.performedBy,
      notes: `${args.targetStage}${args.clearData ? " (clear)" : " (keep)"}`,
    });

    const doc = await ctx.db.get(app._id);
    if (!doc) {
      throw new Error("Document not found");
    }
    return doc;
  },
});

export const resetFlow = mutation({
  args: {
    driverId: v.id("drivers"),
    performedBy: v.string(),
    clearData: v.boolean(),
  },
  handler: async (ctx, args) => {
    console.log("pdp.resetFlow", args);
    const driver = await requireDriver(ctx, args.driverId);
    if (!driver) throw new Error("Driver not found");
    const app = await upsertApplicationForDriver(ctx, args.driverId);
    if (!app) throw new Error("Failed to create application");

    const now = Date.now();
    if (args.clearData) {
      await ctx.db.delete(app._id);
      return null;
    }

    const patch: any = {
      status: PDP_STATUS.IN_PROGRESS,
      departedAt: undefined,
      returnAt: undefined,
      contingency: undefined,
      updatedAt: now,
    };

    if ((app as any).card) patch.card = { ...(app as any).card, collectedAt: undefined };
    patch.expiry = undefined;

    await ctx.db.patch(app._id, patch);

    await appendLog(ctx, {
      applicationId: app._id,
      driverId: args.driverId,
      action: "reset_flow",
      performedBy: args.performedBy,
      notes: "keep",
    });

    const doc = await ctx.db.get(app._id);
    if (!doc) {
      throw new Error("Document not found");
    }
    return doc;
  },
});

export const getReportData = query({
  args: {
    fromDate: v.string(), // YYYY-MM-DD
    toDate: v.string(), // YYYY-MM-DD
    driverId: v.optional(v.id("drivers")),
  },
  handler: async (ctx, args) => {
    const fromMs = Date.parse(`${args.fromDate}T00:00:00.000Z`);
    const toMs = Date.parse(`${args.toDate}T23:59:59.999Z`);
    if (Number.isNaN(fromMs) || Number.isNaN(toMs)) {
      throw new Error("Invalid date range");
    }

    let applications = await ctx.db.query("pdpApplications").collect();
    applications = applications.filter((a: any) => a.createdAt >= fromMs && a.createdAt <= toMs);
    if (args.driverId) {
      applications = applications.filter((a: any) => a.driverId === args.driverId);
    }

    const logsByApp = await Promise.all(
      applications.map((a: any) =>
        ctx.db
          .query("pdpApplicationLogs")
          .withIndex("by_applicationId", (q: any) => q.eq("applicationId", a._id))
          .collect()
      )
    );
    const logs = logsByApp.flat();

    const drivers = await ctx.db.query("drivers").collect();
    const expiryDrivers = drivers
      .filter((d: any) => typeof d.pdpExpiryDate === "string" && d.pdpExpiryDate.length > 0)
      .map((d: any) => ({
        driverId: d._id,
        name: d.driverName,
        surname: (d as any).surname,
        pdpExpiryDate: d.pdpExpiryDate,
      }));

    return { applications, logs, drivers, expiryDrivers };
  },
});

export { generateReport } from "./pdpReport";
