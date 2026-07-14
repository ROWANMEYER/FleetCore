import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  adminSettings: defineTable({
    mode: v.string(),
    passwordHash: v.string(),
  }),
  invoiceCounter: defineTable({
    lastNumber: v.float64(),
  }),
  ageSnapshotRows: defineTable({
    accountNumber: v.string(),
    clientName: v.string(),
    current: v.float64(),
    days120: v.float64(),
    days30: v.float64(),
    days60: v.float64(),
    days90: v.float64(),
    originalRowIndex: v.float64(),
    snapshotId: v.id("ageSnapshots"),
    totalDue: v.float64(),
  }).index("by_snapshotId", ["snapshotId"]),
  ageSnapshots: defineTable({
    current: v.float64(),
    days120: v.float64(),
    days30: v.float64(),
    days60: v.float64(),
    days90: v.float64(),
    fileName: v.string(),
    importedAt: v.float64(),
    importedBy: v.string(),
    month: v.string(),
    status: v.string(),
    totalDue: v.float64(),
  }).index("by_month", ["month"]),
  appSettings: defineTable({
    expiryReminder30: v.boolean(),
    expiryReminder60: v.boolean(),
    expiryReminder90: v.boolean(),
    pushToken: v.optional(v.string()),
    stage1AlertDays: v.float64(),
    stage2AlertDays: v.float64(),
    stage3AlertDays: v.float64(),
  }),
  attachments: defineTable({
    fileName: v.string(),
    fileType: v.string(),
    fileUrl: v.string(),
    refId: v.optional(v.string()),
    refType: v.optional(v.string()),
    storageId: v.id("_storage"),
    taskId: v.optional(v.id("tasks")),
    uploadedAt: v.float64(),
    uploadedBy: v.string(),
  })
    .index("by_refId", ["refId"])
    .index("by_taskId", ["taskId"]),
  clientDisplaySettings: defineTable({
    clientId: v.string(),
    compactMode: v.boolean(),
    createdAt: v.float64(),
    reduceMotion: v.boolean(),
    theme: v.string(),
    updatedAt: v.float64(),
    zoomLevel: v.float64(),
  }).index("by_clientId", ["clientId"]),
  customers: defineTable({
    accountNumber: v.optional(v.string()),
    address: v.optional(v.string()),
    contactPerson: v.optional(v.string()),
    phone: v.optional(v.string()),
    createdAt: v.float64(),
    email: v.optional(v.string()),
    isActive: v.boolean(),
    name: v.string(),
    normalizedName: v.string(),
    note: v.optional(v.string()),
    vatNumber: v.optional(v.string()),
  })
    .index("by_accountNumber", ["accountNumber"])
    .index("by_normalizedName", ["normalizedName"]),
  dailyAvailability: defineTable({
    createdAt: v.float64(),
    createdBy: v.optional(v.string()),
    date: v.string(),
    dayKey: v.string(),
    drivers: v.array(v.string()),
    status: v.union(
      v.literal("available"),
      v.literal("unavailable"),
      v.literal("maintenance")
    ),
    trailers: v.array(v.string()),
    trucks: v.array(v.string()),
  })
    .index("by_date", ["date"])
    .index("by_day", ["dayKey"]),
  dailyRoutes: defineTable({
    client: v.string(),
    createdAt: v.float64(),
    deletedAt: v.optional(v.float64()),
    driverName: v.string(),
    fromLocation: v.optional(v.string()),
    fromLocations: v.optional(v.array(v.string())),
    isDeleted: v.optional(v.boolean()),
    kilometers: v.float64(),
    legs: v.optional(
      v.array(
        v.object({
          from: v.string(),
          kilometers: v.float64(),
          order: v.float64(),
          to: v.string(),
        })
      )
    ),
    loads: v.array(
      v.object({
        client: v.string(),
        fromLocations: v.array(v.string()),
        kilometers: v.optional(v.float64()),
        quantity: v.string(),
        quantityType: v.string(),
        rate: v.string(),
        rateType: v.string(),
        toLocations: v.array(v.string()),
      })
    ),
    notes: v.string(),
    rate: v.float64(),
    routeDate: v.string(),
    routeKilometers: v.optional(v.float64()),
    status: v.optional(v.string()),
    toLocations: v.array(v.string()),
    trailerFleetNo: v.float64(),
    trailerFleetNoStr: v.optional(v.string()),
    truckFleetNo: v.optional(v.float64()),
    truckFleetNoStr: v.optional(v.string()),
  })
    .index("by_routeDate", ["routeDate"])
    .index("by_routeDate_truckFleetNoStr", ["routeDate", "truckFleetNoStr"]),
  damageLogs: defineTable({
    assetType: v.string(),
    assetUnit: v.string(),
    closedAt: v.optional(v.string()),
    date: v.string(),
    notes: v.optional(v.string()),
    photoUrls: v.array(v.string()),
    status: v.string(),
  })
    .index("by_assetType", ["assetType"])
    .index("by_assetType_assetUnit", ["assetType", "assetUnit"])
    .index("by_assetUnit", ["assetUnit"]),
  drivers: defineTable({
    createdAt: v.optional(v.float64()),
    driverId: v.optional(v.string()),
    driverName: v.optional(v.string()),
    idNumber: v.optional(v.string()),
    licenseExpiryDate: v.optional(v.string()),
    name: v.optional(v.string()),
    pdpExpiryDate: v.optional(v.string()),
    phone: v.optional(v.string()),
    photoStorageId: v.optional(v.string()),
    photoUrl: v.optional(v.string()),
    status: v.optional(v.string()),
  }).index("by_driverId", ["driverId"]),
  fleetSetupBaseline: defineTable({
    assignments: v.array(
      v.object({
        trailerId: v.id("trailers"),
        truckId: v.id("trucks"),
      })
    ),
    locked: v.boolean(),
    setupDate: v.float64(),
  }),
  fleetSetupStatus: defineTable({ complete: v.boolean() }),
  invoices: defineTable({
    createdAt: v.float64(),
    invoiceNumber: v.string(),
    routeId: v.id("dailyRoutes"),
    snapshot: v.any(),
    totals: v.object({
      subtotal: v.float64(),
      totalAmount: v.float64(),
      vatAmount: v.float64(),
    }),
  })
    .index("by_invoiceNumber", ["invoiceNumber"])
    .index("by_routeId", ["routeId"]),
  myDaySelections: defineTable({
    createdAt: v.float64(),
    itemId: v.string(),
    itemType: v.string(),
    label: v.string(),
    selectedDate: v.string(),
    completed: v.optional(v.boolean()),
  }).index("by_selectedDate", ["selectedDate"]),
  paymentAllocations: defineTable({
    accountNumber: v.optional(v.string()),
    allocatedAmount: v.float64(),
    allocatedAt: v.float64(),
    allocatedBy: v.string(),
    allocationType: v.optional(v.string()),
    clientName: v.optional(v.string()),
    notes: v.optional(v.string()),
    paymentId: v.id("payments"),
    snapshotId: v.optional(v.id("ageSnapshots")),
    snapshotRowId: v.optional(v.id("ageSnapshotRows")),
  })
    .index("by_accountNumber", ["accountNumber"])
    .index("by_paymentId", ["paymentId"])
    .index("by_snapshotRowId", ["snapshotRowId"]),
  payments: defineTable({
    amount: v.float64(),
    flags: v.array(v.string()),
    importedAt: v.float64(),
    notes: v.optional(v.string()),
    paymentDate: v.string(),
    rawDescription: v.string(),
    reference: v.optional(v.string()),
    source: v.string(),
  })
    .index("by_importedAt", ["importedAt"])
    .index("by_paymentDate", ["paymentDate"]),
  pdpApplicationLogs: defineTable({
    action: v.string(),
    applicationId: v.id("pdpApplications"),
    driverId: v.id("drivers"),
    notes: v.optional(v.string()),
    performedBy: v.string(),
    timestamp: v.string(),
  })
    .index("by_applicationId", ["applicationId"])
    .index("by_driverId", ["driverId"]),
  pdpApplications: defineTable({
    card: v.optional(
      v.object({
        backAttachmentId: v.optional(v.id("attachments")),
        cardNumber: v.optional(v.string()),
        collectedAt: v.optional(v.float64()),
        frontAttachmentId: v.optional(v.id("attachments")),
      })
    ),
    contingencies: v.optional(
      v.array(
        v.object({
          note: v.optional(v.string()),
          performedBy: v.optional(v.string()),
          reasons: v.array(v.string()),
          timestamp: v.string(),
        })
      )
    ),
    contingency: v.optional(
      v.object({
        reason: v.string(),
        resolutionNote: v.string(),
      })
    ),
    createdAt: v.float64(),
    departedAt: v.optional(v.float64()),
    docAttachmentIds: v.optional(v.array(v.id("attachments"))),
    docsNotes: v.optional(v.string()),
    driverId: v.id("drivers"),
    expiry: v.optional(
      v.object({
        expiryDate: v.string(),
        reminderNotificationIds: v.optional(v.array(v.string())),
        setAt: v.float64(),
      })
    ),
    pdpType: v.optional(v.string()),
    retryCount: v.optional(v.float64()),
    returnAt: v.optional(v.float64()),
    status: v.string(),
    updatedAt: v.float64(),
  })
    .index("by_driverId", ["driverId"])
    .index("by_status", ["status"]),
  recipients: defineTable({
    email: v.string(),
    name: v.string(),
  }),
  taskResolutions: defineTable({
    expiryDate: v.optional(v.string()),
    refId: v.string(),
    refType: v.string(),
    resolvedAt: v.float64(),
    resolvedBy: v.string(),
  }).index("by_refId", ["refId"]),
  taskSnoozes: defineTable({
    refId: v.string(),
    snoozeUntil: v.float64(),
    snoozedBy: v.string(),
  }).index("by_refId", ["refId"]),
  tasks: defineTable({
    completed: v.boolean(),
    createdAt: v.float64(),
    description: v.optional(v.string()),
    dueDate: v.string(),
    priority: v.string(),
    relatedTo: v.optional(
      v.object({ id: v.string(), type: v.string() })
    ),
    title: v.string(),
  })
    .index("by_completed", ["completed"])
    .index("by_dueDate", ["dueDate"])
    .index("by_priority", ["priority"]),
  trailerRenewalLogs: defineTable({
    action: v.string(),
    notes: v.optional(v.string()),
    performedBy: v.string(),
    renewalId: v.id("trailerRenewals"),
    timestamp: v.string(),
    trailerId: v.id("trailers"),
  })
    .index("by_renewalId", ["renewalId"])
    .index("by_trailerId", ["trailerId"]),
  trailerRenewals: defineTable({
    expiry: v.optional(
      v.object({
        expiryDate: v.string(),
        setAt: v.float64(),
        setBy: v.string(),
      })
    ),
    initiatedAt: v.float64(),
    initiatedBy: v.string(),
    notes: v.optional(v.string()),
    status: v.union(
      v.literal("initiated"),
      v.literal("complete")
    ),
    trailerId: v.id("trailers"),
    updatedAt: v.float64(),
  })
    .index("by_status", ["status"])
    .index("by_trailerId", ["trailerId"]),
  trailerSwaps: defineTable({
    createdAt: v.string(),
    newTrailerId: v.optional(v.string()),
    notes: v.optional(v.string()),
    oldTrailerFleetNoStr: v.optional(v.string()),
    oldTrailerId: v.optional(v.string()),
    reason: v.string(),
    swapDate: v.string(),
    swapDateMs: v.optional(v.float64()),
    swapType: v.string(),
    trailerFleetNoStr: v.optional(v.string()),
    truckFleetNoStr: v.optional(v.string()),
    truckId: v.string(),
  }),
  trailers: defineTable({
    currentKm: v.optional(v.float64()),
    lastRenewalDate: v.optional(v.string()),
    licenseExpiryDate: v.optional(v.string()),
    receiptPhotoUrl: v.optional(v.string()),
    renewalNotes: v.optional(v.string()),
    serviceDueDate: v.optional(v.string()),
    serviceDueKm: v.optional(v.float64()),
    status: v.optional(v.string()),
    trailerFleetNo: v.float64(),
    trailerFleetNoStr: v.string(),
    trailers: v.array(
      v.object({
        length: v.string(),
        registration: v.string(),
      })
    ),
    type: v.string(),
  }).index("by_trailerFleetNoStr", ["trailerFleetNoStr"]),
  truckRenewalLogs: defineTable({
    action: v.string(),
    notes: v.optional(v.string()),
    performedBy: v.string(),
    renewalId: v.id("truckRenewals"),
    timestamp: v.string(),
    truckId: v.id("trucks"),
  })
    .index("by_renewalId", ["renewalId"])
    .index("by_truckId", ["truckId"]),
  truckRenewals: defineTable({
    expiry: v.optional(
      v.object({
        expiryDate: v.string(),
        setAt: v.float64(),
        setBy: v.string(),
      })
    ),
    initiatedAt: v.float64(),
    initiatedBy: v.string(),
    notes: v.optional(v.string()),
    status: v.union(
      v.literal("initiated"),
      v.literal("complete")
    ),
    truckId: v.id("trucks"),
    updatedAt: v.float64(),
  })
    .index("by_status", ["status"])
    .index("by_truckId", ["truckId"]),
  trucks: defineTable({
    createdAt: v.optional(v.float64()),
    currentKm: v.optional(v.float64()),
    currentTrailerId: v.optional(v.id("trailers")),
    fleetNumber: v.optional(v.string()),
    lastRenewalDate: v.optional(v.string()),
    licenseExpiryDate: v.optional(v.string()),
    make: v.optional(v.string()),
    model: v.optional(v.string()),
    receiptPhotoUrl: v.optional(v.string()),
    registration: v.optional(v.string()),
    renewalNotes: v.optional(v.string()),
    serviceDueDate: v.optional(v.string()),
    serviceDueKm: v.optional(v.float64()),
    status: v.optional(v.string()),
    truckFleetNo: v.optional(v.string()),
  })
    .index("by_currentTrailerId", ["currentTrailerId"])
    .index("by_truckFleetNo", ["truckFleetNo"]),
});
