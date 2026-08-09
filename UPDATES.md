# FleetCore — Project Scope & Updates

> **For AI agents.** This file is the single entry point for understanding the
> complete scope of the FleetCore project and what has changed recently.
> Read it before making any change, then consult the deeper docs it links to.
>
> **Last updated:** 2026-08-09
>
> **Related docs:**
> - `README.md` — project philosophy & locked-baseline statement
> - `PROJECT_CONTEXT.md` — full architecture reference (schema, modules, routes)
> - `ARCHITECTURE_LOCK.md` — frozen architectural decisions (do not casually refactor)
> - `AGENTS.md` — agent instructions (tech stack, commands, theme quick-reference)
> - `LINT_FREEZE.md` — lint exemption policy for legacy files
> - `CEO_DASHBOARD_GUIDE.md` — CEO dashboard documentation
> - `docs/THEME_TOKENS.md` — all CSS design tokens & utility classes
> - `docs/APP_STRUCTURE.md` — detailed application structure
> - `src/pdf/README.md` — PDF invoice layout rules
> - `convex/__analysis__/trailerSwapAnalysis.md` — trailer-swap source-of-truth audit

---

## 1. Project Snapshot

| | |
|---|---|
| **Project** | FleetCore — production fleet operations system |
| **Status** | Locked baseline (as of 2026-01-23); feature-driven work since |
| **Stack** | Next.js 16 (App Router) · React 19 · TypeScript strict · Tailwind v4 · Convex |
| **Convex deployment** | `dev:quixotic-gopher-969` |
| **Auth** | Custom email + password (bcryptjs), session-token based, admin/regional roles |
| **Audience** | Desktop web app + mobile PWA (Android "app" via TWA-style shell) |

FleetCore is a **production fleet operations system**: daily route planning,
load management, fleet master data (trucks/trailers/drivers), subcontractors,
invoices (PDF), email reporting, expiry/renewal tracking, multi-region
scoping, driver birthdays, and a CEO analytics dashboard.

---

## 2. Complete Project Scope

### 2.1 Tech Stack

| Layer | Technology | Notes |
|---|---|---|
| Framework | Next.js 16.1.7 | App Router only, Turbopack |
| Language | TypeScript 5 (strict) | `@/*` path alias → project root |
| Frontend | React 19.2.3 | React Compiler enabled (`babel-plugin-react-compiler`) |
| Styling | Tailwind CSS v4 | CSS-first config via `@theme inline` in `src/app/globals.css` |
| Backend/DB | Convex ^1.31.7 | Queries/mutations/actions, schema in `convex/schema.ts` |
| State | Convex only | No Redux/Zustand; local state = React `useState` |
| Auth | bcryptjs 3 | Custom session tokens (30-day, multi-device) |
| PDF | jsPDF 4 + jspdf-autotable 5 | Absolute positioning only (see `src/pdf/README.md`) |
| Email | Resend 6.8 | Via Convex actions (`convex/emails.ts`) |
| Spreadsheets | exceljs 4.4, xlsx 0.18 | Imports & exports |
| Charts | recharts 3.7 | Dashboard |
| Theme | next-themes 0.4.6 | Default dark; `.dark` class on `<html>` |
| Icons | lucide-react, @heroicons/react | |
| PWA | Custom `public/sw.js` | Versioned cache (`fleetcore-vN`), push via `web-push` |
| Tests | vitest 4 | `npm test` (e.g. `convex/birthdays.test.ts`, `convex/utils.test.ts`) |

### 2.2 Repository Layout

```
fleetcor/
├── convex/                 # Backend — schema, queries, mutations, actions
│   ├── _generated/         # Auto-generated Convex types (npx convex codegen)
│   ├── __analysis__/       # Architecture audits (trailerSwapAnalysis.md)
│   ├── templates/          # Email templates (TransportReport.ts)
│   ├── schema.ts           # Database schema — single source of truth
│   ├── utils.ts            # Shared helpers (calculateLoadAmount)
│   └── *.ts                # One module per domain (see §2.5)
├── src/
│   ├── app/                # Next.js App Router pages (§2.3)
│   ├── components/         # React components (§2.6)
│   ├── lib/exports/        # exportCSV / exportExcelWithTemplate / exportJSON / exportPDF
│   ├── pdf/                # Invoice PDF builder (invoiceBuilder, invoiceTemplate, formatters)
│   ├── types/              # Shared TS types (sheetExport.ts)
│   └── hooks/              # useIsMobile, useBirthdays, useKpiFilter, design-tokens
├── scripts/                # PowerShell / Python / mjs dev utilities
├── docs/                   # APP_STRUCTURE.md, THEME_TOKENS.md
├── public/                 # sw.js, manifest.webmanifest, templates/, icons
├── AGENTS.md / ARCHITECTURE_LOCK.md / LINT_FREEZE.md / PROJECT_CONTEXT.md / UPDATES.md
└── package.json
```

### 2.3 Routing Map

| Route | Purpose |
|---|---|
| `/` | Redirects to `/dashboard` |
| `/login` | Sign-in screen (email + password) |
| `/dashboard` | CEO analytics dashboard (KPIs, revenue, loads, drill-down panels) |
| `/all-regions` | Admin cross-region table (Region column, date selector, R/KM aggregate) |
| `/calendar` | Driver birthday calendar (WhatsApp wishes) |
| `/operations` | Redirects to `/operations/daily-planner/input` |
| `/operations/daily-planner/input` | Route creation wizard (canonical route form) |
| `/operations/daily-planner/sheets` | Sheets view (collapsed summary rows + chevron expansion; loads imported via an `ImportLoadsModal` — not a separate route) |
| `/operations/daily-planner/edit/[routeId]` | Route edit page |
| `/operations/combinations` | Truck–trailer combination management |
| `/operations/fuel` | Fuel tracking |
| `/operations/quicksend` | QuickSend email report |
| `/operations/swaps/history` | Trailer swap history |
| `/operations/swaps/trailers` | Current trailer assignments |
| `/admin` | Admin dashboard (link grid) |
| `/admin/trucks` · `/admin/trailers` · `/admin/drivers` | Fleet master-data CRUD |
| `/admin/subcontractors` | Subcontractor CRUD |
| `/admin/users` | User management (admin-only) |
| `/admin/fleet-import` | Fleet bulk import |
| `/settings` | App settings (incl. change password, push, sessions) |
| `/import` | JSON import page (drivers/trucks/trailers) |
| `/planner`, `/sheets` | Declared legacy by `ARCHITECTURE_LOCK` (must not be reintroduced as new canonical routes) — **no such route files exist in the current codebase** |

**Mobile (PWA) restriction:** On phones (<768px) the app is limited to
Dashboard, Input, Edit, Sheets, Swaps history/trailers, and Calendar
(`MOBILE_ALLOWED_PATHS` in `src/components/auth/AppShell.tsx`); every other
route redirects to Dashboard.

### 2.4 Database Schema (convex/schema.ts)

Full field-by-field reference in `PROJECT_CONTEXT.md` §5. Highlights:

- **`dailyRoutes`** — core table. `routeDate` (YYYY-MM-DD), `region`
  (`"garden_route"` | `"eastern_cape"`), `loads[]` (client, from/to locations,
  quantity/quantityType, rate/rateType, subcontractor rates), `kilometers`,
  `status` (planned/completed/locked), string fleet references
  (`truckFleetNoStr`, `trailerFleetNoStr`), optional `subcontractorId`, `legs[]`.
  Indexes: `by_routeDate`, `by_routeDate_truckFleetNoStr`.
- **`trucks`** — `truckFleetNo`, `currentTrailerId` (**source of truth** for the
  current truck–trailer combo), license/service expiry fields, `subcontractorId`,
  `subStatus`.
- **`trailers`** — `trailerFleetNoStr`, `type`, `trailers[]` array of physical
  units (⚠ confusing name — one doc = one fleet number).
- **`drivers`** — `driverName`, `idNumber` (SA ID — used to derive birthdays),
  `licenseExpiryDate`, `pdpExpiryDate`, `subcontractorId`, `subStatus`.
- **Financial** — `invoices`, `invoiceCounter`.
- **Master data** — `customers`, `subcontractors`.
- **Auth/sessions** — `users` (email, bcrypt hash, role `admin`/`regional`,
  region), `sessions` (one per device, 30-day expiry, max 5 per user).
- **Ops** — `dailyAvailability`, `damageLogs`, `tasks` (+ resolutions/snoozes),
  `attachments`, `fleetSetupBaseline`, `fleetSetupStatus`, `myDaySelections`.
- **Renewals/PDP** — `truckRenewals`/`Logs`, `trailerRenewals`/`Logs`,
  `trailerSwaps` (historical events only), `pdpApplications`, `pdpApplicationLogs`.
- **PWA/birthdays** — `webPushSubscriptions`,
  `dismissedBirthdayAlerts` (per user/driver/year).
- **Settings** — `adminSettings` (legacy PIN; superseded by `users`),
  `appSettings`, `clientDisplaySettings`, `recipients`.

> Removed in earlier revisions (do not write code against): `payments`,
> `paymentAllocations`, `ageSnapshots`, `ageSnapshotRows`, `notifications`.

### 2.5 Convex Backend Modules

| Module | Responsibility |
|---|---|
| `dailyRoutes.ts` | Core route CRUD, auto-complete logic, KM calc, region scoping, bulk create, sheets + QuickSend + email queries |
| `dashboard.ts` | CEO analytics queries (executive summary, revenue over time/by truck, customer analytics, fleet performance) |
| `fleet.ts` | Admin CRUD for trucks/trailers/drivers with subcontractor filtering |
| `subcontractors.ts` | Subcontractor CRUD + stats |
| `customers.ts` | Customer CRUD + search + duplicate detection |
| `users.ts` | Login action, user management (admin-only), change password, seedAdmin |
| `userSessions.ts` | Sessions CRUD, `resolveUserScope`, `resolveEffectiveRegion`, `scopedRegion` (shared by route queries) |
| `birthdays.ts` | Upcoming birthdays from SA ID numbers, dismiss/restore (pure helpers unit-tested) |
| `webPush.ts` + `webPushSubscriptions.ts` | PWA push subscriptions + daily dispatch |
| `notifications.ts` + `crons.ts` | PDP stage/expiry reminders, daily web-push dispatch |
| `invoices.ts` | Invoice generation (PDF + storage) |
| `emails.ts` / `emailTemplates.ts` / `recipients.ts` / `templates/TransportReport.ts` | Resend email delivery |
| `trucks.ts` / `trailers.ts` / `drivers.ts` | Trailer assignment, trailer queries, expiry queries |
| `trailerSwaps.ts` | Swap history CRUD |
| `truckRenewals.ts` / `trailerRenewals.ts` | Renewal workflows + audit logs |
| `pdp.ts` / `pdpReport.ts` | PDP application lifecycle + report |
| `dailyAvailability.ts` / `dailyOps.ts` | Availability CRUD / daily ops snapshot |
| `damageLogs.ts` / `tasks.ts` / `attachments.ts` | Damage, tasks, file uploads |
| `dataImport.ts` / `fleetImport.ts` | Bulk import mutations (drivers/trucks/trailers) |
| `settings.ts` / `adminSettings.ts` / `displaySettings.ts` | App + admin + per-client settings |
| `myDay.ts` | My Day selection tracking |
| `health.ts` / `http.ts` | Health check + HTTP actions |
| `migrations.ts` / `seed.ts` / `backfillStatus.ts` / `backfillRegion.ts` / `resetFlags.ts` / `cleanup_*.ts` | Ops utilities |
| `ai.ts` | Ollama-based AI analysis (Strategic Insights) |

### 2.6 Frontend Components

- **`src/components/common/`** — `Toast`, `ConfirmDialog`, `ModalShell` (+
  `SlideInPanel`), `EmptyState`, `Pagination`, `Skeleton`, `WarningIcon`,
  `useKeyboardShortcut`.
- **`src/components/auth/`** — `AuthProvider` (session token in localStorage,
  `useRegionArg` helper), `AppShell` (route guard + mobile path restriction).
- **`src/components/dashboard/`** — `BirthdaysCard` (all other dashboard
  widgets render inline in `src/app/dashboard/page.tsx`; the old
  `DashboardCard.tsx`, `ceo/TrendIcon.tsx`, and `operations/*` files were
  removed as dead code 2026-08-08).
- **`src/components/operations/daily-planner/`** — `EditRouteForm`,
  `MobileSheetsView`, `SpreadsheetDataTable` (resizable/sortable/persisted
  layout, includes **R / KM** column), `WizardRouteHeader`.
- **`src/components/operations/invoice/`** — `InvoiceDeliveryPanel` +
  `invoiceEscape.ts` (unit-tested escape logic).
- **Misc** — `Navigation` (sidebar), `MobileTabBar`, `PwaInstaller`,
  `PushNotificationSettings`, `BirthdayBell`, `SwapsViewToggle`, `RouteForm`
  (legacy), `EmailReportModal`, `WorkspaceSplit`, providers, `AmbientBackground`.

---

## 3. Auth & Multi-Region System (important!)

The app moved from a single PIN gate to **full user accounts with region scoping**.

- **Login flow:** `users.login` action (bcrypt compare) creates a `sessions` row;
  token stored in `localStorage` (`fleetcore-session-token`); `AuthProvider` →
  `userSessions.getSessionUser` restores the user.
- **Roles:** `admin` (sees everything, can override region via switcher) and
  `regional` (hard-locked to their own region — **never** trusted from client).
- **Server-side enforcement:** dailyRoutes reads resolve scope via
  `resolveUserScope(ctx, token)` / `resolveEffectiveRegion(...)`; a regional
  user's queries are filtered server-side, and new routes are stamped with the
  user's region.
- **Multi-device sessions:** each login appends a session (max 5 per user);
  logout is per-device. Admin Users page lists users + live-session count;
  Settings shows "My devices" with remote sign-out.
- **Guards:** cannot demote/delete the last admin; cannot change your own role;
  own password changes go through Settings (`users.changePassword`).

---

## 4. PWA / Mobile

- `public/sw.js` with versioned cache `fleetcore-vN` (currently v30); on update,
  open app windows are force-reloaded. Bump the `CACHE_NAME` on every deploy
  that changes bundles.
- `public/manifest.webmanifest` (no forced orientation — respects auto-rotate).
- `PwaInstaller` (install prompt), `PushNotificationSettings`, `web-push`
  subscriptions with daily dispatch cron.
- Mobile UI: bottom tab bar (`MobileTabBar`), compact sheets cards
  (`MobileSheetsView`), solid backgrounds for panels/modals on phones.

---

## 5. Key Conventions & Locked Decisions

1. **Sheets table**: collapsed summary rows + chevron expansion (locked).
2. **Status + Risk**: computed pure functions, never user-entered. Priority:
   Incomplete > Missing KM > Multi-drop > Multi-pick > Finalized > Clean.
3. **Backend queries separated by consumer intent** (UI / reporting / email /
   QuickSend) — do not merge into god queries.
4. **Trailer swaps**: current combo lives in `trucks.currentTrailerId`;
   `trailerSwaps` stores history only.
5. **Theme tokens**: use CSS vars (`--foreground`, `--card-bg`,
   `--card-border`, `--nav-text-color`) — **never** `text-gray-*`, `bg-white`,
   `dark:bg-*` etc. Semantic status badges stay hardcoded. See
   `docs/THEME_TOKENS.md`.
6. **PDF**: absolute positioning only, fixed Y zones, ZAR currency
   (`R 1 234,56`) via `src/pdf/formatters.ts` — never `toLocaleString()`.
7. **Lint freeze**: legacy Convex/Planner files may carry `eslint-disable`;
   **new code must be strict and lint-free**.
8. **Currency math**: load amount = `calculateLoadAmount(qty, rate, rateType)`
   from `convex/utils.ts` (flat/full → rate, else qty × rate). R/KM =
   route revenue ÷ kilometres (route-level rate when route has no loads).
9. **Suspense**: localized only, `fallback={null}` unless required.
10. **Mobile**: 44px touch targets, `useIsMobile`/`md:` breakpoint (767px),
    phone panels use `bg-[var(--background)]` (solid, not translucent).

---

## 6. Commands & Environment

```bash
npm run dev            # Next.js dev server
npm run build          # Production build
npm run lint           # ESLint only (no typecheck script)
npm test               # Vitest unit tests
npm run update-backend # convex codegen + snapshot script (PowerShell)
npx convex push        # Push Convex functions to deployment
npx convex codegen     # Regenerate convex/_generated/ types
```

- Env vars (`.env.local`, not committed): `NEXT_PUBLIC_CONVEX_URL`,
  `RESEND_API_KEY`.
- Convex deployment: `dev:quixotic-gopher-969`.
- Seed/audit scripts in `scripts/` (`seed-admin.mjs`, `seed-regional.mjs`,
  `check-*.mjs`, `verify-mobile.mjs`, etc.).

---

## 7. Recent Updates (changelog)

> Chronological, most recent first. Also see `git log --oneline`.

### 2026-08 (current work — some uncommitted)
- **All Regions: edit region from the table** — the Region column badge is now
  an inline dropdown (Garden Route / Eastern Cape / Unassigned). Clicking a
  badge opens a fixed-position menu (flips above the row near the bottom of
  the screen) and saves instantly via a new admin-only `updateRouteRegion`
  mutation; failures surface as a toast. Routes show as "— assign" until a
  region is set, and the region-split pills update live.
- **Mobile sheets minimize view** — new Minimize button on the mobile sheets
  screen collapses the sort/filter toolbar, the FleetCore top bar and the
  bottom tab bar so only the route cards remain; a floating Restore pill
  brings them back, and the state resets automatically when leaving the screen.
- **Floating restore pill** — the sheets minimize Restore button is now
  draggable so the user can place it anywhere on screen; position persists in
  localStorage and is re-clamped on resize/rotation.
- **Pull-to-refresh disabled** — dragging down at the top of a screen used
  to reload the page and reset every drill-down/filter/panel the user had
  open (they had to navigate back down to their data). `overscroll-behavior:
  none` on html/body + `overscroll-y-contain` on the app scroller kill it in
  Chrome; a document-level touch guard (scrollable-ancestor check, cached per
  gesture) covers the rest. Scrolling itself is unaffected.
- **Mobile dashboard layout** — sections reordered on phones so the period KPIs
  come first and Birthdays move to the bottom (KPIs → Revenue by Day → Top
  Clients → Month comparison → Birthdays); tighter mobile spacing, compact
  filter-bar tabs, smaller mobile title, and the Completion KPI card now spans
  the full row instead of dangling at half width. Desktop layout unchanged.
- **Mobile dashboard: no more scrolling** — replaced the stacked, scrollable
  phone layout with a top tab bar (KPIs | Revenue | Clients | Compare |
  Birthdays) that shows one section at a time, so the whole dashboard fits the
  viewport without scrolling. Each section was compacted on mobile (KPI cards,
  collapsible headers, filter tabs, revenue rows, Top Clients capped at 5,
  month selectors + metric cards + a shorter 115px chart). The Revenue list
  keeps an internal `max-h` so a full month of days can't push the page to
  scroll. Desktop (lg+) renders all sections stacked exactly as before.
- **Dashboard tab bar icons** — each tab now shows a lucide icon above its label
  (KPIs `LayoutGrid`, Revenue `TrendingUp`, Clients `Users`, Compare
  `GitCompareArrows`, Birthdays `Cake`), matching the app's bottom-tab-bar style;
  still fits the 375px viewport with zero scroll on every tab.
- **Sheets: table-only mode** — replaced the fullscreen "Focus Mode" feature
  with a table-only toggle. The header icon button (and the toolbar's "Table
  only" button) hide the filter/sort chrome (sticky header, toolbar, filter
  pills, KPI summary, clear-filters bar) so only the spreadsheet table is
  visible. A floating teal **Restore** pill brings the controls back — it is
  draggable anywhere on the screen and its position persists in localStorage
  (`fleetcore-sheets-restore-pos`), matching the mobile sheets minimize/restore
  UX. `Esc` also restores. Fullscreen mode (fixed viewport overlay, Focus Mode
  title/badge, exit bar) was removed entirely.
- **Mobile input: route details open by default** — the "Route details"
  section on the New Route / Edit Route screen (mobile) no longer starts
  collapsed; the truck/driver/date fields are visible immediately (the collapse
  toggle is still available).
- **SW cache** bumped to `fleetcore-v30`.
- **Dead dashboard components removed** — `src/components/dashboard/DashboardCard.tsx`,
  `operations/*` (`DrillDownPanel`, `EditRouteModal`, `KpiCard`, `LoadsTab`,
  `RevenueTab`), and `ceo/TrendIcon.tsx` had zero imports (the dashboard page
  renders all widgets inline) and were deleted; docs updated.
- **R / KM column** added to the sheets `SpreadsheetDataTable` (with persisted
  column-order merge + one-time "new column" onboarding hint), mobile route
  cards show an R/KM badge, and the `/all-regions` page gained a weighted R/KM
  summary stat. Route revenue now falls back to the route-level `rate` when a
  route has no loads (matching across desktop, mobile, and all-regions).
- **Daily planner split-pane resizer** switched from mouse to pointer events
  with capture + blur/visibility safety nets (drag can no longer stick).
- **Invoice PDF button** shows "Generating…" disabled state while building.
- **Solid modal/panel backgrounds** (`bg-[var(--background)]` instead of
  translucent `--card-bg`) across sheets detail panel, confirm dialogs, import
  modal, drill-down/edit-route panels, ModalShell, RevenueTab confirm.
- **Mobile compaction** — dashboard collapsible sections + compact drilldown
  KPIs, swaps history/trailers cards, input load cards, h-11 form fields,
  compact sheets route cards, h-9 toolbar, icon-only filter/sort on phones.
- **SW cache** bumped to `fleetcore-v22`.

### Earlier 2026
- **Region scoping (Stages 3–5):** server-enforced regional locks on all
  `dailyRoutes` reads + `region` on route forms; admin region switcher;
  `/all-regions` admin page; region-aware load imports (All Regions blocked);
  email report region scoping.
- **Auth system:** user management page (create/edit/reset/delete, admin-only),
  change-password in Settings, multi-device sessions table, session-expiry
  enforcement, admin seed password rotation.
- **Driver birthdays:** birthdate derived from SA ID (`getBirthdayFromSAID`,
  unit-tested), notification bell + dismissible dashboard card (per-user, per
  year, restorable), `/calendar` page with WhatsApp wishes, ages shown.
- **PWA hardening:** versioned SW cache, force-reload on update, no forced
  orientation, mobile 4-screen app (Dashboard/Input/Swaps/Sheets + Calendar),
  web-push daily dispatch cron.
- **QuickSend:** empty/inverted date-range guards.
- **Mobile redesigns:** sheets day-grouped cards + search/filters + date nav +
  tappable route detail/edit; route-detail panel restructure (fade-in, stacked
  mobile actions, compact gauge/invoice cards); input screen save-bar pinned on
  mobile.
- **Sheets polish:** compact route cards, client+route merged line, slimmer
  meta bar.

### Baseline (locked 2026-01-23)
- See `README.md` + `PROJECT_CONTEXT.md` §15 for the pre-lock history
  (skeletons, empty states, keyboard shortcuts, modals, toasts, pagination,
  subcontractors Phase 1, etc.).

---

## 8. Working-Tree State (uncommitted as of this writing)

If `git status` shows modified/untracked files, they are typically the current
feature batch (see "2026-08 current work" above). New untracked files include
`src/components/operations/invoice/invoiceEscape.ts` (+ its vitest test).
Always check `git status`/`git diff` before assuming the repo matches this
document.

---

## 9. AI Agent Checklist (before making changes)

1. Read `AGENTS.md` + `ARCHITECTURE_LOCK.md` — respect the locks.
2. Confirm current state with `git status` / `git diff`.
3. For UI: use theme tokens from `docs/THEME_TOKENS.md`, glass utilities, teal
   accent patterns. New code must be lint-clean (no `any`).
4. For routes data: respect region scoping (`resolveEffectiveRegion`) and keep
   queries consumer-intent-separated.
5. For currency: `calculateLoadAmount` + ZAR formatters; never `toLocaleString()`.
6. For PDF: absolute positioning only, fixed zones (see `src/pdf/README.md`).
7. After changes: `npm run lint`, `npm test`, and `npm run build`.
8. Update this file's changelog + snapshot date when you land a meaningful change.
