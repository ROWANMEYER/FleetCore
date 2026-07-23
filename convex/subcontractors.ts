import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const subs = await ctx.db.query("subcontractors").collect();
    return subs.filter((s) => (s as { status?: string }).status !== "inactive");
  },
});

export const getAll = query({
  args: {
    search: v.optional(v.string()),
    includeInactive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const data = await ctx.db.query("subcontractors").collect();
    const includeInactive = Boolean(args.includeInactive);
    let rows = includeInactive ? data : data.filter((s) => (s as { status?: string }).status !== "inactive");
    const search = args.search;
    if (search && search.trim() !== "") {
      const q = search.toLowerCase();
      rows = rows.filter((s) => s.name.toLowerCase().includes(q));
    }
    return rows;
  },
});

export const getStats = query({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("subcontractors").collect();
    const total = all.length;
    const active = all.filter((s) => (s as { status?: string }).status !== "inactive").length;
    const inactive = total - active;
    return { total, active, inactive };
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("subcontractors", {
      name: args.name,
      phone: args.phone,
      email: args.email,
      status: "active",
      createdAt: Date.now(),
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("subcontractors"),
    name: v.string(),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      name: args.name,
      phone: args.phone,
      email: args.email,
    });
  },
});

export const updateStatus = mutation({
  args: {
    id: v.id("subcontractors"),
    status: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { status: args.status });
  },
});

export const remove = mutation({
  args: { id: v.id("subcontractors") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});
