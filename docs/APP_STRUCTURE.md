# FleetCore Application Structure

> **Refreshed**: 2026-08-08 — matches the current codebase.
> Full architecture reference: `PROJECT_CONTEXT.md` · Changelog: `UPDATES.md`.

## 1. Tech Stack

- **Framework**: Next.js 16.1.7 (App Router only, no Pages Router), Turbopack
- **Language**: TypeScript (strict mode enabled), path alias `@/*` → project root
- **Frontend**: React 19.2.3 (React Compiler enabled via `babel-plugin-react-compiler`)
- **Styling**: Tailwind CSS v4 with `@theme inline` in `src/app/globals.css`; dark mode via `.dark` class on `<html>` (injected by `next-themes`)
- **Backend/Database**: Convex (`convex/` directory, deployment `dev:quixotic-gopher-969`)
- **State Management**: Convex queries/mutations only — no Redux, Zustand, or other client state lib
- **Auth**: Custom email + password (bcryptjs) — `users` + `sessions` tables, admin/regional roles, multi-device sessions (30-day tokens, max 5/user)
- **PDF**: jsPDF v4 + jspdf-autotable (absolute positioning only, see `src/pdf/README.md`)
- **Email**: Resend (via `convex/emails.ts`)
- **Push**: web-push v3 (PWA web push with VAPID keys)
- **Spreadsheet Exports**: exceljs, xlsx
- **Charts**: recharts v3
- **Theme**: `next-themes` v0.4.6 (default: dark, system preference disabled)
- **Fonts**: Space Grotesk (heading) + Inter (body) via `next/font/google`
- **Form/Validation**: No form library (vanilla React `useState`); no validation library (manual checks)
- **Tests**: vitest (run with `npm test`)
- **Package Manager**: npm

### Key Dependencies from `package.json`

| Package | Purpose |
|---|---|
| `convex` | Backend queries, mutations, actions, schema |
| `next` | Framework |
| `react` / `react-dom` | UI |
| `tailwindcss` v4 | Utility-first CSS |
| `bcryptjs` | Password hashing (users + legacy adminSettings) |
| `jspdf` + `jspdf-autotable` | PDF invoice generation |
| `recharts` | Dashboard charts |
| `resend` | Transactional emails |
| `exceljs` / `xlsx` | Excel import/export |
| `web-push` | PWA push notifications (VAPID) |
| `next-themes` | Dark/light theme toggle |
| `vitest` | Unit tests |

---

## 2. Folder Structure

```
fleetcor/
├── convex/                 # Convex backend — schema, queries, mutations, actions
│   ├── _generated/         # Auto-generated Convex types (run `npx convex codegen`)
│   ├── __analysis__/       # Architecture analysis docs (trailerSwapAnalysis.md)
│   ├── templates/          # Email templates (TransportReport.ts)
│   ├── schema.ts           # Database schema (single source of truth)
│   ├── dailyRoutes.ts      # Core route CRUD + region scoping
│   ├── users.ts            # Auth: login action, user management, changePassword
│   ├── userSessions.ts     # Sessions CRUD + resolveUserScope / resolveEffectiveRegion
│   ├── birthdays.ts        # Driver birthdays from SA ID (pure helpers, unit-tested)
│   ├── webPush.ts          # PWA push sending (VAPID), daily dispatch
│   ├── webPushSubscriptions.ts  # Push subscription registry
│   ├── dashboard.ts        # CEO dashboard analytics queries
│   ├── fleet.ts            # Admin CRUD for trucks/drivers/trailers + list helpers
│   ├── subcontractors.ts   # Subcontractor CRUD + stats
│   ├── customers.ts        # Customer CRUD + search
│   ├── invoices.ts         # Invoice record storage (PDF rendered client-side in src/pdf/)
│   ├── emails.ts / emailTemplates.ts / recipients.ts  # Email via Resend
│   ├── trucks.ts / trailers.ts / drivers.ts  # Trailer assignment, queries, expiry
│   ├── trailerSwaps.ts     # Swap history (current combo lives on trucks.currentTrailerId)
│   ├── truckRenewals.ts / trailerRenewals.ts  # Renewal workflows + audit logs
│   ├── pdp.ts / pdpReport.ts  # PDP application lifecycle + report
│   ├── dailyAvailability.ts / dailyOps.ts  # Availability CRUD / ops snapshot
│   ├── damageLogs.ts / tasks.ts / attachments.ts  # Damage, tasks, file uploads
│   ├── dataImport.ts / fleetImport.ts  # Bulk import mutations
│   ├── notifications.ts / crons.ts  # Scheduled reminders + push dispatch
│   ├── settings.ts / adminSettings.ts / displaySettings.ts  # App/admin/client settings
│   ├── myDay.ts / vehicleLicences.ts / ai.ts  # My Day, licence queries, Ollama AI
│   ├── health.ts / http.ts / migrations.ts / seed.ts  # Ops utilities
│   ├── backfillRegion.ts / backfillStatus.ts / resetFlags.ts / cleanup_*.ts  # Maintenance
│   └── routes.ts           # Legacy route queries
│
├── src/
│   ├── app/                # Next.js App Router pages
│   │   ├── layout.tsx      # Root layout — ThemeProvider → ConvexClientProvider → ToastProvider → AuthProvider → AppShell + PwaInstaller
│   │   ├── page.tsx        # Root redirects to /dashboard
│   │   ├── globals.css     # Tailwind v4, design tokens, glass utilities, animations
│   │   ├── login/          # Sign-in screen (email + password)
│   │   ├── dashboard/      # CEO dashboard (single page + drill-down panels)
│   │   ├── all-regions/    # Admin cross-region table (Region column, R/KM)
│   │   ├── calendar/       # Driver birthday calendar (WhatsApp wishes)
│   │   ├── settings/       # Reminders, theme, push, change password, my devices
│   │   ├── operations/
│   │   │   ├── layout.tsx / page.tsx  # Ops layout; redirects to daily-planner/input
│   │   │   ├── daily-planner/
│   │   │   │   ├── layout.tsx     # View-mode toggle: Input / Split / Sheets
│   │   │   │   ├── page.tsx       # Redirects to daily-planner/input
│   │   │   │   ├── input/         # Route creation wizard (DailyPlannerInputContent)
│   │   │   │   ├── sheets/        # Sheets view + ImportLoadsModal
│   │   │   │   └── edit/[routeId]/  # Route edit page
│   │   │   ├── combinations/      # Truck-trailer combination management
│   │   │   ├── fuel/              # Fuel tracking
│   │   │   ├── quicksend/         # QuickSend email report
│   │   │   └── swaps/history + swaps/trailers  # Swap history + current assignments
│   │   ├── admin/
│   │   │   ├── layout.tsx     # Admin sub-nav (Fleet / Services / Access groups)
│   │   │   ├── page.tsx       # Admin dashboard (link grid)
│   │   │   ├── trucks/ trailers/ drivers/  # Master data CRUD
│   │   │   ├── subcontractors/  # Subcontractor CRUD
│   │   │   ├── fleet-import/    # Fleet bulk import
│   │   │   └── users/           # User management (admin-only)
│   │   └── import/           # JSON import page (drivers/trucks/trailers)
│   │
│   ├── components/         # React components
│   │   ├── auth/             # AuthProvider (useAuth, useRegionArg), AppShell (route guard)
│   │   ├── common/           # Toast, ConfirmDialog, ModalShell, SlideInPanel, EmptyState,
│   │   │                     # Pagination, Skeleton, WarningIcon, useKeyboardShortcut
│   │   ├── providers/        # ConvexClientProvider
│   │   ├── dashboard/        # BirthdaysCard (all other widgets render inline in the dashboard page)
│   │   ├── operations/       # daily-planner/{EditRouteForm, MobileSheetsView, SpreadsheetDataTable,
│   │   │                     # WizardRouteHeader}, invoice/{InvoiceDeliveryPanel, invoiceEscape}, SwapsViewToggle
│   │   ├── notifications/    # BirthdayBell
│   │   ├── Navigation.tsx    # Desktop sidebar + mobile top bar + admin region switcher
│   │   ├── MobileTabBar.tsx  # Mobile bottom tabs (Dashboard/Input/Swaps/Sheets)
│   │   ├── PwaInstaller.tsx  # Install banner + SW registration (production)
│   │   ├── PushNotificationSettings.tsx
│   │   ├── EmailReportModal.tsx
│   │   ├── RouteForm.tsx     # Legacy route form (used by /planner routes)
│   │   ├── ThemeProvider.tsx / BackgroundProvider.tsx / AmbientBackground.tsx
│   │   └── workspace/WorkspaceSplit.tsx
│   │
│   ├── hooks/               # useIsMobile.ts
│   ├── lib/
│   │   ├── exports/         # exportCSV, exportExcelWithTemplate, exportJSON, exportPDF, utils
│   │   ├── birthdays.ts     # ageThisYear, waWishLink
│   │   ├── useBirthdays.ts / useKpiFilter.ts / design-tokens.ts
│   │
│   ├── pdf/                 # PDF invoice generation (jsPDF, absolute positioning)
│   │   ├── README.md        # PDF layout rules
│   │   ├── invoiceBuilder.ts / invoiceTemplate.ts / formatters.ts / types.ts
│   │
│   └── types/               # sheetExport.ts (SheetExportRow)
│
├── scripts/               # Build/utility scripts
│   ├── updateBackend.ps1 / generateSnapshot.ps1
│   ├── seed-admin.mjs / seed-regional.mjs / seed-test-route.mjs
│   ├── check-*.mjs / verify-mobile.mjs / patch-region-args*.py
│   ├── generate-pwa-icons.mjs / fleetcore_report.py / generate_monthly_report.py
│
├── public/                # sw.js (versioned cache), manifest.webmanifest, templates/, icons
├── docs/                  # APP_STRUCTURE.md, THEME_TOKENS.md
├── AGENTS.md / ARCHITECTURE_LOCK.md / LINT_FREEZE.md / UPDATES.md / CEO_DASHBOARD_GUIDE.md
└── README.md              # Project overview
```

### Routing Summary

| Route Pattern | Purpose |
|---|---|
| `/` | Redirects to `/dashboard` |
| `/login` | Sign-in (email + password) |
| `/dashboard` | CEO analytics dashboard |
| `/all-regions` | Admin cross-region table (admin-only nav item) |
| `/calendar` | Driver birthday calendar (WhatsApp wishes) |
| `/settings` | App settings — reminders, theme, push, change password, my devices |
| `/operations/daily-planner/input` | Create routes (canonical route form) |
| `/operations/daily-planner/sheets` | Sheets view (collapsed summary + expansion; loads imported via `ImportLoadsModal` — not a route) |
| `/operations/daily-planner/edit/[routeId]` | Edit route |
| `/operations/combinations` | Truck-trailer combo management |
| `/operations/fuel` | Fuel tracking |
| `/operations/quicksend` | QuickSend report |
| `/operations/swaps/history` | Trailer swap history |
| `/operations/swaps/trailers` | Current trailer assignments |
| `/admin` | Admin link grid |
| `/admin/trucks` · `/admin/trailers` · `/admin/drivers` | Master data CRUD |
| `/admin/subcontractors` | Subcontractor CRUD |
| `/admin/fleet-import` | Fleet bulk import |
| `/admin/users` | User management (admin-only) |
| `/import` | JSON import (drivers/trucks/trailers) |
| `/planner`, `/sheets` | Declared legacy by `ARCHITECTURE_LOCK` — **no route files exist in the current codebase** |

> **Mobile (PWA, <768px)**: limited to Dashboard, Input, Edit, Sheets, Swaps,
> Calendar — everything else redirects to Dashboard (`AppShell.tsx`).

---

## 3. Data Model / Schema

The full schema is defined in `convex/schema.ts` (runtime validators using
`convex/values`). Below is every table and its fields.

### Auth & Sessions

#### `users`
```ts
{ email: string; passwordHash: string; role: "admin" | "regional";
  region?: "garden_route" | "eastern_cape"; sessionToken?: string; sessionExpiresAt?: number }
```
Indexes: `by_email`, `by_sessionToken`. The `sessionToken` fields are legacy —
current sessions live in `sessions`.

#### `sessions` (multi-device)
```ts
{ userId: Id<"users">; token: string; expiresAt: float64;  // 30 days
  device?: string; userAgent?: string; createdAt: float64 }
```
Indexes: `by_token`, `by_userId`. Max 5 live sessions per user (oldest pruned).

#### `webPushSubscriptions`
```ts
{ endpoint: string; keys: { p256dh: string; auth: string }; userAgent?: string; lastSeenAt: float64 }
```
Index: `by_endpoint`

#### `dismissedBirthdayAlerts`
```ts
{ userId: Id<"users">; driverId: Id<"drivers">; birthdayDate: string }  // e.g. "2026-08-04"
```
Index: `by_userId_driverId`

### Core Operational Tables

#### `dailyRoutes` (core table)
```ts
{
  client: string;                              // Derived from first load
  createdAt: float64;
  deletedAt?: float64;
  driverName: string;
  fromLocation?: string;                       // Legacy single-location field
  fromLocations?: string[];
  isDeleted?: boolean;
  kilometers: float64;                         // Effective KM
  legs?: { from, to: string; kilometers, order: float64 }[];
  loads: {
    client: string;
    fromLocations: string[];
    kilometers?: float64;
    loadId?: string;
    quantity, rate: string;                    // Stored as strings
    quantityType, rateType: string;            // rateType: "flat" | "per_qty" | "full"
    subcontractorRate?: string;
    subcontractorRateType?: string;
    toLocations: string[];
  }[];
  notes: string;
  rate: float64;                               // Route-level rate (revenue fallback when no loads)
  region?: "garden_route" | "eastern_cape";    // Region scoping (Stage 3+)
  routeDate: string;                           // YYYY-MM-DD
  routeKilometers?: float64;                   // Explicit route KM override
  status?: string;                             // "planned" | "completed" | "locked"
  toLocations: string[];
  trailerFleetNo: float64;
  trailerFleetNoStr?: string;
  truckFleetNo?: float64;
  truckFleetNoStr?: string;
  subcontractorId?: Id<"subcontractors">;
}
```
Indexes: `by_routeDate`, `by_routeDate_truckFleetNoStr`

#### `trucks`
```ts
{
  truckFleetNo?: string;                   // Canonical fleet number
  registration?: string; make?, model?: string;
  currentTrailerId?: Id<"trailers">;       // CURRENTLY ASSIGNED trailer (source of truth)
  status?: string;                         // "active" | "inactive"
  subStatus?: string;                      // Subcontractor mode status
  subcontractorId?: Id<"subcontractors">;
  fleetNumber?: string;                    // Legacy
  createdAt?, currentKm?, lastRenewalDate?, licenseExpiryDate?,
  receiptPhotoUrl?, renewalNotes?, serviceDueDate?, serviceDueKm?
}
```
Indexes: `by_currentTrailerId`, `by_truckFleetNo`

#### `trailers`
```ts
{
  trailerFleetNo: float64;                 // Numeric fleet number
  trailerFleetNoStr: string;               // String fleet number (canonical for joins)
  trailers: { length: string; registration: string }[];  // ⚠ Physical units under this fleet number
  type: string;                            // e.g. "interlink", "flatbed"
  status?: string; subStatus?: string;
  subcontractorId?: Id<"subcontractors">;
  currentKm?, lastRenewalDate?, licenseExpiryDate?, receiptPhotoUrl?,
  renewalNotes?, serviceDueDate?, serviceDueKm?
}
```
Index: `by_trailerFleetNoStr`

**Note**: One `trailers` document can represent multiple physical trailer units
(the `trailers` array). The trailer fleet number is the canonical identifier.

#### `drivers`
```ts
{
  createdAt?: float64;
  driverId?: string;          // Business key, e.g. employee/ID number
  driverName?: string;
  idNumber?: string;          // SA ID — used to derive birthdays
  licenseExpiryDate?: string; // YYYY-MM-DD
  name?: string;
  pdpExpiryDate?: string;     // Professional Driving Permit expiry
  phone?: string;
  photoStorageId?: string; photoUrl?: string;
  status?: string;            // "active" | "inactive"
  subStatus?: string;
  subcontractorId?: Id<"subcontractors">;
}
```
Index: `by_driverId`

### Master Data & Settings

| Table | Purpose |
|---|---|
| `customers` | `{ name, normalizedName, accountNumber?, address?, contactPerson?, phone?, email?, vatNumber?, note?, isActive, createdAt }` — indexes `by_accountNumber`, `by_normalizedName` |
| `subcontractors` | `{ companyName, phone?, email?, status?, createdAt }` |
| `adminSettings` | `{ mode, passwordHash }` — legacy PIN gate (superseded by `users` auth) |
| `appSettings` | `{ expiryReminder30/60/90, stage1/2/3AlertDays, pushToken? }` |
| `clientDisplaySettings` | `{ clientId, compactMode, reduceMotion, theme, zoomLevel, createdAt, updatedAt }` — index `by_clientId` |
| `recipients` | `{ email, name }` |

### Financial

| Table | Purpose |
|---|---|
| `invoices` | `{ invoiceNumber, routeId: Id<"dailyRoutes">, snapshot: any, totals: { subtotal, totalAmount, vatAmount }, createdAt }` — indexes `by_invoiceNumber`, `by_routeId`. Record storage only (`convex/invoices.ts`); **PDF rendering is client-side** in `src/pdf/` |
| `invoiceCounter` | `{ lastNumber }` — invoice number sequence |

### Availability & Scheduling

| Table | Purpose |
|---|---|
| `dailyAvailability` | `{ date, dayKey, status: "available"\|"unavailable"\|"maintenance", trucks[], trailers[], drivers[], createdBy?, createdAt }` — indexes `by_date`, `by_day` |
| `myDaySelections` | `{ itemId, itemType, label, selectedDate, completed?, createdAt }` — index `by_selectedDate` |

### Operations & Compliance

| Table | Purpose |
|---|---|
| `attachments` | `{ fileName, fileType, fileUrl, storageId, refId?, refType?, taskId?, uploadedAt, uploadedBy }` — indexes `by_refId`, `by_taskId` |
| `damageLogs` | `{ assetType, assetUnit, date, status, notes?, photoUrls[], closedAt? }` — indexes `by_assetType`, `by_assetType_assetUnit`, `by_assetUnit` |
| `tasks` / `taskResolutions` / `taskSnoozes` | Task management with snooze + resolution tracking |
| `trailerSwaps` | `{ truckId, oldTrailerId?, newTrailerId?, truckFleetNoStr?, trailerFleetNoStr?, oldTrailerFleetNoStr?, reason, swapDate, swapDateMs?, swapType, notes?, createdAt }` — **history only** |
| `fleetSetupBaseline` | `{ assignments: { truckId, trailerId }[], locked, setupDate }` |
| `fleetSetupStatus` | `{ complete }` |

### Renewals & PDP

| Table | Purpose |
|---|---|
| `truckRenewals` / `truckRenewalLogs` | Truck license renewal + audit (`initiated` → `complete`) |
| `trailerRenewals` / `trailerRenewalLogs` | Trailer license renewal + audit (`initiated` → `complete`) |
| `pdpApplications` | PDP lifecycle — stages, docs (`docAttachmentIds`), card, expiry, contingencies |
| `pdpApplicationLogs` | `{ applicationId, driverId, action, performedBy, notes?, timestamp }` |

### Entity Relationships

- **trucks ↔ trailers**: `trucks.currentTrailerId` → `trailers._id` (current
  assignment). History lives in `trailerSwaps`; initial in `fleetSetupBaseline`.
- **users ↔ sessions**: `sessions.userId` → `users._id` (multi-device).
- **dismissedBirthdayAlerts**: `userId` → `users._id`, `driverId` → `drivers._id`.
- **dailyRoutes ↔ trucks/trailers**: string references
  (`truckFleetNoStr` ↔ `trucks.truckFleetNo`, `trailerFleetNoStr` ↔
  `trailers.trailerFleetNoStr`).
- **dailyRoutes ↔ invoices**: `invoices.routeId` is an `Id<"dailyRoutes">`.
- **Subcontractors**: `trucks`/`trailers`/`drivers`/`dailyRoutes` carry an
  optional `subcontractorId` → `subcontractors._id`.
- **drivers**: Not FK-linked — referenced by `dailyRoutes.driverName` as a string.

> **Removed**: Earlier revisions documented `payments`, `paymentAllocations`,
> `ageSnapshots`, `ageSnapshotRows`, and `notifications` tables. They are **not
> in the current schema** — treat `convex/schema.ts` as authoritative.

---

## 4. Existing CRUD Patterns

### 4a. End-to-End "Create a Route" Flow

This is the most representative CRUD flow:

1. **UI Component**: `src/app/operations/daily-planner/input/page.tsx` +
   `DailyPlannerInputContent.tsx` — a multi-step wizard form.

2. **Form Structure**:
   - Header section: date, region (defaults to the user's region), truck
     (select), trailer (optional select), driver (select), route KM, notes
   - Loads section: add/edit/remove individual loads inline (client name, from/to
     locations, quantity+type, rate+type)
   - No form validation library — manual checks
   - Client names uppercased on change

3. **Session Draft Recovery**: `sessionStorage` draft (10-min TTL).

4. **Convex Mutation**: `convex/dailyRoutes.ts` — `createDailyRoute()`
   - Validates inputs, normalizes loads, derives aggregate values
   - **Stamps `region`** (regional users are hard-locked to their own region)
   - Auto-calculates kilometers (priority: routeKilometers > legs sum > max load
     km > legacy km)
   - Auto-sets status to `"completed"` if all loads are valid, else `"planned"`
   - Returns the new document ID

5. **Result Display**: Sheets view (`/operations/daily-planner/sheets`) — collapsed
   summary rows with chevron expansion (desktop `SpreadsheetDataTable`) or
   day-grouped cards (mobile `MobileSheetsView`).

### 4b. Existing Import / Bulk-Entry Features

**JSON Import** (`/import`):
- Paste or upload a JSON array; tabs for drivers / trucks / trailers
- Calls `dataImport.importDrivers` / `importTrucks` / `importTrailers`
  (upsert by business key); example payloads built in

**Fleet Import** (`/admin/fleet-import`):
- Excel template-driven import
  (`public/templates/fleetcore-sheets-template-extended.xlsx`)

**Load Import** (`/operations/daily-planner/sheets` → `ImportLoadsModal.tsx`):
- Imports loads into routes; region-aware (regional users blocked from
  "All Regions"; Region column)

**Bulk Route Creation** (`convex/dailyRoutes.ts`): `createBulkDailyRoutes`
mutation — accepts an array of route objects (no UI wiring yet).

### 4c. Admin Access Control

Auth is **session-based**, not a PIN gate:

- **Login**: `users.login` action (bcrypt compare) creates a `sessions` row;
  token in `localStorage` (`fleetcore-session-token`). `AuthProvider` restores
  the user via `userSessions.getSessionUser`.
- **Roles**: `admin` (sees everything, region-switcher override) and `regional`
  (hard-locked to their region — enforced **server-side** via
  `resolveUserScope` / `resolveEffectiveRegion` in `convex/userSessions.ts`).
- **Guards**: `AppShell` redirects logged-out users to `/login`; user-management
  mutations require a live admin session (`requireAdmin`); cannot demote/delete
  the last admin; sessions expire after 30 days.
- **Admin layout** (`src/app/admin/layout.tsx`): sub-nav grouped into
  **Fleet** (trucks, trailers, drivers), **Services** (subcontractors),
  **Access** (users). It does not gate by role — individual pages + backend
  enforce admin-only access (e.g. `/admin/users`).
- **Legacy**: `convex/adminSettings.ts` (PIN + bcrypt hash) still exists but is
  superseded by the `users`/`sessions` system.

### 4d. Admin CRUD Patterns (Trucks, Trailers, Drivers)

All three admin CRUD pages follow the same pattern:
- **Card-based grid** layout (not a table) with inline edit mode (blue border)
- Sortable columns, debounced search, `includeInactive` checkbox
- KPI cards (Total/Active/Inactive), status badges (green/gray)
- OwnerBadge (Fleet gray vs Subcontractor purple) + sub-status badges
- Hover-revealed actions: Edit (Pencil), Power/PowerOff, Delete (Trash2)
- ConfirmDialog for deletes, Toast feedback, Pagination (20/page)
- Reference checks on delete (blocks when used by existing routes)
- Mutations in `convex/fleet.ts` — `ctx.db.patch`/`insert`/`delete`, uniqueness
  checks on fleet numbers

---

## 5. Shared Utilities and Conventions

### Naming Conventions

- **Files**: camelCase (`dailyRoutes.ts`, `exportCSV.ts`)
- **Components**: PascalCase (`RouteForm.tsx`, `WizardRouteHeader.tsx`)
- **Convex functions**: camelCase (`createDailyRoute`, `getRoutesByDate`)
- **Directories**: kebab-case (`daily-planner/`, `fleet-import/`)

### Formatting Utilities

**Currency** (`src/pdf/formatters.ts`):
```ts
formatCurrency(amount: number): string  // → "R 1 234,56"
```
- Strict ZAR format: space thousands separator, comma decimal, `R ` prefix
- MUST NOT use `toLocaleString()` — always use the custom formatter
- `formatZAR` variants also exist in `MobileSheetsView.tsx` and
  `all-regions/page.tsx` (hydration-safe, matching table columns)

**Date** / **Description** (`src/pdf/formatters.ts`):
`formatDate(date)` → `"YYYY-MM-DD"`; `formatDescription(rawDesc)` inserts a
line break after `" TO "`.

**Load amounts** (`convex/utils.ts`): `calculateLoadAmount(qty, rate, rateType)`
— `flat`/`full` → rate, else `qty × rate`. Used for every revenue/R-KM calc.

**Export helpers** (`src/lib/exports/utils.ts`): `downloadFile` blob download.

### Design Tokens / Colors / Typography

**CSS** (`src/app/globals.css`):
- `@theme inline` tokens: `--color-primary` (#06B6D4), accents, glass colors,
  fonts (`--font-space-grotesk`, `--font-inter`), animations
- Core surface vars: `--background`, `--foreground`, `--card-bg`,
  `--card-border`, `--nav-text-color` (light + `.dark` values)
- Glass utilities: `.glass-card`, `.glass-card-premium`, `.glass-sidebar`,
  `.nav-item-active`, `.settings-input`, `.skeleton-shimmer`
- Scrollbar utilities: `scrollbar-fleet`, `scrollbar-hidden`
- Dark mode: `.dark` class on `<html>` (never from OS preference)

**Rules** (see `docs/THEME_TOKENS.md` for the full reference):
- NEVER use `text-gray-*`, `bg-white`, `border-gray-*`, or `dark:*` variants —
  CSS vars handle theming
- Semantic status badges (`bg-green-100 text-green-800`, etc.) stay hardcoded
- Primary CTAs: `bg-gradient-to-br from-[#06B6D4] to-[#0891B2] text-white`

**Theme**: Default dark. Light/dark toggle lives in `Navigation.tsx`.

---

## 6. Known Constraints

### Immutable / Frozen Architecture (per `ARCHITECTURE_LOCK.md`)

The following must NOT be changed without explicit Phase 3+ approval:
- **Sheets table** collapsed summary + chevron expansion pattern
- **Status + Risk** computation (pure functions only, no hooks/mutations)
- **Backend queries** separated by consumer intent (no "god queries")
- **Suspense** only localized, `fallback={null}` unless required
- **Legacy routes** (`/planner`, `/sheets`): declared in `ARCHITECTURE_LOCK` — not present as route files; do not reintroduce them as canonical routes
- No global state (Redux, Zustand) introduced

### Region Scoping (server-enforced)

- Regional users are hard-locked to their own region — never trusted from the
  client. Route reads resolve scope via `resolveEffectiveRegion`.
- New routes must be stamped with the effective region.

### Schema Sensitivity

- **`convex/schema.ts`**: Do not modify without understanding downstream impact.
  Schema changes require `npx convex push`.
- **`convex/dailyRoutes.ts`**: Locked KM priority + auto-complete logic.
- **`convex/trucks.ts`**: `trucks.currentTrailerId` is source of truth —
  do not use `trailerSwaps` for current state.
- **`src/pdf/`**: Absolute positioning only, fixed Y zones, ZAR via
  `formatters.ts`.

### Lint Freeze

- Legacy Convex/Planner files have `no-explicit-any` disabled per-file
  (see `LINT_FREEZE.md`). New code must be strict and lint-free.
- `npm run lint` (ESLint only — no typecheck script).

### Environment

- Convex deployment: `dev:quixotic-gopher-969`
- Env vars: `.env.local` (not committed) — `NEXT_PUBLIC_CONVEX_URL`,
  `RESEND_API_KEY`
- VAPID keys for web push: `npx convex env set VAPID_PUBLIC_KEY ...` /
  `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT`
- Commands: `npm run dev` · `npm run build` · `npm run lint` · `npm test`
  (vitest) · `npm run update-backend` (codegen + snapshot) · `npx convex push`
- Unit tests exist: `convex/birthdays.test.ts`, `convex/utils.test.ts`,
  `src/components/operations/invoice/invoiceEscape.test.ts`,
  `src/pdf/formatters.test.ts`
- All writes go through Convex mutations/actions — no direct DB access from client

### Other Constraints

- **PDF currency format**: Strict ZAR (`R 1 234,56`) — never `toLocaleString()`
- **New features only** — no cleanup refactoring without explicit instruction
- **React Compiler** enabled — all components must be compatible
- **Trailer schema quirk**: One `trailers` document has a `trailers` array
  (confusing name) representing physical units under a fleet number
- **Mobile**: 44px touch targets, `<768px` limited to
  Dashboard/Input/Edit/Sheets/Swaps/Calendar

---

## Open Questions

1. **`createBulkDailyRoutes`**: exists in `convex/dailyRoutes.ts` but no UI
   calls it. Is it intended for future bulk import?
2. **Trailer `trailers` array confusion**: the field name collides with the
   table name. When adding import features, how should individual physical
   units be referred to?
3. **Deployment split**: only `dev:quixotic-gopher-969` is referenced — is there
   a separate production deployment?
4. **`adminSettings` legacy**: still present but superseded by `users` auth —
   should it be removed in a future cleanup phase?
