import { query, mutation, action, internalMutation } from "./_generated/server"; 
import { v } from "convex/values"; 
import { internal } from "./_generated/api";

export const listTrucks = query({ 
    args: {}, 
    handler: async (ctx) => { 
       const trucks = await ctx.db.query("trucks").collect(); 
       const activeTrucks = trucks.filter(
           (t) => (t as { status?: string }).status !== "inactive"
       );
       return activeTrucks.map((t) => ({ 
            label: `${t.truckFleetNo} (${t.registration})`, 
            value: t.truckFleetNo, 
        })); 
    }, 
}); 

export const listTrailers = query({ 
    args: {}, 
    handler: async (ctx) => { 
       const trailers = await ctx.db.query("trailers").collect(); 
       const activeTrailers = trailers.filter(
           (t) => (t as { status?: string }).status !== "inactive"
       );
       return activeTrailers.map((t) => { 
            // Use string field if available, else number 
            const fleetNo = t.trailerFleetNoStr || String(t.trailerFleetNo); 
            return { 
                label: `${fleetNo} (${t.type})`, 
                value: fleetNo, 
            }; 
        }); 
    }, 
}); 

export const getTrailers = query({
  args: {
    search: v.optional(v.string()),
    sortBy: v.optional(v.string()),
    sortDir: v.optional(v.union(v.literal("asc"), v.literal("desc"))),
    includeInactive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const data = await ctx.db.query("trailers").collect();
    const includeInactive = Boolean(args.includeInactive);
    let rows = includeInactive ? data : data.filter((t) => (t as { status?: string }).status !== "inactive");
    const search = args.search;
    if (search && search.trim() !== "") {
      const q = search.toLowerCase();
      rows = rows.filter((t) => {
        const fleetNo = t.trailerFleetNoStr || String(t.trailerFleetNo ?? "");
        const trailersList = Array.isArray(t.trailers) ? t.trailers : [];
        const matchesTrailer = trailersList.some((item) =>
          `${item.length ?? ""} ${item.registration ?? ""}`.toLowerCase().includes(q)
        );
        return (
          fleetNo.toLowerCase().includes(q) ||
          (t.type || "").toLowerCase().includes(q) ||
          matchesTrailer
        );
      });
    }
    const flatRows = rows.flatMap((t) => {
      const trailersList = Array.isArray(t.trailers) && t.trailers.length > 0
        ? t.trailers
        : [{ length: "", registration: "" }];
      return trailersList.map((item) => ({
        _id: t._id,
        trailerFleetNo: t.trailerFleetNo,
        trailerFleetNoStr: t.trailerFleetNoStr,
        type: t.type,
        status: (t as { status?: string }).status,
        length: item.length,
        registration: item.registration,
        originalLength: item.length,
        originalRegistration: item.registration,
        currentExpiry: t.licenseExpiryDate,
      }));
    });
    const sortBy = args.sortBy || "trailerFleetNoStr";
    const sortDir = args.sortDir || "asc";
    flatRows.sort((a, b) => {
      const av = (a as Record<string, unknown>)[sortBy] ?? "";
      const bv = (b as Record<string, unknown>)[sortBy] ?? "";
      const cmp = String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: "base" });
      return sortDir === "asc" ? cmp : -cmp;
    });
    return flatRows;
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
        const active = trucks.filter((t) => (t as any).status !== "inactive").length;
        const inactive = total - active;
        return { total, active, inactive };
    },
});

export const getTrailerStats = query({
    args: {},
    handler: async (ctx) => {
        const trailers = await ctx.db.query("trailers").collect();
        const total = trailers.length;
        const active = trailers.filter((t) => (t as any).status !== "inactive").length;
        const inactive = total - active;
        return { total, active, inactive };
    },
});

export const debugAllTrucks = query({
    handler: async (ctx) => ctx.db.query("trucks").collect(),
});

export const debugAllTrailers = query({
    handler: async (ctx) => ctx.db.query("trailers").collect(),
});

export const debugAllDrivers = query({
    handler: async (ctx) => ctx.db.query("drivers").collect(),
});

export const getTrucks = query({
    args: {
        search: v.optional(v.string()),
        sortBy: v.optional(v.string()), // "truckFleetNo" | "registration" | "make" | "model"
        sortDir: v.optional(v.union(v.literal("asc"), v.literal("desc"))),
        includeInactive: v.optional(v.boolean()),
    },
    handler: async (ctx, args) => {
        const data = await ctx.db.query("trucks").collect();
        const includeInactive = Boolean(args.includeInactive);
        let rows = includeInactive ? data : data.filter((t) => (t as any).status !== "inactive");
        const search = args.search;
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
        
        return rows.map(t => ({
            ...t,
            currentExpiry: t.licenseExpiryDate,
        }));
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

export const updateTruck = mutation({
    args: {
        id: v.id("trucks"),
        patch: v.object({
            truckFleetNo: v.optional(v.string()),
            registration: v.optional(v.string()),
            make: v.optional(v.string()),
            model: v.optional(v.string()),
            currentTrailerId: v.optional(v.id("trailers")),
            status: v.optional(v.string()),
            licenseExpiryDate: v.optional(v.string()),
            serviceDueDate: v.optional(v.string()),
            serviceDueKm: v.optional(v.number()),
            currentKm: v.optional(v.number()),
        }),
    },
    handler: async (ctx, args) => {
        const current = await ctx.db.get(args.id);
        if (!current) {
          throw new Error("Document not found");
        }
        // If changing truckFleetNo ensure uniqueness
        if (args.patch.truckFleetNo && args.patch.truckFleetNo !== current.truckFleetNo) {
            const exists = await ctx.db
                .query("trucks")
                .filter((q) => q.eq(q.field("truckFleetNo"), args.patch.truckFleetNo!))
                .first();
            if (exists) throw new Error("Another truck already has this fleet number");
        }
        await ctx.db.patch(args.id, args.patch);
    },
});

export const createTruck = mutation({
    args: {
        truckFleetNo: v.string(),
        registration: v.string(),
        make: v.string(),
        model: v.string(),
        currentTrailerId: v.optional(v.id("trailers")),
        status: v.string(), // "active" | "inactive"
        licenseExpiryDate: v.optional(v.string()),
        serviceDueDate: v.optional(v.string()),
        serviceDueKm: v.optional(v.number()),
        currentKm: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        // Simple uniqueness check on truckFleetNo
        const existing = await ctx.db
            .query("trucks")
            .filter((q) => q.eq(q.field("truckFleetNo"), args.truckFleetNo))
            .first();
        if (existing) {
            throw new Error("Truck with this fleet number already exists");
        }
        return await ctx.db.insert("trucks", args);
    },
});

export const updateTruckStatus = mutation({
    args: {
        id: v.id("trucks"),
        status: v.string(), // "active" | "inactive"
    },
    handler: async (ctx, args) => {
        const current = await ctx.db.get(args.id);
        if (!current) {
          throw new Error("Document not found");
        }
        await ctx.db.patch(args.id, { status: args.status });
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
        photoStorageId: v.optional(v.string()),
        photoUrl: v.optional(v.string()),
        licenseExpiryDate: v.optional(v.string()),
        pdpExpiryDate: v.optional(v.string()),
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
            photoStorageId: v.optional(v.string()),
            photoUrl: v.optional(v.string()),
            licenseExpiryDate: v.optional(v.string()),
            pdpExpiryDate: v.optional(v.string()),
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
        trailerFleetNoStr: v.string(),
        trailerNumber: v.optional(v.string()),
        trailers: v.array(
            v.object({
                length: v.string(),
                registration: v.string(),
            })
        ),
        type: v.string(),
        status: v.optional(v.string()),
        licenseExpiryDate: v.optional(v.string()),
        serviceDueDate: v.optional(v.string()),
        serviceDueKm: v.optional(v.number()),
        currentKm: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const resolvedFleetNoStr = args.trailerFleetNoStr ?? args.trailerNumber;
        if (!resolvedFleetNoStr) {
            throw new Error("trailerFleetNoStr is required");
        }

        const resolvedFleetNoNum = (() => {
            const n = parseInt(resolvedFleetNoStr, 10);
            return isNaN(n) ? args.trailerFleetNo : n;
        })();

        const { trailerNumber: _trailerNumber, ...argsWithoutTrailerNumber } = args;
        const payload = {
            ...argsWithoutTrailerNumber,
            trailerFleetNoStr: resolvedFleetNoStr,
            trailerFleetNo: resolvedFleetNoNum,
        };

        // Check if fleet number exists
        const existing = await ctx.db
            .query("trailers")
            .withIndex("by_trailerFleetNoStr", (q) => q.eq("trailerFleetNoStr", resolvedFleetNoStr))
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
                 const updatedTrailers = [...existing.trailers, ...newItems];
                 await ctx.db.patch(existing._id, { trailers: updatedTrailers });
             }
             return existing._id;
        } else {
            // Create new
            return await ctx.db.insert("trailers", payload);
        }
    },
});

export const updateTrailer = mutation({
    args: {
        id: v.id("trailers"),
        patch: v.object({
            trailerNumber: v.optional(v.string()),
            trailerFleetNoStr: v.optional(v.string()),
            type: v.optional(v.string()),
            trailers: v.optional(v.array(
                v.object({
                    length: v.string(),
                    registration: v.string(),
                })
            )),
            status: v.optional(v.string()),
            licenseExpiryDate: v.optional(v.string()),
            serviceDueDate: v.optional(v.string()),
            serviceDueKm: v.optional(v.number()),
            currentKm: v.optional(v.number()),
        }),
    },
    handler: async (ctx, args) => {
        const current = await ctx.db.get(args.id);
        if (!current) {
          throw new Error("Document not found");
        }
        
        // If changing trailerFleetNoStr ensure uniqueness
        if (args.patch.trailerFleetNoStr && args.patch.trailerFleetNoStr !== current.trailerFleetNoStr) {
             const exists = await ctx.db
                .query("trailers")
                .withIndex("by_trailerFleetNoStr", (q) => q.eq("trailerFleetNoStr", args.patch.trailerFleetNoStr!))
                .first();
            if (exists) throw new Error("Another trailer already has this fleet number");
        }

        // If trailers array is provided, just replace it (simple update)
        const patch = { ...args.patch } as any;

        if (args.patch.trailerNumber && !args.patch.trailerFleetNoStr) {
            (patch as any).trailerFleetNoStr = args.patch.trailerNumber;
        }

        // Never persist legacy field to DB (not in schema)
        delete patch.trailerNumber;

        if (args.patch.trailerFleetNoStr) {
            // Also update numeric field if possible (best effort, legacy)
            const num = parseInt(args.patch.trailerFleetNoStr, 10);
            if (!isNaN(num)) {
                (patch as any).trailerFleetNo = num;
            }
        }
        
        await ctx.db.patch(args.id, patch);
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
        newTrailerFleetNo: v.optional(v.number()),
        newTrailerFleetNoStr: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const current = await ctx.db.get(args.id);
        if (!current) {
          throw new Error("Document not found");
        }

        const resolvedFleetNoStr =
            args.newTrailerFleetNoStr ??
            current.trailerFleetNoStr ??
            (args.newTrailerFleetNo !== undefined ? String(args.newTrailerFleetNo) : undefined);

        if (resolvedFleetNoStr && resolvedFleetNoStr !== current.trailerFleetNoStr) {
            const exists = await ctx.db
                .query("trailers")
                .withIndex("by_trailerFleetNoStr", (q) => q.eq("trailerFleetNoStr", resolvedFleetNoStr))
                .first();
            if (exists && exists._id !== current._id) {
                throw new Error("Another trailer already has this fleet number");
            }
        }

        let found = false;
        const updatedTrailers = current.trailers.map((t) => {
            if (t.length === args.originalLength && t.registration === args.originalRegistration) {
                found = true;
                return { length: args.newLength, registration: args.newRegistration };
            }
            return t;
        });

        if (!found) {
            throw new Error("Trailer component not found");
        }

        const patch: Record<string, unknown> = {
            trailers: updatedTrailers,
            type: args.newType,
        };
        if (args.newTrailerFleetNo !== undefined) {
            patch.trailerFleetNo = args.newTrailerFleetNo;
        }
        if (resolvedFleetNoStr) {
            patch.trailerFleetNoStr = resolvedFleetNoStr;
        }

        await ctx.db.patch(args.id, patch);
    },
});

export const updateTrailerStatus = mutation({
    args: {
        id: v.id("trailers"),
        status: v.string(),
    },
    handler: async (ctx, args) => {
        const current = await ctx.db.get(args.id);
        if (!current) {
          throw new Error("Document not found");
        }
        await ctx.db.patch(args.id, { status: args.status });
    },
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
    },
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

// =============================================================================
// Driver Photo Management
// =============================================================================

export const updateDriverPhotoInternal = internalMutation({
  args: {
    driverId: v.id("drivers"),
    storageId: v.string(),
    url: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.driverId, {
      photoStorageId: args.storageId,
      photoUrl: args.url,
    });
  },
});

export const setDriverPhoto = mutation({
  args: {
    driverId: v.id("drivers"),
    storageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    const driver = await ctx.db.get(args.driverId);
    if (!driver) throw new Error("Driver not found");

    const url = await ctx.storage.getUrl(args.storageId);
    if (!url) throw new Error("Failed to get storage URL");

    await ctx.db.patch(args.driverId, {
      photoStorageId: args.storageId,
      photoUrl: url,
    });

    return { url };
  },
});

export const removeDriverPhoto = mutation({
  args: {
    driverId: v.id("drivers"),
  },
  handler: async (ctx, args) => {
    const driver = await ctx.db.get(args.driverId);
    if (!driver) throw new Error("Driver not found");
    
    await ctx.db.patch(args.driverId, {
      photoStorageId: undefined,
      photoUrl: undefined,
    });
  },
});

export const uploadDriverPhoto = action({
  args: {
    driverId: v.id("drivers"),
    image: v.string(), // Base64 data URL
  },
  handler: async (ctx, args) => {
    // 1. Auth check
    // const identity = await ctx.auth.getUserIdentity();
    // if (!identity) throw new Error("Unauthorized");

    // 2. Parse Base64 Data URL
    const matches = args.image.match(/^data:(.+);base64,(.+)$/);
    if (!matches) throw new Error("Invalid image data URL");

    const mimeType = matches[1];
    const base64Data = matches[2];

    // 3. Validation
    if (!mimeType.startsWith("image/")) throw new Error("Invalid file type: must be an image");
    
    // Check size (approximate: base64 length * 0.75)
    const sizeInBytes = base64Data.length * 0.75;
    if (sizeInBytes > 5 * 1024 * 1024) throw new Error("File size too large (max 5MB)");

    // 4. Store file
    const bytes = Uint8Array.from(
      atob(base64Data),
      (c) => c.charCodeAt(0)
    );
    const blob = new Blob([bytes], { type: mimeType });
    
    const storageId = await ctx.storage.store(blob);
    const url = await ctx.storage.getUrl(storageId);

    if (!url) throw new Error("Failed to generate storage URL");

    // 5. Update driver record
    await ctx.runMutation(internal.fleet.updateDriverPhotoInternal, {
      driverId: args.driverId,
      storageId,
      url,
    });

    return { storageId, url };
  },
});
