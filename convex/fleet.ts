import { query, mutation } from "./_generated/server"; 
 import { v } from "convex/values"; 
 
 export const listTrucks = query({ 
     args: {}, 
     handler: async (ctx) => { 
         const trucks = await ctx.db.query("trucks").collect(); 
         return trucks.map((t) => ({ 
             label: `${t.truckFleetNo} (${t.registration})`, 
             value: t.truckFleetNo, 
         })); 
     }, 
 }); 
 
 export const listTrailers = query({ 
     args: {}, 
     handler: async (ctx) => { 
         const trailers = await ctx.db.query("trailers").collect(); 
         return trailers.map((t) => { 
             // Use string field if available, else number 
             const fleetNo = t.trailerFleetNoStr || String(t.trailerFleetNo); 
             return { 
                 label: `${fleetNo} (${t.type})`, 
                 value: fleetNo, 
             }; 
         }); 
     }, 
 }); 
 
 export const listDrivers = query({ 
     args: {}, 
     handler: async (ctx) => { 
       const drivers = await ctx.db.query("drivers").collect();
       const activeDrivers = drivers.filter((d) => {
         const status = (d as { status?: string }).status;
         return status !== "inactive";
       });
        return activeDrivers.map((d) => ({ 
             label: d.driverName, 
             value: d.driverName, // Storing name as requested by prompt 
         })); 
     }, 
 });

export const getDriverStats = query({
    args: {},
    handler: async (ctx) => {
        const drivers = await ctx.db.query("drivers").collect();
        const total = drivers.length;
        const active = drivers.filter((d) => (d as any).status !== "inactive").length;
        const inactive = total - active;
        return { total, active, inactive };
    },
});

export const getTruckStats = query({
    args: {},
    handler: async (ctx) => {
        const trucks = await ctx.db.query("trucks").collect();
        const total = trucks.length;
        return { total };
    },
});

export const getTrucks = query({
    args: {
        search: v.optional(v.string()),
        sortBy: v.optional(v.string()), // "truckFleetNo" | "registration" | "make" | "model"
        sortDir: v.optional(v.union(v.literal("asc"), v.literal("desc"))),
    },
    handler: async (ctx, args) => {
        const data = await ctx.db.query("trucks").collect();
        const search = args.search;
        let rows = data;
        if (search && search.trim() !== "") {
            const q = search.toLowerCase();
            rows = rows.filter((t) => {
                return (
                    (t.truckFleetNo || "").toLowerCase().includes(q) ||
                    (t.registration || "").toLowerCase().includes(q) ||
                    (t.make || "").toLowerCase().includes(q) ||
                    (t.model || "").toLowerCase().includes(q)
                );
            });
        }
        const sortBy = args.sortBy || "truckFleetNo";
        const sortDir = args.sortDir || "asc";
        rows.sort((a, b) => {
            const av = (a as Record<string, unknown>)[sortBy] ?? "";
            const bv = (b as Record<string, unknown>)[sortBy] ?? "";
            const cmp = String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: "base" });
            return sortDir === "asc" ? cmp : -cmp;
        });
        return rows;
    },
});

export const getTrailers = query({
    args: {
        search: v.optional(v.string()),
        sortBy: v.optional(v.string()), // "trailerFleetNoStr" | "type" | "length" | "registration"
        sortDir: v.optional(v.union(v.literal("asc"), v.literal("desc"))),
    },
    handler: async (ctx, args) => {
        const data = await ctx.db.query("trailers").collect();
        
        // Flatten nested trailers into rows
        let rows = data.flatMap((t) => {
            // Handle edge case where trailers array might be empty or undefined (though schema says required)
            const subTrailers = t.trailers && t.trailers.length > 0 ? t.trailers : [];
            if (subTrailers.length === 0) {
                // Return a "phantom" row or just the parent info? 
                // If there are no physical trailers, maybe we shouldn't show it, or show with empty fields.
                // Assuming schema enforcement, trailers array should have items. 
                // If empty, let's return one row with empty length/reg so it can be edited/deleted.
                return [{
                    _id: t._id,
                    trailerFleetNo: t.trailerFleetNo,
                    trailerFleetNoStr: t.trailerFleetNoStr,
                    type: t.type,
                    length: "",
                    registration: "",
                    originalLength: "",
                    originalRegistration: "",
                }];
            }
            return subTrailers.map((inner) => ({
                _id: t._id,
                trailerFleetNo: t.trailerFleetNo,
                trailerFleetNoStr: t.trailerFleetNoStr,
                type: t.type,
                length: inner.length,
                registration: inner.registration,
                originalLength: inner.length,
                originalRegistration: inner.registration,
            }));
        });

        const search = args.search;
        if (search && search.trim() !== "") {
            const q = search.toLowerCase();
            rows = rows.filter((r) => {
                const fleetNo = r.trailerFleetNoStr || String(r.trailerFleetNo || "");
                return (
                    fleetNo.toLowerCase().includes(q) ||
                    (r.type || "").toLowerCase().includes(q) ||
                    (r.length || "").toLowerCase().includes(q) ||
                    (r.registration || "").toLowerCase().includes(q)
                );
            });
        }

        const sortBy = args.sortBy || "trailerFleetNoStr";
        const sortDir = args.sortDir || "asc";
        
        rows.sort((a, b) => {
            // @ts-ignore
            let av = a[sortBy];
            // @ts-ignore
            let bv = b[sortBy];

            if (sortBy === "trailerFleetNoStr") {
                av = a.trailerFleetNoStr || String(a.trailerFleetNo);
                bv = b.trailerFleetNoStr || String(b.trailerFleetNo);
            }
            
            // Fallback for nulls
            av = av ?? "";
            bv = bv ?? "";

            const cmp = String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: "base" });
            return sortDir === "asc" ? cmp : -cmp;
        });
        
        return rows;
    },
});

// =============================================================================
// Mutations — Admin Master Data
// =============================================================================

export const getDrivers = query({
    args: {
        search: v.optional(v.string()),
        sortBy: v.optional(v.string()), // "driverName" | "driverId" | "status"
        sortDir: v.optional(v.union(v.literal("asc"), v.literal("desc"))),
        includeInactive: v.optional(v.boolean()),
    },
    handler: async (ctx, args) => {
        const data = await ctx.db.query("drivers").collect();
        const includeInactive = Boolean(args.includeInactive);
        let rows = includeInactive ? data : data.filter((d) => (d as { status?: string }).status !== "inactive");
        const search = args.search;
        if (search && search.trim() !== "") {
            const q = search.toLowerCase();
            rows = rows.filter((d) => {
                return (
                    (d.driverName || "").toLowerCase().includes(q) ||
                    (d.driverId || "").toLowerCase().includes(q) ||
                    (d.idNumber || "").toLowerCase().includes(q) ||
                    (d.phone || "").toLowerCase().includes(q) ||
                    (d.status || "").toLowerCase().includes(q)
                );
            });
        }
        const sortBy = args.sortBy || "driverName";
        const sortDir = args.sortDir || "asc";
        rows.sort((a, b) => {
            const av = (a as Record<string, unknown>)[sortBy] ?? "";
            const bv = (b as Record<string, unknown>)[sortBy] ?? "";
            const cmp = String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: "base" });
            return sortDir === "asc" ? cmp : -cmp;
        });
        return rows;
    },
});

// =============================================================================
// Mutations — Admin Master Data
// =============================================================================

export const createTruck = mutation({
    args: {
        truckFleetNo: v.string(),
        registration: v.string(),
        make: v.string(),
        model: v.string(),
    },
    handler: async (ctx, args) => {
        const existing = await ctx.db
            .query("trucks")
            .withIndex("by_truckFleetNo", (q) => q.eq("truckFleetNo", args.truckFleetNo))
            .first();
        if (existing) {
            throw new Error("Truck with this fleet number already exists");
        }
        return await ctx.db.insert("trucks", args);
    },
});

export const updateTruck = mutation({
    args: {
        id: v.id("trucks"),
        patch: v.object({
            truckFleetNo: v.optional(v.string()),
            registration: v.optional(v.string()),
            make: v.optional(v.string()),
            model: v.optional(v.string()),
        }),
    },
    handler: async (ctx, args) => {
        const current = await ctx.db.get(args.id);
        if (!current) throw new Error("Truck not found");
        // If changing fleet number, ensure unique
        if (args.patch.truckFleetNo && args.patch.truckFleetNo !== current.truckFleetNo) {
            const exists = await ctx.db
                .query("trucks")
                .withIndex("by_truckFleetNo", (q) => q.eq("truckFleetNo", args.patch.truckFleetNo!))
                .first();
            if (exists) throw new Error("Another truck already has this fleet number");
        }
        await ctx.db.patch(args.id, args.patch);
    },
});

export const deleteTruck = mutation({
    args: { id: v.id("trucks") },
    handler: async (ctx, args) => {
        const truck = await ctx.db.get(args.id);
        if (!truck) throw new Error("Truck not found");
        // Reference check in dailyRoutes: truckFleetNoStr equals trucks.truckFleetNo
        const referenced = await ctx.db
            .query("dailyRoutes")
            .filter((q) => q.eq(q.field("truckFleetNoStr"), truck.truckFleetNo))
            .first();
        if (referenced) {
            throw new Error("Cannot delete — record is used in existing routes");
        }
        await ctx.db.delete(args.id);
    },
});

export const createDriver = mutation({
    args: {
        driverId: v.string(),
        driverName: v.string(),
        idNumber: v.string(),
        phone: v.string(),
        status: v.string(), // "active" | "inactive"
    },
    handler: async (ctx, args) => {
        // Simple uniqueness check on driverId
        const existing = await ctx.db
            .query("drivers")
            .filter((q) => q.eq(q.field("driverId"), args.driverId))
            .first();
        if (existing) {
            throw new Error("Driver with this driverId already exists");
        }
        return await ctx.db.insert("drivers", args);
    },
});

export const updateDriver = mutation({
    args: {
        id: v.id("drivers"),
        patch: v.object({
            driverId: v.optional(v.string()),
            driverName: v.optional(v.string()),
            idNumber: v.optional(v.string()),
            phone: v.optional(v.string()),
            status: v.optional(v.string()),
        }),
    },
    handler: async (ctx, args) => {
        const current = await ctx.db.get(args.id);
        if (!current) throw new Error("Driver not found");
        // If changing driverId ensure uniqueness
        if (args.patch.driverId && args.patch.driverId !== current.driverId) {
            const exists = await ctx.db
                .query("drivers")
                .filter((q) => q.eq(q.field("driverId"), args.patch.driverId!))
                .first();
            if (exists) throw new Error("Another driver already has this driverId");
        }
        await ctx.db.patch(args.id, args.patch);
    },
});

export const updateDriverStatus = mutation({
    args: {
        id: v.id("drivers"),
        status: v.string(), // "active" | "inactive"
    },
    handler: async (ctx, args) => {
        const current = await ctx.db.get(args.id);
        if (!current) throw new Error("Driver not found");
        await ctx.db.patch(args.id, { status: args.status });
    },
});

export const deleteDriver = mutation({
    args: { id: v.id("drivers") },
    handler: async (ctx, args) => {
        const driver = await ctx.db.get(args.id);
        if (!driver) throw new Error("Driver not found");
        // Reference check: driverName
        const referenced = await ctx.db
            .query("dailyRoutes")
            .filter((q) => q.eq(q.field("driverName"), driver.driverName))
            .first();
        if (referenced) {
            throw new Error("Cannot delete — record is used in existing routes");
        }
        await ctx.db.delete(args.id);
    },
});

export const createTrailer = mutation({
    args: {
        trailerFleetNo: v.number(),
        trailerFleetNoStr: v.optional(v.string()),
        trailers: v.array(
            v.object({
                length: v.string(),
                registration: v.string(),
            })
        ),
        type: v.string(),
    },
    handler: async (ctx, args) => {
        // Check if fleet number exists
        const existing = await ctx.db
            .query("trailers")
            .withIndex("by_trailerFleetNo", (q) => q.eq("trailerFleetNo", args.trailerFleetNo))
            .first();

        if (existing) {
             // Add to existing, avoiding duplicates
             const newItems = args.trailers.filter(newItem => 
                !existing.trailers.some(existingItem => 
                    existingItem.registration === newItem.registration && existingItem.length === newItem.length
                )
             );
             
             // If we have new items, append them
             if (newItems.length > 0) {
                 await ctx.db.patch(existing._id, {
                     trailers: [...existing.trailers, ...newItems],
                     // Optionally update type/string if provided, assuming latest write wins for shared fields
                     type: args.type, 
                     trailerFleetNoStr: args.trailerFleetNoStr || existing.trailerFleetNoStr
                 });
             } else {
                 throw new Error("This trailer already exists for fleet number " + args.trailerFleetNo);
             }
        } else {
            // Create new
            await ctx.db.insert("trailers", args);
        }
    },
});

export const updateTrailer = mutation({
    args: {
        id: v.id("trailers"),
        patch: v.object({
            trailerFleetNo: v.optional(v.number()), // Changed from string to number to match schema
            trailerFleetNoStr: v.optional(v.string()),
            trailers: v.array(
                v.object({
                    length: v.string(),
                    registration: v.string(),
                })
            ),
            type: v.optional(v.string()),
        }),
    },
    handler: async (ctx, args) => {
        await ctx.db.patch(args.id, args.patch);
    },
});

export const updateTrailerComponent = mutation({
    args: {
        id: v.id("trailers"),
        originalLength: v.string(),
        originalRegistration: v.string(),
        
        newLength: v.string(),
        newRegistration: v.string(),
        newType: v.string(),
        newTrailerFleetNo: v.number(),
        newTrailerFleetNoStr: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const doc = await ctx.db.get(args.id);
        if (!doc) throw new Error("Trailer not found");

        const patch: any = {};
        
        // 1. Handle Parent Fields (affects all siblings)
        if (args.newType !== doc.type) patch.type = args.newType;
        if (args.newTrailerFleetNoStr !== doc.trailerFleetNoStr) patch.trailerFleetNoStr = args.newTrailerFleetNoStr;
        
        if (args.newTrailerFleetNo !== doc.trailerFleetNo) {
             const existing = await ctx.db.query("trailers").withIndex("by_trailerFleetNo", q => q.eq("trailerFleetNo", args.newTrailerFleetNo)).first();
             if (existing && existing._id !== doc._id) throw new Error("Fleet number " + args.newTrailerFleetNo + " already exists");
             patch.trailerFleetNo = args.newTrailerFleetNo;
        }

        // 2. Handle Child Fields (update specific array item)
        const trailers = [...doc.trailers];
        const index = trailers.findIndex(t => t.length === args.originalLength && t.registration === args.originalRegistration);
        
        if (index === -1) {
            // If not found, maybe it was already changed? Or we are adding?
            // Fallback: if array has only 1 item, update it? No, unsafe.
            throw new Error("Original trailer component not found. Please refresh.");
        }
        
        trailers[index] = {
            length: args.newLength,
            registration: args.newRegistration
        };
        
        patch.trailers = trailers;
        
        await ctx.db.patch(args.id, patch);
    }
});

export const deleteTrailerComponent = mutation({
    args: {
        id: v.id("trailers"),
        length: v.string(),
        registration: v.string(),
    },
    handler: async (ctx, args) => {
        const doc = await ctx.db.get(args.id);
        if (!doc) throw new Error("Trailer not found");
        
        // Safety Check: Is the Fleet Number used in any route?
        const referenced = await ctx.db
            .query("dailyRoutes")
            .filter((q) => {
                const numMatch = q.eq(q.field("trailerFleetNo"), doc.trailerFleetNo);
                if (doc.trailerFleetNoStr) {
                    return q.or(numMatch, q.eq(q.field("trailerFleetNoStr"), doc.trailerFleetNoStr));
                }
                return numMatch;
            })
            .first();
            
        if (referenced) {
            throw new Error("This trailer is used in existing routes and cannot be removed.");
        }
        
        // Remove item
        const newTrailers = doc.trailers.filter(t => !(t.length === args.length && t.registration === args.registration));
        
        if (newTrailers.length === 0) {
            // Delete parent if empty
            await ctx.db.delete(args.id);
        } else {
            await ctx.db.patch(args.id, { trailers: newTrailers });
        }
    }
});

export const deleteTrailer = mutation({
    args: { id: v.id("trailers") },
    handler: async (ctx, args) => {
        const trailer = await ctx.db.get(args.id);
        if (!trailer) throw new Error("Trailer not found");
        // Reference check in dailyRoutes by either string or numeric
        const referencedByStr = await ctx.db
            .query("dailyRoutes")
            .filter((q) => q.eq(q.field("trailerFleetNoStr"), trailer.trailerFleetNoStr ?? ""))
            .first();
        const referencedByNum = await ctx.db
            .query("dailyRoutes")
            .filter((q) => q.eq(q.field("trailerFleetNo"), trailer.trailerFleetNo))
            .first();
        if (referencedByStr || referencedByNum) {
            throw new Error("Cannot delete — record is used in existing routes");
        }
        await ctx.db.delete(args.id);
    },
});
