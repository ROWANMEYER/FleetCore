import { defineSchema, defineTable } from "convex/server"; 
 import { v } from "convex/values"; 
 
 export default defineSchema({ 
   dailyRoutes: defineTable({ 
     // New fields for multi-load support 
     loads: v.array( 
       v.object({ 
         client: v.string(), 
         quantity: v.string(), 
         quantityType: v.string(), // "ton" | "pallet" 
         rate: v.string(), 
         rateType: v.string(), // "full" | "per_qty" 
         fromLocations: v.array(v.string()), 
         toLocations: v.array(v.string()), 
       }) 
     ), 
 
     // Backward compatibility (populated from first load or aggregates) 
     client: v.string(), // Primary client 
     rate: v.number(), // Total Revenue 
 
     createdAt: v.number(), 
     driverName: v.string(), 
     fromLocation: v.optional(v.string()), // Legacy singular field explicitly optional 
     kilometers: v.number(), 
     notes: v.string(), 
     routeDate: v.string(), 
     toLocations: v.array(v.string()), 
     trailerFleetNo: v.number(), 
     truckFleetNo: v.optional(v.number()), 
 
     // New backward-compatible fields 
     fromLocations: v.optional(v.array(v.string())), 
    truckFleetNoStr: v.optional(v.string()), 
    trailerFleetNoStr: v.optional(v.string()), 
    status: v.optional(v.string()), // "planned" | "completed" | "locked"
    
    // Soft Delete Fields
    isDeleted: v.optional(v.boolean()),
    deletedAt: v.optional(v.number()),

    // Legs (Physical Journey Segments)
    legs: v.optional(v.array(
      v.object({
        from: v.string(),
        to: v.string(),
        kilometers: v.number(),
        order: v.number(),
      })
    )),
  }) 
    .index("by_routeDate_truckFleetNo", ["routeDate", "truckFleetNo"]) 
     .index("by_routeDate_truckFleetNoStr", ["routeDate", "truckFleetNoStr"]), 
 
   drivers: defineTable({ 
    driverId: v.string(), 
    driverName: v.string(), 
    idNumber: v.string(), 
    phone: v.string(), 
    status: v.string(), 
  }), 

  trailers: defineTable({ 
    trailerFleetNo: v.number(), 
    trailers: v.array( 
      v.object({ 
        length: v.string(), 
        registration: v.string(), 
      }) 
    ), 
    type: v.string(), 

    trailerFleetNoStr: v.optional(v.string()), 
  }) 
    .index("by_trailerFleetNo", ["trailerFleetNo"]) 
    .index("by_trailerFleetNoStr", ["trailerFleetNoStr"]), 

  trucks: defineTable({ 
    truckFleetNo: v.string(), 
    registration: v.string(), 
    make: v.string(), 
    model: v.string(), 
  }) 
    .index("by_truckFleetNo", ["truckFleetNo"]),

  recipients: defineTable({
    name: v.string(),
    email: v.string(),
  }),
});