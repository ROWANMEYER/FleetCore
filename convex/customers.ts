import { mutation, query, type MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { resolveUserScope } from "./userSessions";
import {
  accountNumberConflictMessage,
  updateAccountNumberConflictMessage,
  normalizeCustomerName,
  checkNameAvailability,
  describeNameUnavailable,
  findRenameCollision,
  renameCollisionError,
  toggleCustomerStatus,
} from "./customerValidation";

/* ── Authorization (mirrors the existing resolveUserScope + role pattern) ──
   - customer CREATE needs a live session of either role (admin Clients page
     AND the 6.4A Quick Capture quick-add both create customers)
   - customer UPDATE / ACTIVATE / DEACTIVATE / DELETE are admin-only */
async function requireCustomerSession(
  ctx: MutationCtx,
  token?: string | null
): Promise<void> {
  const scope = await resolveUserScope(ctx, token);
  if (!scope) {
    throw new Error("Not authorized");
  }
}

async function requireCustomerAdmin(
  ctx: MutationCtx,
  token?: string | null
): Promise<void> {
  const scope = await resolveUserScope(ctx, token);
  if (scope?.role !== "admin") {
    throw new Error("Admin access required");
  }
}

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
    token: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    await requireCustomerSession(ctx, args.token);
    const normalizedName = normalizeCustomerName(args.name);

    if (!normalizedName) {
      throw new Error("Client name must contain non-whitespace text");
    }

    // 1. Check duplicate Account Number (unchanged rule + message)
    if (args.accountNumber) {
      const existing = await ctx.db
        .query("customers")
        .withIndex("by_accountNumber", (q) => q.eq("accountNumber", args.accountNumber))
        .first();

      if (existing) {
        throw new Error(accountNumberConflictMessage(args.accountNumber, existing.name));
      }
    }

    // 2. Deterministic name uniqueness — enforces duplicate normalizedName
    //    (active AND inactive) on the backend. Never reactivates silently.
    const existingByName = await ctx.db
      .query("customers")
      .withIndex("by_normalizedName", (q) => q.eq("normalizedName", normalizedName))
      .first();

    const availability = checkNameAvailability(existingByName);
    const unavailableMessage = describeNameUnavailable(availability);
    if (unavailableMessage) {
      throw new Error(unavailableMessage);
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
    token: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    await requireCustomerAdmin(ctx, args.token);
    const customer = await ctx.db.get(args.id);
    if (!customer) {
      throw new Error("Document not found");
    }

    const normalizedName = normalizeCustomerName(args.name);
    if (!normalizedName) {
      throw new Error("Client name must contain non-whitespace text");
    }
    const newAccountNumber = args.accountNumber?.trim();

    // 1. Rename collision — reject renaming onto ANY other existing client's
    //    normalized name (active or inactive). _id / createdAt never change.
    if (normalizedName !== customer.normalizedName) {
      const sameName = await ctx.db
        .query("customers")
        .withIndex("by_normalizedName", (q) => q.eq("normalizedName", normalizedName))
        .collect();
      const collision = findRenameCollision(sameName, args.id);
      if (collision) {
        throw new Error(renameCollisionError(collision.name));
      }
    }

    // 2. Check duplicate Account Number (if changed) — unchanged rule + message
    if (newAccountNumber && newAccountNumber !== customer.accountNumber) {
      const existing = await ctx.db
        .query("customers")
        .withIndex("by_accountNumber", (q) => q.eq("accountNumber", newAccountNumber))
        .first();

      if (existing && existing._id !== args.id) {
        throw new Error(updateAccountNumberConflictMessage(newAccountNumber, existing.name));
      }
    }

    // 3. Check for Locked Finance History (if name changed) — unchanged rule
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
  args: {
    id: v.id("customers"),
    isActive: v.boolean(),
    token: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    await requireCustomerAdmin(ctx, args.token);
    await toggleCustomerStatus(ctx.db as unknown as Parameters<typeof toggleCustomerStatus>[0], args.id, args.isActive);
  },
});

export const deleteCustomer = mutation({
  args: { id: v.id("customers"), token: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, args) => {
    await requireCustomerAdmin(ctx, args.token);
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
  args: { ids: v.array(v.id("customers")), token: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, args) => {
    await requireCustomerAdmin(ctx, args.token);
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