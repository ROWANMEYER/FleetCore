import { mutation } from "./_generated/server";
import { v, ConvexError } from "convex/values";

export const getOrCreate = mutation({
  args: {
    routeId: v.id("dailyRoutes"),
    invoiceData: v.any(), // Accepts the JSON-serialized InvoiceData
  },
  handler: async (ctx, args) => {
    // 1. Check if invoice exists for this route
    const existing = await ctx.db
      .query("invoices")
      .withIndex("by_routeId", (q) => q.eq("routeId", args.routeId))
      .first();

    if (existing) {
      return existing.snapshot;
    }

    // 2. Create new invoice
    // Validation: Prevent server crash if totals are missing
    if (!args.invoiceData || !args.invoiceData.totals) {
      throw new ConvexError("Invalid invoiceData: 'totals' is required but missing.");
    }

    // Ensure invoiceData has the expected shape (totals)
    const { totals, invoiceNumber } = args.invoiceData;
    
    // We store the whole object as snapshot
    await ctx.db.insert("invoices", {
      routeId: args.routeId,
      invoiceNumber,
      createdAt: Date.now(),
      snapshot: args.invoiceData,
      totals: {
        subtotal: totals.subtotal,
        vatAmount: totals.vatAmount,
        totalAmount: totals.totalAmount,
      },
    });

    return args.invoiceData;
  },
});
