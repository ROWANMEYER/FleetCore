import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";

// 1. initiateRenewal (mutation)
export const initiateRenewal = mutation({
  args: {
    assetId: v.id("trucks"),
    initiatedBy: v.string(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("truckRenewals")
      .withIndex("by_truckId", (q) =>
        q.eq("truckId", args.assetId)
      )
      .filter((q) => q.eq(q.field("status"), "initiated"))
      .first();

    if (existing) {
      throw new Error("An active renewal already exists for this asset.");
    }

    const now = Date.now();
    const renewalId = await ctx.db.insert("truckRenewals", {
      truckId: args.assetId,
      status: "initiated",
      initiatedAt: now,
      initiatedBy: args.initiatedBy,
      notes: args.notes,
      updatedAt: now,
    });

    await ctx.db.patch(args.assetId, {
      status: "RENEWAL_IN_PROGRESS",
    });

    await ctx.db.insert("truckRenewalLogs", {
      renewalId,
      truckId: args.assetId,
      action: "initiated",
      performedBy: args.initiatedBy,
      timestamp: new Date().toISOString(),
    });

    return renewalId;
  },
});

// 2. completeRenewal (mutation)
export const completeRenewal = mutation({
  args: {
    renewalId: v.id("truckRenewals"),
    expiryDate: v.string(),
    setBy: v.string(),
  },
  handler: async (ctx, args) => {
    const renewal = await ctx.db.get(args.renewalId);
    if (!renewal) {
      throw new Error("Renewal not found.");
    }

    const now = Date.now();
    await ctx.db.patch(args.renewalId, {
      status: "complete",
      expiry: {
        expiryDate: args.expiryDate,
        setAt: now,
        setBy: args.setBy,
      },
      updatedAt: now,
    });

    await ctx.db.patch(renewal.truckId, {
      status: "VALID",
      licenseExpiryDate: args.expiryDate,
    });

    await ctx.db.insert("truckRenewalLogs", {
      renewalId: args.renewalId,
      truckId: renewal.truckId,
      action: "completed",
      performedBy: args.setBy,
      timestamp: new Date().toISOString(),
    });

    return args.renewalId;
  },
});

// 3. stepBack (mutation)
export const stepBack = mutation({
  args: {
    renewalId: v.id("truckRenewals"),
    performedBy: v.string(),
    clearData: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const renewal = await ctx.db.get(args.renewalId);
    if (!renewal) {
      throw new Error("Renewal not found.");
    }

    if (renewal.status === "initiated") {
      await ctx.db.delete(args.renewalId);
      await ctx.db.patch(renewal.truckId, {
        status: "VALID",
      });
      await ctx.db.insert("truckRenewalLogs", {
        renewalId: args.renewalId,
        truckId: renewal.truckId,
        action: "stepped_back_deleted",
        performedBy: args.performedBy,
        timestamp: new Date().toISOString(),
      });
      return args.renewalId;
    }

    if (renewal.status !== "complete") {
      throw new Error("Cannot step back from this state.");
    }

    const patch: any = {
      status: "initiated",
      expiry: undefined,
      updatedAt: Date.now(),
    };

    await ctx.db.patch(args.renewalId, patch);

    await ctx.db.patch(renewal.truckId, {
      status: "RENEWAL_IN_PROGRESS",
    });

    await ctx.db.insert("truckRenewalLogs", {
      renewalId: args.renewalId,
      truckId: renewal.truckId,
      action: args.clearData ? "stepped_back_cleared" : "stepped_back_kept",
      performedBy: args.performedBy,
      timestamp: new Date().toISOString(),
    });

    return args.renewalId;
  },
});

// 4. reset (mutation)
export const reset = mutation({
  args: {
    renewalId: v.id("truckRenewals"),
    performedBy: v.string(),
    clearData: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const renewal = await ctx.db.get(args.renewalId);
    if (!renewal) {
      throw new Error("Renewal not found.");
    }

    const patch: any = {
      status: "initiated",
      updatedAt: Date.now(),
    };

    if (args.clearData) {
      patch.expiry = undefined;
      patch.notes = undefined;
    }

    await ctx.db.patch(args.renewalId, patch);

    await ctx.db.patch(renewal.truckId, {
      status: "VALID",
    });

    await ctx.db.insert("truckRenewalLogs", {
      renewalId: args.renewalId,
      truckId: renewal.truckId,
      action: args.clearData ? "reset_cleared" : "reset_kept",
      performedBy: args.performedBy,
      timestamp: new Date().toISOString(),
    });

    return args.renewalId;
  },
});

// 5. getActiveRenewal (query)
export const getActiveRenewal = query({
  args: {
    assetId: v.id("trucks"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("truckRenewals")
      .withIndex("by_truckId", (q) =>
        q.eq("truckId", args.assetId)
      )
      .filter((q) => q.eq(q.field("status"), "initiated"))
      .order("desc")
      .first();
  },
});

// 6. getRenewalHistory (query)
export const getRenewalHistory = query({
  args: {
    assetId: v.id("trucks"),
  },
  handler: async (ctx, args) => {
    const renewals = await ctx.db
      .query("truckRenewals")
      .withIndex("by_truckId", (q) => q.eq("truckId", args.assetId))
      .order("desc")
      .collect();

    const renewalsWithLogs = await Promise.all(
      renewals.map(async (renewal) => {
        const logs = await ctx.db
          .query("truckRenewalLogs")
          .withIndex("by_renewalId", (q) => q.eq("renewalId", renewal._id))
          .order("desc")
          .collect();
        return { ...renewal, logs };
      })
    );

    return renewalsWithLogs;
  },
});
