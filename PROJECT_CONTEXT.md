# FleetCore — Full Project Context

> **Generated**: 2026-07-27  
> **Project**: FleetCore — A production fleet operations management system  
> **Status**: Locked baseline (as of 2026-01-23)  
> **Architecture Lock**: See `ARCHITECTURE_LOCK.md` — core decisions are frozen

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Tech Stack](#2-tech-stack)
3. [Project Structure](#3-project-structure)
4. [Routing Map](#4-routing-map)
5. [Database Schema](#5-database-schema)
6. [Convex Backend Modules](#6-convex-backend-modules)
7. [Frontend Components](#7-frontend-components)
8. [Core UI Patterns & Conventions](#8-core-ui-patterns--conventions)
9. [CRUD Patterns](#9-crud-patterns)
10. [Architecture Locks & Constraints](#10-architecture-locks--constraints)
11. [Environment & Configuration](#11-environment--configuration)
12. [Import / Bulk-Entry Features](#12-import--bulk-entry-features)
13. [Expiry & Renewal Tracking](#13-expiry--renewal-tracking)
14. [Email & Reporting](#14-email--reporting)
15. [Recent Changes (Phase 1)](#15-recent-changes-phase-1)

---

## 1. Project Overview

FleetCore is a production-focused fleet operations system for daily route planning, load management, subcontractor management, financial reporting, and operational intelligence. It is built for real operators, real loads, and real consequences.

**Primary use cases:**
- Daily route planning with multi-load wizard
- Fleet master data management (trucks, trailers, drivers)
- Subcontractor management with linked assets
- CEO-level analytics dashboard
- Invoice generation (PDF)
- Email reporting (QuickSend)
- Age analysis / receivables tracking
- Payment import and allocation
- Expiry tracking (licenses, PDP, services)
- Trailer swap management

---

## 2. Tech Stack

| Layer | Technology | Details |
|-------|-----------|---------|
| **Framework** | Next.js 16.1.7 | App Router only (no Pages Router) |
| **Language** | TypeScript 5 | Strict mode enabled |
| **Frontend** | React 19.2.3 | With React Compiler enabled |
| **Styling** | Tailwind CSS v4 | `@theme inline` directives; dark mode via class toggle |
| **Backend/Database** | Convex 1.31.7 | Deployment: `dev:quixotic-gopher-969` |
| **State Management** | Convex queries/mutations | No Redux, Zustand, or other client state lib |
| **Auth** | bcryptjs 3 | Simple PIN-based admin gate (no OAuth) |
| **PDF** | jsPDF 4 + jspdf-autotable 5 | Absolute positioning only |
| **Email** | Resend 6.8 | Via Convex actions |
| **Spreadsheets** | exceljs 4.4, xlsx 0.18 | Import/export |
| **Charts** | recharts 3.7 | Dashboard visualizations |
| **Theme** | next-themes 0.4.6 | Default: dark; system preference disabled |
| **Icons** | lucide-react 1.26, @heroicons/react 2.2 | |
| **Package Manager** | npm | |
| **React Compiler** | babel-plugin-react-compiler 1.0.0 | Enabled in `next.config.ts` |

### Key NPM Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `next` | 16.1.7 | Framework |
| `react` / `react-dom` | 19.2.3 | UI |
| `convex` | ^1.31.7 | Backend queries, mutations, actions, schema |
| `tailwindcss` | ^4 | Utility-first CSS |
| `bcryptjs` | ^3.0.3 | Admin password hashing |
| `jspdf` + `jspdf-autotable` | ^4.0.0 / ^5.0.7 | PDF invoice generation |
| `recharts` | ^3.7.0 | Dashboard charts |
| `resend` | ^6.8.0 | Transactional emails |
| `exceljs` / `xlsx` | ^4.4.0 / ^0.18.5 | Excel import/export |
| `next-themes` | ^0.4.6 | Dark/light theme toggle |
| `lucide-react` | ^1.26.0 | Icon library |

---

## 3. Project Structure

```
fleetcor/
├── convex/                          # 📁 Backend — Convex functions
│   ├── _generated/                  #   Auto-generated types (run `npx convex codegen`)
│   ├── __analysis__/                #   Architecture analysis docs
│   ├── templates/                   #   Email templates (TransportReport.ts)
│   ├── schema.ts                    #   📄 Database schema (single source of truth)
│   ├── utils.ts                     #   Shared helpers (calculateLoadAmount)
│   ├── adminSettings.ts             #   Admin PIN/mode management
│   ├── ai.ts                        #   AI integration (Ollama)
│   ├── attachments.ts               #   File upload/storage management
│   ├── backfillStatus.ts            #   Status backfill utilities
│   ├── cleanupTrailerSwaps.ts       #   Trailer swap cleanup
│   ├── cleanup_trucks.ts            #   Truck data cleanup
│   ├── crons.ts                     #   Scheduled cron jobs
│   ├── customers.ts                 #   Customer CRUD + search
│   ├── dailyAvailability.ts         #   Daily truck/driver/trailer availability
│   ├── dailyOps.ts                  #   Daily operational snapshot (expiries, issues)
│   ├── dailyRoutes.ts               #   📄 Core route CRUD (create, update, query, delete)
│   ├── damageLogs.ts                #   Asset damage tracking
│   ├── dashboard.ts                 #   📄 CEO dashboard analytics queries
│   ├── dataImport.ts                #   Bulk import mutations (drivers, trucks, trailers)
│   ├── displaySettings.ts           #   Client display settings
│   ├── drivers.ts                   #   Driver expiry tracking + queries
│   ├── emails.ts                    #   Email sending via Resend
│   ├── emailTemplates.ts            #   Email template rendering
│   ├── fleet.ts                     #   📄 Admin CRUD (trucks, drivers, trailers) + list helpers
│   ├── fleetImport.ts               #   Fleet import utilities
│   ├── fleetSetup.ts                #   Initial fleet setup (truck-trailer assignments)
│   ├── fleetStatus.ts               #   Fleet setup status tracking
│   ├── health.ts                    #   Health check endpoint
│   ├── http.ts                      #   HTTP action endpoints
│   ├── invoices.ts                  #   Invoice generation (PDF + storage)
│   ├── migrations.ts                #   Data migrations
│   ├── myDay.ts                     #   My Day selection tracking
│   ├── notifications.ts             #   PDP expiry + stage reminders
│   ├── pdp.ts                       #   PDP application tracking
│   ├── pdpReport.ts                 #   PDP report generation
│   ├── recipients.ts                #   Email recipient management
│   ├── resetFlags.ts                #   Flag reset utilities
│   ├── routes.ts                    #   Legacy route queries
│   ├── seed.ts                      #   Database seeding
│   ├── settings.ts                  #   Application settings
│   ├── subcontractors.ts            #   📄 Subcontractor CRUD (Phase 1)
│   ├── tasks.ts                     #   Task management
│   ├── trailerRenewals.ts           #   Trailer license renewal tracking
│   ├── trailers.ts                  #   Trailer queries (current assignment, details)
│   ├── trailerSwaps.ts              #   Trailer swap history management
│   ├── truckRenewals.ts             #   Truck license renewal tracking
│   ├── trucks.ts                    #   Truck operations (trailer assignment)
│   └── vehicleLicences.ts           #   Vehicle license queries
│
├── src/
│   ├── app/                         # 📁 Next.js App Router pages
│   │   ├── layout.tsx               #   Root layout (Convex, Theme, Nav, Toast)
│   │   ├── page.tsx                 #   🔀 Redirects to /dashboard
│   │   ├── globals.css              #   Tailwind v4, scrollbar styles, theme vars
│   │   ├── dashboard/
│   │   │   └── page.tsx             #   📄 CEO dashboard (detailed analytics)
│   │   ├── operations/
│   │   │   ├── layout.tsx            #   Operations layout
│   │   │   ├── page.tsx             #   🔀 Redirects to daily-planner/input
│   │   │   ├── daily-planner/
│   │   │   │   ├── layout.tsx        #   Daily planner layout (tabs: Input, Sheets, Import)
│   │   │   │   ├── page.tsx         #   🔀 Redirects to /input
│   │   │   │   ├── input/
│   │   │   │   │   ├── page.tsx     #   📄 Route creation wizard
│   │   │   │   │   └── DailyPlannerInputContent.tsx
│   │   │   │   ├── sheets/
│   │   │   │   │   ├── page.tsx     #   📄 Sheets view (collapsed summary + expansion)
│   │   │   │   │   └── ImportLoadsModal.tsx
│   │   │   │   └── edit/
│   │   │   │       └── [routeId]/
│   │   │   │           └── page.tsx  #   Route edit page
│   │   │   ├── combinations/        #   Truck-trailer combo management
│   │   │   ├── fuel/                #   Fuel tracking
│   │   │   ├── quicksend/           #   QuickSend email report
│   │   │   └── swaps/
│   │   │       ├── history/         #   Trailer swap history
│   │   │       └── trailers/        #   Current trailer assignments
│   │   ├── admin/
│   │   │   ├── layout.tsx           #   Admin sub-navigation (Fleet + Finance groups)
│   │   │   ├── page.tsx             #   Admin dashboard (link grid)
│   │   │   ├── trucks/             #   Truck master data CRUD
│   │   │   ├── trailers/           #   Trailer master data CRUD
│   │   │   ├── drivers/            #   Driver master data CRUD
│   │   │   ├── subcontractors/     #   Subcontractor CRUD (Phase 1)
│   │   │   ├── fleet-import/       #   Fleet import page
│   │   │   ├── customers/          #   Customer master data
│   │   │   ├── age-analysis/       #   Age analysis snapshots
│   │   │   ├── payments/           #   Bank payment import + allocation
│   │   │   └── reconciliation/     #   Reconciliation view
│   │   ├── import/                  #   General import page (placeholder)
│   │   └── settings/               #   Application settings page
│   │
│   ├── components/                  # 📁 React components
│   │   ├── common/                  #   Shared reusable components
│   │   │   ├── Toast.tsx            #     Toast notification system
│   │   │   ├── ConfirmDialog.tsx    #     Confirmation modal
│   │   │   ├── ModalShell.tsx       #     Accessible modal + SlideInPanel
│   │   │   ├── EmptyState.tsx       #     Empty state with icons
│   │   │   ├── Pagination.tsx       #     Page navigation
│   │   │   ├── Skeleton.tsx         #     Loading skeletons (Line, Card, Table, Page, KpiGrid)
│   │   │   ├── WarningIcon.tsx      #     Tooltip warning/info icon
│   │   │   └── useKeyboardShortcut.ts  #  Keyboard shortcut hooks
│   │   ├── providers/
│   │   │   └── ConvexClientProvider.tsx  #  Convex React client setup
│   │   ├── Navigation.tsx           #   Top-level nav bar
│   │   ├── ThemeProvider.tsx        #   next-themes wrapper
│   │   ├── ThemeToggle.tsx          #   Light/dark toggle (SVG icons)
│   │   ├── BackgroundProvider.tsx   #   Background context
│   │   ├── ParticleBackground.tsx   #   Animated particle background
│   │   ├── RouteForm.tsx            #   Legacy route form (marked ⚠️)
│   │   ├── EmailReportModal.tsx     #   Email report dialog
│   │   ├── dashboard/
│   │   │   └── ceo/                 #   CEO dashboard widgets
│   │   │       ├── ExecutiveSummary.tsx
│   │   │       ├── FinancialHealthWidget.tsx
│   │   │       ├── OperationalMetrics.tsx
│   │   │       ├── CustomerPerformance.tsx
│   │   │       ├── FleetPerformance.tsx
│   │   │       ├── StrategicInsights.tsx
│   │   │       └── TrendIcon.tsx
│   │   ├── operations/
│   │   │   └── daily-planner/
│   │   │       ├── EditRouteForm.tsx     #  Route editor in slide panel
│   │   │       └── WizardRouteHeader.tsx #  Wizard step indicator
│   │   └── admin/
│   │       └── payments/            #   Payment allocation components
│   │
│   ├── lib/
│   │   └── exports/                 #   Export utilities
│   │       ├── exportCSV.ts
│   │       ├── exportExcelWithTemplate.ts
│   │       ├── exportJSON.ts
│   │       ├── exportPDF.ts
│   │       └── utils.ts
│   │
│   ├── pdf/                         # 📁 PDF invoice generation
│   │   ├── README.md               #   PDF layout rules
│   │   ├── invoiceBuilder.ts
│   │   ├── invoiceTemplate.ts
│   │   ├── formatters.ts           #   formatCurrency (ZAR), formatDate, formatDescription
│   │   └── types.ts
│   │
│   └── types/
│       └── sheetExport.ts          #   SheetExportRow interface
│
├── scripts/                         # Build/utility scripts
│   ├── generateSnapshot.ps1
│   ├── updateBackend.ps1
│   ├── fleetcore_report.py
│   └── generate_monthly_report.py
│
├── docs/                            # Documentation
│   └── APP_STRUCTURE.md            # Detailed architecture docs
│
├── public/
│   └── templates/                  # Static template assets (Excel)
│
├── AGENTS.md                        # AI agent instructions
├── ARCHITECTURE_LOCK.md             # Frozen architectural decisions
├── LINT_FREEZE.md                   # Lint exemption policy
├── CEO_DASHBOARD_GUIDE.md           # Dashboard documentation
├── PROJECT_CONTEXT.md               # 📄 This file
└── README.md                        # Project overview
```

---

## 4. Routing Map

### Main Navigation Routes

| Route Pattern | Purpose | Status |
|---------------|---------|--------|
| `/` | 🔀 Redirects to `/dashboard` | Root |
| `/dashboard` | 📊 CEO analytics dashboard | Active |
| `/operations` | 🔀 Redirects to `/operations/daily-planner/input` | Active |
| `/admin` | 📋 Admin dashboard (link grid) | Active |
| `/settings` | ⚙️ Application settings | Active |
| `/import` | 📥 General import page (placeholder) | Skeleton |

### Operations Sub-Routes

| Route Pattern | Purpose |
|---------------|---------|
| `/operations/daily-planner` | 🔀 Redirects to `/input` |
| `/operations/daily-planner/input` | ✏️ Route creation wizard (canonical route form) |
| `/operations/daily-planner/sheets` | 📄 Sheets view (collapsed summary + expansion) |
| `/operations/daily-planner/edit/[routeId]` | ✏️ Edit specific route |
| `/operations/combinations` | 🔗 Truck-trailer combo management |
| `/operations/fuel` | ⛽ Fuel tracking |
| `/operations/quicksend` | 📧 QuickSend email report |
| `/operations/swaps/history` | 📜 Trailer swap history |
| `/operations/swaps/trailers` | 🔄 Current trailer assignments |

### Admin Sub-Routes

| Route Pattern | Purpose |
|---------------|---------|
| `/admin/trucks` | 🚛 Truck master data CRUD |
| `/admin/trailers` | 🛞 Trailer master data CRUD |
| `/admin/drivers` | 👤 Driver master data CRUD |
| `/admin/subcontractors` | 🤝 Subcontractor CRUD (Phase 1) |
| `/admin/customers` | 🏢 Customer master data |
| `/admin/fleet-import` | 📦 Fleet bulk import |
| `/admin/age-analysis` | 📊 Age analysis snapshots list |
| `/admin/age-analysis/[snapshotId]` | 📄 Snapshot detail view |
| `/admin/payments` | 💳 Bank payment import + allocation |
| `/admin/reconciliation` | 🔍 Reconciliation read-only view |

### Legacy Routes (must not be removed per ARCHITECTURE_LOCK)

- `/planner`
- `/sheets`

---

## 5. Database Schema

The full schema is defined in `convex/schema.ts` using Convex runtime validators (`convex/values`). Below is every table and its fields.

### Core Operational Tables

#### `dailyRoutes` (Core Table)
```typescript
{
  _id: Id<"dailyRoutes">,
  _creationTime: number,
  routeDate: string,               // YYYY-MM-DD
  driverName: string,
  client: string,                  // Derived from first load
  createdAt: number,
  deletedAt?: number,
  isDeleted?: boolean,
  kilometers: number,              // Effective KM (auto-calculated)
  routeKilometers?: number,        // Explicit route KM override
  notes: string,
  status?: string,                 // "planned" | "completed" | "locked"
  
  // Fleet references (string-based, not FK)
  truckFleetNo?: number,
  truckFleetNoStr?: string,
  trailerFleetNo: number,
  trailerFleetNoStr?: string,
  subcontractorId?: Id<"subcontractors">,
  
  // Location fields
  fromLocation?: string,           // Legacy single-location
  fromLocations?: string[],
  toLocations: string[],
  
  // Loads (the core cargo items)
  loads: {
    client: string,
    fromLocations: string[],
    toLocations: string[],
    quantity: string,
    quantityType: string,         // "ton" | "pallet" | "load"
    rate: string,
    rateType: string,             // "flat" | "per_qty" | "full"
    kilometers?: number,
    subcontractorRate?: string,
    subcontractorRateType?: string,
  }[],
  
  // Physical journey segments
  legs?: {
    from: string,
    to: string,
    kilometers: number,
    order: number,
  }[],
}
```
Indexes: `by_routeDate`, `by_routeDate_truckFleetNoStr`

#### `trucks`
```typescript
{
  truckFleetNo?: string,           // Canonical fleet number
  registration?: string,           // Vehicle registration plate
  make?: string,
  model?: string,
  status?: string,                 // "active" | "inactive"
  subStatus?: string,              // "active" | "inactive" (subcontractor mode)
  subcontractorId?: Id<"subcontractors">,
  currentTrailerId?: Id<"trailers">, // CURRENTLY ASSIGNED trailer (source of truth)
  currentKm?: number,
  fleetNumber?: string,            // Legacy
  licenseExpiryDate?: string,
  serviceDueDate?: string,
  serviceDueKm?: number,
  lastRenewalDate?: string,
  renewalNotes?: string,
  receiptPhotoUrl?: string,
  createdAt?: number,
}
```
Indexes: `by_currentTrailerId`, `by_truckFleetNo`

#### `trailers`
```typescript
{
  trailerFleetNo: number,          // Numeric fleet number
  trailerFleetNoStr: string,       // String fleet number (canonical for joins)
  type: string,                    // e.g. "interlink", "flatbed"
  status?: string,                 // "active" | "inactive"
  subStatus?: string,              // "active" | "inactive" (subcontractor mode)
  subcontractorId?: Id<"subcontractors">,
  
  // Physical trailer units under this fleet number
  trailers: {
    length: string,
    registration: string,
  }[],
  
  currentKm?: number,
  licenseExpiryDate?: string,
  serviceDueDate?: string,
  serviceDueKm?: number,
  lastRenewalDate?: string,
  renewalNotes?: string,
  receiptPhotoUrl?: string,
}
```
Index: `by_trailerFleetNoStr`

> **⚠️ Schema Quirk**: One `trailers` document has a `trailers` array (confusing naming) representing physical units under a fleet number.

#### `drivers`
```typescript
{
  driverId?: string,               // Business key (e.g. employee number)
  driverName?: string,
  name?: string,
  idNumber?: string,               // National ID
  phone?: string,
  status?: string,                 // "active" | "inactive"
  subStatus?: string,              // "active" | "inactive" (subcontractor mode)
  subcontractorId?: Id<"subcontractors">,
  licenseExpiryDate?: string,
  pdpExpiryDate?: string,          // Professional Driving Permit expiry
  photoStorageId?: string,
  photoUrl?: string,
  createdAt?: number,
}
```
Index: `by_driverId`

### Financial Tables

#### `invoices`
```typescript
{
  invoiceNumber: string,
  routeId: Id<"dailyRoutes">,
  snapshot: any,                   // Route snapshot at time of invoice
  totals: {
    subtotal: number,
    totalAmount: number,
    vatAmount: number,
  },
  createdAt: number,
}
```
Indexes: `by_invoiceNumber`, `by_routeId`

#### `payments`
```typescript
{
  amount: number,
  paymentDate: string,
  rawDescription: string,
  reference?: string,
  source: string,
  notes?: string,
  flags: string[],
  importedAt: number,
}
```
Indexes: `by_importedAt`, `by_paymentDate`

#### `paymentAllocations`
```typescript
{
  paymentId: Id<"payments">,
  allocatedAmount: number,
  allocatedAt: number,
  allocatedBy: string,
  accountNumber?: string,
  clientName?: string,
  allocationType?: string,
  notes?: string,
  snapshotId?: Id<"ageSnapshots">,
  snapshotRowId?: Id<"ageSnapshotRows">,
}
```
Indexes: `by_accountNumber`, `by_paymentId`, `by_snapshotRowId`

#### `ageSnapshots`
```typescript
{
  current: number,
  days30: number,
  days60: number,
  days90: number,
  days120: number,
  totalDue: number,
  fileName: string,
  importedAt: number,
  importedBy: string,
  month: string,
  status: string,
}
```
Index: `by_month`

#### `ageSnapshotRows`
```typescript
{
  snapshotId: Id<"ageSnapshots">,
  accountNumber: string,
  clientName: string,
  current: number,
  days30: number,
  days60: number,
  days90: number,
  days120: number,
  totalDue: number,
  originalRowIndex: number,
}
```
Index: `by_snapshotId`

### Customer Table

#### `customers`
```typescript
{
  name: string,
  normalizedName: string,          // Lowercased, trimmed
  accountNumber?: string,
  address?: string,
  contactPerson?: string,
  phone?: string,
  email?: string,
  vatNumber?: string,
  note?: string,
  isActive: boolean,
  createdAt: number,
}
```
Indexes: `by_accountNumber`, `by_normalizedName`

### Subcontractors Table (Phase 1)

#### `subcontractors`
```typescript
{
  companyName: string,
  phone?: string,
  email?: string,
  status?: string,                 // "active" | "inactive"
  createdAt: number,
}
```

### Availability & Scheduling

#### `dailyAvailability`
```typescript
{
  date: string,
  dayKey: string,
  status: "available" | "unavailable" | "maintenance",
  trucks: string[],
  trailers: string[],
  drivers: string[],
  createdBy?: string,
  createdAt: number,
}
```
Indexes: `by_date`, `by_day`

### Other Tables

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `adminSettings` | Admin PIN & mode | `mode`, `passwordHash` |
| `appSettings` | Application settings | `expiryReminder30/60/90`, `stage1/2/3AlertDays` |
| `attachments` | File attachments | `fileName`, `fileType`, `fileUrl`, `storageId`, `refId`, `taskId` |
| `clientDisplaySettings` | Per-client display prefs | `clientId`, `compactMode`, `reduceMotion`, `theme`, `zoomLevel` |
| `damageLogs` | Asset damage tracking | `assetType`, `assetUnit`, `date`, `status`, `photoUrls` |
| `fleetSetupBaseline` | Initial truck-trailer assignments | `assignments[]`, `locked` |
| `fleetSetupStatus` | Setup completion flag | `complete` |
| `invoiceCounter` | Invoice number sequence | `lastNumber` |
| `myDaySelections` | My Day item tracking | `itemId`, `itemType`, `label`, `selectedDate`, `completed` |
| `notifications` | Push notification tracking | (schema scope) |
| `pdpApplications` | PDP application tracking | `driverId`, `status`, `pdpType`, `expiry`, `contingencies` |
| `pdpApplicationLogs` | PDP application audit log | `applicationId`, `driverId`, `action`, `notes` |
| `recipients` | Email recipients | `name`, `email` |
| `tasks` | Task management | `title`, `description`, `dueDate`, `priority`, `completed` |
| `taskResolutions` | Task resolution tracking | `refId`, `refType`, `resolvedAt`, `resolvedBy` |
| `taskSnoozes` | Task snooze tracking | `refId`, `snoozeUntil` |
| `trailerRenewals` | Trailer license renewals | `trailerId`, `status`, `expiry`, `notes` |
| `trailerRenewalLogs` | Trailer renewal audit log | `renewalId`, `trailerId`, `action` |
| `trailerSwaps` | Trailer swap history | `truckId`, `oldTrailerId`, `newTrailerId`, `reason`, `swapDate` |
| `truckRenewals` | Truck license renewals | `truckId`, `status`, `expiry`, `notes` |
| `truckRenewalLogs` | Truck renewal audit log | `renewalId`, `truckId`, `action` |

### Entity Relationships

```
trucks.currentTrailerId ──────► trailers._id         (current assignment)
dailyRoutes.truckFleetNoStr ──► trucks.truckFleetNo   (string reference)
dailyRoutes.trailerFleetNoStr─► trailers.trailerFleetNoStr
dailyRoutes.subcontractorId ──► subcontractors._id
invoices.routeId ──────────────► dailyRoutes._id
ageSnapshotRows.snapshotId ────► ageSnapshots._id
paymentAllocations.paymentId ──► payments._id
paymentAllocations.snapshotRowId ► ageSnapshotRows._id
drivers.subcontractorId ───────► subcontractors._id
trucks.subcontractorId ────────► subcontractors._id
trailers.subcontractorId ──────► subcontractors._id
```

---

## 6. Convex Backend Modules

### Core Modules

| Module | Key Exports | Purpose |
|--------|-------------|---------|
| `dailyRoutes.ts` | `createDailyRoute`, `updateDailyRoute`, `deleteDailyRoute`, `getRoutesByDate`, `getForSheets`, `getById`, `getRoutesByTruckAndDate`, `markRouteCompleted`, `lockRoute`, `unlockRoute`, `getLoadsForEmailReport`, `getQuickSendReport`, `createBulkDailyRoutes` | Core route CRUD with auto-complete logic, KM calculation |
| `dashboard.ts` | `getExecutiveSummary`, `getCustomerAnalytics`, `getFleetPerformance`, `getOperationalEfficiency`, `getMonthToMonthComparison`, `getDashboardLoadsSummary`, `getRevenueOverTime`, `getRevenueByTruck`, `getRoutesByStatus` | CEO-level analytics queries |
| `fleet.ts` | `listTrucks`, `listTrailers`, `listDrivers`, `getTrucks`, `getTrailers`, `getDrivers`, `createTruck/Trailer/Driver`, `updateTruck/Trailer/Driver`, `deleteTruck/Trailer/Driver`, `setDriverPhoto`, `uploadDriverPhoto` | Admin CRUD + list helpers with subcontractor filtering |
| `subcontractors.ts` | `list`, `getAll`, `getStats`, `create`, `update`, `updateStatus`, `remove` | Subcontractor CRUD (Phase 1) |
| `customers.ts` | `search`, `list`, `createCustomer`, `updateCustomer`, `deactivateCustomer`, `deleteCustomer`, `deleteBulkCustomers` | Customer CRUD with duplicate detection |

### Specialty Modules

| Module | Key Exports | Purpose |
|--------|-------------|---------|
| `invoices.ts` | Invoice generation (PDF via jsPDF) | Generate, store, and retrieve invoices |
| `emails.ts` | `sendLoadReportEmail` | Send reports via Resend with HTML templates |
| `pdp.ts` | PDP application lifecycle | Full PDP tracking with stages, docs, expiry |
| `trailerSwaps.ts` | Swap history CRUD | Record and query trailer swap events |
| `trucks.ts` | Trailer assignment | Assign/unassign trailers to trucks |
| `trailers.ts` | Trailer queries | Current assignment lookup |
| `drivers.ts` | Expiry tracking | License and PDP expiry queries |
| `trailerRenewals.ts` | Renewal lifecycle | Trailer license renewal workflow |
| `truckRenewals.ts` | Renewal lifecycle | Truck license renewal workflow |
| `dailyAvailability.ts` | Availability CRUD | Daily truck/driver/trailer availability |
| `dailyOps.ts` | Ops snapshot | Daily issues: expiring licenses, services due |
| `damageLogs.ts` | Damage tracking | Asset damage logs with photo support |
| `tasks.ts` | Task management | Create, update, resolve, snooze tasks |
| `notifications.ts` | Scheduled reminders | PDP stage and expiry reminder logic |
| `crons.ts` | Cron jobs | Daily PDP stage reminders, monthly expiry reminders |
| `attachments.ts` | File management | Generate upload URLs, save attachment metadata |
| `dataImport.ts` | Bulk import | `importDrivers`, `importTrucks`, `importTrailers` |
| `adminSettings.ts` | PIN auth | Password verification via bcrypt |
| `ai.ts` | AI integration | Ollama-based AI analysis |
| `settings.ts` | App settings | Read/update application configuration |
| `recipients.ts` | Email recipients | CRUD for email report recipients |

---

## 7. Frontend Components

### Common/Shared Components (`src/components/common/`)

| Component | Props | Purpose |
|-----------|-------|---------|
| `Toast.tsx` / `ToastProvider` | Context-based | Toast notification system (success/error/info), auto-dismiss 4s |
| `ConfirmDialog.tsx` | `open`, `title`, `message`, `confirmLabel`, `variant`, `loading`, `onConfirm`, `onCancel` | Accessible confirmation modal |
| `ModalShell.tsx` | `open`, `onClose`, `children` | Accessible modal with focus trapping, Escape key, Tab cycling |
| `SlideInPanel.tsx` | `open`, `onClose`, `children` | Right-side slide-in panel variant |
| `EmptyState.tsx` | `icon`, `title`, `description`, `action` | Empty state illustrations (search, filter, empty, calendar, clipboard) |
| `Pagination.tsx` | `currentPage`, `totalPages`, `onPageChange` | Page navigation with ellipsis |
| `Skeleton.tsx` | Various | Loading placeholders (Line, Card, Table, Page, KpiGrid) |
| `WarningIcon.tsx` | `type`, `tooltip` | Tooltip with warning/info emoji |
| `useKeyboardShortcut.ts` | `key`, `handler`, `enabled`, `ctrl` | Keyboard shortcut hook + `useEscapeToClose` |

### Navigation & Layout

| Component | Purpose |
|-----------|---------|
| `Navigation.tsx` | Top-level nav bar with links to Dashboard, Operations, Admin, Settings + ThemeToggle |
| `ThemeProvider.tsx` | next-themes wrapper (default: dark, no system) |
| `ThemeToggle.tsx` | SVG sun/moon toggle button with hydration-safe mounting |
| `ConvexClientProvider.tsx` | Convex React client initialization |
| `BackgroundProvider.tsx` | Background context provider |
| `ParticleBackground.tsx` | Animated particle effect |

### CEO Dashboard (`src/components/dashboard/ceo/`)

| Component | Purpose |
|-----------|---------|
| `ExecutiveSummary.tsx` | Top KPI display (Revenue, R/KM, R/Load, Completion Rate) |
| `FinancialHealthWidget.tsx` | Receivables aging analysis (current, 30/60/90/120+ days) |
| `OperationalMetrics.tsx` | Route and load efficiency KPIs |
| `CustomerPerformance.tsx` | Customer concentration risk + top 10 table |
| `FleetPerformance.tsx` | Truck efficiency ranking + utilization |
| `StrategicInsights.tsx` | AI-generated recommendations with success/warning/alert levels |
| `TrendIcon.tsx` | Reusable trend direction indicator |

### Operations Components

| Component | Purpose |
|-----------|---------|
| `EditRouteForm.tsx` | Route editing form (used in slide-in panel) |
| `WizardRouteHeader.tsx` | Step indicator for route creation wizard |
| `RouteForm.tsx` | Legacy route form (⚠️ marked for Phase 3+ deprecation) |
| `ImportLoadsModal.tsx` | Modal for importing loads from external sources |

### Admin Components

| Component | Purpose |
|-----------|---------|
| `InvoiceDeliveryPanel.tsx` | Invoice email delivery panel |

### Export Utilities (`src/lib/exports/`)

| Utility | Purpose |
|---------|---------|
| `exportCSV.ts` | CSV file export |
| `exportExcelWithTemplate.ts` | Excel export with template-based formatting |
| `exportJSON.ts` | JSON data export |
| `exportPDF.ts` | PDF document export |
| `utils.ts` | `downloadFile` blob download utility |

---

## 8. Core UI Patterns & Conventions

### Design Tokens (from `globals.css`)

```css
/* Theme variables */
--color-background: #ffffff (light) | #0b1220 (dark)
--color-foreground: #171717 (light) | #e5e7eb (dark)
--font-sans: Geist (via next/font/google)
--font-mono: Geist Mono

/* Dark mode: .dark class on <html> (never from OS preference) */
```

### Common CSS Patterns

| Element | Tailwind Classes |
|---------|-----------------|
| Page container | `w-full h-full p-6 space-y-6 overflow-y-auto` |
| Cards | `bg-white dark:bg-slate-900/60 rounded-lg border shadow-sm` |
| Form inputs | `border border-gray-300 dark:border-slate-700 rounded-lg px-3 py-2 text-xs` |
| Primary buttons | `px-3 py-1.5 bg-black text-white text-xs font-medium rounded-lg hover:bg-gray-800` |
| Status badges | `inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold` |
| Success badge | `bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300` |
| Inactive badge | `bg-gray-100 text-gray-500 dark:bg-slate-800 dark:text-slate-400` |
| Error messages | `text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1` |
| Navigation | `bg-black/95` dark:bg-black, white text, active = border-b-2 |
| Admin sub-nav | Grouped sections (Fleet vs Finance) with small-caps headers |

### Scrollbar Utilities

- `scrollbar-fleet`: Thin dark scrollbar for in-panel scrolling
- `scrollbar-hidden`: Hide scrollbar chrome while preserving scroll behavior
- `scrollbar-thin`: Thin light scrollbar (used in sheets table)

### Naming Conventions

| Category | Convention | Examples |
|----------|-----------|----------|
| Files | `camelCase.ts` | `dailyRoutes.ts`, `exportCSV.ts` |
| Components | `PascalCase.tsx` | `RouteForm.tsx`, `WizardRouteHeader.tsx` |
| Directories | `kebab-case/` | `daily-planner/`, `age-analysis/` |
| Convex functions | `camelCase` | `createDailyRoute`, `getRoutesByDate` |
| React state | `camelCase` with `set` prefix | `search`, `setSearch` |

### Owner/Ownership Badge Pattern

All admin CRUD pages (trucks, trailers, drivers) share a common ownership badge pattern:

- **Fleet-owned**: Gray badge "Fleet"
- **Subcontractor-owned**: Purple badge with sub-company name + Blue/gray sub-status badge
- **Sub-status**: "Sub Active" (blue) or "Sub Inactive" (gray)

### Status Badge Pattern

- **Active**: Green background with dark green text
- **Inactive**: Gray background with gray text
- Both support dark mode variants

---

## 9. CRUD Patterns

### Admin CRUD (Trucks, Trailers, Drivers)

All three admin CRUD pages follow the **same pattern**:

1. **Card-based grid layout** (not a table) — `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4`
2. **Inline editing** — clicking Edit transforms the card into edit mode (blue border)
3. **Sortable columns** — via sort state (asc/desc toggles)
4. **Search filter** — text input with debounced filtering
5. **`includeInactive` checkbox** — toggle visibility of inactive records
6. **KPI cards** — showing Total / Active / Inactive counts
7. **Status badges** — green = Active, gray = Inactive
8. **Action buttons** — hover-revealed: Edit (Pencil), Power/PowerOff, Delete (Trash2)
9. **lucide-react icons** — for all actions
10. **OwnerBadge** — Fleet or Subcontractor ownership indicator
11. **ConfirmDialog** — for delete confirmations
12. **Pagination** — 20 items per page
13. **Toast notifications** — success/error messages that auto-dismiss

### Route Creation Flow

1. **Multi-step form** in `daily-planner/input/` — header section + load section
2. **Session draft recovery** — saves to `sessionStorage` with 10-min TTL
3. **Subcontractor support** — optional ID + auto-generated notes (sub name / truck reg / driver phone)
4. **Auto-complete logic** — if all loads have client, from, to, and amount > 0, status = "completed"
5. **KM calculation priority**: Route KM > Leg sum > Max Load KM > Input field
6. **Input uppercasing** — client names auto-uppercased on change

### Route Status Flow

```
planned → completed → locked
              ↑            │
              └── unlock ──┘
```

- **Planned**: Route is created but not yet completed
- **Completed**: All loads are validated, route is done
- **Locked**: Route is locked for financial processing (cannot be edited or deleted)
- **Delete**: Only allowed for planned/completed routes (not locked)

### Delete Safety Checks

- **Truck/Driver delete**: Checks `dailyRoutes` for references
- **Trailer delete**: Checks `dailyRoutes` by both string and numeric fleet number
- **Customer delete**: Checks `dailyRoutes` by client name
- **All blocked if referenced**: Soft error message instructing deactivation instead

---

## 10. Architecture Locks & Constraints

### 🔐 Locked UI Contracts (per `ARCHITECTURE_LOCK.md`)

- **Sheets table**: Default view is collapsed summary rows with chevron expansion
- **Status + Risk**: Computed (pure functions, no hooks, no mutations, no side effects)
- **Status priority**: Incomplete > Missing KM > Multi-drop > Multi-pick > Finalized > Clean
- **Backend queries**: Separated by consumer intent (UI, reporting, email, QuickSend)
- **Suspense**: Localized only, `fallback={null}` unless required
- **Legacy routes** (`/planner`, `/sheets`): Must not be removed

### 🚫 Prohibited Without Phase 3+

- Removing legacy routes
- Consolidating routing systems
- Merging backend queries
- Replacing table architecture
- Introducing global state systems (Redux, Zustand)
- Major component splitting

### Lint Freeze (per `LINT_FREEZE.md`)

- Legacy Convex and Planner files have `no-explicit-any` disabled via per-file comments
- New code must remain strict and lint-free
- Lint: `npm run lint` (ESLint only — no typecheck script exists)

### PDF Constraints (per `src/pdf/README.md`)

- **Absolute positioning only**, fixed Y-coordinates in points (pt)
- Fixed zones: Header (top), Bill To (Y=140), Description (Y=220, max 2 lines), Totals (Y=290), Banking (Y=360)
- **Never use mm/px** or flow-based layouts
- Currency format: ZAR (`R 1 234,56`) via `formatters.ts`, never `toLocaleString()`

### Trailer Swaps — Source of Truth

- The **current** truck-trailer combination is stored in `trucks.currentTrailerId` (not `trailerSwaps`)
- `trailerSwaps` table stores historical swap events only
- See `convex/__analysis__/trailerSwapAnalysis.md` for full audit

---

## 11. Environment & Configuration

### Commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | Next.js dev server |
| `npm run build` | Production build |
| `npm run lint` | ESLint only (no test/typecheck) |
| `npm run update-backend` | Runs `npx convex codegen` + `generateSnapshot.ps1` |
| `npx convex push` | Push Convex functions to deployment |
| `npx convex codegen` | Regenerate `convex/_generated/` types |

### Environment Variables

- `NEXT_PUBLIC_CONVEX_URL` — Convex deployment URL
- `RESEND_API_KEY` — Resend API key for email sending
- Stored in `.env.local` (not committed)

### Convex Deployment

- **Development**: `dev:quixotic-gopher-969`
- Client created in `ConvexClientProvider.tsx` using `process.env.NEXT_PUBLIC_CONVEX_URL`

### Configuration Files

| File | Purpose |
|------|---------|
| `next.config.ts` | React Compiler enabled, Turbopack |
| `tsconfig.json` | Strict mode, path alias `@/*` → `./*` |
| `postcss.config.mjs` | Tailwind v4 PostCSS setup |
| `tailwind.config.ts` | (Not needed — v4 uses CSS-first config via `@theme inline`) |

---

## 12. Import / Bulk-Entry Features

### Age Analysis Import (`/admin/age-analysis`)

- **Multi-step wizard**: Upload .xlsx → preview rows → select header → map columns → validate → import
- **Library**: `xlsx` for file parsing
- **Duplicate detection**: Checks if snapshot for month already exists
- **Validation**: `convex/finance/lib/validateAgeRows.ts`
- **Storage**: Convex action `finance.importAgeSnapshot.importSnapshot`

### Payment Import (`/admin/payments`)

- **Method**: Copy-paste raw bank statement lines into textarea
- **Parsing**: Regex-based (amount extraction, reference detection)
- **Anomaly detection**: Flags missing reference, zero/negative amounts, outliers
- **Duplicate detection**: Per batch using signature `paymentDate-amount-reference`

### Bulk Data Import (`convex/dataImport.ts`)

- `importDrivers` — array of driver objects, upserts by `driverId`
- `importTrucks` — array of truck objects, upserts by `truckFleetNo`
- `importTrailers` — array of trailer objects, upserts by `trailerFleetNoStr`
- **Not wired to UI** — intended for CLI or script-based import

### Bulk Route Creation (`convex/dailyRoutes.ts`)

- `createBulkDailyRoutes` — accepts array of route objects (no UI wire yet)

### General Import Page (`/import`)

- Route exists but content is a placeholder (no implementation)

---

## 13. Expiry & Renewal Tracking

### License Expiry Tracking

- **Drivers**: `licenseExpiryDate` + `pdpExpiryDate` (Professional Driving Permit)
- **Trucks**: `licenseExpiryDate` + `serviceDueDate` + `serviceDueKm`
- **Trailers**: `licenseExpiryDate` + `serviceDueDate` + `serviceDueKm`

### Renewal Workflows

| Table | Lifecycle | Status Values |
|-------|-----------|---------------|
| `truckRenewals` | Initiated → Complete | `initiated`, `complete` |
| `trailerRenewals` | Initiated → Complete | `initiated`, `complete` |
| `truckRenewalLogs` | Audit trail | `action` + `performedBy` + `timestamp` |
| `trailerRenewalLogs` | Audit trail | `action` + `performedBy` + `timestamp` |

### PDP Application Tracking

Full lifecycle: Application → Docs → Card collection → Expiry tracking
- Stages with contingency handling
- Attachment support for documentation
- Automatic expiry reminders via cron jobs

### Scheduled Cron Jobs (`convex/crons.ts`)

| Cron | Schedule | Job |
|------|----------|-----|
| PDP Stage Reminders | Daily at 05:00 UTC | `internal.notifications.checkStageReminders` |
| PDP Expiry Reminders | Monthly on 1st at 05:00 UTC | `internal.notifications.checkExpiryReminders` |

---

## 14. Email & Reporting

### Email Infrastructure

- **Provider**: Resend (via `convex/emails.ts`)
- **Templates**: `convex/templates/TransportReport.ts` (HTML email template)
- **Recipients**: Managed via `convex/recipients.ts`

### QuickSend Report

- Page: `/operations/quicksend`
- Allows filtering by date range and completion status
- Column selection for report output
- Delivered via `sendLoadReportEmail` Convex action

### Email Report Modal

- Component: `EmailReportModal.tsx`
- Select recipients from list
- Custom subject line
- Used for sending periodic route/load reports

---

## 15. Recent Changes (Phase 1)

### Subcontractor Management (In Progress)

The following changes are currently uncommitted:

1. **Schema changes** (`convex/schema.ts`):
   - `subcontractors.name` → `subcontractors.companyName`
   - Added `subcontractorId` and `subStatus` fields to `trucks`, `trailers`, `drivers`, and `dailyRoutes`
   - New `subcontractors` table with `companyName`, `phone`, `email`, `status`, `createdAt`

2. **Backend changes** (`convex/fleet.ts`, `convex/subcontractors.ts`, `convex/dailyRoutes.ts`):
   - Fleet queries (list/get) now support dual filtering: fleet-mode (status) vs sub-mode (subStatus)
   - Subcontractor CRUD with enriched truck/trailer counts
   - Auto-generated route notes for subcontractor routes

3. **Frontend changes** (admin CRUD pages):
   - Added `OwnerBadge` and `StatusBadge` components
   - Subcontractor selection on create/edit forms
   - Sub-status management per asset
   - Card-based grid layout with lucide-react icons

### Previous Commits (in order)

| Stage | Description |
|-------|-------------|
| Stage 1 | Loading skeleton components for all pages |
| Stage 2 | Empty state illustrations with CTAs |
| Stage 3 | Keyboard shortcuts + focus trapping on modals |
| Stage 4 | Responsive collapsible admin sidebar |
| Stage 5 | Replace `window.confirm()` with proper modals |
| Stage 6 | Toast notification system |
| Stage 7 | Pagination on admin tables |
| Stage 8 | SVG icons for theme toggle (replace emoji) |
| Fix | Server-side redirect() causing Next.js 16 performance measure TypeError |
| Phase 1 | Subcontractors — schema + backend + admin CRUD |
