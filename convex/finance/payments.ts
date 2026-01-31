import { mutation, query } from "../_generated/server";
import { v } from "convex/values";

export const createPayments = mutation({
  args: {
    payments: v.array(
      v.object({
        paymentDate: v.string(),
        amount: v.number(),
        reference: v.optional(v.string()),
        rawDescription: v.string(),
        source: v.string(),
        flags: v.array(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const importedAt = Date.now();
    for (const payment of args.payments) {
      await ctx.db.insert("payments", {
        ...payment,
        importedAt,
      });
    }
  },
});

export const getPaymentsWithAllocationStatus = query({
  args: {},
  handler: async (ctx) => {
    const payments = await ctx.db.query("payments").order("desc").collect();
    const allocations = await ctx.db.query("paymentAllocations").collect();

    const allocatedByPayment: Record<string, number> = {};
    const onAccountByPayment: Record<string, boolean> = {};
    const onAccountAmountByPayment: Record<string, number> = {};
    const onAccountClientsByPayment: Record<string, Set<string>> = {};

    for (const alloc of allocations) {
      const key = alloc.paymentId;
      allocatedByPayment[key] =
        (allocatedByPayment[key] || 0) + alloc.allocatedAmount;
      
      if (alloc.allocationType === "ON_ACCOUNT") {
        onAccountByPayment[key] = true;
        onAccountAmountByPayment[key] = (onAccountAmountByPayment[key] || 0) + alloc.allocatedAmount;
        if (alloc.clientName) {
          if (!onAccountClientsByPayment[key]) {
            onAccountClientsByPayment[key] = new Set();
          }
          onAccountClientsByPayment[key].add(alloc.clientName);
        }
      }
    }

    return payments.map((p) => {
      const allocatedAmount = allocatedByPayment[p._id] || 0;
      const remainingAmount = p.amount - allocatedAmount;
      const hasOnAccount = onAccountByPayment[p._id] || false;
      const onAccountAmount = onAccountAmountByPayment[p._id] || 0;
      
      const onAccountClientNames = onAccountClientsByPayment[p._id] 
        ? Array.from(onAccountClientsByPayment[p._id]).join(", ") 
        : undefined;

      let allocationStatus: "Unallocated" | "Partially Allocated" | "Fully Allocated";
      if (allocatedAmount === 0) {
        allocationStatus = "Unallocated";
      } else if (Math.abs(remainingAmount) < 0.01) {
        allocationStatus = "Fully Allocated";
      } else {
        allocationStatus = "Partially Allocated";
      }

      return {
        ...p,
        allocatedAmount,
        remainingAmount,
        allocationStatus,
        hasOnAccount,
        onAccountAmount,
        onAccountClientNames,
      };
    });
  },
});

export const updatePaymentMetadata = mutation({
  args: {
    paymentId: v.id("payments"),
    paymentDate: v.optional(v.string()),
    reference: v.optional(v.string()),
    flags: v.array(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const payment = await ctx.db.get(args.paymentId);
    if (!payment) {
      throw new Error("Payment not found");
    }

    const patch: {
      paymentDate?: string;
      reference?: string;
      flags?: string[];
      notes?: string;
    } = {};

    if (args.paymentDate !== undefined) {
      patch.paymentDate = args.paymentDate;
    }
    if (args.reference !== undefined) {
      patch.reference = args.reference ?? "";
    }
    patch.flags = args.flags;
    if (args.notes !== undefined) {
      patch.notes = args.notes ?? "";
    }

    await ctx.db.patch(args.paymentId, patch);
  },
});

export const deletePaymentIfUnallocated = mutation({
  args: {
    paymentId: v.id("payments"),
  },
  handler: async (ctx, args) => {
    const allocations = await ctx.db
      .query("paymentAllocations")
      .withIndex("by_paymentId", (q) => q.eq("paymentId", args.paymentId))
      .collect();

    if (allocations.length > 0) {
      throw new Error("Cannot delete a payment that has allocations.");
    }

    await ctx.db.delete(args.paymentId);
  },
});
