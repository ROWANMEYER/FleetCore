# FleetCore — Agent Instructions

## Tech Stack
- **Frontend**: Next.js 16 (App Router), React 19, Tailwind CSS v4
- **Backend**: Convex (functions in `convex/`), database schema in `convex/schema.ts`
- **State**: Convex queries/mutations (no Redux/Zustand)
- **PDF**: jsPDF with strict absolute positioning (see `src/pdf/README.md`)
- **Email**: Resend (via `convex/emails.ts`)
- **Exports**: exceljs, xlsx
- **Charts**: recharts
- **Auth**: bcryptjs

## Commands

```bash
npm run dev      # Next.js dev server
npm run build    # Production build
npm run lint     # ESLint only (no test/typecheck script)
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
- Legacy routes (`/planner`, `/sheets`) must not be removed

## Lint Freeze

Legacy Convex and Planner files have `no-explicit-any` disabled via per-file `eslint-disable` comments (see `LINT_FREEZE.md`). New code must remain strict and lint-free.

## Routing

- `/operations/daily-planner/*` — canonical route system
- `/dashboard` — CEO dashboard (see `CEO_DASHBOARD_GUIDE.md`)
- `/admin/*` — trucks, trailers, drivers, customers, payments, age-analysis, reconciliation

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
| `ageSnapshots` / `ageSnapshotRows` | Receivables aging data |
| `payments` | Payment records |
| `invoices` | Invoice records |

## Environment

- Convex deployment: `dev:quixotic-gopher-969`
- Env vars in `.env.local` (not committed)
- React Compiler enabled (`babel-plugin-react-compiler`)
