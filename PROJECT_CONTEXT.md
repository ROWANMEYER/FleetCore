# FleetCore — Full Project Context

> **Generated**: 2026-08-08
> **Project**: FleetCore — A production fleet operations management system
> **Status**: Locked baseline (as of 2026-01-23); feature-driven work since
> **Architecture Lock**: See `ARCHITECTURE_LOCK.md` — core decisions are frozen
> **Companion docs**: `UPDATES.md` (changelog + agent entry point), `AGENTS.md` (agent instructions), `docs/THEME_TOKENS.md` (design tokens), `src/pdf/README.md` (PDF rules)

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Tech Stack](#2-tech-stack)
3. [Project Structure](#3-project-structure)
4. [Routing Map](#4-routing-map)
5. [Database Schema](#5-database-schema)
6. [Convex Backend Modules](#6-convex-backend-modules)
7. [Frontend Components](#7-frontend-components)
8. [Auth & Multi-Device Sessions](#8-auth--multi-device-sessions)
9. [Region Scoping](#9-region-scoping)
10. [Core UI Patterns & Conventions](#10-core-ui-patterns--conventions)
11. [CRUD Patterns](#11-crud-patterns)
12. [Architecture Locks & Constraints](#12-architecture-locks--constraints)
13. [Environment & Configuration](#13-environment--configuration)
14. [PWA, Push & Mobile](#14-pwa-push--mobile)
15. [Driver Birthdays](#15-driver-birthdays)
16. [Import / Bulk-Entry Features](#16-import--bulk-entry-features)
17. [Expiry & Renewal Tracking](#17-expiry--renewal-tracking)
18. [Email & Reporting](#18-email--reporting)
19. [Recent Changes](#19-recent-changes)

---

## 1. Project Overview

FleetCore is a production fleet operations system for daily route planning, load management, fleet master data, subcontractors, invoicing, reporting, and operational intelligence. It is built for real operators, real loads, and real consequences.

**Primary use cases:**
- Daily route planning with a multi-load wizard (`/operations/daily-planner/input`)
- Sheets view — collapsed summary rows with chevron expansion (`/operations/daily-planner/sheets`)
- Fleet master data management (trucks, trailers, drivers, subcontractors)
- Multi-region operations — `garden_route` and `eastern_cape`, with server-enforced scoping
- Multi-user auth — admin + regional roles, multi-device sessions
- CEO analytics dashboard (KPIs, revenue, R/KM, drill-down panels)
- Invoice generation (PDF, ZAR) + email reporting (QuickSend via Resend)
- Expiry & renewal tracking (licenses, services, PDP applications)
- Trailer swap management (current combo lives on `trucks.currentTrailerId`)
- Driver birthday alerts (bell, dashboard card, calendar with WhatsApp wishes)
- PWA install + web push notifications for mobile phones

---

## 2. Tech Stack

| Layer | Technology | Details |
|-------|-----------|---------|
| **Framework** | Next.js 16.1.7 | App Router only (no Pages Router), Turbopack |
| **Language** | TypeScript 5 | Strict mode enabled, path alias `@/*` → project root |
| **Frontend** | React 19.2.3 | With React Compiler enabled (`babel-plugin-react-compiler`) |
| **Styling** | Tailwind CSS v4 | `@theme inline` in `src/app/globals.css`; dark mode via `.dark` class on `<html>` |
| **Backend/Database** | Convex ^1.31.7 | Deployment: `dev:quixotic-gopher-969` |
| **State Management** | Convex queries/mutations | No Redux, Zustand, or other client state lib |
| **Auth** | bcryptjs 3 | Custom email+password, session tokens (30-day, multi-device) |
| **PDF** | jsPDF 4 + jspdf-autotable 5 | Absolute positioning only (see `src/pdf/README.md`) |
| **Email** | Resend 6.8 | Via Convex actions |
| **Spreadsheets** | exceljs 4.4, xlsx 0.18 | Import/export |
| **Charts** | recharts 3.7 | Dashboard visualizations |
| **Theme** | next-themes 0.4.6 | Default: dark; system preference disabled |
| **Icons** | lucide-react 1.26, @heroicons/react 2.2 | |
| **Push** | web-push 3.6.7 | PWA web push (VAPID) |
| **Tests** | vitest ^4.1.10 | `npm test` (`vitest run`) |
| **Package Manager** | npm | |

### Key NPM Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `next` | 16.1.7 | Framework |
| `react` / `react-dom` | 19.2.3 | UI |
| `convex` | ^1.31.7 | Backend queries, mutations, actions, schema |
| `tailwindcss` | ^4 | Utility-first CSS |
| `bcryptjs` | ^3.0.3 | Password hashing (users + adminSettings) |
| `jspdf` + `jspdf-autotable` | ^4.0.0 / ^5.0.7 | PDF invoice generation |
| `recharts` | ^3.7.0 | Dashboard charts |
| `resend` | ^6.8.0 | Transactional emails |
| `exceljs` / `xlsx` | ^4.4.0 / ^0.18.5 | Excel import/export |
| `web-push` | ^3.6.7 | PWA push notifications |
| `next-themes` | ^0.4.6 | Dark/light theme toggle |
| `lucide-react` | ^1.26.0 | Icon library |
| `vitest` | ^4.1.10 | Unit tests |

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
│   ├── dailyRoutes.ts               #   📄 Core route CRUD + region scoping
│   ├── users.ts / userSessions.ts   #   📄 Auth: login, user mgmt, sessions, region scope helpers
│   ├── birthdays.ts                 #   Driver birthdays from SA ID (pure helpers, unit-tested)
│   ├── webPush.ts / webPushSubscriptions.ts  # PWA push (VAPID, daily dispatch)
│   ├── dashboard.ts                 #   CEO dashboard analytics queries
│   ├── fleet.ts                     #   Admin CRUD (trucks, drivers, trailers) + list helpers
│   ├── subcontractors.ts            #   Subcontractor CRUD
│   ├── customers.ts                 #   Customer CRUD + search
│   ├── invoices.ts                  #   Invoice record storage (PDF rendered client-side in src/pdf/)
│   ├── emails.ts / emailTemplates.ts / recipients.ts  # Email via Resend
│   ├── trucks.ts / trailers.ts / drivers.ts           # Trailer assignment, expiry queries
│   ├── trailerSwaps.ts              #   Swap history (current combo = trucks.currentTrailerId)
│   ├── truckRenewals.ts / trailerRenewals.ts          # Renewal workflows + audit logs
│   ├── pdp.ts / pdpReport.ts        #   PDP application lifecycle + report
│   ├── dailyAvailability.ts / dailyOps.ts             # Availability CRUD / ops snapshot
│   ├── damageLogs.ts / tasks.ts / attachments.ts      # Damage, tasks, file uploads
│   ├── dataImport.ts / fleetImport.ts                 # Bulk import mutations
│   ├── notifications.ts / crons.ts   #   Scheduled reminders + push dispatch
│   ├── settings.ts / adminSettings.ts / displaySettings.ts  # App/admin/client settings
│   ├── myDay.ts / vehicleLicences.ts / ai.ts          # My Day, licence queries, Ollama AI
│   ├── health.ts / http.ts / migrations.ts / seed.ts  # Ops utilities
│   ├── backfillRegion.ts / backfillStatus.ts / resetFlags.ts / cleanup_*.ts  # Maintenance
│   └── routes.ts                    #   Legacy route queries
│
├── src/
│   ├── app/                         # 📁 Next.js App Router pages
│   │   ├── layout.tsx               #   Root layout (Convex, Theme, Auth, Nav, Toast)
│   │   ├── page.tsx                 #   🔀 Redirects to /dashboard
│   │   ├── globals.css              #   Tailwind v4, design tokens, glass utilities, animations
│   │   ├── login/                   #   Sign-in screen
│   │   ├── dashboard/               #   📄 CEO dashboard (single page + drill-down panels)
│   │   ├── all-regions/             #   📄 Admin cross-region table (Region column, R/KM)
│   │   ├── calendar/                #   📄 Driver birthday calendar (WhatsApp wishes)
│   │   ├── settings/                #   ⚙️ Reminders, theme, push, password, my devices
│   │   ├── operations/
│   │   │   ├── layout.tsx / page.tsx            #   Ops layout; redirects to daily-planner/input
│   │   │   ├── daily-planner/
│   │   │   │   ├── layout.tsx       #     View-mode toggle: Input / Split / Sheets
│   │   │   │   ├── page.tsx         #     🔀 Redirects to /input
│   │   │   │   ├── input/           #     Route creation wizard (+ DailyPlannerInputContent)
│   │   │   │   ├── sheets/          #     Sheets view (+ ImportLoadsModal, spreadsheets)
│   │   │   │   └── edit/[routeId]/  #     Route edit page
│   │   │   ├── combinations/        #   Truck–trailer combo management
│   │   │   ├── fuel/                #   Fuel tracking
│   │   │   ├── quicksend/           #   QuickSend email report
│   │   │   └── swaps/history + swaps/trailers  #   Swap history + current assignments
│   │   ├── admin/
│   │   │   ├── layout.tsx / page.tsx             #   Sub-nav + link grid
│   │   │   ├── trucks/ trailers/ drivers/        #   Master data CRUD
│   │   │   ├── subcontractors/                   #   Subcontractor CRUD
│   │   │   ├── fleet-import/                     #   Fleet bulk import
│   │   │   └── users/                            #   User management (admin-only)
│   │   └── import/                  #   JSON import page (drivers/trucks/trailers)
│   │
│   ├── components/                  # 📁 React components
│   │   ├── auth/                    #   AuthProvider (useAuth, useRegionArg), AppShell (route guard)
│   │   ├── common/                  #   Toast, ConfirmDialog, ModalShell, SlideInPanel, EmptyState,
│   │   │                            #   Pagination, Skeleton, WarningIcon, useKeyboardShortcut
│   │   ├── providers/               #   ConvexClientProvider
│   │   ├── dashboard/               #   BirthdaysCard (all other widgets are inline in the page)
│   │   ├── operations/daily-planner/#   EditRouteForm, MobileSheetsView, SpreadsheetDataTable,
│   │   │                            #   WizardRouteHeader
│   │   ├── operations/invoice/      #   InvoiceDeliveryPanel, invoiceEscape (unit-tested)
│   │   ├── notifications/           #   BirthdayBell
│   │   ├── Navigation.tsx           #   Desktop sidebar + mobile top bar + admin region switcher
│   │   ├── MobileTabBar.tsx         #   Mobile bottom tabs (Dashboard/Input/Swaps/Sheets)
│   │   ├── PwaInstaller.tsx         #   Install banner + SW registration (production)
│   │   ├── PushNotificationSettings.tsx
│   │   ├── SwapsViewToggle.tsx / EmailReportModal.tsx / RouteForm.tsx (legacy)
│   │   ├── ThemeProvider.tsx / BackgroundProvider.tsx / AmbientBackground.tsx
│   │   └── workspace/WorkspaceSplit.tsx
│   │
│   ├── lib/
│   │   ├── exports/                 #   exportCSV, exportExcelWithTemplate, exportJSON, exportPDF
│   │   ├── birthdays.ts             #   ageThisYear, waWishLink helpers
│   │   ├── useBirthdays.ts / useKpiFilter.ts / design-tokens.ts
│   │   └── pdf/                     #   formatters.test.ts, formatters.ts (ZAR), invoiceBuilder, invoiceTemplate, types
│   │
│   ├── pdf/                         # 📁 PDF invoice generation (jsPDF, absolute positioning)
│   │   ├── README.md               #   PDF layout rules
│   │   ├── invoiceBuilder.ts / invoiceTemplate.ts / formatters.ts / types.ts
│   │
│   ├── types/                       #   sheetExport.ts (SheetExportRow)
│   └── hooks/                       #   useIsMobile.ts
│
├── scripts/                         # Build/utility scripts (PowerShell, Python, mjs)
│   ├── updateBackend.ps1 / generateSnapshot.ps1
│   ├── seed-admin.mjs / seed-regional.mjs / seed-test-route.mjs
│   ├── check-region-switcher.mjs / check-regional-region.mjs / check-settings-password.mjs
│   ├── check-users-page.mjs / verify-mobile.mjs / patch-region-args*.py
│   ├── generate-pwa-icons.mjs / fleetcore_report.py / generate_monthly_report.py
│   └── replace-text-colors.mjs
│
├── public/
│   ├── sw.js                        #   PWA service worker (versioned cache `fleetcore-vN`)
│   ├── manifest.webmanifest         #   No forced orientation
│   └── templates/                   #   Excel template assets
│
├── docs/                            #   APP_STRUCTURE.md, THEME_TOKENS.md
├── .github/workflows/               #   mobile-audit.yml
├── AGENTS.md / ARCHITECTURE_LOCK.md / LINT_FREEZE.md / UPDATES.md / CEO_DASHBOARD_GUIDE.md
└── README.md                        # Project overview
```

> **Note**: Earlier documentation described Finance screens (`/admin/payments`,
> `/admin/age-analysis`, `/admin/reconciliation`) and tables (`payments`,
> `paymentAllocations`, `ageSnapshots`, `ageSnapshotRows`, `notifications`).
> These are **not present in the current codebase** — the current admin area is
> trucks, trailers, drivers, subcontractors, fleet-import, and users. Treat
> `convex/schema.ts` as the single source of truth.

---

## 4. Routing Map

### Main Navigation Routes

| Route Pattern | Purpose | Notes |
|---------------|---------|-------|
| `/` | 🔀 Redirects to `/dashboard` | Root |
| `/login` | 🔐 Sign-in (email + password) | Shown when no session |
| `/dashboard` | 📊 CEO analytics dashboard | KPIs, revenue/loads tabs, drill-down panels |
| `/all-regions` | 🌍 Admin cross-region table | Admin-only nav item; Region column, R/KM aggregate |
| `/calendar` | 🎂 Driver birthday calendar | Month grid + WhatsApp wish links |
| `/settings` | ⚙️ Settings | Reminders, theme, push, change password, my devices |
| `/operations` | 🔀 Redirects to `/operations/daily-planner/input` | |
| `/admin` | 📋 Admin dashboard (link grid) | |
| `/import` | 📥 JSON import page (drivers/trucks/trailers) | Functional |

### Operations Sub-Routes

| Route Pattern | Purpose |
|---------------|---------|
| `/operations/daily-planner` | 🔀 Redirects to `/operations/daily-planner/input` |
| `/operations/daily-planner/input` | ✏️ Route creation wizard (canonical route form) |
| `/operations/daily-planner/sheets` | 📄 Sheets view (collapsed summary + expansion) |
| `/operations/daily-planner/edit/[routeId]` | ✏️ Edit specific route |
| `/operations/combinations` | 🔗 Truck–trailer combo management |
| `/operations/fuel` | ⛽ Fuel tracking |
| `/operations/quicksend` | 📧 QuickSend email report (region-scoped) |
| `/operations/swaps/history` | 📜 Trailer swap history |
| `/operations/swaps/trailers` | 🔄 Current trailer assignments |

### Admin Sub-Routes

| Route Pattern | Purpose |
|---------------|---------|
| `/admin/trucks` | 🚛 Truck master data CRUD |
| `/admin/trailers` | 🛞 Trailer master data CRUD |
| `/admin/drivers` | 👤 Driver master data CRUD |
| `/admin/subcontractors` | 🤝 Subcontractor CRUD |
| `/admin/fleet-import` | 📦 Fleet bulk import |
| `/admin/users` | 👥 User management (admin-only, guarded server-side) |

### Legacy Routes (declared by ARCHITECTURE_LOCK)

- `/planner`, `/sheets` — `ARCHITECTURE_LOCK.md` declares these legacy and
  prohibits reintroducing them as canonical routes; **they do not currently
  exist as route files in `src/app`** (the canonical system is
  `/operations/daily-planner/*`).

### Mobile (PWA) Route Restriction

On phones (`<768px`) the app is limited to: Dashboard, Input, Edit, Sheets,
Swaps history, Swaps trailers, and Calendar. Every other route redirects to
Dashboard. Enforced in `src/components/auth/AppShell.tsx` via
`MOBILE_ALLOWED_PATHS`.

---

## 5. Database Schema

Defined in `convex/schema.ts` using Convex runtime validators. Below is every
table currently defined and its key fields.

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
  region?: "garden_route" | "eastern_cape",   // Region scoping (Stage 3+)
  rate: number,                    // Route-level rate (fallback revenue when no loads)

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
    quantityType: string,          // "ton" | "pallet" | "load"
    rate: string,
    rateType: string,              // "flat" | "per_qty" | "full"
    loadId?: string,
    kilometers?: number,
    subcontractorRate?: string,
    subcontractorRateType?: string,
  }[],

  // Physical journey segments
  legs?: { from: string, to: string, kilometers: number, order: number }[],
}
```
Indexes: `by_routeDate`, `by_routeDate_truckFleetNoStr`

#### `trucks`
```typescript
{
  truckFleetNo?: string,           // Canonical fleet number
  registration?: string,
  make?: string, model?: string,
  status?: string,                 // "active" | "inactive"
  subStatus?: string,              // Subcontractor mode status
  subcontractorId?: Id<"subcontractors">,
  currentTrailerId?: Id<"trailers">, // CURRENTLY ASSIGNED trailer (source of truth)
  currentKm?: number,
  fleetNumber?: string,            // Legacy
  licenseExpiryDate?: string,
  serviceDueDate?: string, serviceDueKm?: number,
  lastRenewalDate?: string, renewalNotes?: string, receiptPhotoUrl?: string,
  createdAt?: number,
}
```
Indexes: `by_currentTrailerId`, `by_truckFleetNo`

#### `trailers`
```typescript
{
  trailerFleetNo: number,
  trailerFleetNoStr: string,       // Canonical for joins
  type: string,                    // e.g. "interlink", "flatbed"
  status?: string, subStatus?: string,
  subcontractorId?: Id<"subcontractors">,
  trailers: { length: string, registration: string }[], // ⚠ physical units under this fleet number
  currentKm?: number,
  licenseExpiryDate?: string, serviceDueDate?: string, serviceDueKm?: number,
  lastRenewalDate?: string, renewalNotes?: string, receiptPhotoUrl?: string,
}
```
Index: `by_trailerFleetNoStr`

> **⚠️ Schema Quirk**: One `trailers` document has a `trailers` array (confusing
> naming) representing physical units under a fleet number.

#### `drivers`
```typescript
{
  driverId?: string,               // Business key (e.g. employee number)
  driverName?: string, name?: string,
  idNumber?: string,               // SA ID — used to derive birthdays
  phone?: string,
  status?: string, subStatus?: string,
  subcontractorId?: Id<"subcontractors">,
  licenseExpiryDate?: string,
  pdpExpiryDate?: string,          // Professional Driving Permit expiry
  photoStorageId?: string, photoUrl?: string,
  createdAt?: number,
}
```
Index: `by_driverId`

### Auth & Sessions Tables

#### `users`
```typescript
{
  email: string,                   // Lowercased
  passwordHash: string,            // bcrypt
  role: "admin" | "regional",
  region?: "garden_route" | "eastern_cape",  // Required for regional users
  sessionToken?: string,           // Legacy single-token (superseded by sessions table)
  sessionExpiresAt?: number,
}
```
Indexes: `by_email`, `by_sessionToken`

#### `sessions` (multi-device)
```typescript
{
  userId: Id<"users">,
  token: string,                   // Random UUID stored client-side
  expiresAt: number,               // 30 days from login
  device?: string,                 // "Desktop" | "Mobile" | "Browser"
  userAgent?: string,              // Raw UA for the "my devices" list
  createdAt: number,
}
```
Indexes: `by_token`, `by_userId`. Max 5 live sessions per user (oldest pruned).

#### `webPushSubscriptions`
```typescript
{
  endpoint: string,
  keys: { p256dh: string, auth: string },
  userAgent?: string,
  lastSeenAt: number,
}
```
Index: `by_endpoint`

#### `dismissedBirthdayAlerts`
```typescript
{
  userId: Id<"users">,
  driverId: Id<"drivers">,
  birthdayDate: string,            // This year's occurrence, e.g. "2026-08-04"
}
```
Index: `by_userId_driverId`. One row hides this year's birthday for that user only.

### Financial Tables

#### `invoices`
```typescript
{
  invoiceNumber: string,
  routeId: Id<"dailyRoutes">,
  snapshot: any,                   // Route snapshot at time of invoice
  totals: { subtotal: number, totalAmount: number, vatAmount: number },
  createdAt: number,
}
```
Indexes: `by_invoiceNumber`, `by_routeId`. `invoiceCounter` holds the number sequence.

### Master Data & Settings

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `customers` | Customer master data | `name`, `normalizedName`, `accountNumber`, `isActive`, `vatNumber` |
| `subcontractors` | Subcontractor CRUD | `companyName`, `phone`, `email`, `status` |
| `adminSettings` | Legacy admin PIN gate | `mode`, `passwordHash` (superseded by `users` auth) |
| `appSettings` | App settings | `expiryReminder30/60/90`, `stage1/2/3AlertDays`, `pushToken` |
| `clientDisplaySettings` | Per-client display prefs | `clientId`, `compactMode`, `reduceMotion`, `theme`, `zoomLevel` |
| `recipients` | Email recipients | `name`, `email` |

### Availability & Scheduling

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `dailyAvailability` | Daily truck/driver/trailer availability | `date`, `dayKey`, `status`, `trucks[]`, `trailers[]`, `drivers[]` |
| `myDaySelections` | My Day item tracking | `itemId`, `itemType`, `label`, `selectedDate`, `completed` |

### Operations & Compliance

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `attachments` | File attachments (storage IDs) | `fileName`, `fileUrl`, `storageId`, `refId`, `taskId` |
| `damageLogs` | Asset damage tracking | `assetType`, `assetUnit`, `date`, `status`, `photoUrls[]` |
| `tasks` | Task management | `title`, `dueDate`, `priority`, `completed`, `relatedTo` |
| `taskResolutions` | Task resolution tracking | `refId`, `resolvedAt`, `resolvedBy` |
| `taskSnoozes` | Task snooze tracking | `refId`, `snoozeUntil` |
| `trailerSwaps` | Swap history (events only) | `truckId`, `oldTrailerId`, `newTrailerId`, `reason`, `swapDate`, `swapType` |
| `fleetSetupBaseline` | Initial truck–trailer assignments | `assignments[]`, `locked`, `setupDate` |
| `fleetSetupStatus` | Setup completion flag | `complete` |

### Renewals & PDP

| Table | Purpose | Lifecycle |
|-------|---------|-----------|
| `truckRenewals` / `truckRenewalLogs` | Truck license renewal + audit | `initiated` → `complete` |
| `trailerRenewals` / `trailerRenewalLogs` | Trailer license renewal + audit | `initiated` → `complete` |
| `pdpApplications` | PDP application lifecycle | stages, docs, card, expiry, contingencies |
| `pdpApplicationLogs` | PDP application audit log | `action`, `performedBy`, `timestamp` |

### Entity Relationships

```
trucks.currentTrailerId ──────► trailers._id         (current assignment)
dailyRoutes.truckFleetNoStr ──► trucks.truckFleetNo   (string reference)
dailyRoutes.trailerFleetNoStr─► trailers.trailerFleetNoStr
dailyRoutes.subcontractorId ──► subcontractors._id
dailyRoutes.region            ─ (not FK — string enum)
invoices.routeId ──────────────► dailyRoutes._id
sessions.userId ───────────────► users._id
dismissedBirthdayAlerts.userId ► users._id / driverId ► drivers._id
drivers.subcontractorId ───────► subcontractors._id
trucks.subcontractorId ────────► subcontractors._id
trailers.subcontractorId ──────► subcontractors._id
```

> **Removed vs. documented**: The previous revision of this doc listed
> `payments`, `paymentAllocations`, `ageSnapshots`, `ageSnapshotRows`, and
> `notifications` tables. They are **not in the current schema** — do not write
> code against them.

---

## 6. Convex Backend Modules

### Auth & Sessions

| Module | Key Exports | Purpose |
|--------|-------------|---------|
| `users.ts` | `login` (action), `listUsers`, `createUser`, `updateUser`, `deleteUser`, `seedAdmin`, `changePassword`, `countAdminsInternal` | Login, admin-only user management, password changes. All guarded by live-session checks. |
| `userSessions.ts` | `getSessionUser`, `getUserBySessionToken`, `setSessionToken`, `logout`, `listMySessions`, `logoutSession`, `resolveUserScope`, `scopedRegion`, `resolveEffectiveRegion` | Session lifecycle (30-day, max 5/user) + shared region-scope resolution used by route queries. |

### Core Modules

| Module | Key Exports | Purpose |
|--------|-------------|---------|
| `dailyRoutes.ts` | `createDailyRoute`, `updateDailyRoute`, `deleteDailyRoute`, `getRoutesByDate`, `getForSheets`, `getById`, `getRoutesByTruckAndDate`, `markRouteCompleted`, `lockRoute`, `unlockRoute`, `getLoadsForEmailReport`, `getQuickSendReport`, `createBulkDailyRoutes` | Core route CRUD with auto-complete logic, KM calculation, **region scoping** via `resolveEffectiveRegion`. |
| `dashboard.ts` | `getExecutiveSummary`, `getCustomerAnalytics`, `getFleetPerformance`, `getOperationalEfficiency`, `getMonthToMonthComparison`, `getDashboardLoadsSummary`, `getRevenueOverTime`, `getRevenueByTruck`, `getRoutesByStatus` | CEO-level analytics queries. |
| `fleet.ts` | `listTrucks`, `listTrailers`, `listDrivers`, `getTrucks`, `getTrailers`, `getDrivers`, `createTruck/Trailer/Driver`, `updateTruck/Trailer/Driver`, `deleteTruck/Trailer/Driver`, `setDriverPhoto`, `uploadDriverPhoto` | Admin CRUD + list helpers with subcontractor filtering. |
| `subcontractors.ts` | `list`, `getAll`, `getStats`, `create`, `update`, `updateStatus`, `remove` | Subcontractor CRUD. |
| `customers.ts` | `search`, `list`, `createCustomer`, `updateCustomer`, `deactivateCustomer`, `deleteCustomer`, `deleteBulkCustomers` | Customer CRUD with duplicate detection. |

### Birthdays & Notifications

| Module | Key Exports | Purpose |
|--------|-------------|---------|
| `birthdays.ts` | `upcomingBirthdays`, `getBirthdaysForMonth`, `getDismissedBirthdays`, `dismissBirthday`, `restoreBirthday`, `restoreAllBirthdays`; helpers `getBirthdayFromSAID`, `daysUntilBirthday`, `occurrenceDate` | Driver birthdays derived from SA ID numbers. Pure helpers are unit-tested (`birthdays.test.ts`). |
| `notifications.ts` | `checkStageReminders`, `checkExpiryReminders` | PDP stage + expiry reminder logic (cron-driven). |
| `crons.ts` | 3 cron jobs | `pdp-stage-reminders` (daily 05:00 UTC), `pdp-expiry-reminders` (monthly 1st 05:00 UTC), `web-push-daily-dispatch` (daily 06:00 UTC). |

### PWA / Push

| Module | Key Exports | Purpose |
|--------|-------------|---------|
| `webPush.ts` | `sendTest` (action), `sendDailyDispatch` (internalAction) | Sends push via `web-push` (Node runtime). Prunes dead subscriptions (404/410). Requires VAPID env keys. |
| `webPushSubscriptions.ts` | `listSubscriptions`, `deleteSubscription`, + subscribe/unsubscribe | Subscription registry. |

### Specialty Modules

| Module | Key Exports | Purpose |
|--------|-------------|---------|
| `invoices.ts` | Invoice record storage (`getOrCreate`, `regenerate`, `debugAllInvoices`) — numbering via `invoiceCounter` + enriched data storage. **PDF rendering is client-side** in `src/pdf/` (`generateInvoicePDF`). |
| `emails.ts` / `emailTemplates.ts` / `recipients.ts` | `sendLoadReportEmail` | Send reports via Resend with HTML templates. |
| `pdp.ts` / `pdpReport.ts` | PDP lifecycle | Full PDP tracking with stages, docs, expiry, report. |
| `trailerSwaps.ts` | Swap history CRUD | Record/query swap events. Current combo lives on `trucks.currentTrailerId`. |
| `trucks.ts` / `trailers.ts` / `drivers.ts` | Trailer assignment, trailer queries, expiry queries | Fleet operations helpers. |
| `truckRenewals.ts` / `trailerRenewals.ts` | Renewal lifecycle + logs | License renewal workflows. |
| `dailyAvailability.ts` / `dailyOps.ts` | Availability CRUD / ops snapshot | Daily issues: expiring licenses, services due. |
| `damageLogs.ts` / `tasks.ts` / `attachments.ts` | Damage, tasks, files | Asset damage, task mgmt, uploads. |
| `dataImport.ts` / `fleetImport.ts` | Bulk import | `importDrivers`, `importTrucks`, `importTrailers` (upsert by business key). |
| `settings.ts` / `adminSettings.ts` / `displaySettings.ts` | Settings | App config, legacy PIN, per-client display prefs. |
| `myDay.ts` / `vehicleLicences.ts` | My Day / licences | Item tracking, licence queries. |
| `ai.ts` | Ollama AI | AI-generated insights (Strategic Insights). |
| `health.ts` / `http.ts` | Health / HTTP actions | Ops endpoints. |
| `migrations.ts` / `seed.ts` / `backfillRegion.ts` / `backfillStatus.ts` / `resetFlags.ts` / `cleanup_*.ts` | Maintenance | Data migrations, region backfill, status backfill, cleanups. |
| `routes.ts` | Legacy route queries | Kept for legacy `/planner`/`/sheets` support. |

### Shared Helpers

- `convex/utils.ts` → `calculateLoadAmount(quantity, rate, rateType)`:
  `flat`/`full` → rate, otherwise `quantity × rate`. Used everywhere revenue is
  computed (sheets, mobile cards, all-regions, dashboard).
- `convex/userSessions.ts` → `resolveUserScope`, `scopedRegion`,
  `resolveEffectiveRegion` — region enforcement for route reads.

---

## 7. Frontend Components

### Common/Shared Components (`src/components/common/`)

| Component | Props | Purpose |
|-----------|-------|---------|
| `Toast.tsx` / `ToastProvider` | Context-based | Toast notifications (success/error/info), auto-dismiss 4s |
| `ConfirmDialog.tsx` | `open`, `title`, `message`, `confirmLabel`, `variant`, `loading`, `onConfirm`, `onCancel` | Accessible confirmation modal |
| `ModalShell.tsx` | `open`, `onClose`, `children` | Accessible modal (focus trap, Escape, Tab cycling) |
| `SlideInPanel.tsx` | `open`, `onClose`, `children` | Right-side slide-in panel variant |
| `EmptyState.tsx` | `icon`, `title`, `description`, `action` | Empty-state illustrations |
| `Pagination.tsx` | `currentPage`, `totalPages`, `onPageChange` | Page navigation with ellipsis |
| `Skeleton.tsx` | Various | Loading placeholders (Line, Card, Table, Page, KpiGrid) |
| `WarningIcon.tsx` | `type`, `tooltip` | Tooltip warning/info icon |
| `useKeyboardShortcut.ts` | `key`, `handler`, `enabled`, `ctrl` | Keyboard shortcuts + `useEscapeToClose` |

### Auth & Shell

| Component | Purpose |
|-----------|---------|
| `auth/AuthProvider.tsx` | Session restore from `localStorage` (`fleetcore-session-token`), `login`/`logout`, `useAuth()`, `useRegionArg()` helper, admin `regionFilter` override |
| `auth/AppShell.tsx` | Route guard (redirect to `/login` when logged out), mobile path restriction (`MOBILE_ALLOWED_PATHS`) |

### Navigation & Layout

| Component | Purpose |
|-----------|---------|
| `Navigation.tsx` | Desktop sidebar (collapsible), mobile top bar, **admin region switcher**, birthday bell, theme toggle, user block + logout |
| `MobileTabBar.tsx` | Mobile bottom tabs — Dashboard, Input, Swaps, Sheets |
| `ThemeProvider.tsx` | next-themes wrapper (default dark, no system) |
| `ConvexClientProvider.tsx` | Convex React client initialization |
| `BackgroundProvider.tsx` / `AmbientBackground.tsx` | Background blobs |
| `PwaInstaller.tsx` | Install banner + SW registration (production only) |
| `PushNotificationSettings.tsx` | Push subscription + test button |

### Dashboard

| Component | Purpose |
|-----------|---------|
| `src/app/dashboard/page.tsx` | Main dashboard: KPI grid, revenue/loads tabs, drill-down panels, collapsible mobile sections |
| `dashboard/BirthdaysCard.tsx` | Dismissible upcoming-birthdays card (per user/year) |
| `notifications/BirthdayBell.tsx` | Bell showing upcoming birthdays + dismiss actions |

> The dashboard renders all widgets inline in `src/app/dashboard/page.tsx`
> (`KpiCard`, `DrillDownPanel`, `CollapsibleSection`, `ProgressBar`, filters).
> The former `dashboard/DashboardCard.tsx`, `dashboard/ceo/TrendIcon.tsx`, and
> `dashboard/operations/*` component files were removed as dead code
> (2026-08-08) — nothing imported them.

### Operations Components

| Component | Purpose |
|-----------|---------|
| `operations/daily-planner/SpreadsheetDataTable.tsx` | Desktop sheets table — resizable/sortable columns with persisted layout (localStorage), includes **R / KM** column, column-visibility menu, layout profiles |
| `operations/daily-planner/MobileSheetsView.tsx` | Mobile sheets: day-grouped cards, search + filters, date nav, tappable route detail/edit, R/KM badge |
| `operations/daily-planner/EditRouteForm.tsx` | Route editing form (slide-in panel) |
| `operations/daily-planner/WizardRouteHeader.tsx` | Step indicator for route creation wizard |
| `operations/invoice/InvoiceDeliveryPanel.tsx` | Invoice email delivery panel |
| `operations/invoice/invoiceEscape.ts` | Invoice string-escape helper (unit-tested) |
| `operations/SwapsViewToggle.tsx` | History/Trailers toggle for swaps screens |
| `EmailReportModal.tsx` | Email report dialog (recipients + subject) |
| `RouteForm.tsx` | Legacy route form (⚠ legacy) |
| `workspace/WorkspaceSplit.tsx` | Resizable split-pane (used in daily planner) |

### Hooks & Lib

- `hooks/useIsMobile.ts` — `md:` breakpoint detection (767px)
- `lib/useBirthdays.ts`, `lib/birthdays.ts` (`ageThisYear`, `waWishLink`),
  `lib/useKpiFilter.ts`, `lib/design-tokens.ts`
- `lib/exports/` — `exportCSV`, `exportExcelWithTemplate`, `exportJSON`,
  `exportPDF`, `utils.ts` (`downloadFile`)
- `lib/pdf/` — `formatters.ts` (ZAR currency, dates — unit-tested), invoice builder/template/types

---

## 8. Auth & Multi-Device Sessions

The app moved from a single PIN gate to **full user accounts with region scoping**.

### Login Flow

1. `AuthProvider` generates a token (`crypto.randomUUID()`) and calls the
   `users.login` **action** with email, password, token, device label, and UA.
2. The action verifies bcrypt and registers a `sessions` row via
   `userSessions.setSessionToken` (each login appends — other devices stay signed in).
3. The token is stored in `localStorage` (`fleetcore-session-token`).
4. `userSessions.getSessionUser` restores the user on reload (skipped with
   `"skip"` when no token).

### Roles

- **`admin`** — sees all regions, can override via the sidebar region switcher
  (client-side filter; server still enforces on regional accounts only).
- **`regional`** — hard-locked to their own region server-side; never trusted
  from the client. New routes default to the regional user's region.

### Session Rules

- 30-day expiry (`SESSION_MS`), max **5 live sessions per user** (oldest pruned).
- Logout is per-device (`sessions.logout` deletes only that token's session).
- Settings shows "My devices" (`listMySessions`) with remote sign-out
  (`logoutSession`, ownership-checked).
- Admin Users page (`/admin/users`) lists users + live-session count.

### Guards (enforced server-side AND in UI)

- Cannot demote or delete the **last admin** (`countAdminsInternal`).
- Cannot delete or change your own role.
- Own password changes must go through Settings (`users.changePassword` —
  verifies current password first).
- All user-management mutations require a live **admin** session
  (`requireAdmin`).

---

## 9. Region Scoping

Two regions exist: `garden_route` and `eastern_cape`.

- **Storage**: `dailyRoutes.region` (optional enum). New routes are stamped with
  the effective region at creation.
- **Server enforcement**: route reads call `resolveUserScope(ctx, token)` then
  `resolveEffectiveRegion(ctx, token, override)`:
  - regional user → their own region, always
  - admin → the requested override (or `null` = all)
  - no/invalid token → `null` (system-level, sees all)
- **Client**: `useRegionArg()` derives the query arg from auth state (admin
  filter only); `Navigation.tsx` renders the `RegionSwitcher` for admins.
- **Coverage**: dailyRoutes queries, route creation, load imports (region-aware,
  "All Regions" blocked for regional users), QuickSend email reports, and the
  `/all-regions` admin page (Region column + summary).

---

## 10. Core UI Patterns & Conventions

### Design Tokens (from `src/app/globals.css`)

All tokens are CSS custom properties with `.dark` handled automatically by the
`.dark` class (injected by next-themes). **Never use `text-gray-*`, `bg-white`,
`dark:bg-*` etc.** — see `docs/THEME_TOKENS.md` for the full reference.

| Token | Light | Dark | Usage |
|-------|-------|------|-------|
| `--background` | `#F0F4F8` | `#0B1220` | Page body |
| `--foreground` | `#0F172A` | `#E2E8F0` | Primary text |
| `--card-bg` | white 75% | slate 65% | Card/panel surfaces |
| `--card-border` | black 6% | white 8% | Borders, dividers |
| `--nav-text-color` | `#475569` | `#94A3B8` | Secondary text, labels, placeholders |

### Glass Utility Classes

| Class | Purpose |
|-------|---------|
| `.glass-card` | Standard glass panel (blur + border + shadow) |
| `.glass-card-premium` | Premium panel (rounded + hover lift) |
| `.glass-sidebar` | Sidebar glass (sidebar vars) |
| `.nav-item-active` | Active nav pill (teal gradient + glow) |
| `.settings-input` | Settings form input (glass + teal focus) |
| `.skeleton-shimmer` | Loading shimmer |
| `.gradient-text` / `.noise-overlay` | Teal gradient text / fixed noise texture |

### Teal Accent Patterns

```tsx
// Primary buttons & active toggles
className="bg-gradient-to-br from-[#06B6D4] to-[#0891B2] text-white hover:opacity-90 shadow-sm"
// Focus rings
focus:ring-[#06B6D4] focus:border-[#06B6D4]
```

### Semantic Colors (do NOT replace with CSS vars)

Status badges and alerts keep hardcoded semantic colors:
`bg-green-100 text-green-800`, `bg-blue-100 text-blue-800`, `bg-red-100 text-red-800`,
`bg-yellow-100 text-yellow-800`, plus the alert/import/chart palettes in
`docs/THEME_TOKENS.md` §7.

### Mobile Conventions

- Breakpoint: `md:` = 767px; `useIsMobile` hook mirrors it.
- Phones use the bottom `MobileTabBar` + top bar; desktop uses the sidebar.
- Touch targets ≥ 44px; modals/panels on phones use **solid**
  `bg-[var(--background)]` (not translucent).
- Only `MOBILE_ALLOWED_PATHS` are reachable on phones.

### Naming Conventions

| Category | Convention | Examples |
|----------|-----------|----------|
| Files | `camelCase.ts` | `dailyRoutes.ts`, `exportCSV.ts` |
| Components | `PascalCase.tsx` | `RouteForm.tsx`, `WizardRouteHeader.tsx` |
| Directories | `kebab-case/` | `daily-planner/`, `fleet-import/` |
| Convex functions | `camelCase` | `createDailyRoute`, `getRoutesByDate` |

---

## 11. CRUD Patterns

### Admin CRUD (Trucks, Trailers, Drivers)

All three admin CRUD pages follow the same pattern:

1. **Card-based grid** — `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4`
2. **Inline editing** — Edit transforms the card into edit mode (blue border)
3. **Sortable columns** + **debounced search**
4. **`includeInactive` checkbox** — toggle inactive records
5. **KPI cards** — Total / Active / Inactive counts
6. **Status badges** — green = Active, gray = Inactive
7. **OwnerBadge** — Fleet (gray) vs Subcontractor (purple) ownership
8. **Action buttons** — hover-revealed Edit (Pencil), Power/PowerOff, Delete (Trash2)
9. **ConfirmDialog** for deletes, **Toast** for feedback, **Pagination** (20/page)

### Route Creation Flow

1. Multi-step wizard in `daily-planner/input/` — header + load sections
2. Session draft recovery (`sessionStorage`, 10-min TTL)
3. Subcontractor support — optional ID + auto-generated notes
4. Auto-complete logic — if all loads have client/from/to and amount > 0,
   status = `completed`
5. KM calculation priority: Route KM > Leg sum > Max Load KM > Input field
6. Input uppercasing for client names; **region defaults to the user's region**

### Route Status Flow

```
planned → completed → locked
              ↑            │
              └── unlock ──┘
```
- **Locked** routes cannot be edited or deleted.
- **Delete** only allowed for planned/completed routes.

### Revenue / R-KM

- Route revenue = sum of `calculateLoadAmount` over loads, **or** the
  route-level `rate` when a route has no loads (matching desktop sheets, mobile
  cards, and all-regions).
- R/KM = route revenue ÷ `kilometers` (0 when KM or revenue missing).

### Delete Safety Checks

- Truck/Driver delete checks `dailyRoutes` references; Trailer delete checks by
  string AND numeric fleet number; Customer delete checks by client name.
- All blocked (with deactivation guidance) when referenced.

---

## 12. Architecture Locks & Constraints

### 🔐 Locked UI Contracts (per `ARCHITECTURE_LOCK.md`)

- **Sheets table**: collapsed summary rows + chevron expansion
- **Status + Risk**: computed (pure functions, no hooks/mutations/side effects)
- **Status priority**: Incomplete > Missing KM > Multi-drop > Multi-pick > Finalized > Clean
- **Backend queries**: separated by consumer intent (UI, reporting, email, QuickSend)
- **Suspense**: localized only, `fallback={null}` unless required
- **Legacy routes** (`/planner`, `/sheets`): declared in `ARCHITECTURE_LOCK` — not present as route files; do not reintroduce them as canonical routes

### 🚫 Prohibited Without Phase 3+

Removing legacy routes, consolidating routing systems, merging backend queries,
replacing table architecture, introducing global state systems, major component
splitting.

### Lint Freeze (per `LINT_FREEZE.md`)

- Legacy Convex/Planner files have `no-explicit-any` disabled per-file
- **New code must be strict and lint-free**
- `npm run lint` (ESLint only — no typecheck script)

### PDF Constraints (per `src/pdf/README.md`)

- **Absolute positioning only**, fixed Y-coordinates in points (pt)
- Fixed zones: Header (top), Bill To (Y=140), Description (Y=220, max 2 lines),
  Totals (Y=290), Banking (Y=360)
- **Never use mm/px** or flow-based layouts
- Currency: ZAR (`R 1 234,56`) via `formatters.ts`, never `toLocaleString()`

### Trailer Swaps — Source of Truth

- Current combo stored in `trucks.currentTrailerId` (not `trailerSwaps`)
- `trailerSwaps` stores historical events only
- See `convex/__analysis__/trailerSwapAnalysis.md`

### Region Scoping — Server Is the Source of Truth

- Regional users can never widen their scope from the client
- New routes must be stamped with the effective region

---

## 13. Environment & Configuration

### Commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | Next.js dev server |
| `npm run build` | Production build |
| `npm run lint` | ESLint only (no typecheck script) |
| `npm test` | Vitest unit tests |
| `npm run update-backend` | `npx convex codegen` + `generateSnapshot.ps1` (PowerShell) |
| `npx convex push` | Push Convex functions to deployment |
| `npx convex codegen` | Regenerate `convex/_generated/` types |

### Environment Variables

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_CONVEX_URL` | Convex deployment URL |
| `RESEND_API_KEY` | Resend API key for email sending |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | Web push keys (set via `npx convex env set ...`) |
| Admin seed password | Scrubbed to an env var — see `scripts/seed-admin.mjs` |

Stored in `.env.local` (not committed). Convex deployment: `dev:quixotic-gopher-969`.

### Configuration Files

| File | Purpose |
|------|---------|
| `next.config.ts` | React Compiler enabled, Turbopack |
| `tsconfig.json` | Strict mode, `@/*` → `./*` |
| `postcss.config.mjs` | Tailwind v4 PostCSS setup |
| `convex/tsconfig.json` | Convex function TS config |
| `.github/workflows/mobile-audit.yml` | CI audit workflow |

### Unit Tests

- `convex/birthdays.test.ts` — SA-ID birthday derivation, day math
- `convex/utils.test.ts` — `calculateLoadAmount`
- `src/components/operations/invoice/invoiceEscape.test.ts` — invoice escaping
- `src/lib/pdf/formatters.test.ts` — ZAR currency/date formatting

---

## 14. PWA, Push & Mobile

### Service Worker (`public/sw.js`)

- Versioned cache name `fleetcore-vN` (currently **v33**) — bump on every deploy
  that changes bundles.
- Stale-while-revalidate for hashed assets; Convex/cross-origin never cached.
- On SW update, open app windows are force-reloaded so new bundles appear immediately.
- Registered only in production (`PwaInstaller`).

### Manifest & Install

- `public/manifest.webmanifest` — **no orientation member** (respects auto-rotate).
- `PwaInstaller` shows the install banner (`beforeinstallprompt`) or iOS
  instructions (Share → Add to Home Screen); dismissible via localStorage.

### Web Push

- `webPushSubscriptions` table stores per-device subscriptions (VAPID).
- `webPush.sendTest` — test notification (Settings → Send test).
- `webPush.sendDailyDispatch` — daily "Today's Dispatch" push (cron 06:00 UTC)
  summarizing that day's planned routes.

### Mobile UI

- Bottom tab bar (Dashboard / Input / Swaps / Sheets) + top bar on phones.
- Compact mobile components: `MobileSheetsView`, dashboard collapsible sections,
  h-11 inputs, 44px touch targets, solid panel backgrounds.

---

## 15. Driver Birthdays

- **Derivation**: `getBirthdayFromSAID(idNumber)` — first 6 SA-ID digits are
  YYMMDD; century rule (≤ currentYY−16 → 20xx, else 19xx); rejects impossible
  dates. Pure and unit-tested.
- **Queries**: `upcomingBirthdays` (window, default 7 days, active drivers
  only), `getBirthdaysForMonth` (calendar grid), `getDismissedBirthdays`.
- **UI**:
  - `BirthdayBell` in the sidebar/mobile top bar (upcoming within window)
  - `BirthdaysCard` on the dashboard (dismissible per user per year, restorable)
  - `/calendar` — month grid with WhatsApp wish links (`waWishLink`) + age
  - Driver ages shown in bell/calendar/dashboard
- **Spec**: `fleetcore-driver-birthdays-spec.md`

---

## 16. Import / Bulk-Entry Features

### Fleet Import (`/admin/fleet-import`)

- Excel template-driven import (`public/templates/fleetcore-sheets-template-extended.xlsx`).

### Bulk Data Import (`convex/dataImport.ts`)

- `importDrivers` — upserts by `driverId`
- `importTrucks` — upserts by `truckFleetNo`
- `importTrailers` — upserts by `trailerFleetNoStr`
- Intended for CLI/script-based import.

### Bulk Route Creation (`convex/dailyRoutes.ts`)

- `createBulkDailyRoutes` — accepts an array of route objects.

### Load Import (`sheets/ImportLoadsModal.tsx`)

- Modal in the sheets screen for importing loads; **region-aware** (regional
  users blocked from "All Regions"; Region column).

### Legacy `/planner`, `/sheets` routes

Declared in `ARCHITECTURE_LOCK.md` but **not present as route files** in the
current codebase — do not recreate them; keep the canonical
`/operations/daily-planner/*` system.

### JSON Import Page (`/import`)

- Functional JSON import: tabs for drivers / trucks / trailers, paste or upload
  a JSON array, wired to `dataImport.importDrivers/importTrucks/importTrailers`
  (upsert by business key), with built-in example payloads.

---

## 17. Expiry & Renewal Tracking

### License Expiry Tracking

- **Drivers**: `licenseExpiryDate` + `pdpExpiryDate`
- **Trucks**: `licenseExpiryDate` + `serviceDueDate` + `serviceDueKm`
- **Trailers**: `licenseExpiryDate` + `serviceDueDate` + `serviceDueKm`

### Renewal Workflows

| Table | Lifecycle | Status Values |
|-------|-----------|---------------|
| `truckRenewals` | Initiated → Complete | `initiated`, `complete` |
| `trailerRenewals` | Initiated → Complete | `initiated`, `complete` |
| `truckRenewalLogs` / `trailerRenewalLogs` | Audit trail | `action` + `performedBy` + `timestamp` |

### PDP Application Tracking

Full lifecycle: Application → Docs → Card collection → Expiry tracking, with
contingency handling, attachments, and automatic reminders.

### Scheduled Cron Jobs (`convex/crons.ts`)

| Cron | Schedule | Job |
|------|----------|-----|
| PDP Stage Reminders | Daily 05:00 UTC | `internal.notifications.checkStageReminders` |
| PDP Expiry Reminders | Monthly 1st 05:00 UTC | `internal.notifications.checkExpiryReminders` |
| Web Push Daily Dispatch | Daily 06:00 UTC | `internal.webPush.sendDailyDispatch` |

---

## 18. Email & Reporting

### Email Infrastructure

- **Provider**: Resend (via `convex/emails.ts`)
- **Templates**: `convex/templates/TransportReport.ts` (HTML email template)
- **Recipients**: managed via `convex/recipients.ts`

### QuickSend Report

- Page: `/operations/quicksend`
- Filters by date range (with empty/inverted-range guards) and completion status
- Column selection; **region-scoped** for regional users
- Delivered via `sendLoadReportEmail` Convex action

### Email Report Modal

- Component: `EmailReportModal.tsx` — select recipients, custom subject
- Used for periodic route/load reports

---

## 19. Recent Changes

See `UPDATES.md` for the full changelog. Summary of the major phases since the
2026-01-23 baseline:

| Phase | Description |
|-------|-------------|
| **Stages 1–2** | Skeleton components + empty states across all pages |
| **Stages 3–5** | Multi-user auth + region scoping: `users`/`sessions` tables, login, admin user management, admin region switcher, `/all-regions` page, server-enforced regional locks, region-aware imports/email |
| **Auth hardening** | Multi-device sessions (max 5, per-device logout), change-password, last-admin guards, session-expiry enforcement, seed password rotation |
| **Birthdays** | SA-ID birthday derivation, bell + dashboard card + `/calendar` with WhatsApp wishes, ages, per-user/year dismissals |
| **PWA** | Versioned SW cache, force-reload on update, no forced orientation, web push (VAPID) + daily dispatch, install banner |
| **Mobile** | 4-screen phone app (Dashboard/Input/Swaps/Sheets + Calendar), bottom tab bar, mobile sheets redesign (day-grouped cards, search/filters/date nav, tappable detail), compact route cards, dashboard collapsible sections |
| **Sheets/planner** | R/KM column (desktop + mobile badge + all-regions aggregate), route-level-rate revenue fallback, invoice "Generating…" state, resizer pointer-event fix, solid modal backgrounds, new-column onboarding hint |
