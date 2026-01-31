import { defineSchema, defineTable } from "convex/server"; 
 import { v } from "convex/values"; 
 
 export default defineSchema({ 
   customers: defineTable({
    name: v.string(),
    normalizedName: v.string(),
    accountNumber: v.optional(v.string()),
    isActive: v.boolean(),
    createdAt: v.number(),
    note: v.optional(v.string()),
    // Invoice / Contact Details
    address: v.optional(v.string()),
    vatNumber: v.optional(v.string()),
    contactPerson: v.optional(v.string()),
    email: v.optional(v.string()),
  })
    .index("by_normalizedName", ["normalizedName"])
    .index("by_accountNumber", ["accountNumber"]),

  // NOTE: invoices table is defined once intentionally.
  // Do not duplicate or redefine elsewhere in this file.
  invoices: defineTable({
    routeId: v.id("dailyRoutes"),
    invoiceNumber: v.string(),
    createdAt: v.number(),
    snapshot: v.any(), // Stores the full InvoiceData JSON for immutability
    totals: v.object({
      subtotal: v.number(),
      vatAmount: v.number(),
      totalAmount: v.number(),
    }),
  })
    .index("by_routeId", ["routeId"])
    .index("by_invoiceNumber", ["invoiceNumber"]),

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
        kilometers: v.optional(v.number()),
      }) 
    ), 
 
     // Backward compatibility (populated from first load or aggregates) 
     client: v.string(), // Primary client 
     rate: v.number(), // Total Revenue 
 
     createdAt: v.number(), 
     driverName: v.string(), 
     fromLocation: v.optional(v.string()), // Legacy singular field explicitly optional 
    kilometers: v.number(), 
    routeKilometers: v.optional(v.number()), // Explicit route-level KM input
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

  ageSnapshots: defineTable({
    month: v.string(), // YYYY-MM
    importedAt: v.number(),
    importedBy: v.string(),
    fileName: v.string(),
    status: v.string(), // "active"
    totalDue: v.number(),
    days120: v.number(),
    days90: v.number(),
    days60: v.number(),
    days30: v.number(),
    current: v.number(),
  })
  .index("by_month", ["month"]),

  ageSnapshotRows: defineTable({
    snapshotId: v.id("ageSnapshots"),
    clientName: v.string(),
    accountNumber: v.string(), // Rek no
    current: v.number(),
    days30: v.number(),
    days60: v.number(),
    days90: v.number(),
    days120: v.number(), // 120+
    totalDue: v.number(),
    originalRowIndex: v.number(),
  })
  .index("by_snapshotId", ["snapshotId"]),

  payments: defineTable({
    paymentDate: v.string(), // YYYY-MM-DD
    amount: v.number(),
    reference: v.optional(v.string()),
    rawDescription: v.string(),
    source: v.string(),
    flags: v.array(v.string()),
    importedAt: v.number(),
    notes: v.optional(v.string()),
  })
  .index("by_paymentDate", ["paymentDate"])
  .index("by_importedAt", ["importedAt"]),

  paymentAllocations: defineTable({
    paymentId: v.id("payments"),
    
    // Allocation Type
    allocationType: v.optional(v.string()), // "SNAPSHOT" | "ON_ACCOUNT" - defaults to SNAPSHOT if missing

    // Fields for SNAPSHOT allocations
    snapshotId: v.optional(v.id("ageSnapshots")),
    snapshotRowId: v.optional(v.id("ageSnapshotRows")), // The customer row being allocated to

    // Fields for ON_ACCOUNT allocations
    accountNumber: v.optional(v.string()), // Required if ON_ACCOUNT
    clientName: v.optional(v.string()), // Snapshot of name at time of allocation

    allocatedAmount: v.number(),
    allocatedAt: v.number(),
    allocatedBy: v.string(), // User ID or "manual"
    notes: v.optional(v.string()),
  })
  .index("by_paymentId", ["paymentId"])
  .index("by_snapshotRowId", ["snapshotRowId"])
  .index("by_accountNumber", ["accountNumber"]),
});
