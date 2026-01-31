import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const seedFromSnapshots = mutation({
  args: {},
  handler: async (ctx) => {
    // 1. Fetch all snapshot rows (this might be large, but for migration it's okay)
    const rows = await ctx.db.query("ageSnapshotRows").collect();
    
    // 2. Deduplicate
    const uniqueCustomers = new Map<string, { name: string; accountNumber?: string }>();
    
    for (const row of rows) {
      // Create a key for uniqueness
      // Prefer account number if available, otherwise use normalized name
      const cleanName = row.clientName.trim();
      const cleanAccount = row.accountNumber?.trim();
      
      const key = cleanAccount 
        ? `ACC:${cleanAccount.toLowerCase()}` 
        : `NAME:${cleanName.toLowerCase()}`;
        
      if (!uniqueCustomers.has(key)) {
        uniqueCustomers.set(key, {
          name: cleanName,
          accountNumber: cleanAccount || undefined,
        });
      }
    }

    // 3. Insert unique customers
    let count = 0;
    const existingCustomers = await ctx.db.query("customers").collect();
    const existingKeys = new Set(existingCustomers.map(c => 
        c.accountNumber 
            ? `ACC:${c.accountNumber.toLowerCase()}` 
            : `NAME:${c.normalizedName}`
    ));

    for (const [key, data] of uniqueCustomers.entries()) {
        // Double check against already inserted in DB (idempotency)
        const dbKey = data.accountNumber 
            ? `ACC:${data.accountNumber.toLowerCase()}` 
            : `NAME:${data.name.toLowerCase()}`;
            
        if (existingKeys.has(dbKey)) continue;

        await ctx.db.insert("customers", {
            name: data.name,
            normalizedName: data.name.toLowerCase(),
            accountNumber: data.accountNumber,
            isActive: true,
            createdAt: Date.now(),
        });
        count++;
    }

    return { 
      processedRows: rows.length, 
      uniqueFound: uniqueCustomers.size,
      inserted: count 
    };
  },
});

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
    email: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const customer = await ctx.db.get(args.id);
    if (!customer) throw new Error("Customer not found");

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
      email: args.email,
    });
  },
});

export const deactivateCustomer = mutation({
  args: { id: v.id("customers"), isActive: v.boolean() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { isActive: args.isActive });
  },
});
