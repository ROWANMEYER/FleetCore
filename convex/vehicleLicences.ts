import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";

export const updateStatus = mutation({
  args: {
    vehicleId: v.string(),
    status: v.string(), // "VALID" | "RENEWAL_REQUIRED" | "RENEWAL_IN_PROGRESS" | "EXPIRED"
  },
  handler: async (ctx, args) => {
    // Try to update as a truck first
    const truckId = args.vehicleId as Id<"trucks">;
    const truck = await ctx.db.get(truckId);
    if (truck) {
      await ctx.db.patch(truckId, {
        status: args.status,
      });
      return;
    }

    // Try to update as a trailer
    const trailerId = args.vehicleId as Id<"trailers">;
    const trailer = await ctx.db.get(trailerId);
    if (trailer) {
      await ctx.db.patch(trailerId, {
        status: args.status,
      });
      return;
    }

    throw new Error(`Vehicle with ID ${args.vehicleId} not found in trucks or trailers.`);
  },
});

export const recordRenewal = mutation({
  args: {
    vehicleId: v.string(),
    renewalDate: v.string(),
    newExpiryDate: v.string(),
    receiptPhotoUrl: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const status = "VALID";
    
    // Try truck
    const truckId = args.vehicleId as Id<"trucks">;
    const truck = await ctx.db.get(truckId);
    if (truck) {
      await ctx.db.patch(truckId, {
        status,
        licenseExpiryDate: args.newExpiryDate,
        lastRenewalDate: args.renewalDate,
        renewalNotes: args.notes,
        receiptPhotoUrl: args.receiptPhotoUrl,
      });
      return;
    }

    // Try trailer
    const trailerId = args.vehicleId as Id<"trailers">;
    const trailer = await ctx.db.get(trailerId);
    if (trailer) {
      await ctx.db.patch(trailerId, {
        status,
        licenseExpiryDate: args.newExpiryDate,
        lastRenewalDate: args.renewalDate,
        renewalNotes: args.notes,
        receiptPhotoUrl: args.receiptPhotoUrl,
      });
      return;
    }

    throw new Error(`Vehicle with ID ${args.vehicleId} not found in trucks or trailers.`);
  },
});
