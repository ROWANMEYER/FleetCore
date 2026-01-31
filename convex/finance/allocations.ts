import { mutation, query } from "../_generated/server";
import { v } from "convex/values";

export const createAllocation = mutation({
  args: {
    paymentId: v.id("payments"),
    snapshotId: v.id("ageSnapshots"),
    snapshotRowId: v.id("ageSnapshotRows"),
    amount: v.number(),
  },
  handler: async (ctx, args) => {
    const payment = await ctx.db.get(args.paymentId);
    if (!payment) throw new Error("Payment not found");

    const row = await ctx.db.get(args.snapshotRowId);
    if (!row) throw new Error("Customer row not found");
    if (row.snapshotId !== args.snapshotId) throw new Error("Snapshot ID mismatch");

    const existingAllocations = await ctx.db
      .query("paymentAllocations")
      .withIndex("by_paymentId", (q) => q.eq("paymentId", args.paymentId))
      .collect();

    const totalAllocated = existingAllocations.reduce((sum, a) => sum + a.allocatedAmount, 0);
    const remaining = payment.amount - totalAllocated;

    if (args.amount > remaining + 0.01) {
      throw new Error(`Cannot allocate ${args.amount}. Only ${remaining} remaining.`);
    }

    await ctx.db.insert("paymentAllocations", {
      paymentId: args.paymentId,
      allocationType: "SNAPSHOT",
      snapshotId: args.snapshotId,
      snapshotRowId: args.snapshotRowId,
      allocatedAmount: args.amount,
      allocatedAt: Date.now(),
      allocatedBy: "manual",
    });
  },
});

export const createOnAccountAllocation = mutation({
  args: {
    paymentId: v.id("payments"),
    amount: v.number(),
    accountNumber: v.string(),
    clientName: v.string(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const payment = await ctx.db.get(args.paymentId);
    if (!payment) throw new Error("Payment not found");

    const existingAllocations = await ctx.db
      .query("paymentAllocations")
      .withIndex("by_paymentId", (q) => q.eq("paymentId", args.paymentId))
      .collect();

    const totalAllocated = existingAllocations.reduce((sum, a) => sum + a.allocatedAmount, 0);
    const remaining = payment.amount - totalAllocated;

    if (args.amount > remaining + 0.01) {
      throw new Error(`Cannot allocate ${args.amount}. Only ${remaining} remaining.`);
    }

    await ctx.db.insert("paymentAllocations", {
      paymentId: args.paymentId,
      allocationType: "ON_ACCOUNT",
      accountNumber: args.accountNumber,
      clientName: args.clientName,
      allocatedAmount: args.amount,
      allocatedAt: Date.now(),
      allocatedBy: "manual",
      notes: args.notes,
    });
  },
});

export const getPaymentAllocations = query({
  args: { paymentId: v.id("payments") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("paymentAllocations")
      .withIndex("by_paymentId", (q) => q.eq("paymentId", args.paymentId))
      .collect();
  },
});

export const getUnallocatedPaymentsSummary = query({
  args: {},
  handler: async (ctx) => {
    const payments = await ctx.db.query("payments").collect();
    const allocations = await ctx.db.query("paymentAllocations").collect();

    const allocatedByPayment: Record<string, number> = {};
    for (const alloc of allocations) {
      const key = alloc.paymentId;
      allocatedByPayment[key] = (allocatedByPayment[key] || 0) + alloc.allocatedAmount;
    }

    return payments
      .map((p) => {
        const allocated = allocatedByPayment[p._id] || 0;
        const remaining = p.amount - allocated;
        return {
          _id: p._id,
          paymentDate: p.paymentDate,
          rawDescription: p.rawDescription,
          amount: p.amount,
          allocatedAmount: allocated,
          remainingAmount: remaining,
        };
      })
      .filter((p) => p.remainingAmount > 0.01)
      .sort((a, b) => a.paymentDate.localeCompare(b.paymentDate));
  },
});

export const getSnapshotCustomerReconciliation = query({
  args: { snapshotId: v.id("ageSnapshots") },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("ageSnapshotRows")
      .withIndex("by_snapshotId", (q) => q.eq("snapshotId", args.snapshotId))
      .collect();

    const allocations = await ctx.db.query("paymentAllocations").collect();
    
    // 1. SNAPSHOT allocations for this snapshot
    const snapshotAllocations = allocations.filter(
      (a) => a.snapshotId === args.snapshotId
    );

    // 2. ON_ACCOUNT allocations (global, matching by account number)
    const onAccountAllocations = allocations.filter(
      (a) => a.allocationType === "ON_ACCOUNT"
    );

    const allocatedByRow: Record<string, number> = {};
    for (const alloc of snapshotAllocations) {
      if (alloc.snapshotRowId) {
        const key = alloc.snapshotRowId;
        allocatedByRow[key] = (allocatedByRow[key] || 0) + alloc.allocatedAmount;
      }
    }

    const onAccountByAccountNo: Record<string, number> = {};
    for (const alloc of onAccountAllocations) {
      if (alloc.accountNumber) {
        const key = alloc.accountNumber;
        onAccountByAccountNo[key] = (onAccountByAccountNo[key] || 0) + alloc.allocatedAmount;
      }
    }

    return rows.map((row) => {
      const allocated = allocatedByRow[row._id] || 0;
      const remaining = row.totalDue - allocated;
      const onAccount = onAccountByAccountNo[row.accountNumber] || 0;

      return {
        _id: row._id,
        clientName: row.clientName,
        accountNumber: row.accountNumber,
        originalTotalDue: row.totalDue,
        allocatedAmount: allocated,
        remainingOutstanding: remaining,
        onAccountAmount: onAccount,
      };
    });
  },
});
