 
import { query } from "./_generated/server";
import { calculateLoadAmount } from "./utils";
import { v } from "convex/values";

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

        const totalKm = activeRoutes.reduce((sum, r) => sum + (Number((r as any).kilometers) || 0), 0);

        return {
            totalRoutes,
            totalLoads,
            completedRoutes,
            incompleteRoutes,
            avgLoadsPerRoute: Math.round(avgLoadsPerRoute * 10) / 10, // 1 decimal
            totalKm: Math.round(totalKm),
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

export const getClientBreakdown = query({
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

        const clientCounts: Record<string, number> = {};

        activeRoutes.forEach((route) => {
            const client = route.client || "Unknown";
            const loadCount = route.loads?.length || 0;
            clientCounts[client] = (clientCounts[client] || 0) + loadCount;
        });

        // Convert to array, sort by count desc, take top 5
        const result = Object.entries(clientCounts)
            .map(([client, count]) => ({ client, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 5);

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
                totalLoads += route.loads.length;
            }
            
            // Fix: calculateLoadAmount is not defined. Using flat route fields as requested.
            // Formula: (route.rate ?? 0) * (route.kilometers ?? 0)
            const amount = (route.rate ?? 0) * (route.kilometers ?? 0);
            totalRevenue += amount;
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

// ============================================================================
// CEO-LEVEL ANALYTICS QUERIES
// ============================================================================

/**
 * Executive Summary: Key business metrics for decision making
 */
export const getExecutiveSummary = query({
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

        // Revenue calculations
        let totalRevenue = 0;
        let totalKm = 0;
        let totalLoads = 0;
        let completedCount = 0;

        activeRoutes.forEach((route) => {
            totalRevenue += route.rate || 0;
            totalKm += (route as any).kilometers || 0;
            totalLoads += route.loads?.length || 0;
            if ((route as any).status === "completed" || (route as any).status === "locked") {
                completedCount++;
            }
        });

        const totalRoutes = activeRoutes.length;

        return {
            period: { startDate: args.startDate, endDate: args.endDate },
            totalRevenue,
            totalRoutes,
            totalLoads,
            totalKm,
            completedRoutes: completedCount,
            activeRoutes: totalRoutes - completedCount,
            revenuePerKm: totalKm > 0 ? totalRevenue / totalKm : 0,
            revenuePerLoad: totalLoads > 0 ? totalRevenue / totalLoads : 0,
            revenuePerRoute: totalRoutes > 0 ? totalRevenue / totalRoutes : 0,
            avgKmPerRoute: totalRoutes > 0 ? totalKm / totalRoutes : 0,
            completionRate: totalRoutes > 0 ? (completedCount / totalRoutes) * 100 : 0,
        };
    },
});

/**
 * Customer Performance Analysis: Identify top customers and risk profiles
 */
export const getCustomerAnalytics = query({
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

        // Group by customer
        const customerMetrics: Record<
            string,
            {
                name: string;
                revenue: number;
                loads: number;
                routes: number;
                km: number;
                avgRevenuePerLoad: number;
            }
        > = {};

        activeRoutes.forEach((route) => {
            const client = route.client || "Unknown";
            if (!customerMetrics[client]) {
                customerMetrics[client] = {
                    name: client,
                    revenue: 0,
                    loads: 0,
                    routes: 0,
                    km: 0,
                    avgRevenuePerLoad: 0,
                };
            }

            customerMetrics[client].revenue += route.rate || 0;
            customerMetrics[client].loads += route.loads?.length || 0;
            customerMetrics[client].routes += 1;
            customerMetrics[client].km += (route as any).kilometers || 0;
        });

        // Calculate avg revenue per load
        Object.values(customerMetrics).forEach((c) => {
            c.avgRevenuePerLoad = c.loads > 0 ? c.revenue / c.loads : 0;
        });

        // Rank by revenue
        const byRevenue = Object.values(customerMetrics)
            .sort((a, b) => b.revenue - a.revenue)
            .slice(0, 10);

        // Total revenue for concentration analysis
        const totalRevenue = Object.values(customerMetrics).reduce((sum, c) => sum + c.revenue, 0);
        const topCustomersRevenue = byRevenue.reduce((sum, c) => sum + c.revenue, 0);
        const concentrationRisk = totalRevenue > 0 ? (topCustomersRevenue / totalRevenue) * 100 : 0;

        return {
            topCustomers: byRevenue,
            totalUniqueCustomers: Object.keys(customerMetrics).length,
            concentrationRisk, // % of revenue from top 10
        };
    },
});

/**
 * Fleet Performance: Truck and utilization analytics
 */
export const getFleetPerformance = query({
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

        // Group by truck
        const truckMetrics: Record<
            string,
            {
                truckNumber: string;
                revenue: number;
                routes: number;
                km: number;
                loads: number;
                revenuePerKm: number;
                efficiency: number;
            }
        > = {};

        activeRoutes.forEach((route) => {
            const truck = route.truckFleetNoStr || "Unknown";
            if (!truckMetrics[truck]) {
                truckMetrics[truck] = {
                    truckNumber: truck,
                    revenue: 0,
                    routes: 0,
                    km: 0,
                    loads: 0,
                    revenuePerKm: 0,
                    efficiency: 0,
                };
            }

            truckMetrics[truck].revenue += route.rate || 0;
            truckMetrics[truck].routes += 1;
            truckMetrics[truck].km += (route as any).kilometers || 0;
            truckMetrics[truck].loads += route.loads?.length || 0;
        });

        // Calculate efficiency metrics
        Object.values(truckMetrics).forEach((t) => {
            t.revenuePerKm = t.km > 0 ? t.revenue / t.km : 0;
            t.efficiency = t.routes > 0 ? t.km / t.routes : 0; // avg km per route
        });

        // Sort by revenue
        const topPerformers = Object.values(truckMetrics)
            .sort((a, b) => b.revenue - a.revenue)
            .slice(0, 10);

        const avgRevenuePerKm =
            activeRoutes.reduce((sum, r) => sum + (r.rate || 0), 0) /
                (activeRoutes.reduce((sum, r) => sum + ((r as any).kilometers || 0), 0) || 1);

        return {
            topTrucks: topPerformers,
            totalTrucksActive: Object.keys(truckMetrics).length,
            avgRevenuePerKm,
        };
    },
});

/**
 * Operational Efficiency: Load and route analysis
 */
export const getOperationalEfficiency = query({
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

        const completed = activeRoutes.filter(
            (r) => (r as any).status === "completed" || (r as any).status === "locked"
        );
        const planned = activeRoutes.filter((r) => (r as any).status === "planned");

        const totalLoads = activeRoutes.reduce((sum, r) => sum + (r.loads?.length || 0), 0);
        const totalKm = activeRoutes.reduce((sum, r) => sum + ((r as any).kilometers || 0), 0);
        const totalRevenue = activeRoutes.reduce((sum, r) => sum + (r.rate || 0), 0);

        return {
            totalRoutes: activeRoutes.length,
            completedRoutes: completed.length,
            plannedRoutes: planned.length,
            totalLoads,
            loadsPerRoute: activeRoutes.length > 0 ? totalLoads / activeRoutes.length : 0,
            totalKm,
            kmPerRoute: activeRoutes.length > 0 ? totalKm / activeRoutes.length : 0,
            revenuePerRoute: activeRoutes.length > 0 ? totalRevenue / activeRoutes.length : 0,
            avgRouteLength: activeRoutes.length > 0 ? totalKm / activeRoutes.length : 0,
            plannedCompletionRate:
                activeRoutes.length > 0 ? (completed.length / activeRoutes.length) * 100 : 0,
        };
    },
});

/**
 * Month-to-Month Comparison: Compare two selected months
 */
export const getMonthToMonthComparison = query({
    args: {
        month1: v.string(), // Format: "YYYY-MM"
        month2: v.string(), // Format: "YYYY-MM"
    },
    handler: async (ctx, args) => {
        // Get today's date
        const today = new Date();
        const todayIso = today.toISOString().split("T")[0];
        const todayMonth = todayIso.slice(0, 7);
        const todayDay = parseInt(todayIso.slice(8, 10), 10);

        // Check if month2 is the current month
        const isCurrentMonth = args.month2 === todayMonth;

        const getMonthRange = (monthStr: string) => {
            const date = new Date(monthStr + "-01");
            const year = date.getUTCFullYear();
            const month = date.getUTCMonth();
            const start = new Date(Date.UTC(year, month, 1)).toISOString().split("T")[0];
            const end = new Date(Date.UTC(year, month + 1, 0)).toISOString().split("T")[0];
            return { start, end };
        };

        const range1 = getMonthRange(args.month1);
        const range2 = getMonthRange(args.month2);

        // If month2 is current month, clamp month1 to same day count
        let clampedRange1 = range1;
        if (isCurrentMonth) {
            const month1Date = new Date(args.month1 + "-01");
            const year1 = month1Date.getUTCFullYear();
            const month1 = month1Date.getUTCMonth();
            clampedRange1 = {
                start: range1.start,
                end: new Date(Date.UTC(year1, month1, todayDay)).toISOString().split("T")[0],
            };
        }

        const getMonthData = async (range: { start: string; end: string }) => {
            const routes = await ctx.db
                .query("dailyRoutes")
                .withIndex("by_routeDate_truckFleetNoStr", (q) =>
                    q.gte("routeDate", range.start).lte("routeDate", range.end)
                )
                .collect();

            const activeRoutes = routes.filter((r) => !(r as any).isDeleted);

            let totalRevenue = 0;
            let totalKm = 0;
            let totalLoads = 0;
            let completedCount = 0;

            activeRoutes.forEach((route) => {
                totalRevenue += route.rate || 0;
                totalKm += (route as any).kilometers || 0;
                totalLoads += route.loads?.length || 0;
                if ((route as any).status === "completed" || (route as any).status === "locked") {
                    completedCount++;
                }
            });

            return {
                month: range.start.slice(0, 7),
                totalRevenue,
                totalRoutes: activeRoutes.length,
                totalLoads,
                totalKm,
                completedRoutes: completedCount,
                revenuePerKm: totalKm > 0 ? totalRevenue / totalKm : 0,
                revenuePerLoad: totalLoads > 0 ? totalRevenue / totalLoads : 0,
                revenuePerRoute: activeRoutes.length > 0 ? totalRevenue / activeRoutes.length : 0,
                completionRate: activeRoutes.length > 0 ? (completedCount / activeRoutes.length) * 100 : 0,
            };
        };

        const [data1, data2] = await Promise.all([
            getMonthData(clampedRange1),
            getMonthData(range2),
        ]);

        const calculateChange = (value1: number, value2: number) => {
            if (value1 === 0) return value2 > 0 ? 100 : 0;
            return ((value2 - value1) / value1) * 100;
        };

        return {
            month1: data1,
            month2: data2,
            changes: {
                revenue: calculateChange(data1.totalRevenue, data2.totalRevenue),
                routes: calculateChange(data1.totalRoutes, data2.totalRoutes),
                loads: calculateChange(data1.totalLoads, data2.totalLoads),
                km: calculateChange(data1.totalKm, data2.totalKm),
                completed: calculateChange(data1.completedRoutes, data2.completedRoutes),
                revenuePerKm: calculateChange(data1.revenuePerKm, data2.revenuePerKm),
            },
            isMtdComparison: isCurrentMonth,
            mtdDayCount: isCurrentMonth ? todayDay : null,
        };
    },
});
