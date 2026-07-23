 
import { query } from "./_generated/server";
import { v } from "convex/values";

/**
 * PHASE 0 READ-ONLY CONTRACT FOR ANDROID CLIENT
 * 
 * This module provides a LOCKED API contract for the Android mobile app.
 * 
 * RULES:
 * - Android app may ONLY call queries in this file
 * - DTOs are FROZEN - no modifications without explicit approval
 * - Returns empty array (never null) when no data exists
 * - Fully denormalized - Android performs ZERO joins
 * - Read-only - no mutations exposed to mobile
 */

// Type definitions for documentation (not enforced by TypeScript at runtime)
type TruckDTO = {
    id: string;
    fleetNumber: string;
};

type TrailerDTO = {
    id: string;
    fleetNumber: string;
};

type DriverDTO = {
    id: string;
    name: string;
};

type RouteDTO = {
    id: string;
    date: string;
    truck: TruckDTO;
    trailer: TrailerDTO;
    driver: DriverDTO;
    fromLocations: string[];
    toLocations: string[];
    amount: number;
    status: "planned" | "in_progress" | "completed" | "cancelled";
};

/**
 * LOCKED QUERY: listByDate
 * 
 * Returns all routes for a given date.
 * 
 * INPUT:
 *   date: ISO date string (e.g., "2026-01-23")
 * 
 * OUTPUT:
 *   RouteDTO[] - Empty array if no routes exist
 * 
 * FAILURE MODES:
 *   - Network error: Android shows error state
 *   - Invalid date: Returns empty array
 *   - No data: Returns empty array
 */
export const listByDate = query({
    args: {
        date: v.string(),
    },
    handler: async (ctx, args): Promise<RouteDTO[]> => {
        // Fetch routes for the given date using existing index
        const routes = await ctx.db
            .query("dailyRoutes")
            .withIndex("by_routeDate_truckFleetNoStr", (q) =>
                q.eq("routeDate", args.date)
            )
            .collect();

        // Filter out deleted routes
        const activeRoutes = routes.filter((r) => !(r as any).isDeleted);

        // Transform to locked DTO format
        const routeDTOs: RouteDTO[] = activeRoutes.map((route) => {
            // Generate synthetic IDs for Phase 0 (no separate entity tables yet)
            const truckId = route.truckFleetNoStr || "unknown";
            const trailerId = route.trailerFleetNoStr || "unknown";

            // Generate driver ID from name hash (deterministic)
            const driverId = hashDriverName(route.driverName);

            // Map status with default fallback
            const status = mapStatus((route as any).status);

            return {
                id: route._id,
                date: route.routeDate,

                truck: {
                    id: truckId,
                    fleetNumber: route.truckFleetNoStr || "",
                },

                trailer: {
                    id: trailerId,
                    fleetNumber: route.trailerFleetNoStr || "",
                },

                driver: {
                    id: driverId,
                    name: route.driverName,
                },

                fromLocations: route.fromLocations || [],
                toLocations: route.toLocations || [],

                amount: route.rate, // Total revenue (already calculated server-side)
                status: status,
            };
        });

        // Sort by truck fleet number for consistent ordering
        routeDTOs.sort((a, b) => {
            const truckCompare = a.truck.fleetNumber.localeCompare(b.truck.fleetNumber);
            if (truckCompare !== 0) return truckCompare;
            return a.id.localeCompare(b.id);
        });

        return routeDTOs;
    },
});

/**
 * Helper: Map backend status to locked contract status enum
 * 
 * Backend may have undefined status - default to "planned"
 */
function mapStatus(
    backendStatus: string | undefined
): "planned" | "in_progress" | "completed" | "cancelled" {
    if (!backendStatus) return "planned";

    // Map known statuses
    switch (backendStatus) {
        case "planned":
            return "planned";
        case "in_progress":
            return "in_progress";
        case "completed":
            return "completed";
        case "cancelled":
            return "cancelled";
        case "locked":
            // Locked routes are treated as completed for mobile view
            return "completed";
        default:
            // Unknown status defaults to planned
            return "planned";
    }
}

/**
 * Helper: Generate deterministic driver ID from name
 * 
 * Phase 0 doesn't have separate driver entities, so we generate
 * a synthetic ID from the driver name for consistency.
 */
function hashDriverName(name: string): string {
    if (!name) return "driver_unknown";

    // Simple hash: use name as-is with prefix
    // In future phases, this will be replaced with actual driver IDs
    const normalized = name.toLowerCase().trim().replace(/\s+/g, "_");
    return `driver_${normalized}`;
}
