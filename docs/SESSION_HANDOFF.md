# FleetCore session handoff

- Session date: **2026-10-27** (Africa/Johannesburg).
- Project: **ROWANMEYER/FleetCore**.
- Repository: `https://github.com/ROWANMEYER/FleetCore.git`.
- Local project: `C:\dev\Fleetcor`. This task's original tool workspace was a different repository, Fuelconsumption; do not apply FleetCore work there.
- Working branch: **`sync/session-handoff`**. Continue on this branch on both PCs.
- Latest commit (validated application baseline): **`4424cd8fdbd40eca2f6f8719bb3ea7486009ab5f`**, `Exclude deactivated drivers from the phonebook`.
- The handoff commit adds this document and `vercel.json` after that baseline. Its own hash cannot be embedded in the file it hashes; obtain the exact current handoff revision with `git log -1 --format=%H -- docs/SESSION_HANDOFF.md` and `git rev-parse HEAD`.
- Production branch: **`main`**. Do not push or merge to it as part of cross-PC synchronization.

## Synchronization and deployment safety

The repository was clean on `main` at handoff start. `git fetch origin` succeeded; `HEAD...origin/main` was **0 ahead / 0 behind**, so no remote changes or conflicts needed integration. All application changes below were already committed and pushed before this handoff.

No existing branch was suitable for routine synchronization: the other branches are older, unrelated feature work. `sync/session-handoff` was created from the synchronized application baseline without resetting, deleting, or merging anything.

`vercel.json` disables automatic Vercel deployments **only for `sync/session-handoff`**, using `git.deploymentEnabled`. Other branches retain their existing behavior. Preserve this rule when syncing. The documented behavior is at https://vercel.com/docs/project-configuration/git-configuration .

`.github/workflows/mobile-audit.yml` runs on pushes to `main`, on a schedule, and on manual dispatch; it does not run on pushes to this sync branch. Its upload audit can change a live driver's photo: do not manually dispatch it against production as a harmless validation step. The workflow was inspected but not changed or dispatched during this handoff.

**Production deployment during this end-of-session handoff: NOT PERFORMED.** Earlier feature work in this session was deployed under the user's earlier authorization; that is historical context, not an instruction to deploy again. Do not run Vercel deploy/promote, `npx convex deploy`, data imports, seeds, or migrations merely to resume work.

## Session summary and completed features

1. Mobile landing flow: `/` enters `/start`, with the existing splash artwork shown for 10 seconds, then a 280 ms fade. Tapping the splash skips immediately. The splash mounts once per document load, not on every client-side navigation.
2. `/start` is the primary mobile menu with **Operations, QuickSend, Fuel, Phonebook, Birthdays**. The mobile bottom tab bar was removed. Section headers have **Tabs** links back to the chooser. Operations retains its own header menu for Dashboard, Input, Sheets, and Admin where permitted.
3. Mobile guests can read QuickSend (`/operations/quick-message`), Fuel comparison (`/operations/fuel`), Birthdays (`/calendar`), and Phonebook (`/operations/phonebook`). Operations requires a login. Exact public path matching keeps nested management routes protected. Signed-in users can log out from the mobile header; the login screen has Back to tabs.
4. The driver phonebook uses live driver records instead of five placeholder contacts, reuses existing driver photos and the long-press photo viewer, and includes search plus call/WhatsApp links.
5. Multiple numbers are supported in the shared driver record: keep `phone` as the legacy primary number; optional `additionalPhones` contains up to ten `{ label, number, whatsapp }` entries. The web Admin > Drivers create/edit forms and signed-in mobile Phonebook pencil editor use the same fields. Additional numbers appear on web driver cards too.
6. Extra-number writes require a valid existing admin/regional session. The new public directory exposes only names, photos, and contact information; it excludes national IDs, driver codes, credentials, and storage identifiers. Driver codes were deliberately excluded because existing records often use national ID values as their code.
7. The phonebook shows only records whose **driver `status` is exactly `active`**, excludes test drivers, and excludes inactive subcontractor assignments. An active `subStatus` cannot override an inactive driver `status`. No driver status was changed to implement this filter.
8. Fuel comparison reads were made public for mobile; Fuel price management writes still require admin access.
9. The driver recorded as **JAPPIE JARSERAG**, code **888**, was deleted at the user's explicit request using `fleet.deleteDriver` and its route-history safeguard. This was an actual database deletion, not deactivation. Do not recreate that record through seed/import routines.

## Work in progress

No partially implemented feature or uncommitted application work was left at handoff. There is no WIP commit required. Items in Known issues / Next steps are follow-up work, not a claim that they have been implemented.

## Important files

| File | Purpose |
| --- | --- |
| `src/components/auth/AppShell.tsx` | Shared authentication shell, exact public mobile routes, mobile-only route restrictions, header/safe-area spacing. |
| `src/lib/appMode.ts` | Current mobile mode is viewport `<768px`; do not rely on user-agent checks for the embedded browser. |
| `src/app/page.tsx`, `src/app/start/page.tsx` | Desktop/mobile entry routing and five-choice splash-style menu. |
| `src/lib/splashLifecycle.ts`, `src/components/MobileSplashGate.tsx` | Ten-second splash and immediate tap-to-skip lifecycle. |
| `src/components/Navigation.tsx`, `src/components/MobileOperationsMenu.tsx` | Desktop sidebar plus mobile header, Tabs link, logout, and Operations screen menu. |
| `src/components/MobileTabBar.tsx` | Removed; do not reintroduce duplicate bottom navigation. |
| `src/app/login/page.tsx` | Existing login plus return to the mobile chooser. |
| `src/app/operations/phonebook/page.tsx` | Live paginated contacts, driver photos, search, dial/WhatsApp links, authenticated number editing. |
| `src/components/admin/DriverPhoneFields.tsx`, `src/app/admin/drivers/page.tsx` | Shared phone editor and web driver CRUD integration. |
| `src/lib/driverPhones.ts` | Number validation, SA/international dial normalization, duplicate prevention, legacy primary preservation. |
| `convex/schema.ts`, `convex/driverPhoneFields.ts` | Optional additional-number schema and `drivers.by_driverName` index. |
| `convex/driverPhonebook.ts` | Paginated, projected public contacts and authenticated `saveNumbers`. |
| `convex/lib/driverContactAccess.ts`, `convex/fleet.ts` | Existing session checks for additional-number edits; compatibility with legacy driver calls. |
| `convex/_generated/api.d.ts` | Tracked generated API bindings for the added backend modules. |
| `convex/fuelPrices.ts`, `src/app/operations/fuel/page.tsx` | Public comparison reads, admin-only management links/writes. |
| `convex/driverPhonebook.test.ts`, `src/lib/driverPhones.test.ts` | Contact projection, activation rules, photo preservation, authorized saves, multiple numbers, duplicates. |
| `src/lib/splashLifecycle.test.ts`, `src/components/SplashScreen.test.tsx` | Splash timing and skip checks. |
| `vercel.json` | Prevents deployment from the cross-PC sync branch. |

## Backend state and data portability

- Existing backend remains **Convex**, with the application's existing bcrypt/custom `users` + `sessions` authentication. Do not replace its auth architecture as incidental cleanup.
- Production backend used and verified earlier: `https://dependable-quail-107.convex.cloud`, deployment `prod:dependable-quail-107`. This identifier is context only, not a development target.
- Earlier production backend changes: optional `drivers.additionalPhones`, `drivers.by_driverName`, public contact projection, authenticated number saves, and strict active-driver filtering. No destructive schema migration or contact backfill was required; existing `phone` values remain valid.
- Earlier final live verification: **53 active contacts**, **19 inactive drivers hidden**, no visible contacts without active status, **43 existing photos**. These are time-of-verification counts, not immutable expectations.
- Missing photos show initials. Uploading a photo or editing a number changes live backend data and requires an intentional user action in the proper environment.
- GitHub transfers source/schema/function definitions, **not** Convex database contents, stored photos, browser login sessions, ignored environment files, or machine-specific Vercel/Convex credentials. A development deployment may contain different drivers or photos; do not overwrite it with production data just to make screenshots match.

## Testing performed for this handoff

All checks were run from `C:\dev\Fleetcor` on the validated application baseline; handoff changes are documentation plus the branch-specific deployment rule.

| Command | Result |
| --- | --- |
| `npx tsc --noEmit --incremental false` | PASS, exit 0. Avoids changing the ignored incremental cache. |
| `npm test` | PASS: **53 files / 946 tests**. Includes the two added activation-filter regressions. |
| `npm run lint` | PASS, exit 0: **0 errors, 65 pre-existing warnings**. |
| `npm run build` | PASS, local Next.js production build, 32 static pages generated. This is not a deployment. |
| `git diff --check` | PASS before committing. |

The existing lint warnings are in generated files, legacy Convex/planner code, scripts, hooks, and image usage. They predate the handoff and were not suppressed or fixed here. Vitest also reports an existing config-loader/module-format warning; tests still pass. No outstanding compilation or test failure is known.

Earlier feature verification, before the handoff request: live mobile chooser -> Phonebook -> Tabs return, QuickSend without bottom navigation, saved photo rendering/search, working photo HTTP response, and production aggregate active/inactive checks. Real driver records were not modified to exercise number-save tests; those tests use an in-memory database.

## Known issues and limits

- Web and mobile are still **one responsive Next.js application**, not separate builds/deployments. `<768px` selects the mobile shell, including a narrow desktop or embedded browser. A previous user-agent experiment broke Back and the chooser and was reversed. Desktop-width route restrictions are bypassed, but a full authenticated desktop/mobile browser matrix should be rerun before changing shell logic again.
- Public contact reads are intentional for the mobile Phonebook. Editing numbers requires login. The new projection excludes identity fields; older fleet endpoints and CRUD have legacy authentication behavior that has not been comprehensively audited. Do not describe the whole backend as secured solely because the new number APIs check sessions.
- Search operates over loaded paginated contacts (100 records per batch); use Load more for larger lists. It is not a server-wide search across unloaded pages.
- A driver with missing/unknown status is intentionally hidden until explicitly activated. Deactivated drivers remain stored for history; hiding them does not delete them.
- Eleven of the 53 active drivers had no saved photo at the earlier verification. No replacement photos or extra phone numbers were invented.
- The existing mobile audit workflow includes legacy credential fallback behavior and a production-targeted upload audit. Review these separately; do not copy credential values into documentation or automatically run that workflow.
- Some legacy tracked seed/argument artifacts exist. They were not changed or newly staged during this handoff; review them separately before reuse or broader sharing. `.env*`, `.vercel/`, `node_modules/`, `.next/`, and TypeScript caches remain ignored.
- Older project documentation and workflow comments may name an outdated dev backend or bottom-tab design. Current source and this handoff describe the implemented state.

## Important decisions to preserve

- The chooser, including Phonebook, is the primary mobile navigation; no bottom tab bar.
- Only Operations requires login to enter. Public routes must match exactly; nested admin/management URLs must not inherit guest access.
- The mobile filter changes visibility only. Never activate/deactivate/delete drivers as a workaround for a display bug.
- Preserve the primary `phone` field for QuickSend/birthday/legacy consumers. Additional numbers supplement it; adding them must not overwrite identity, photo, status, or other driver metadata.
- Use the existing photo component and live stored photo lookup, with initials when absent.
- Keep server-side session checks on added number writes and private-field projection on public reads.
- Preserve the project's architecture locks and server-enforced regional scope. The Fuelconsumption reporting-boundary policy belongs to a different project; do not edit that repository during FleetCore work.
- Do not merge the handoff branch into `main` without explicit release authorization. A push to `main` can trigger production deployment and production-targeted CI.

## Next steps, in priority order

1. Re-run authenticated desktop and phone/PWA navigation checks: Operations, Settings, login/logout, Back/Tabs, chooser, and number editors. Reproduce any viewport issue before altering mode detection.
2. Use authorized driver edits to enter real additional numbers and upload missing photos. Check a web save appears in the mobile phonebook and vice versa using development/test data first.
3. Audit legacy fleet authorization and the production-targeted mobile CI audit; plan safe test fixtures and credential handling as a separate scoped task. Consider server-wide phonebook search if the directory grows.

## Restart on another Windows PC

Prerequisites: Git for Windows, Node.js compatible with Next.js 16 (CI uses Node 22; this PC validated Node **24.14.0** / npm **11.9.0**), and access to this GitHub repository. Keep any existing local changes before switching branches. Do not use reset, clean, force push, or automatic stash/pop to bypass a dirty worktree.

Run the following in PowerShell. The commands stop on local work, a wrong remote, a failed checkout, or a non-fast-forward pull. A fresh clone is created only when the target folder does not already exist.

```powershell
$project = 'C:\dev\Fleetcor'
$repository = 'https://github.com/ROWANMEYER/FleetCore.git'
$branch = 'sync/session-handoff'

if (-not (Test-Path -LiteralPath "$project\.git")) {
    if (Test-Path -LiteralPath $project) {
        throw 'The target folder already exists but is not this Git checkout. Inspect it first.'
    }
    git clone --branch $branch $repository $project
    if ($LASTEXITCODE -ne 0) { throw 'Clone failed.' }
}
Set-Location -LiteralPath $project

$origin = git remote get-url origin
if ($LASTEXITCODE -ne 0 -or $origin -notmatch '^(https://github\.com/ROWANMEYER/FleetCore(\.git)?|git@github\.com:ROWANMEYER/FleetCore(\.git)?)$') {
    throw 'Unexpected origin. Verify the repository before continuing.'
}
git status --short --branch
$localChanges = git status --porcelain
if ($LASTEXITCODE -ne 0) { throw 'Could not inspect local changes.' }
if ($localChanges) { throw 'Local changes exist. Preserve them before syncing.' }

git fetch origin
if ($LASTEXITCODE -ne 0) { throw 'Fetch failed.' }
$previousLock = git rev-parse HEAD:package-lock.json
git show-ref --verify --quiet "refs/heads/$branch"
if ($LASTEXITCODE -eq 0) {
    git switch $branch
} else {
    git switch --create $branch --track "origin/$branch"
}
if ($LASTEXITCODE -ne 0) { throw 'Branch switch failed.' }
git pull --ff-only origin $branch
if ($LASTEXITCODE -ne 0) { throw 'Cannot fast-forward. Preserve local commits and inspect divergence; do not reset.' }

$currentLock = git rev-parse HEAD:package-lock.json
if (-not (Test-Path -LiteralPath 'node_modules') -or $previousLock -ne $currentLock) {
    npm ci
    if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }
}
git status --short --branch
git log -1 --oneline
Get-Content docs/SESSION_HANDOFF.md

if (-not (Test-Path -LiteralPath '.env.local')) {
    throw 'Restore .env.local securely for the intended development backend before starting.'
}
npm run dev
```

Open `http://localhost:3000`; if occupied, use `npm run dev -- --port 3001` and open that port instead. The mobile chooser requires a phone-width viewport.

### Environment setup

- Restore environment values through the approved local/secure setup, not Git. `NEXT_PUBLIC_CONVEX_URL` is required by the frontend; `CONVEX_DEPLOYMENT` must identify the intended **development** deployment for backend tooling.
- The current local environment also contains `NEXT_PUBLIC_CONVEX_SITE_URL` and `NEXT_PUBLIC_VAPID_PUBLIC_KEY`. Keep site/cloud endpoints matched to the same intended backend. Email/push server secrets (`RESEND_API_KEY`, VAPID server keys, and related settings) belong in that backend's secure configuration.
- Vercel credentials/OIDC tokens and `.vercel/` are machine-specific; never copy them into this file or commit them. Local development does not require redeploying or relinking production.
- Frontend-only continuation: use the restored dev URL and `npm run dev`. Backend development, when explicitly needed: in a separate terminal, first verify the configured target is a development deployment, then run `npx convex dev`. It can publish schema/functions to that target; never point it at production casually.
- `npm run update-backend` invokes Convex code generation/upload behavior plus snapshot generation. It is not a harmless read-only handoff check and was not run during this handoff.

If either PC has diverged commits, keep them and stop the `--ff-only` workflow for a deliberate integration. On the next end-of-session handoff, update this file in place and push the same safe branch after fetching and validating again.
