/* eslint-disable @typescript-eslint/no-explicit-any */
import { query } from "./_generated/server";
import { v } from "convex/values";
import { calculateLoadAmount } from "./utils";

/**
 * Dashboard Queries — Read-Only Management Intelligence
 * 
 * These queries aggregate data for management visibility.
 * They do NOT modify state and do NOT affect operational flows.
 */

// ============================================================================
// LOADS TAB QUERIES
// ============================================================================

export const getDashboardLoadsSummary = query({
    args: {
        startDate: v.string(),
        endDate: v.string(),
    },
    handler: async (ctx, args) => {
        const routes = await ctx.db
            .query("dailyRoutes")
            .withIndex("by_routeDate_truckFleetNoStr", (q) =>
                q.gte("routeDate", args.startDate).lte("routeDate", args.endDate)
            )
            .collect();

        // Filter active routes only
        const activeRoutes = routes.filter((r) => !(r as any).isDeleted);

        // Calculate KPIs
        const totalRoutes = activeRoutes.length;
        const totalLoads = activeRoutes.reduce(
            (sum, r) => sum + (r.loads?.length || 0),
            0
        );

        const completedRoutes = activeRoutes.filter((r) => {
            const status = (r as any).status || "planned";
            return status === "completed" || status === "locked";
        }).length;

        const incompleteRoutes = activeRoutes.filter((r) => {
            const status = (r as any).status || "planned";
            return status === "planned";
        }).length;

        const avgLoadsPerRoute = totalRoutes > 0 ? totalLoads / totalRoutes : 0;

        return {
            totalRoutes,
            totalLoads,
            completedRoutes,
            incompleteRoutes,
            avgLoadsPerRoute: Math.round(avgLoadsPerRoute * 10) / 10, // 1 decimal
        };
    },
});

export const getLoadsOverTime = query({
    args: {
        startDate: v.string(),
        endDate: v.string(),
    },
    handler: async (ctx, args) => {
        const routes = await ctx.db
            .query("dailyRoutes")
            .withIndex("by_routeDate_truckFleetNoStr", (q) =>
                q.gte("routeDate", args.startDate).lte("routeDate", args.endDate)
            )
            .collect();

        const activeRoutes = routes.filter((r) => !(r as any).isDeleted);

        // Group loads by date
        const loadsByDate: Record<string, number> = {};

        activeRoutes.forEach((route) => {
            const date = route.routeDate;
            const loadCount = route.loads?.length || 0;
            loadsByDate[date] = (loadsByDate[date] || 0) + loadCount;
        });

        // Convert to array and sort
        const result = Object.entries(loadsByDate).map(([date, loadCount]) => ({
            date,
            loadCount,
        }));

        result.sort((a, b) => a.date.localeCompare(b.date));

        return result;
    },
});

export const getRoutesByStatus = query({
    args: {
        startDate: v.string(),
        endDate: v.string(),
    },
    handler: async (ctx, args) => {
        const routes = await ctx.db
            .query("dailyRoutes")
            .withIndex("by_routeDate_truckFleetNoStr", (q) =>
                q.gte("routeDate", args.startDate).lte("routeDate", args.endDate)
            )
            .collect();

        const activeRoutes = routes.filter((r) => !(r as any).isDeleted);

        // Group by status
        const statusCounts: Record<string, number> = {
            planned: 0,
            completed: 0,
            locked: 0,
        };

        activeRoutes.forEach((route) => {
            const status = (route as any).status || "planned";
            statusCounts[status] = (statusCounts[status] || 0) + 1;
        });

        // Convert to array
        return Object.entries(statusCounts).map(([status, count]) => ({
            status,
            count,
        }));
    },
});

// ============================================================================
// REVENUE TAB QUERIES
// ============================================================================

export const getDashboardRevenueSummary = query({
    args: {
        startDate: v.string(),
        endDate: v.string(),
    },
    handler: async (ctx, args) => {
        const routes = await ctx.db
            .query("dailyRoutes")
            .withIndex("by_routeDate_truckFleetNoStr", (q) =>
                q.gte("routeDate", args.startDate).lte("routeDate", args.endDate)
            )
            .collect();

        const activeRoutes = routes.filter((r) => !(r as any).isDeleted);

        let totalRevenue = 0;
        let totalLoads = 0;

        activeRoutes.forEach((route) => {
            if (route.loads && Array.isArray(route.loads)) {
                route.loads.forEach((load) => {
                    const q = parseFloat(load.quantity) || 0;
                    const r = parseFloat(load.rate) || 0;
                    const amount = calculateLoadAmount(q, r, load.rateType);
                    totalRevenue += amount;
                    totalLoads++;
                });
            }
        });

        const totalRoutes = activeRoutes.length;
        const avgRevenuePerRoute = totalRoutes > 0 ? totalRevenue / totalRoutes : 0;
        const avgRevenuePerLoad = totalLoads > 0 ? totalRevenue / totalLoads : 0;

        return {
            totalRevenue,
            avgRevenuePerRoute,
            avgRevenuePerLoad,
            totalRoutes,
            totalLoads,
        };
    },
});

export const getRevenueOverTime = query({
    args: {
        startDate: v.string(),
        endDate: v.string(),
    },
    handler: async (ctx, args) => {
        const routes = await ctx.db
            .query("dailyRoutes")
            .withIndex("by_routeDate_truckFleetNoStr", (q) =>
                q.gte("routeDate", args.startDate).lte("routeDate", args.endDate)
            )
            .collect();

        const activeRoutes = routes.filter((r) => !(r as any).isDeleted);

        // Group revenue by date
        const revenueByDate: Record<string, number> = {};

        activeRoutes.forEach((route) => {
            const date = route.routeDate;
            let routeRevenue = 0;

            if (route.loads && Array.isArray(route.loads)) {
                route.loads.forEach((load) => {
                    const q = parseFloat(load.quantity) || 0;
                    const r = parseFloat(load.rate) || 0;
                    routeRevenue += calculateLoadAmount(q, r, load.rateType);
                });
            }

            revenueByDate[date] = (revenueByDate[date] || 0) + routeRevenue;
        });

        // Convert to array and sort
        const result = Object.entries(revenueByDate).map(([date, revenue]) => ({
            date,
            revenue,
        }));

        result.sort((a, b) => a.date.localeCompare(b.date));

        return result;
    },
});

export const getRevenueByTruck = query({
    args: {
        startDate: v.string(),
        endDate: v.string(),
        limit: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const routes = await ctx.db
            .query("dailyRoutes")
            .withIndex("by_routeDate_truckFleetNoStr", (q) =>
                q.gte("routeDate", args.startDate).lte("routeDate", args.endDate)
            )
            .collect();

        const activeRoutes = routes.filter((r) => !(r as any).isDeleted);

        // Group revenue by truck
        const revenueByTruck: Record<string, number> = {};

        activeRoutes.forEach((route) => {
            const truck = route.truckFleetNoStr || "Unknown";
            let routeRevenue = 0;

            if (route.loads && Array.isArray(route.loads)) {
                route.loads.forEach((load) => {
                    const q = parseFloat(load.quantity) || 0;
                    const r = parseFloat(load.rate) || 0;
                    routeRevenue += calculateLoadAmount(q, r, load.rateType);
                });
            }

            revenueByTruck[truck] = (revenueByTruck[truck] || 0) + routeRevenue;
        });

        // Convert to array and sort by revenue descending
        let result = Object.entries(revenueByTruck).map(
            ([truckFleetNo, revenue]) => ({
                truckFleetNo,
                revenue,
            })
        );

        result.sort((a, b) => b.revenue - a.revenue);

        // Apply limit (default to top 10)
        const limit = args.limit || 10;
        result = result.slice(0, limit);

        return result;
    },
});
