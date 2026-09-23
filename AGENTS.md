# FleetCore — Agent Instructions

> **Read first**: `PROJECT_CONTEXT.md` (full architecture reference) and `UPDATES.md` (changelog + current working-tree state) describe the complete project scope. This file is the quick-reference cheat sheet.

## Tech Stack
- **Frontend**: Next.js 16 (App Router), React 19, Tailwind CSS v4
- **Backend**: Convex (functions in `convex/`), database schema in `convex/schema.ts`
- **State**: Convex queries/mutations (no Redux/Zustand)
- **PDF**: jsPDF with strict absolute positioning (see `src/pdf/README.md`)
- **Email**: Resend (via `convex/emails.ts`)
- **Exports**: exceljs, xlsx
- **Charts**: recharts
- **Auth**: bcryptjs — custom email/password with `users`/`sessions` tables (admin/regional roles, multi-device sessions, 30-day tokens)
- **Push**: web-push (PWA web push with VAPID)
- **Tests**: vitest (`npm test`)

## Commands

```bash
npm run dev      # Next.js dev server
npm run build    # Production build
npm run lint     # ESLint only (no typecheck script)
npm test         # Vitest unit tests
npm run update-backend  # Runs: npx convex codegen + generateSnapshot.ps1
npx convex push  # Push Convex functions to deployment
npx convex codegen  # Regenerate convex/_generated/ types
```

## Architecture Lock

This project is in a **locked baseline** state (as of 2026-01-23). Core architecture decisions are frozen per `ARCHITECTURE_LOCK.md`. Do not casually refactor:
- Sheets table: collapsed summary rows + chevron expansion
- Status + Risk: computed (pure functions, no hooks/mutations/side effects)
- Backend queries: separated by consumer intent (UI, reporting, email, QuickSend)
- Suspense: localized only, `fallback={null}` unless required
- Legacy routes (`/planner`, `/sheets`): declared in `ARCHITECTURE_LOCK` — no route files exist in the current codebase; do not reintroduce them as canonical routes
- Region scoping is **server-enforced** — regional users are hard-locked to their own region (never trusted from the client); route queries resolve scope via `resolveEffectiveRegion` in `convex/userSessions.ts`

## Lint Freeze

Legacy Convex and Planner files have `no-explicit-any` disabled via per-file `eslint-disable` comments (see `LINT_FREEZE.md`). New code must remain strict and lint-free.

## Routing

- `/login` — sign-in (email + password, multi-device sessions)
- `/dashboard` — CEO dashboard (see `CEO_DASHBOARD_GUIDE.md`)
- `/operations/daily-planner/*` — canonical route system
- `/all-regions` — admin cross-region table (admin-only nav item)
- `/calendar` — driver birthday calendar (WhatsApp wishes)
- `/settings` — reminders, theme, push, change password, my devices
- `/admin/*` — trucks, trailers, drivers, subcontractors, fleet-import, users
- `/planner`, `/sheets` — declared legacy by `ARCHITECTURE_LOCK`; no route files exist in the current codebase (don't recreate them)
- Mobile (PWA, <768px) is limited to Dashboard, Input, Edit, Sheets, Admin (admin-only tab), Calendar — everything else redirects to Dashboard (see `AppShell.tsx`)

## Trailer Swaps — Source of Truth

The **current** truck-trailer combination is stored in `trucks.currentTrailerId` (not `trailerSwaps`). See `convex/__analysis__/trailerSwapAnalysis.md` for full audit.

## PDF Layout Rules (src/pdf/)

- **Absolute positioning only**, fixed Y-coordinates in points (pt)
- Fixed zones: Header (top), Bill To (Y=140), Description (Y=220, max 2 lines), Totals (Y=290), Banking (Y=360)
- **Never use mm/px** or flow-based layouts
- Currency format: ZAR (`R 1 234,56`) via `formatters.ts`, never `toLocaleString()`
- See `src/pdf/README.md` for full rules

## Database Tables (key)

| Table | Purpose |
|---|---|
| `dailyRoutes` | Core route data (indexed by `routeDate`) |
| `trucks` | Fleet trucks, `currentTrailerId` = active combo |
| `trailers` | Fleet trailers |
| `drivers` | Driver records |
| `dailyAvailability` | Daily truck/driver/trailer availability |
| `invoices` | Invoice records |
| `users` / `sessions` | Auth — accounts + multi-device sessions (max 5/user) |
| `subcontractors` | Subcontractor master data |
| `webPushSubscriptions` | PWA push subscriptions |
| `dismissedBirthdayAlerts` | Per-user per-year birthday dismissals |
| `customers` | Customer master data (name, normalizedName, isActive, accountNumber, etc.) |
| `planningLoads` | Board unallocated/allocated planning loads (by_loadDate_region_status, by_batchKey, by_allocatedRouteId indexes) |

## Environment

- Convex deployment: `dev:quixotic-gopher-969` (project: quixotic-gopher-969, deployment: dev:precise-chickadee-602)
- Env vars in `.env.local` (not committed): `NEXT_PUBLIC_CONVEX_URL`, `RESEND_API_KEY`
- VAPID keys (`VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT`) set via `npx convex env set ...` for web push
- React Compiler enabled (`babel-plugin-react-compiler`)

## Planner Board — Quick Reference

### Parser (`src/lib/planner/parser.ts`)
- `parseQuickCapture(text)` → `ParseResult` with date, loads, errors
- Grammar: `CLIENT x FROM na TO`, `+` for multiple locations
- Pure function, no React/Convex/browser dependencies

### Client Resolution
- `resolveParsedClients(parsed, customers)` → `ClientResolution[]`
- Matches against `customers.normalizedName` (case-insensitive)
- Returns status: `matched` | `unknown` | `ambiguous` | `alias_missing`

### Location Aliases (`src/lib/planner/aliases.ts`)
- `resolveLocation(input)` → normalized name (alias lookup or title-case)
- `resolveClientAlias(input)` → mapped customer name or undefined

### Board Page
- Route: `/operations/daily-planner/board?date=YYYY-MM-DD`
- Left panel: Quick Capture + Preview + Unallocated Loads
- Right panel: Placeholder for Stage 4 (fleet allocation board)
- Uses `createBulkPlanningLoads`, `getUnallocatedByDate`, `cancelPlanningLoad`

### Test Results
- Parser: 48 tests (date, parsing, aliases, client resolution)
- Full suite: 173 tests across 10 files
