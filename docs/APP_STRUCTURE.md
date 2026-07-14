# FleetCore Application Structure

## 1. Tech Stack

- **Framework**: Next.js 16.1.7 (App Router only, no Pages Router)
- **Language**: TypeScript (strict mode enabled)
- **Frontend**: React 19.2.3
- **Styling**: Tailwind CSS v4 with `@theme inline` directives; dark mode via class toggle (`next-themes` injects `.dark` on `<html>`)
- **Backend/Database**: Convex (`convex/` directory, deployment `dev:quixotic-gopher-969`)
- **State Management**: Convex queries/mutations only — no Redux, Zustand, or other client state lib
- **Auth**: bcryptjs (simple PIN-based admin gate, no OAuth)
- **PDF**: jsPDF v4 + jspdf-autotable (absolute positioning only, see `src/pdf/` conventions)
- **Email**: Resend (via `convex/emails.ts`)
- **Spreadsheet Exports**: exceljs, xlsx
- **Charts**: recharts v3
- **Theme**: `next-themes` v0.4.6 (default: dark, system preference disabled)
- **Form/Validation**: No form library (vanilla React `useState`); no validation library (manual checks)
- **Package Manager**: npm
- **React Compiler**: enabled via `babel-plugin-react-compiler`

### Key Dependencies from `package.json`

| Package | Purpose |
|---|---|
| `convex` | Backend queries, mutations, actions, schema |
| `next` | Framework |
| `react` / `react-dom` | UI |
| `tailwindcss` v4 | Utility-first CSS |
| `bcryptjs` | Admin password hashing |
| `jspdf` + `jspdf-autotable` | PDF invoice generation |
| `recharts` | Dashboard charts |
| `resend` | Transactional emails |
| `exceljs` / `xlsx` | Excel import/export |
| `next-themes` | Dark/light theme toggle |

---

## 2. Folder Structure

```
fleetcor/
├── convex/                 # Convex backend — schema, queries, mutations, actions
│   ├── _generated/         # Auto-generated Convex types (run `npx convex codegen`)
│   ├── __analysis__/       # Architecture analysis docs (e.g. trailerSwapAnalysis.md)
│   ├── finance/            # Finance module: age analysis, payments, allocations
│   │   ├── lib/            # Shared helpers (parseAgeAnalysis.ts, validateAgeRows.ts)
│   │   ├── allocations.ts
│   │   ├── dashboard.ts
│   │   ├── deleteAgeSnapshot.ts
│   │   ├── getAgeSnapshotRows.ts
│   │   ├── getAgeSnapshots.ts
│   │   ├── getAgeSnapshotSummary.ts
│   │   ├── importAgeSnapshot.ts
│   │   └── payments.ts
│   ├── templates/          # Email templates (Resend)
│   ├── schema.ts           # Database schema (single source of truth)
│   ├── dailyRoutes.ts      # Core route CRUD
│   ├── trucks.ts           # Truck operations (trailer assignment)
│   ├── trailers.ts         # Trailer queries
│   ├── drivers.ts          # Driver queries + expiry tracking
│   ├── fleet.ts            # Admin CRUD for trucks/drivers/trailers + list helpers
│   ├── dashboard.ts        # CEO dashboard analytics queries
│   ├── dataImport.ts       # Bulk import mutations (drivers, trucks, trailers)
│   ├── emails.ts           # Email sending via Resend
│   └── ... (other modules)
│
├── src/
│   ├── app/                # Next.js App Router pages
│   │   ├── layout.tsx      # Root layout — ConvexClientProvider, ThemeProvider, Navigation
│   │   ├── page.tsx        # Root redirects to /dashboard
│   │   ├── globals.css     # Tailwind v4 imports, custom scrollbar styles, theme vars
│   │   ├── dashboard/      # CEO dashboard (single page)
│   │   ├── operations/     # Operations routes
│   │   │   ├── daily-planner/  # Core route planning UI
│   │   │   │   ├── input/      # Route creation/edit form (wizard-based)
│   │   │   │   ├── edit/       # Route edit page
│   │   │   │   ├── sheets/     # Sheets view (collapsed summary + expanded rows)
│   │   │   │   ├── page.tsx    # Redirects to /input
│   │   │   │   └── layout.tsx  # Daily planner layout
│   │   │   ├── combinations/   # Truck-trailer combination management
│   │   │   ├── fuel/           # Fuel tracking
│   │   │   ├── quicksend/      # QuickSend report page
│   │   │   ├── swaps/          # Trailer swap management
│   │   │   ├── layout.tsx      # Operations layout
│   │   │   └── page.tsx        # Operations landing page
│   │   ├── admin/          # Admin routes (CRUD for master data)
│   │   │   ├── layout.tsx     # Admin sub-navigation (Fleet group + Finance group)
│   │   │   ├── page.tsx       # Admin dashboard (link grid)
│   │   │   ├── trucks/        # Truck master data CRUD
│   │   │   ├── trailers/      # Trailer master data CRUD
│   │   │   ├── drivers/       # Driver master data CRUD
│   │   │   ├── customers/     # Customer master data
│   │   │   ├── age-analysis/  # Age analysis snapshot import + list + detail views
│   │   │   │   ├── page.tsx
│   │   │   │   └── [snapshotId]/
│   │   │   ├── payments/      # Bank payment import + allocation
│   │   │   ├── reconciliation/ # Reconciliation (read-only view)
│   │   │   └── settings/      # App settings
│   │   ├── import/             # General import page
│   │   └── settings/           # Application settings page
│   │
│   ├── components/         # React components
│   │   ├── admin/             # Admin-specific components
│   │   │   └── payments/      # AllocationModal, OnAccountModal
│   │   ├── common/            # WarningIcon
│   │   ├── dashboard/ceo/     # CEO dashboard widgets
│   │   │   ├── ExecutiveSummary.tsx
│   │   │   ├── FinancialHealthWidget.tsx
│   │   │   ├── OperationalMetrics.tsx
│   │   │   ├── CustomerPerformance.tsx
│   │   │   ├── FleetPerformance.tsx
│   │   │   ├── StrategicInsights.tsx
│   │   │   └── TrendIcon.tsx
│   │   ├── operations/        # Operations components
│   │   │   └── daily-planner/ # WizardRouteHeader, EditRouteForm, Sheets components
│   │   ├── providers/         # ConvexClientProvider
│   │   ├── Navigation.tsx     # Top-level nav bar (Dashboards, Operations, Admin, Settings)
│   │   ├── RouteForm.tsx      # Legacy route form (used by /planner routes)
│   │   ├── ThemeProvider.tsx  # next-themes wrapper
│   │   ├── ThemeToggle.tsx    # Light/dark toggle button
│   │   ├── EmailReportModal.tsx
│   │   ├── BackgroundProvider.tsx
│   │   ├── ParticleBackground.tsx
│   │   └── Placeholder.tsx
│   │
│   ├── lib/
│   │   └── exports/           # Export utilities
│   │       ├── exportCSV.ts
│   │       ├── exportExcelWithTemplate.ts
│   │       ├── exportJSON.ts
│   │       ├── exportPDF.ts
│   │       └── utils.ts
│   │
│   ├── pdf/                # PDF invoice generation
│   │   ├── invoiceBuilder.ts
│   │   ├── invoiceTemplate.ts
│   │   ├── formatters.ts      # formatCurrency (ZAR), formatDate, formatDescription
│   │   ├── types.ts
│   │   └── README.md
│   │
│   └── types/
│       └── sheetExport.ts    # SheetExportRow interface
│
├── scripts/               # Build/utility scripts
│   ├── generateSnapshot.ps1
│   ├── updateBackend.ps1
│   ├── fleetcore_report.py
│   └── generate_monthly_report.py
│
├── public/                # Static assets (templates, etc.)
├── docs/                  # (this file)
├── AGENTS.md              # AI agent instructions
├── ARCHITECTURE_LOCK.md   # Frozen architectural decisions
├── LINT_FREEZE.md         # Lint exemption policy
├── CEO_DASHBOARD_GUIDE.md # Dashboard documentation
└── README.md              # Project overview
```

### Routing Summary

| Route Pattern | Purpose |
|---|---|
| `/` | Redirects to `/dashboard` |
| `/dashboard` | CEO analytics dashboard |
| `/operations/daily-planner/input` | Create/edit routes (canonical route form) |
| `/operations/daily-planner/sheets` | Sheets view (collapsed summary + expansion) |
| `/operations/daily-planner/edit` | Edit route |
| `/operations/combinations` | Truck-trailer combo management |
| `/operations/fuel` | Fuel tracking |
| `/operations/quicksend` | QuickSend report |
| `/operations/swaps` | Trailer swap history |
| `/admin/trucks` | Truck master data CRUD |
| `/admin/trailers` | Trailer master data CRUD |
| `/admin/drivers` | Driver master data CRUD |
| `/admin/customers` | Customer master data |
| `/admin/age-analysis` | Age analysis import + list |
| `/admin/age-analysis/[snapshotId]` | Snapshot detail view |
| `/admin/payments` | Bank payment import + allocation |
| `/admin/reconciliation` | Reconciliation read-only view |
| `/settings` | App settings |

---

## 3. Data Model / Schema

The full schema is defined in `convex/schema.ts` (runtime validators using `convex/values`). Below is every table and its fields.

### `adminSettings`
```ts
{ mode: string; passwordHash: string }
```
Single-row table for admin PIN and mode.

### `invoiceCounter`
```ts
{ lastNumber: float64 }
```

### `ageSnapshots`
```ts
{ current, days120, days90, days60, days30: float64; fileName: string; importedAt: float64; importedBy: string; month: string; status: string; totalDue: float64 }
```
Index: `by_month` (month)

### `ageSnapshotRows`
```ts
{ accountNumber, clientName: string; current, days120, days30, days60, days90, originalRowIndex, totalDue: float64; snapshotId: Id<"ageSnapshots"> }
```
Index: `by_snapshotId` (snapshotId)

### `appSettings`
```ts
{ expiryReminder30, expiryReminder60, expiryReminder90: boolean; pushToken?: string; stage1AlertDays, stage2AlertDays, stage3AlertDays: float64 }
```

### `attachments`
```ts
{ fileName, fileType, fileUrl: string; refId?, refType?: string; storageId: Id<"_storage">; taskId?: Id<"tasks">; uploadedAt: float64; uploadedBy: string }
```
Indexes: `by_refId`, `by_taskId`

### `clientDisplaySettings`
```ts
{ clientId: string; compactMode, reduceMotion: boolean; createdAt, updatedAt, zoomLevel: float64; theme: string }
```
Index: `by_clientId`

### `customers`
```ts
{ accountNumber?, address?, contactPerson?, phone?, email?, vatNumber?, note?: string; createdAt: float64; isActive: boolean; name: string; normalizedName: string }
```
Indexes: `by_accountNumber`, `by_normalizedName`

### `dailyAvailability`
```ts
{ createdAt: float64; createdBy?: string; date, dayKey: string; drivers: string[]; status: "available" | "unavailable" | "maintenance"; trailers: string[]; trucks: string[] }
```
Indexes: `by_date`, `by_day`

### **`dailyRoutes`** (core table)
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
    quantity, rate: string;                    // Stored as strings
    quantityType, rateType: string;
    toLocations: string[];
  }[];
  notes: string;
  rate: float64;                               // Derived total revenue
  routeDate: string;                           // YYYY-MM-DD
  routeKilometers?: float64;                   // Explicit route KM override
  status?: string;                             // "planned" | "completed" | "locked"
  toLocations: string[];
  trailerFleetNo: float64;
  trailerFleetNoStr?: string;
  truckFleetNo?: float64;
  truckFleetNoStr?: string;
}
```
Indexes: `by_routeDate`, `by_routeDate_truckFleetNoStr`

### `damageLogs`
```ts
{ assetType, assetUnit, date, status: string; closedAt?, notes?: string; photoUrls: string[] }
```
Indexes: `by_assetType`, `by_assetType_assetUnit`, `by_assetUnit`

### `drivers`
```ts
{
  createdAt?: float64;
  driverId?: string;          // Business key, e.g. employee/ID number
  driverName?: string;
  idNumber?: string;          // National ID
  licenseExpiryDate?: string; // YYYY-MM-DD
  name?: string;
  pdpExpiryDate?: string;     // Professional Driving Permit expiry
  phone?: string;
  photoStorageId?: string;
  photoUrl?: string;
  status?: string;            // "active" | "inactive"
}
```
No indexes defined beyond default `_creationTime`.

### `fleetSetupBaseline`
```ts
{ assignments: { trailerId: Id<"trailers">; truckId: Id<"trucks"> }[]; locked: boolean; setupDate: float64 }
```

### `fleetSetupStatus`
```ts
{ complete: boolean }
```

### `invoices`
```ts
{ createdAt: float64; invoiceNumber: string; routeId: Id<"dailyRoutes">; snapshot: any; totals: { subtotal, totalAmount, vatAmount: float64 } }
```
Indexes: `by_invoiceNumber`, `by_routeId`

### `myDaySelections`
```ts
{ createdAt: float64; itemId, itemType, label, selectedDate: string; completed?: boolean }
```
Index: `by_selectedDate`

### `paymentAllocations`
```ts
{ allocatedAmount: float64; allocatedAt: float64; allocatedBy, accountNumber?, clientName?, allocationType?, notes?: string; paymentId: Id<"payments">; snapshotId?: Id<"ageSnapshots">; snapshotRowId?: Id<"ageSnapshotRows"> }
```
Indexes: `by_accountNumber`, `by_paymentId`, `by_snapshotRowId`

### `payments`
```ts
{ amount: float64; flags: string[]; importedAt: float64; notes?: string; paymentDate: string; rawDescription: string; reference?: string; source: string }
```
Indexes: `by_importedAt`, `by_paymentDate`

### `pdpApplications` / `pdpApplicationLogs`
Complex tables for driver PDP (Professional Driving Permit) application tracking.

### `recipients`
```ts
{ email, name: string }
```

### `tasks` / `taskResolutions` / `taskSnoozes`
Task management tables with snooze and resolution tracking.

### `trailerRenewals` / `trailerRenewalLogs`
Trailer license renewal tracking.

### `trailerSwaps`
```ts
{ createdAt, notes?, oldTrailerFleetNoStr?, oldTrailerId?, reason, swapDate, swapDateMs?, swapType, trailerFleetNoStr?, truckFleetNoStr?, truckId, newTrailerId?: string }
```

### **`trailers`** (core table)
```ts
{
  trailerFleetNo: float64;                 // Numeric fleet number
  trailerFleetNoStr: string;               // String fleet number (canonical for joins)
  trailers: { length: string; registration: string }[];  // Physical trailer units under this fleet number
  type: string;                            // e.g. "interlink", "flatbed"
  status?: string;                         // "active" | "inactive"
  currentKm?: float64;
  licenseExpiryDate?, lastRenewalDate?, receiptPhotoUrl?, renewalNotes?, serviceDueDate?, serviceDueKm?: string | float64
}
```
Index: `by_trailerFleetNoStr`

**Note**: One `trailers` document can represent multiple physical trailer units (the `trailers` array). The `registration` field exists per-physical-unit within the array. The trailer fleet number is the canonical identifier.

### **`trucks`** (core table)
```ts
{
  truckFleetNo?: string;                   // Canonical fleet number
  registration?: string;                   // Vehicle registration plate
  make?, model?: string;
  currentTrailerId?: Id<"trailers">;       // CURRENTLY ASSIGNED trailer (source of truth)
  status?: string;                         // "active" | "inactive"
  fleetNumber?: string;                    // Legacy
  createdAt?, currentKm?, lastRenewalDate?, licenseExpiryDate?, receiptPhotoUrl?, renewalNotes?, serviceDueDate?, serviceDueKm?: string | float64
}
```
Indexes: `by_currentTrailerId`, `by_truckFleetNo`

### `truckRenewals` / `truckRenewalLogs`
Truck license renewal tracking.

### Entity Relationships

- **trucks ↔ trailers**: `trucks.currentTrailerId` points to `trailers._id`. This is the *current* assignment. Historical assignments are tracked in `trailerSwaps`. Initial assignments are stored in `fleetSetupBaseline`.
- **drivers**: Not directly FK-linked to any table. Referenced by `dailyRoutes.driverName` as a string.
- **dailyRoutes ↔ trucks**: `dailyRoutes.truckFleetNoStr` references `trucks.truckFleetNo` (string, not ID).
- **dailyRoutes ↔ trailers**: `dailyRoutes.trailerFleetNoStr` references `trailers.trailerFleetNoStr`.
- **dailyRoutes ↔ invoices**: `invoices.routeId` is an `Id<"dailyRoutes">`.
- **ageSnapshots ↔ ageSnapshotRows**: `ageSnapshotRows.snapshotId` is an `Id<"ageSnapshots">`.
- **payments ↔ paymentAllocations**: `paymentAllocations.paymentId` is an `Id<"payments">`.

---

## 4. Existing CRUD Patterns

### 4a. End-to-End "Create a Route" Flow

This is the most representative CRUD flow:

1. **UI Component**: `src/app/operations/daily-planner/input/page.tsx` — a multi-step wizard form.

2. **Form Structure**:
   - Header section: date, truck (select), trailer (optional select), driver (select), route KM, notes
   - Loads section: add/edit/remove individual loads inline (client name, from/to locations, quantity+type, rate+type)
   - No form validation library — uses manual checks like `if (!date || !truckFleetNo || !driverName)`
   - Input values are uppercased on change (e.g. client name `toUpperCase()`)

3. **Session Draft Recovery**: The form saves state to `sessionStorage` (key `fleetcor_daily_planner_draft`, 10-min TTL) and restores on page load for crash recovery.

4. **Convex Mutation**: `convex/dailyRoutes.ts` — `createDailyRoute()`
   - Validates `truckFleetNo` is non-empty
   - Normalizes loads, derives aggregate values (client name, total rate, from/to locations)
   - Auto-calculates kilometers (priority: routeKilometers > legs sum > max load km > legacy km)
   - Converts `truckFleetNoStr` to numeric `truckFleetNo` where possible
   - Auto-sets status to `"completed"` if all loads are valid, else `"planned"`
   - Returns the new document ID

5. **Result Display**: The route appears in the Sheets view (`/operations/daily-planner/sheets`) which shows collapsed summary rows with chevron expansion.

### 4b. Existing Import / Bulk-Entry Features

**Age Analysis Import** (`/admin/age-analysis`):
- Multi-step wizard: upload .xlsx → preview rows → select header → map columns → validate → import
- Uses `xlsx` library for file parsing
- Imports via Convex action (`finance.importAgeSnapshot.importSnapshot`)
- Validates rows with `finance/lib/validateAgeRows.ts`
- Duplicate detection: checks if snapshot for month already exists
- Refuses import for existing months

**Payment Import** (`/admin/payments`):
- Copy-paste raw bank statement lines into a textarea
- Parses lines with regex (amount extraction, reference detection)
- Flags anomalies (missing reference, zero/negative amounts, outliers)
- Imports via `finance.payments.createPayments` mutation
- Duplicate detection per batch using signature `paymentDate-amount-reference`

**Bulk Data Import** (`convex/dataImport.ts`):
- `importDrivers` — array of driver objects, upserts by `driverId`
- `importTrucks` — array of truck objects, upserts by `truckFleetNo`
- `importTrailers` — array of trailer objects, upserts by `trailerFleetNoStr`
- These are Convex mutations (not actions) and exist in `convex/dataImport.ts`. They are NOT wired to any UI page currently — they appear to be intended for CLI or script-based import.

**Bulk Route Creation** (`convex/dailyRoutes.ts`): `createBulkDailyRoutes` mutation — accepts array of route objects similar to single create.

**General Import Page** (`/import`): Exists as a route but no content implemented yet (single `page.tsx`).

### 4c. Admin Access Control

Admin access uses a simple PIN system:

- **`convex/adminSettings.ts`**: Single-row table with `mode` ("ADMIN" or other) and `passwordHash` (bcrypt)
- Default password: `"admin123"`
- Access check: `verifyAdminPassword` Convex action uses bcrypt compare
- The admin layout (`src/app/admin/layout.tsx`) does NOT enforce auth in layout — individual pages appear to be unprotected beyond the nav. The PIN check likely happens at the settings/route level.
- There is no role system — just "admin" or not.

### 4d. Admin CRUD Patterns (Trucks, Trailers, Drivers)

All three admin CRUD pages follow the same pattern:
- **Inline editing** within a CSS grid table (not a separate form page)
- Sortable columns via sort state (asc/desc toggles)
- Search filter with `includeInactive` checkbox
- KPI cards showing total/active/inactive counts
- Status badges (green = Active, gray = Inactive)
- Edit/Save/Cancel/Delete + Activate/Deactivate buttons per row
- Error/success toast messages that auto-dismiss after 2.5s
- Reference checks on delete (prevents deletion if the entity is used in existing routes)
- Mutations in `convex/fleet.ts`: `createTruck`, `updateTruck`, `deleteTruck`, `createDriver`, `updateDriver`, `deleteDriver`, `createTrailer`, `updateTrailerComponent`, `deleteTrailerComponent` + status mutations
- All mutations use `ctx.db.patch` for updates, `ctx.db.insert` for create, `ctx.db.delete` for delete
- Uniqueness checks on fleet numbers before insert/update

---

## 5. Shared Utilities and Conventions

### Naming Conventions

- **Files**: camelCase (`dailyRoutes.ts`, `age-analysis/`, `exportCSV.ts`)
- **Components**: PascalCase (`RouteForm.tsx`, `WizardRouteHeader.tsx`)
- **Convex functions**: camelCase (`createDailyRoute`, `getRoutesByDate`, `listTrucks`)
- **Convex query/mutation exports**: `export const getXxx = query({...})`, `export const createXxx = mutation({...})`
- **React state variables**: camelCase, prefixed with `set` for setters
- **Directories**: kebab-case (`daily-planner/`, `age-analysis/`)

### Formatting Utilities

**Currency** (`src/pdf/formatters.ts`):
```ts
formatCurrency(amount: number): string  // → "R 1 234,56"
```
- Strict ZAR format: space thousands separator, comma decimal, `R ` prefix
- MUST NOT use `toLocaleString()` — always use the custom formatter
- The `formatZAR` function in `input/page.tsx` duplicates this logic (hydration-safe version)

**Date** (`src/pdf/formatters.ts`):
```ts
formatDate(date): string  // → "YYYY-MM-DD"
```

**Description** (`src/pdf/formatters.ts`):
```ts
formatDescription(rawDesc): string  // Inserts line break after " TO "
```

**Export helpers** (`src/lib/exports/utils.ts`): `downloadFile` utility for triggering file download from blob.

### Design Tokens / Colors / Typography

**CSS** (`src/app/globals.css`):
- `@theme inline` with `--color-background`, `--color-foreground`, `--font-sans`, `--font-mono`
- Two custom scrollbar utilities: `scrollbar-fleet` (thin dark) and `scrollbar-hidden`
- Dark mode class: `.dark` (never from OS preference)
- Base background: `#f0f4f8` (light), `#0b1220` (dark)
- Font: Geist (sans) via `next/font/google`

**Component-level patterns** (observed throughout):
- Page container: `w-full h-full p-6 space-y-6 overflow-y-auto`
- Cards: `bg-white dark:bg-slate-900/60 rounded-lg border shadow-sm`
- Tables: CSS grid with `grid-cols-[repeat(N,minmax(0,1fr))]`
- Form inputs: `border rounded px-2 py-1 text-sm`
- Buttons: hover effects, status coloring (blue primary, red danger, green success)
- Error/success messages: `text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1`
- Status badges: `inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold`
- Navigation: black nav bar (`bg-black/95`), white text, active link has bottom border
- Admin sub-nav: grouped sections (Fleet vs Finance) with small-caps headers

**Theme**: Default dark. Next-themes injects `.dark` on `<html>`. Light/dark toggle in nav bar.

---

## 6. Known Constraints

### Immutable / Frozen Architecture (per `ARCHITECTURE_LOCK.md`)

The following must NOT be changed without explicit Phase 3+ approval:
- **Sheets table** collapsed summary + chevron expansion pattern
- **Status + Risk** computation (pure functions only, no hooks/mutations)
- **Backend queries** separated by consumer intent (no merging into "god queries")
- **Suspense** only localized, `fallback={null}` unless required
- **Legacy routes** (`/planner`, `/sheets`) must not be removed
- No global state (Redux, Zustand) introduced

### Schema Sensitivity

- **`convex/schema.ts`**: Do not modify without understanding downstream impact. Schema changes require `npx convex push`.
- **`convex/dailyRoutes.ts`**: Contains locked KM calculation priority and auto-complete logic.
- **`convex/trucks.ts`**: `trucks.currentTrailerId` is source of truth for truck-trailer assignments. Do not use `trailerSwaps` for current state.
- **`src/pdf/`**: Absolute positioning only. Never use mm/px or flow layout. Currency must use `formatters.ts`.

### Lint Freeze

- Legacy Convex and Planner files have `no-explicit-any` disabled per-file (see `LINT_FREEZE.md`).
- New code must remain strict and lint-free.
- Lint command: `npm run lint` (ESLint only, no typecheck script).

### Environment

- Convex deployment: `dev:quixotic-gopher-969`
- Env vars: `.env.local` (not committed) with `NEXT_PUBLIC_CONVEX_URL`
- Production build: `npm run build` (verified passing as of 2026-01-23)
- Backend updates: `npm run update-backend` runs `npx convex codegen` + `generateSnapshot.ps1`
- All writes go through Convex mutations/actions — no direct DB access from client

### Other Constraints

- **PDF currency format**: Strict ZAR (`R 1 234,56`) — never use `toLocaleString()`
- **New features only** — no cleanup refactoring without explicit instruction
- **React Compiler** enabled — all components must be compatible
- **No test suite** exists (no test script in package.json)
- **Trailer schema quirk**: One `trailers` document has a `trailers` array (confusing name) representing physical units under a fleet number

---

## Open Questions

1. **Admin auth enforcement**: Where exactly is `verifyAdminPassword` called? The admin layout does not gate pages — is the PIN enforced at the individual page level, or only in settings?
2. **The `/import` route**: A page exists at `src/app/import/page.tsx` with no content. Is this planned or abandoned?
3. **`createBulkDailyRoutes`**: This mutation exists but no UI calls it. Is it intended for future bulk import?
4. **Trailer `trailers` array confusion**: The `trailers` field on the `trailers` table holds physical units, but is named the same as the table. When adding a new import feature, how should we refer to individual physical trailer units to avoid confusion?
5. **Email templates**: `convex/templates/` directory exists but wasn't fully explored — what email templates exist?
6. **Driver photo upload**: Uses Convex storage via action — is this pattern relevant for future import features?
7. **Convex deployment split**: Is there a separate production/staging deployment, or only `dev:quixotic-gopher-969`?
