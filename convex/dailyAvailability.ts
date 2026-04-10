import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

function toDayKey(iso: string) {
  return iso.slice(0, 10);
}

function dedupe(list: string[]) {
  return Array.from(new Set(list));
}

export const getByDay = query({
  args: { dayKey: v.string() },
  handler: async (ctx, args) => {
    const doc = await ctx.db
      .query("dailyAvailability")
      .withIndex("by_day", (q) => q.eq("dayKey", args.dayKey))
      .first();
    return doc ?? null;
  },
});

export const getRange = query({
  args: {
    start: v.string(),
    end: v.string(),
    selectedTruck: v.optional(v.string()),
    selectedTrailer: v.optional(v.string()),
    selectedDriver: v.optional(v.string()),
    status: v.optional(v.array(v.union(v.literal("available"), v.literal("unavailable"), v.literal("maintenance")))),
    sortBy: v.optional(v.union(v.literal("date"), v.literal("truck"), v.literal("driver"), v.literal("status"))),
    sortOrder: v.optional(v.union(v.literal("asc"), v.literal("desc"))),
  },
  handler: async (ctx, args) => {
    const startKey = toDayKey(args.start);
    const endKey = toDayKey(args.end);

    let rows = await ctx.db
      .query("dailyAvailability")
      .withIndex("by_date")
      .collect();

    rows = rows.filter((r) => {
      const k = toDayKey(r.date);
      return k >= startKey && k <= endKey;
    });

    if (args.selectedTruck) {
      rows = rows.filter((r) => (r.trucks ?? []).includes(args.selectedTruck!));
    }
    if (args.selectedTrailer) {
      rows = rows.filter((r) => (r.trailers ?? []).includes(args.selectedTrailer!));
    }
    if (args.selectedDriver) {
      rows = rows.filter((r) => (r.drivers ?? []).includes(args.selectedDriver!));
    }
    if (args.status && args.status.length > 0) {
      const set = new Set(args.status);
      rows = rows.filter((r) => set.has(r.status as any));
    }

    const sortBy = args.sortBy ?? "date";
    const sortOrder = args.sortOrder ?? "desc";
    const dir = sortOrder === "asc" ? 1 : -1;

    rows.sort((a, b) => {
      if (sortBy === "date") {
        return (a.date.localeCompare(b.date)) * dir;
      }
      if (sortBy === "truck") {
        const av = a.trucks?.[0] ?? "";
        const bv = b.trucks?.[0] ?? "";
        return av.localeCompare(bv) * dir;
      }
      if (sortBy === "driver") {
        const av = a.drivers?.[0] ?? "";
        const bv = b.drivers?.[0] ?? "";
        return av.localeCompare(bv) * dir;
      }
      if (sortBy === "status") {
        return (a.status?.localeCompare(b.status ?? "") ?? 0) * dir;
      }
      return 0;
    });

    return rows;
  },
});

export const upsert = mutation({
  args: {
    dateISO: v.string(),
    trucks: v.array(v.string()),
    trailers: v.array(v.string()),
    drivers: v.array(v.string()),
    status: v.union(v.literal("available"), v.literal("unavailable"), v.literal("maintenance")),
    createdBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const dayKey = toDayKey(args.dateISO);
    const existing = await ctx.db
      .query("dailyAvailability")
      .withIndex("by_day", (q) => q.eq("dayKey", dayKey))
      .first();

    if (existing) {
      const next = {
        trucks: dedupe([...(existing.trucks ?? []), ...args.trucks]),
        trailers: dedupe([...(existing.trailers ?? []), ...args.trailers]),
        drivers: dedupe([...(existing.drivers ?? []), ...args.drivers]),
        status: args.status,
      };
      await ctx.db.patch(existing._id, next);
      const updated = await ctx.db.get(existing._id);
      if (!updated) throw new Error("Document not found");
      return { action: "updated", record: updated };
    }

    const insertedId = await ctx.db.insert("dailyAvailability", {
      dayKey,
      date: args.dateISO,
      trucks: dedupe(args.trucks),
      trailers: dedupe(args.trailers),
      drivers: dedupe(args.drivers),
      status: args.status,
      createdAt: Date.now(),
      createdBy: args.createdBy,
    });
    const created = await ctx.db.get(insertedId);
    if (!created) throw new Error("Document not found");
    return { action: "created", record: created };
  },
});

export const deleteDay = mutation({
  args: { dayKey: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("dailyAvailability")
      .withIndex("by_day", (q) => q.eq("dayKey", args.dayKey))
      .first();
    if (!existing) return { ok: false, reason: "not_found" as const };
    await ctx.db.delete(existing._id);
    return { ok: true };
  },
});

export const replaceDay = mutation({
  args: {
    dayKey: v.string(),
    trucks: v.array(v.string()),
    trailers: v.array(v.string()),
    drivers: v.array(v.string()),
    status: v.union(v.literal("available"), v.literal("unavailable"), v.literal("maintenance")),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("dailyAvailability")
      .withIndex("by_day", (q) => q.eq("dayKey", args.dayKey))
      .first();
    if (!existing) return { ok: false, reason: "not_found" as const };
    const next = {
      trucks: dedupe(args.trucks),
      trailers: dedupe(args.trailers),
      drivers: dedupe(args.drivers),
      status: args.status,
    };
    await ctx.db.patch(existing._id, next);
    const updated = await ctx.db.get(existing._id);
    return { ok: true, record: updated };
  },
});

export const deleteSelections = mutation({
  args: {
    dayKey: v.string(),
    remove: v.object({
      trucks: v.optional(v.array(v.string())),
      trailers: v.optional(v.array(v.string())),
      drivers: v.optional(v.array(v.string())),
    }),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("dailyAvailability")
      .withIndex("by_day", (q) => q.eq("dayKey", args.dayKey))
      .first();
    if (!existing) return { ok: false, reason: "not_found" as const };

    const remT = new Set(args.remove.trucks ?? []);
    const remTr = new Set(args.remove.trailers ?? []);
    const remD = new Set(args.remove.drivers ?? []);

    const next = {
      trucks: (existing.trucks ?? []).filter((x) => !remT.has(x)),
      trailers: (existing.trailers ?? []).filter((x) => !remTr.has(x)),
      drivers: (existing.drivers ?? []).filter((x) => !remD.has(x)),
    };

    await ctx.db.patch(existing._id, next);
    const updated = await ctx.db.get(existing._id);
    if (!updated) throw new Error("Document not found");
    return { ok: true, record: updated };
  },
});
