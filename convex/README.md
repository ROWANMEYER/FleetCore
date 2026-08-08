# Convex Backend — FleetCore

> **Refreshed**: 2026-08-08. This is the FleetCore backend, not the default
> Convex template. For the full project picture see `../PROJECT_CONTEXT.md`,
> `../UPDATES.md` (changelog) and `../AGENTS.md` (agent instructions).

## Overview

All FleetCore backend logic lives here as Convex functions (queries,
mutations, actions, internal functions) with the database schema in
`schema.ts`. The deployment is `dev:quixotic-gopher-969`.

## Key Conventions

- **Schema**: single source of truth in `convex/schema.ts` — always regenerate
  types after changes with `npx convex codegen`, then push with
  `npx convex push`.
- **Query separation**: backend queries are separated by **consumer intent**
  (UI, reporting, email, QuickSend) — do not merge into "god queries"
  (`ARCHITECTURE_LOCK.md`).
- **Region scoping**: any query/mutation touching `dailyRoutes` should resolve
  scope via `userSessions.resolveEffectiveRegion(ctx, token, override)` —
  regional users are hard-locked to their own region server-side.
- **Revenue math**: always use `calculateLoadAmount(qty, rate, rateType)` from
  `utils.ts` (flat/full → rate, else qty × rate).
- **Money formatting**: formatting lives in the frontend
  (`src/pdf/formatters.ts`, ZAR). Backend returns raw numbers/dates.
- **Internal functions**: cross-module calls use `internal.*` (e.g.
  `userSessions` helpers called from `users.ts` actions), never public client
  functions from server code.
- **Lint freeze**: legacy files may carry per-file `eslint-disable` comments
  (see `../LINT_FREEZE.md`). New code must be strict and lint-free.

## Module Map (by domain)

| Domain | Modules |
|---|---|
| Auth & sessions | `users.ts`, `userSessions.ts` |
| Routes (core) | `dailyRoutes.ts`, `routes.ts` (legacy) |
| Fleet master data | `fleet.ts`, `trucks.ts`, `trailers.ts`, `drivers.ts` |
| Subcontractors | `subcontractors.ts` |
| Customers | `customers.ts` |
| Dashboard analytics | `dashboard.ts` |
| Birthdays | `birthdays.ts` (pure helpers unit-tested) |
| Invoices (storage) | `invoices.ts` — numbering + record storage; PDF rendered client-side in `src/pdf/` |
| Email | `emails.ts`, `emailTemplates.ts`, `recipients.ts`, `templates/TransportReport.ts` |
| PWA push | `webPush.ts`, `webPushSubscriptions.ts` |
| Notifications / cron | `notifications.ts`, `crons.ts` |
| Renewals & PDP | `truckRenewals.ts`, `trailerRenewals.ts`, `pdp.ts`, `pdpReport.ts`, `vehicleLicences.ts` |
| Trailer swaps | `trailerSwaps.ts` (history only — current combo is `trucks.currentTrailerId`) |
| Availability & ops | `dailyAvailability.ts`, `dailyOps.ts`, `damageLogs.ts`, `tasks.ts` |
| Files & imports | `attachments.ts`, `dataImport.ts`, `fleetImport.ts`, `fleetSetup.ts`, `fleetStatus.ts` |
| Settings | `settings.ts`, `adminSettings.ts` (legacy PIN), `displaySettings.ts` |
| Misc | `myDay.ts`, `ai.ts` (Ollama), `health.ts`, `http.ts`, `seed.ts`, `migrations.ts`, `utils.ts` |
| Maintenance | `backfillRegion.ts`, `backfillStatus.ts`, `resetFlags.ts`, `cleanupTrailerSwaps.ts`, `cleanup_trucks.ts` |

## Schema (tables)

Defined in `schema.ts`. Highlights:

- **Core ops**: `dailyRoutes` (region, loads, KM, status), `trucks`
  (`currentTrailerId` = active combo), `trailers`, `drivers`, `customers`,
  `subcontractors`
- **Auth**: `users` (role admin/regional + region), `sessions` (multi-device,
  30-day, max 5/user)
- **PWA/birthdays**: `webPushSubscriptions`, `dismissedBirthdayAlerts`
- **Finance**: `invoices`, `invoiceCounter`
- **Tracking**: `dailyAvailability`, `tasks` (+ resolutions/snoozes),
  `damageLogs`, `attachments`, `trailerSwaps`, renewals/PDP tables,
  `myDaySelections`, `recipients`, `appSettings`, `clientDisplaySettings`

> Removed in earlier revisions (do not write code against): `payments`,
> `paymentAllocations`, `ageSnapshots`, `ageSnapshotRows`, `notifications`.

## Scheduled Crons (`crons.ts`)

| Cron | Schedule (UTC) | Job |
|---|---|---|
| PDP stage reminders | daily 05:00 | `internal.notifications.checkStageReminders` |
| PDP expiry reminders | monthly 1st 05:00 | `internal.notifications.checkExpiryReminders` |
| Web push daily dispatch | daily 06:00 | `internal.webPush.sendDailyDispatch` |

## Environment (Convex env, via `npx convex env set ...`)

| Variable | Purpose |
|---|---|
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | Web push (VAPID) |
| `RESEND_API_KEY` | Email via Resend |

Client env vars (`NEXT_PUBLIC_CONVEX_URL`) live in `../.env.local`.

## Commands

```bash
npx convex codegen   # Regenerate convex/_generated/ types
npx convex push      # Deploy functions + schema
npx convex -h        # CLI help
npx convex docs      # Open Convex docs
npm test             # Vitest (e.g. convex/birthdays.test.ts, convex/utils.test.ts)
```

## Tests

- `birthdays.test.ts` — SA-ID birthdate derivation + day math
- `utils.test.ts` — `calculateLoadAmount`
