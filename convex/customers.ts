import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const search = query({
  args: { searchTerm: v.string() },
  handler: async (ctx, args) => {
    const term = args.searchTerm.toLowerCase().trim();
    if (!term) return [];

    const customers = await ctx.db
      .query("customers")
      .withIndex("by_normalizedName")
      .collect();

    return customers
      .filter(c => 
        c.normalizedName.includes(term) || 
        (c.accountNumber && c.accountNumber.toLowerCase().includes(term))
      )
      .slice(0, 20)
      .map(c => ({
        _id: c._id,
        name: c.name,
        accountNumber: c.accountNumber
      }));
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("customers")
      .withIndex("by_normalizedName")
      .order("asc")
      .collect();
  },
});

export const createCustomer = mutation({
  args: {
    name: v.string(),
    accountNumber: v.optional(v.string()),
    note: v.optional(v.string()),
    address: v.optional(v.string()),
    vatNumber: v.optional(v.string()),
    contactPerson: v.optional(v.string()),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const normalizedName = args.name.toLowerCase().trim();
    
    // 1. Check duplicate Account Number
    if (args.accountNumber) {
      const existing = await ctx.db
        .query("customers")
        .withIndex("by_accountNumber", (q) => q.eq("accountNumber", args.accountNumber))
        .first();
      
      if (existing) {
        throw new Error(`Customer with account number ${args.accountNumber} already exists (${existing.name}).`);
      }
    }

    // 2. Warn on similar name (handled by UI via check, but we could return warning if mutation return type supports it. 
    // Since this is a simple mutation, we proceed with creation. The UI can check for duplicates before calling this if needed,
    // or we assume "Warn" was a pre-submission step.)
    // However, we should at least check for EXACT normalized name match to avoid simple duplicates if no account number.
    const existingName = await ctx.db
      .query("customers")
      .withIndex("by_normalizedName", (q) => q.eq("normalizedName", normalizedName))
      .first();

    if (existingName) {
        // If account numbers differ (and are both present), we might allow same name? 
        // But usually same name is confusing.
        // Let's allow it ONLY if the existing one has a different account number.
        // If existing one has NO account number, it's definitely a duplicate candidate.
        // For now, let's throw if exact name match exists, unless the user overrides (not implemented).
        // Actually, prompt says "Warn on similar... do not auto-block". So we should NOT throw on name match.
        // We just insert.
    }

    const customerId = await ctx.db.insert("customers", {
      name: args.name.trim(),
      normalizedName,
      accountNumber: args.accountNumber?.trim(),
      note: args.note,
      address: args.address,
      vatNumber: args.vatNumber,
      contactPerson: args.contactPerson,
      phone: args.phone,
      email: args.email,
      isActive: true,
      createdAt: Date.now(),
    });

    return customerId;
  },
});

export const updateCustomer = mutation({
  args: {
    id: v.id("customers"),
    name: v.string(),
    accountNumber: v.optional(v.string()),
    note: v.optional(v.string()),
    address: v.optional(v.string()),
    vatNumber: v.optional(v.string()),
    contactPerson: v.optional(v.string()),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const customer = await ctx.db.get(args.id);
    if (!customer) {
      throw new Error("Document not found");
    }

    const normalizedName = args.name.toLowerCase().trim();
    const newAccountNumber = args.accountNumber?.trim();

    // 1. Check duplicate Account Number (if changed)
    if (newAccountNumber && newAccountNumber !== customer.accountNumber) {
      const existing = await ctx.db
        .query("customers")
        .withIndex("by_accountNumber", (q) => q.eq("accountNumber", newAccountNumber))
        .first();
      
      if (existing && existing._id !== args.id) {
        throw new Error(`Account number ${newAccountNumber} is already taken by ${existing.name}.`);
      }
    }

    // 2. Check for Locked Finance History (if name changed)
    if (normalizedName !== customer.normalizedName) {
      // Check for locked routes with the OLD name
      const lockedRoutes = await ctx.db
        .query("dailyRoutes")
        .filter((q) => 
          q.and(
            q.eq(q.field("client"), customer.name),
            q.eq(q.field("status"), "locked")
          )
        )
        .first();

      if (lockedRoutes) {
        throw new Error("Cannot change name: Customer has locked finance history (routes).");
      }
    }

    await ctx.db.patch(args.id, {
      name: args.name.trim(),
      normalizedName,
      accountNumber: newAccountNumber,
      note: args.note,
      address: args.address,
      vatNumber: args.vatNumber,
      contactPerson: args.contactPerson,
      phone: args.phone,
      email: args.email,
    });
  },
});

export const deactivateCustomer = mutation({
  args: { id: v.id("customers"), isActive: v.boolean() },
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.id);
    if (!doc) {
      throw new Error("Document not found");
    }
    await ctx.db.patch(args.id, { isActive: args.isActive });
  },
});

export const deleteCustomer = mutation({
  args: { id: v.id("customers") },
  handler: async (ctx, args) => {
    const customer = await ctx.db.get(args.id);
    if (!customer) throw new Error("Customer not found");

    // Block delete if customer has any routes
    const linkedRoute = await ctx.db
      .query("dailyRoutes")
      .filter((q) => q.eq(q.field("client"), customer.name))
      .first();

    if (linkedRoute) {
      throw new Error(
        `Cannot delete "${customer.name}" — they have existing routes. Deactivate instead.`
      );
    }

    await ctx.db.delete(args.id);
  },
});

export const deleteBulkCustomers = mutation({
  args: { ids: v.array(v.id("customers")) },
  handler: async (ctx, args) => {
    const blocked: string[] = [];

    for (const id of args.ids) {
      const customer = await ctx.db.get(id);
      if (!customer) continue;

      const linkedRoute = await ctx.db
        .query("dailyRoutes")
        .filter((q) => q.eq(q.field("client"), customer.name))
        .first();

      if (linkedRoute) {
        blocked.push(customer.name);
        continue;
      }

      await ctx.db.delete(id);
    }

    if (blocked.length > 0) {
      throw new Error(
        `Deleted what was possible. Skipped (have routes): ${blocked.join(", ")}`
      );
    }
  },
});
