import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { calculateLoadAmount } from "./utils";
import { resolveUserScope } from "./userSessions";

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
      rows = rows.filter((s) => s.companyName.toLowerCase().includes(q));
    }

    // Enrich with linked truck/trailer counts
    const allTrucks = await ctx.db.query("trucks").collect();
    const allTrailers = await ctx.db.query("trailers").collect();

    return rows.map((sub) => {
      const linkedTrucks = allTrucks.filter(
        (t) => (t as { subcontractorId?: string }).subcontractorId === sub._id
      );
      const linkedTrailers = allTrailers.filter(
        (t) => (t as { subcontractorId?: string }).subcontractorId === sub._id
      );
      return {
        ...sub,
        truckCount: linkedTrucks.length,
        truckFleetNos: linkedTrucks.map((t) => t.truckFleetNo).filter(Boolean),
        trailerCount: linkedTrailers.length,
        trailerFleetNos: linkedTrailers.map((t) => t.trailerFleetNoStr).filter(Boolean),
      };
    });
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
    companyName: v.string(),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("subcontractors", {
      companyName: args.companyName,
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
    companyName: v.string(),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      companyName: args.companyName,
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

export const getFinancialSummary = query({
  args: {
    startDate: v.string(),
    endDate: v.string(),
    token: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const scope = await resolveUserScope(ctx, args.token);
    const region = scope?.role === "regional" ? scope.region : null;
    const routes = await ctx.db
      .query("dailyRoutes")
      .withIndex("by_routeDate_truckFleetNoStr", (q) =>
        q.gte("routeDate", args.startDate).lte("routeDate", args.endDate)
      )
      .collect();

    const activeRoutes = routes.filter((r) => !(r as any).isDeleted && (!region || r.region === region));

    // Group by subcontractor
    const subData: Record<
      string,
      {
        subcontractorId: string;
        companyName: string;
        routeCount: number;
        loadCount: number;
        totalCustomerRevenue: number;
        totalSubCost: number;
      }
    > = {};

    for (const route of activeRoutes) {
      const subId = (route as any).subcontractorId as string | undefined;
      if (!subId) continue;

      if (!subData[subId]) {
        let companyName = "Unknown";
        try {
          const sub = await ctx.db.get(subId as any);
          if (sub) companyName = (sub as any).companyName || "Unknown";
        } catch {
          // Subcontractor doc might have been deleted
        }
        subData[subId] = {
          subcontractorId: subId,
          companyName,
          routeCount: 0,
          loadCount: 0,
          totalCustomerRevenue: 0,
          totalSubCost: 0,
        };
      }

      subData[subId].routeCount += 1;
      subData[subId].loadCount += route.loads?.length || 0;
      subData[subId].totalCustomerRevenue += route.rate || 0;

      // Sum subcontractor costs from loads
      if (route.loads) {
        for (const load of route.loads) {
          if (load.subcontractorRate) {
            const q = parseFloat(load.quantity) || 0;
            const r = parseFloat(load.subcontractorRate) || 0;
            const rateType = load.subcontractorRateType || "flat";
            const subCost = calculateLoadAmount(q, r, rateType);
            subData[subId].totalSubCost += subCost;
          }
        }
      }
    }

    const subcontractors = Object.values(subData);
    const totalCustomerRevenue = subcontractors.reduce((s, d) => s + d.totalCustomerRevenue, 0);
    const totalSubCost = subcontractors.reduce((s, d) => s + d.totalSubCost, 0);
    const totalMargin = totalCustomerRevenue - totalSubCost;

    return {
      subcontractors,
      summary: {
        totalSubcontractors: subcontractors.length,
        totalRoutes: subcontractors.reduce((s, d) => s + d.routeCount, 0),
        totalLoads: subcontractors.reduce((s, d) => s + d.loadCount, 0),
        totalCustomerRevenue,
        totalSubCost,
        totalMargin,
        marginPercent: totalCustomerRevenue > 0 ? (totalMargin / totalCustomerRevenue) * 100 : 0,
      },
    };
  },
});
