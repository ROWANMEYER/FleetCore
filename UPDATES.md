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
Dashboard, Input, Edit, Sheets, Admin (admins only), and Calendar — the
Swaps history/trailers screens stay reachable by URL but no longer have a tab
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

- `public/sw.js` with versioned cache `fleetcore-vN` (currently v35); on update,
  open app windows are force-reloaded. Bump the `CACHE_NAME` on every deploy
  that changes bundles.
- `public/manifest.webmanifest` (no forced orientation — respects auto-rotate).
- `PwaInstaller` (install prompt), `PushNotificationSettings`, `web-push`
  subscriptions with daily dispatch cron.
- Mobile UI: bottom tab bar (`MobileTabBar` — Dashboard/Input/Admin/Sheets;
  Admin is admin-only and highlights on every `/admin/*` subpage), compact
  sheets cards (`MobileSheetsView`), solid backgrounds for panels/modals on
  phones.

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
- **Dashboard KPI cards: hover tilt for consistency** — the cursor-tracking
  tilt from the admin flip cards is now a shared `src/hooks/useTilt.ts`
  hook and applies to every KPI card in the app: the dashboard's five
  main period KPIs (Revenue / Routes / Loads / Total KM / Completion,
  `KpiCard` in `src/app/dashboard/page.tsx`) and the shared
  `AnalyticsKpiCard` (dashboard analytics panel + sheets route-analytics
  panel — same component, so the tilt follows everywhere it appears). Same
  6° face-toward-cursor tilt, 200ms ease, prefers-reduced-motion and
  coarse-pointer guards (desktop-only), `data-tilt` marker on all three
  consumers (flip-card root, KpiCard, AnalyticsKpiCard) for audits.
  `FlipCard` now reuses the hook — behavior unchanged.
  `public/sw.js` → `fleetcore-v63`. Backend (incl. the trailer maintenance
  fields in `convex/fleet.ts`) deployed to the **production** deployment
  `dependable-quail-107` (2026-08-12, `npx convex deploy`); additive only —
  no indexes deleted, two new `sessions` indexes added.
- **Flip cards: hover 3D tilt** — every admin card now tilts a few degrees
  toward the cursor on hover (max 6°, tracking mouse position) as a subtle
  "tap me" affordance that invites the flip. The tilt lives on its own
  wrapper in `src/components/common/FlipCard.tsx` with a snappy 200ms
  transition, so it never fights the 500ms flip spin; it's zeroed while
  the card is flipped, skipped when `prefers-reduced-motion` is set, and
  touch devices are unaffected (no hover). Desktop-only by nature.
  `public/sw.js` → `fleetcore-v62`.
- **Flip hint is a one-time discoverability affordance** — the "Tap to
  flip" pill on every admin card now disappears once the user has flipped
  any card: `FlipCard` marks a shared `fleetcore-flip-hint-dismissed`
  localStorage flag on the first toggle, every mounted hint fades out over
  500ms (custom `fleetcore:flip-hint-dismissed` event), and the pill never
  renders again on that browser (all pages share one flag — no repeat
  hints on trucks/trailers/drivers/subs/users). New
  `src/lib/flipHint.ts` (localStorage helpers + `useFlipHint` hook);
  `FlipHint` renders nothing once dismissed. `public/sw.js` →
  `fleetcore-v61`.
- **Flip hints + audits for all admin cards** — Subcontractors and Users
  cards now carry the same `data-face="front"` / `data-face="back"`
  markers and a "Tap to flip" hint as the Trucks/Trailers/Drivers cards:
  `FlipHint` gained an `inline` variant (static chip) for text-based cards
  — Subcontractors show it in the top row beside the actions, Users rows
  swap their lone flip icon for the full pill. `verify-fleet-flip.mjs` now
  covers all four pages: the PAGES table gained per-page flags
  (frontEdit/frontActivate/frontDelete — Users keeps its actions on the
  back face, so those checks are skipped there) and a `backActions` suite
  that verifies the back-panel buttons (Edit user / Reset password /
  Delete user) exist and that opening the Reset-password modal doesn't
  unflip the card. `public/sw.js` → `fleetcore-v60`.
- **Flip hint on image-first cards** — a small "Tap to flip" pill (flip
  icon + label, `pointer-events-none`) now sits in the top-left corner of
  every Trucks / Trailers / Drivers card image area so users discover the
  Licence & Service / details back panel. Reusable
  `src/components/admin/FlipHint.tsx`, rendered inside `AssetImage`
  (trucks + trailers) and over the `DriverAvatar` banner (drivers); it
  never intercepts clicks, so tapping anywhere on the card still flips.
  `public/sw.js` → `fleetcore-v59`.
- **Admin cards: image-first redesign** — the Trucks, Trailers and Drivers
  cards are now image-dominant: a big photo/vehicle panel (flex-fills the
  card, so it's "as big as the card allows") sits on top, and the bottom
  row carries fleet number (or driver name/phone) + owner/status badges +
  the Edit / Activate-Deactivate / Delete buttons (all stopPropagation).
  Trucks and Trailers use a new shared `src/components/admin/AssetImage.tsx`
  — a large vehicle icon (Truck / Container) on a themed gradient with a
  caption overlay (registration · make/model, or type · unit count); it
  already accepts a `photoUrl` so a real vehicle photo can slot in later
  without a layout change. Drivers use a new `banner` variant of
  `DriverAvatar` that fills the card: photo (or huge initials) with the
  `#driverId` caption and the camera/remove overlay on the panel
  (buttons now stopPropagation so they never flip the card). The trailer
  card keeps its per-unit component strip (length/registration + per-unit
  Edit/Delete) under the image. Card faces now carry `data-face="front"` /
  `data-face="back"`, and both flip audits
  (`verify-driver-flip.mjs`, `verify-fleet-flip.mjs`) assert the visible
  face via `elementFromPoint` + `data-face` instead of text heuristics
  (icon/photo centres have no text). `FlipCard`'s inner wrapper is now
  `h-full` so cards in a grid row stretch to equal height and the image
  absorbs the difference. `public/sw.js` → `fleetcore-v58`.
- **Fleet flip-card audit script** — new `scripts/verify-fleet-flip.mjs` runs
  the same headless-Chrome checks as `verify-driver-flip.mjs` against both
  Admin → Trucks and Admin → Trailers: flip to back (Licence & Service
  panel topmost), flip back to front, only-one-card-flipped-at-a-time,
  Edit/Delete open the form/dialog without flipping, keyboard Enter on an
  inner button doesn't flip, and zero console errors. Page-specific strings
  (back-panel markers, delete-dialog text) are parameterized in a `PAGES`
  table. Usage: `node scripts/verify-fleet-flip.mjs [url]` (supports
  `AUDIT_URL` / `AUDIT_MOBILE=1`; exits non-zero on failure for CI).
- **Admin flip cards everywhere** — the 3D rotate animation from Admin →
  Drivers is now on every card in the admin area. Trucks: front shows
  fleet no/registration/make/model/badges, back shows "Licence & Service"
  (licence expiry, service due with Expired/Due-soon badges, current KM,
  last renewal, member since). Trailers: same back panel (licence expiry,
  service due, current KM, last renewal) via new maintenance fields added
  to `convex/fleet.ts getTrailers` flat rows; component Edit/Delete buttons
  stopPropagation. Subcontractors: front keeps identity/contact/badges and
  the expandable vehicles list, back shows the per-sub Financial Summary
  (routes, customer revenue, sub cost, margin, member since); the expand
  toggle no longer flips the card. Users: rows now flip — front is
  identity/role/region/signed-in status, back reveals the account actions
  (Edit, Reset password, Delete) so admins tap to flip before acting.
  All action buttons call stopPropagation so they never trigger the flip.
  `public/sw.js` → `fleetcore-v57`; Convex functions pushed to the dev
  deployment.
- **Drivers: 3D flip cards** — tapping an Admin → Drivers card spins it
  180° (perspective 3D, 500ms) to reveal a back panel with the driver's
  licence expiry, PDP expiry (red "Expired"/amber "Due soon" badges when
  relevant), birthday derived from the SA ID number, and member-since
  date; tapping again spins back to the front. Only one card is flipped
  at a time, and the Edit / Deactivate / Delete buttons no longer trigger
  the flip (stopPropagation). New reusable
  `src/components/common/FlipCard.tsx` + client-safe
  `getBirthdayFromSAID` in `src/lib/birthdays.ts`. New
  `scripts/verify-driver-flip.mjs` headless audit (12 checks, passed:
  flip to back, back on top, flip to front, single-flip, edit/delete
  don't flip, zero console errors). `public/sw.js` → `fleetcore-v56`.
- **Photo upload: HEIC/HEIF support + 50MB cap** — iPhone/Android
  "high efficiency" photos are now converted client-side (on-demand
  `heic2any` WASM, only loaded when needed) and upload like any JPEG;
  decoding uses `createImageBitmap` so EXIF orientation is respected
  automatically. The pre-downscale sanity cap is raised 15MB → 50MB
  (photos are re-encoded to ≤900px JPEG before hitting the backend, so
  payloads stay ~100KB), and the image-type check no longer rejects
  empty-MIME HEIC picks (some pickers report them with no type).
  Unsupported formats get a clear "please save it as a JPEG or PNG"
  toast instead of a generic failure. New
  `scripts/verify-driver-upload.mjs` (headless end-to-end: a real HEIC
  converts + uploads, a 23MB JPEG uploads past the old 15MB cap, and a
  fake image surfaces the friendly error toast). `public/sw.js` bumped
  to `fleetcore-v55` so installed PWA clients pick up the new bundle.
  Verified in browser: zero console errors; stored images are 900px max.
- **Photo upload: stale 5MB limit fixed everywhere** — the client-side
  downscaling fix was merged, but the PWA service worker cache still served
  the old bundle (`fleetcore-v53`), so installed clients kept hitting the
  old "max 5MB" check. Bumped `public/sw.js` to `fleetcore-v54` (per the
  repo's bump-on-every-bundle-deploy rule) and raised the backend safety
  net in `fleet.uploadDriverPhoto` from 5MB to 10MB (downscaled uploads are
  ~100KB, so it never fires for the new client).
- **Drivers: photo placeholder + upload/remove** — each Admin → Drivers card
  now shows a round driver avatar: the driver's photo when `drivers.photoUrl`
  is set, otherwise a deterministic initials placeholder (stable gradient per
  driver). A camera button on the avatar opens a file picker and uploads via
  the `fleet.uploadDriverPhoto` action (base64 → Convex storage, image-type
  check); once a photo is set a trash button calls `fleet.removeDriverPhoto`.
  New `src/components/admin/DriverAvatar.tsx`.
- **Drivers: photo upload fix (client-side downscaling)** — real camera
  photos (multi-MB) previously failed with "Could not read the file":
  `readAsDataURL` on a huge file hits memory limits on phones, and the full
  base64 also blows past Convex's action-arg size cap. The upload now
  decodes via object URL + canvas and re-encodes to a ≤900px JPEG (q0.85)
  on a white backdrop (no black boxes for transparent PNGs), so any photo
  uploads as a small payload. Sanity cap 15MB before downscaling;
  non-decodable formats (e.g. HEIC on some browsers) get a clear "use a
  JPEG or PNG" toast instead of a generic failure. Verified with an 11.6MB
  4000x3000 JPEG: uploads fine, stored at 900x675.
- **Admin: hamburger bar removed + compact single-row KPIs** — the admin
  section-nav header (with the mobile hamburger + dropdown) is now
  desktop-only (`hidden md:block` in `src/app/admin/layout.tsx`); on phones
  admins navigate via the /admin hub cards and the bottom Admin tab. The
  Total / Active / Inactive KPI cards on the trucks, trailers, drivers,
  subcontractors and fleet-import pages are now one compact row
  (`grid grid-cols-3 max-w-sm`, smaller padding, `text-xl` numbers, truncated
  labels) instead of wrapping.
  New `scripts/verify-admin-mobile.mjs` audit covers this.
- **Mobile: refresh page button** — the mobile top bar gains a refresh
  button (RefreshCw icon, next to the region switcher / theme toggle). PWA
  users have no browser refresh, so tapping it spins the icon briefly for
  feedback, then does a full `window.location.reload()` so every screen
  re-fetches fresh data. Mobile top bar only, per request.
- **Mobile: Swaps tab replaced with an admin-only Admin tab** — the mobile
  bottom tab bar drops the Swaps tab and gains an Admin tab (`/admin`, Shield
  icon) that stays highlighted on every `/admin/*` subpage. Regional users see
  the three core tabs (Dashboard/Input/Sheets); admins get the fourth Admin
  tab. `/admin` joins `MOBILE_ALLOWED_PATHS` in `AppShell.tsx` so the admin
  screens are reachable on phones; the Swaps history/trailers screens remain
  URL-reachable but are no longer tabbed on mobile.
  `scripts/verify-mobile.mjs` updated (tab expectations now Dashboard/Input/
  Admin/Sheets; `/admin/trucks` is now an allowed mobile page).
- **Mobile input: banner removed + subcontractor summary** — the sticky
  "New Route / Create and manage your fleet routes" header is hidden below the
  `lg` breakpoint so the mobile form starts right under the app top bar.
  The mobile "Route details" collapse bar now shows the selected
  subcontractor's company name in its summary line when in subcontractor mode
  (instead of the meaningless truck number): collapsed shows
  `POOL VERVOER · Driver · Date`, expanded shows `Date · Sub: NAME · Driver`.
  Anti-overlap hardening: the collapse-bar title truncates (`truncate min-w-0`)
  and the "● fields missing" badge is `shrink-0`, so a long subcontractor name
  or the badge can never wrap or push into the Edit/Collapse control (bar
  height stays 78px; previously the badge could wrap and stretch it to 98px).
  In subcontractor mode the missing-fields badge now keys off the subcontractor
  selection instead of the truck.
- **Modal focus fix (ModalShell / SlideInPanel)** — modals no longer steal
  focus from inputs on every keystroke. The effect that focuses the modal
  container on open depended on `[open, onClose]`, and parent pages pass a
  fresh `onClose` closure on each render — so typing one character re-rendered
  the parent, re-ran the effect, and yanked the caret out of the field (the
  admin Reset password modal needed a re-click per character). `onClose` now
  lives in a ref (kept fresh in a no-deps effect) and the focus effect depends
  only on `open`.
- **Import loads: duplicate detection** — exact-load duplicates (same date +
  truck + trailer + client + amount, normalized) are detected and skipped. The
  import preview flags duplicate rows with an amber badge + row tint, adds a
  Duplicates summary card and a warning banner, and excludes them from the
  valid count/import. `createBulkDailyRoutes` is the authoritative guard: it
  fingerprints existing loads per imported date (and fresh rows within the
  same paste) and skips collisions, returning `{ created, skipped }`; the
  success toast reports "Imported X, skipped Y duplicate(s)". Shared
  `loadFingerprint` helper in `convex/utils.ts` keeps preview and backend in
  sync.
- **All Regions: month stepper + clickable KPI filters** — the native month
  input becomes a ‹ label › stepper (same as the dashboard; UTC-safe month
  arithmetic so Dec→Jan wrap and month-length shifts never corrupt the key).
  The Garden Route / Eastern Cape KPI pills are now toggle filters: click to
  focus one region in the table (teal ring + ✕ when active), click again to
  clear; Total resets to all regions. A "No routes in this region" empty state
  covers zero-result filters.
- **Sheets: restore pill portaled to body** — the table-only floating restore
  pill now renders via createPortal to document.body. The sheets pane is
  .glass-card-premium (backdrop-filter), which creates a containing block for
  position:fixed descendants in real browsers — the pill could anchor to the
  pane instead of the viewport and vanish when the pointer left the window.
  Portaling keeps it viewport-fixed.
- **Mobile sheets: region filter in the filter bottom sheet** — the filter
  sheet gained a Region section (All / Garden Route / Eastern Cape segmented
  buttons with region dots) so an admin on "All Regions" can focus one region.
  Purely client-side: regional users are server-locked to their own region, so
  the filter is a no-op for them. Shared state persists via SHEETS_UI_KEY, and
  the desktop active-filter pills show a Region pill too.
- **Mobile sheets: region badge on route cards** — each route card now shows a
  region pill in its meta row (Garden Route teal / Eastern Cape purple, plain
  em-dash for unassigned), matching the desktop sheets Region column colors so
  a route reads identically across web and phone. The loads/trailer/km summary
  truncates on narrow phones so the badge + Details stay on one line.
- **Sheets (desktop): month stepper arrows + Region column** — the two native
  `<input type="month">` controls (compact header + expanded header) were
  replaced with a `‹ label ›` stepper like the dashboard's month filter, using
  UTC month arithmetic on the persisted `selectedMonth` so December/January
  wrap correctly. The spreadsheet table also gained a display-only **Region**
  column (colored badge: Garden Route teal / Eastern Cape purple, em-dash for
  unassigned) via the existing `SpreadsheetDataTable` `extraColumn` prop — it
  sits right after Date, is sortable, and participates in resize/visibility/
  layout profiles like any built-in column. Desktop only (mobile sheets uses
  its own card view).
- **Mobile dashboard: one seamless page, no sideways scroll** — the dashboard's
  own inner scroller (the `flex-1 overflow-y-auto` root) now sets
  `overflow-x-hidden` explicitly (before, `overflow-y:auto` alone computed
  `overflow-x` to `auto`, which is how the phone could still scroll left-right
  even after `main` was guarded). The root's `bg-[var(--card-bg)]` was dropped
  on mobile so there's no container edge floating above the tab bar, and the
  section containers (Revenue/Clients/Compare/Birthdays) switched to a new
  `.glass-card-lg` class that is fully transparent below `lg` and only shows
  the glass panel on desktop — on the phone the sections now read as one
  continuous page. The KPI tab stretches (`flex-1` + `auto-rows-fr`) so cards
  fill the viewport, and `main`'s bottom padding matches the tab bar exactly
  (`pb-[calc(4rem+env(safe-area-inset-bottom))]` instead of `pb-24`) — the gap
  between data and the bottom tab bar shrank from ~227px to ~35px. Nested
  scrollers on Calendar, Swaps, and the sheets detail panel also got
  `overflow-x-hidden` so nothing can scroll sideways. Desktop dashboard is
  unchanged (glass sections, header, region filter all intact).
- **No more sideways scrolling** — the app's main scroller is now
  `overflow-x-hidden` (vertical-only scrolling everywhere), and the sheets /
  input page roots got `overflow-x-clip` so their full-bleed `-mx-4` sticky
  headers no longer inflate `scrollWidth` (that 16px overhang was what let the
  page scroll left-right). Tables that need it keep their own internal
  horizontal scroll.
- **Bell replaces the dashboard region select** — on mobile the Dashboard's
  region dropdown is gone (the region select now lives only in the top bar);
  the compact birthday bell sits in the Dashboard filter row instead.
- **Mobile top bar trimmed** — now only the app logo/name, the region select
  and the day/night toggle (the bell moved to the Dashboard).
- **Mobile dashboard: header removed + compact filters** — the Dashboard title
  row no longer renders on phones (desktop keeps its header). The region
  selector and the Day/Month/Range tabs now share a single compact row, the
  region pill drops its label and shrinks (MapPin + select only), and the
  month arrows / date inputs are tighter — the whole filter area is now two
  slim rows instead of three, freeing vertical space for the KPIs.
- **Admin page: Users card** — the admin landing page now includes a Users
  card (alongside Trucks, Drivers, Trailers, Subcontractors and Fleet Import)
  linking to `/admin/users` for managing who can sign in and which region
  they see.
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
