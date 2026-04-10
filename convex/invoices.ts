import { mutation, query } from "./_generated/server";
import { v, ConvexError } from "convex/values";

const INVOICE_START = 9350;

async function nextInvoiceNumber(ctx: any): Promise<string> {
  const counter = await ctx.db.query("invoiceCounter").first();
  if (counter) {
    const next = counter.lastNumber + 1;
    await ctx.db.patch(counter._id, { lastNumber: next });
    return String(next);
  }
  await ctx.db.insert("invoiceCounter", { lastNumber: INVOICE_START });
  return String(INVOICE_START);
}

async function buildEnrichedData(ctx: any, routeId: any, invoiceData: any) {
  if (!invoiceData?.totals) throw new ConvexError("Invalid invoiceData: 'totals' is required.");

  const seqNumber = await nextInvoiceNumber(ctx);

  const route = await ctx.db.get(routeId);

  // ── Truck registration lookup ──────────────────────────────────────────────
  let truckRegistration = invoiceData.lineItems?.[0]?.truckReg || "";
  if (route?.truckFleetNoStr) {
    const truck = await ctx.db
      .query("trucks")
      .withIndex("by_truckFleetNo", (q: any) => q.eq("truckFleetNo", route.truckFleetNoStr))
      .first();
    if (truck?.registration) truckRegistration = truck.registration;
  }

  // ── Customer lookup from DB — authoritative source ─────────────────────────
  const clientName: string = route?.client || invoiceData.client?.name || "";
  let customerData = {
    name: clientName,
    address: invoiceData.client?.address,
    vatNumber: invoiceData.client?.vatNumber,
    contactPerson: invoiceData.client?.contactPerson,
    phone: invoiceData.client?.phone,
    email: invoiceData.client?.email,
  };

  if (clientName) {
    // Try exact name match first
    const normalizedSearch = clientName.toLowerCase().trim();
    const exactMatch = await ctx.db
      .query("customers")
      .withIndex("by_normalizedName", (q: any) => q.eq("normalizedName", normalizedSearch))
      .first();

    if (exactMatch) {
      customerData = {
        name: exactMatch.name,
        address: exactMatch.address,
        vatNumber: exactMatch.vatNumber,
        contactPerson: exactMatch.contactPerson,
        phone: (exactMatch as any).phone,
        email: exactMatch.email,
      };
    } else {
      // Fallback: partial match scan
      const allCustomers = await ctx.db.query("customers").collect();
      const partial = allCustomers.find(
        (c: any) =>
          c.normalizedName?.includes(normalizedSearch) ||
          normalizedSearch.includes(c.normalizedName || "")
      );
      if (partial) {
        customerData = {
          name: partial.name,
          address: partial.address,
          vatNumber: partial.vatNumber,
          contactPerson: partial.contactPerson,
          phone: (partial as any).phone,
          email: partial.email,
        };
      }
    }
  }

  return {
    ...invoiceData,
    invoiceNumber: seqNumber,
    client: customerData,
    lineItems: (invoiceData.lineItems || []).map((item: any, i: number) =>
      i === 0 ? { ...item, truckReg: truckRegistration } : item
    ),
  };
}

export const getOrCreate = mutation({
  args: { routeId: v.id("dailyRoutes"), invoiceData: v.any() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("invoices")
      .withIndex("by_routeId", (q) => q.eq("routeId", args.routeId))
      .first();
    if (existing) return existing.snapshot;

    const enriched = await buildEnrichedData(ctx, args.routeId, args.invoiceData);
    const { totals } = enriched;
    await ctx.db.insert("invoices", {
      routeId: args.routeId,
      invoiceNumber: enriched.invoiceNumber,
      createdAt: Date.now(),
      snapshot: enriched,
      totals: { subtotal: totals.subtotal, vatAmount: totals.vatAmount, totalAmount: totals.totalAmount },
    });
    return enriched;
  },
});

// Always generates a fresh invoice with a new sequential number (replaces any existing)
export const regenerate = mutation({
  args: { routeId: v.id("dailyRoutes"), invoiceData: v.any() },
  handler: async (ctx, args) => {
    // Delete existing invoice for this route if any
    const existing = await ctx.db
      .query("invoices")
      .withIndex("by_routeId", (q) => q.eq("routeId", args.routeId))
      .first();
    if (existing) await ctx.db.delete(existing._id);

    const enriched = await buildEnrichedData(ctx, args.routeId, args.invoiceData);
    const { totals } = enriched;
    await ctx.db.insert("invoices", {
      routeId: args.routeId,
      invoiceNumber: enriched.invoiceNumber,
      createdAt: Date.now(),
      snapshot: enriched,
      totals: { subtotal: totals.subtotal, vatAmount: totals.vatAmount, totalAmount: totals.totalAmount },
    });
    return enriched;
  },
});

export const debugAllInvoices = query({
  args: {},
  handler: async (ctx) => ctx.db.query("invoices").collect(),
});
