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
        fromLocations: v.array(v.string()), 
        toLocations: v.array(v.string()), 
        kilometers: v.optional(v.number()),
        quantity: v.string(), 
        quantityType: v.string(), // "ton" | "pallet" 
        rate: v.string(), 
        rateType: v.string(), // "full" | "per_qty" 
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
    .index("by_routeDate", ["routeDate"])
    .index("by_routeDate_truckFleetNoStr", ["routeDate", "truckFleetNoStr"]), 
 
   drivers: defineTable({ 
    driverId: v.string(), 
    driverName: v.string(), 
    idNumber: v.string(), 
    phone: v.string(), 
    status: v.string(), 
    photoStorageId: v.optional(v.string()),
    photoUrl: v.optional(v.string()),
    licenseExpiryDate: v.optional(v.string()),
    pdpExpiryDate: v.optional(v.string()),
  }), 

  pdpApplications: defineTable({
    driverId: v.id("drivers"),
    status: v.string(),
    pdpType: v.optional(v.string()),
    departedAt: v.optional(v.number()),
    returnAt: v.optional(v.number()),
    docsNotes: v.optional(v.string()),
    docAttachmentIds: v.optional(v.array(v.id("attachments"))),
    contingency: v.optional(v.object({
      reason: v.string(),
      resolutionNote: v.string(),
    })),
    retryCount: v.optional(v.number()),
    contingencies: v.optional(v.array(v.object({
      reasons: v.array(v.string()),
      note: v.optional(v.string()),
      timestamp: v.string(),
      performedBy: v.optional(v.string()),
    }))),
    card: v.optional(v.object({
      frontAttachmentId: v.optional(v.id("attachments")),
      backAttachmentId: v.optional(v.id("attachments")),
      cardNumber: v.optional(v.string()),
      collectedAt: v.optional(v.number()),
    })),
    expiry: v.optional(v.object({
      expiryDate: v.string(), // YYYY-MM-DD
      reminderNotificationIds: v.optional(v.array(v.string())),
      setAt: v.number(),
    })),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_driverId", ["driverId"])
    .index("by_status", ["status"]),

  pdpApplicationLogs: defineTable({
    applicationId: v.id("pdpApplications"),
    driverId: v.id("drivers"),
    action: v.string(),
    timestamp: v.string(), // ISO
    performedBy: v.string(),
    notes: v.optional(v.string()),
  })
    .index("by_applicationId", ["applicationId"])
    .index("by_driverId", ["driverId"]),

  trailers: defineTable({ 
    trailerFleetNo: v.number(), 
    trailers: v.array( 
      v.object({ 
        length: v.string(), 
        registration: v.string(), 
      }) 
    ), 
    type: v.string(), 
    status: v.optional(v.string()), 
    trailerFleetNoStr: v.string(), 
    licenseExpiryDate: v.optional(v.string()),
    lastRenewalDate: v.optional(v.string()),
    renewalNotes: v.optional(v.string()),
    receiptPhotoUrl: v.optional(v.string()),
    serviceDueDate: v.optional(v.string()),
    serviceDueKm: v.optional(v.number()),
    currentKm: v.optional(v.number()),
  }) 
    .index("by_trailerFleetNoStr", ["trailerFleetNoStr"]), 

  trucks: defineTable({
    truckFleetNo: v.string(),
    registration: v.string(),
    make: v.string(),
    model: v.string(),
    currentTrailerId: v.optional(v.id("trailers")),
    status: v.optional(v.string()),
    licenseExpiryDate: v.optional(v.string()),
    lastRenewalDate: v.optional(v.string()),
    renewalNotes: v.optional(v.string()),
    receiptPhotoUrl: v.optional(v.string()),
    serviceDueDate: v.optional(v.string()),
    serviceDueKm: v.optional(v.number()),
    currentKm: v.optional(v.number()),
  })
    .index("by_truckFleetNo", ["truckFleetNo"])
    .index("by_currentTrailerId", ["currentTrailerId"]),

  damageLogs: defineTable({
    assetType: v.string(),
    assetUnit: v.string(),
    date: v.string(),
    notes: v.optional(v.string()),
    photoUrls: v.array(v.string()),
    status: v.string(),
    closedAt: v.optional(v.string()),
  })
    .index("by_assetType_assetUnit", ["assetType", "assetUnit"])
    .index("by_assetType", ["assetType"])
    .index("by_assetUnit", ["assetUnit"]),

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

  // ============================================================================
  // TASK MANAGEMENT (FleetToDo)
  // ============================================================================
  
  tasks: defineTable({
    title: v.string(),
    description: v.optional(v.string()),
    priority: v.string(), // "critical" | "warning" | "normal"
    dueDate: v.string(), // ISO String
    completed: v.boolean(),
    createdAt: v.number(),
    
    // Optional: Link to fleet items if needed for manual tasks too
    relatedTo: v.optional(v.object({
      type: v.string(), // "driver" | "truck" | "trailer"
      id: v.string(),
    })),
  })
    .index("by_completed", ["completed"])
    .index("by_priority", ["priority"])
    .index("by_dueDate", ["dueDate"]),

  attachments: defineTable({
    taskId: v.optional(v.id("tasks")), // Only for manual tasks currently
    refId: v.optional(v.string()), // For fleet items (e.g. "driver-license-123")
    refType: v.optional(v.string()), // "driver" | "truck" | "trailer" | "manual"
    storageId: v.id("_storage"),
    fileUrl: v.string(),
    fileType: v.string(), // "image" | "pdf"
    fileName: v.string(),
    uploadedAt: v.number(),
    uploadedBy: v.string(),
  })
    .index("by_taskId", ["taskId"])
    .index("by_refId", ["refId"]),

  taskResolutions: defineTable({
    refId: v.string(), // The unique string ID of the task/alert
    refType: v.string(), // "driver" | "truck" | "trailer" | "manual"
    expiryDate: v.optional(v.string()), // For generated alerts, to know if it's still relevant
    resolvedAt: v.number(),
    resolvedBy: v.string(),
  })
    .index("by_refId", ["refId"]),

  taskSnoozes: defineTable({
    refId: v.string(),
    snoozeUntil: v.number(),
    snoozedBy: v.string(),
  })
    .index("by_refId", ["refId"]),

  myDaySelections: defineTable({
    itemId: v.string(),
    itemType: v.string(),
    label: v.string(),
    selectedDate: v.string(),
    createdAt: v.number(),
  })
    .index("by_selectedDate", ["selectedDate"]),

  trailerSwaps: defineTable({
    truckId: v.string(),
    oldTrailerId: v.optional(v.string()),
    newTrailerId: v.optional(v.string()),
    reason: v.string(),
    notes: v.optional(v.string()),
    swapDate: v.string(),
    swapDateMs: v.optional(v.number()),
    swapType: v.string(),
    createdAt: v.string(),
    // Denormalized fields for UI display
    truckFleetNoStr: v.optional(v.string()),
    trailerFleetNoStr: v.optional(v.string()),
    oldTrailerFleetNoStr: v.optional(v.string()),
  }),

  fleetSetupStatus: defineTable({
    complete: v.boolean(),
  }),

  fleetSetupBaseline: defineTable({
    setupDate: v.number(),
    locked: v.boolean(),
    assignments: v.array(
      v.object({
        truckId: v.id("trucks"),
        trailerId: v.id("trailers"),
      })
    ),
  }),

  clientDisplaySettings: defineTable({
    clientId: v.string(),
    zoomLevel: v.number(),
    compactMode: v.boolean(),
    theme: v.string(),
    reduceMotion: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_clientId", ["clientId"]),

  appSettings: defineTable({
    pushToken: v.optional(v.string()),
    stage1AlertDays: v.number(),
    stage2AlertDays: v.number(),
    stage3AlertDays: v.number(),
    expiryReminder90: v.boolean(),
    expiryReminder60: v.boolean(),
    expiryReminder30: v.boolean(),
  }),

  adminSettings: defineTable({
    mode: v.string(), // "ADMIN" | "VIEW_ONLY"
    passwordHash: v.string(),
  }),

  dailyAvailability: defineTable({
    dayKey: v.string(),
    date: v.string(),
    trucks: v.array(v.string()),
    trailers: v.array(v.string()),
    drivers: v.array(v.string()),
    status: v.union(v.literal("available"), v.literal("unavailable"), v.literal("maintenance")),
    createdAt: v.number(),
    createdBy: v.optional(v.string()),
  })
    .index("by_day", ["dayKey"])
    .index("by_date", ["date"]),

  truckRenewals: defineTable({ 
    truckId: v.id("trucks"), 
    status: v.union( 
      v.literal("initiated"), 
      v.literal("complete") 
    ), 
    initiatedAt: v.float64(), 
    initiatedBy: v.string(), 
    expiry: v.optional(v.object({ 
      expiryDate: v.string(), 
      setAt: v.float64(), 
      setBy: v.string(), 
    })), 
    notes: v.optional(v.string()), 
    updatedAt: v.float64(), 
  }) 
    .index("by_truckId", ["truckId"]) 
    .index("by_status", ["status"]), 

  truckRenewalLogs: defineTable({ 
    renewalId: v.id("truckRenewals"), 
    truckId: v.id("trucks"), 
    action: v.string(), 
    performedBy: v.string(), 
    timestamp: v.string(), 
    notes: v.optional(v.string()), 
  }) 
    .index("by_renewalId", ["renewalId"]) 
    .index("by_truckId", ["truckId"]), 

  trailerRenewals: defineTable({ 
    trailerId: v.id("trailers"), 
    status: v.union( 
      v.literal("initiated"), 
      v.literal("complete") 
    ), 
    initiatedAt: v.float64(), 
    initiatedBy: v.string(), 
    expiry: v.optional(v.object({ 
      expiryDate: v.string(), 
      setAt: v.float64(), 
      setBy: v.string(), 
    })), 
    notes: v.optional(v.string()), 
    updatedAt: v.float64(), 
  }) 
    .index("by_trailerId", ["trailerId"]) 
    .index("by_status", ["status"]), 

  trailerRenewalLogs: defineTable({ 
    renewalId: v.id("trailerRenewals"), 
    trailerId: v.id("trailers"), 
    action: v.string(), 
    performedBy: v.string(), 
    timestamp: v.string(), 
    notes: v.optional(v.string()), 
  }) 
    .index("by_renewalId", ["renewalId"]) 
    .index("by_trailerId", ["trailerId"]), 
});
