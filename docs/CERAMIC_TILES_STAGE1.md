# Ceramic Tiles — Stage 1: bulk shipment importer

## Confirmed decisions
- Feature lives under **FleetCore → Operations → Ceramic Tiles**.
- Existing FleetCore Convex backend; **no separate database**.
- Manual drag-and-drop or file picker from Outlook-saved PDFs. Microsoft 365/Exchange mailbox access is **excluded** because tenant administrative approval was not available.
- The feature reads **multiple PDFs at once** and shows a review stage before committing.
- Match drivers and trucks against existing FleetCore records. **No trailer selection** in this feature.
- UI follows the existing neutral glass-card theme and teal accent.
- No production Convex data or live FleetCore application release changed. Feature-branch preview deployments were built on Vercel.

## Code committed on feature branch
1. `src/lib/ceramic-tiles/pdfReader.ts`: browser-only PDF.js reader. Lines are reconstructed from X/Y coordinates because SAP fields often occupy separate PDF text runs. All document extraction runs on the user's device; no third-party parsing service.
2. `src/lib/ceramic-tiles/parser.ts`: pure SAP plan parser. Extracts shipment ID, version, total weight, total pallets, transporter, planned dates; each destination has delivery orders with collection warehouses, weights and item pallet estimates. Mixed shipment numbers or versions across pages are rejected. Declared-vs-order weight discrepancies are flagged, with warnings recalculated after the operator edits the review data.
3. `src/app/operations/ceramic-tiles/page.tsx`: up-to-25-file drag/drop or file picker, per-file errors, editable shipment and order review, shipment/version comparison, import confirmation, archive of original PDFs to Convex storage, latest imported shipment list, driver/truck assignment and revision history with original-PDF links.
4. `convex/schema.ts`, `convex/ceramicTilesFields.ts`, `convex/ceramicTiles.ts`: active shipment and immutable revision tables; authenticated, region-scoped import preview, atomic batch commit, duplicate checks, version conflict detection, saved version history, fleet selection and assignment.
5. Pinned PDF.js package in `package.json` and `package-lock.json` and added new module to `convex/_generated/api.d.ts`.
6. Added an Operations navigation tab and a separate GitHub Actions workflow for parser tests, TypeScript and lint checks.
7. `src/lib/ceramic-tiles/driverInstructions.ts` and `src/components/ceramic-tiles/DriverInstructionsPanel.tsx`: editable standard safety instructions, additional dispatch notes, and deterministic WhatsApp draft from shipment/driver/truck information. No automatic sending.
8. `npm run test:ceramic` runs all five Ceramic Tiles test files. The feature branch currently runs the tests before its Next.js build.

## Duplicate/version rules
- Same shipment ID + identical version + same file hash: already imported, skip.
- Same shipment ID + lower version: old, skip.
- Same shipment ID + higher version: replace active snapshot, add immutable history entry, preserve existing driver and truck assignment.
- Same shipment ID + version + different file hash: conflict, require manual review; never silently replace.
- Same shipment appears twice in the same batch: prevent duplicate import.
- Other warnings (missing dates/collection information) are shown for review and do **not** automatically block data import. Valid numbers and a known shipment ID remain required.

## Verified locally
- Actual PDF SH00130526 v1 (one destination, two delivery orders, planned dates 2026-11-20 and 2026-11-24, 2.3 total pallets).
- Actual PDF SH00130468 v5 (six destination sections, twenty delivery orders, same planned dates, 27.731 total pallets).
- A local reconstruction using the PDFs' text-coordinate geometry returned the expected shipment numbers, versions, stop counts, order counts, dates and pallet totals.
- Parser has synthetic/redacted regression tests. **Real customer PDF files were not committed to GitHub.**
- **Verified 20 November 2026:** 15/15 Ceramic Tiles tests passed during a Vercel feature-branch build (nine parser, three PDF geometry, three driver-message tests), followed by successful Next.js compilation, TypeScript and static page generation on the `fleetcore` preview project. The driver message decimal-separator regression found by the first run was corrected.
- **Development activation verified 20 November 2026:** The guarded activation script synced the functions/schema to quixotic-gopher-969 after the authenticated management API confirmed its development type and matching URL. All eight Ceramic Tiles public functions are present. Invalid-session calls to list and fleetChoices reach the handlers and deny access. Fifteen feature tests, TypeScript, targeted lint, local Next.js build, code generation and post-sync TypeScript passed. Calendar changes were preserved and restored. **Still outstanding:** authenticated browser-to-database imports, PDF archive access, driver assignments and WhatsApp handoff have not been tested end to end. GitHub Actions runners did not start successfully; do not treat their jobs as passing.

## Safe activation from the FleetCore Windows PC

An authenticated Convex CLI session on the PC is needed to deploy backend code. The GitHub integration and current Convex guidance connector cannot deploy to the existing backend themselves.

The feature branch includes `scripts/activateCeramicDev.ps1`. From the repository root in Windows PowerShell:

```powershell
git fetch origin
git switch feature/ceramic-tiles-stage1-foundation
git pull --ff-only

# Safe checks only: does NOT push Convex
powershell -ExecutionPolicy Bypass -File scripts/activateCeramicDev.ps1

# Explicitly activate ONLY after the checks succeed and the target is verified
powershell -ExecutionPolicy Bypass -File scripts/activateCeramicDev.ps1 -DeployToDevelopment
```

The activation script refuses to proceed unless:

- The current branch is exactly `feature/ceramic-tiles-stage1-foundation` and the working tree has no uncommitted files.
- `.env.local` contains **both** `CONVEX_DEPLOYMENT=dev:quixotic-gopher-969` and `NEXT_PUBLIC_CONVEX_URL=https://quixotic-gopher-969.convex.cloud`.
- No `CONVEX_DEPLOY_KEY` or `CONVEX_SELF_HOSTED_URL` override is present in the environment or local dotenv file.
- Dependencies, Ceramic Tiles regression tests, TypeScript, targeted lint, and Next.js build all complete successfully.

It invokes `npx convex dev --once --env-file .env.local` only with the explicit deployment switch. It will not run `npx convex deploy`, select or create another deployment, push to production, merge the PR, or send WhatsApp messages.

**Important:** Older project agent notes also mention `dev:precise-chickadee-602` while other FleetCore documentation and the Vercel development setting identify `quixotic-gopher-969`. On 20 November 2026, the authenticated management API confirmed quixotic-gopher-969 as the development deployment in fleet-backend, matching the local CLI selectors and frontend URL. The guarded development sync then succeeded against that target. If the script detects it, stop and verify the actual development target in the Convex dashboard rather than modifying the script to bypass the safety guard. Do not share passwords, deployment keys or the contents of `.env.local` in chat.

After development deployment, test with a signed-in FleetCore development account: import one PDF, repeat it, import a higher version, verify history and original PDF links, assign a driver/truck, edit safety notes and manually open the WhatsApp draft. No production enablement until all checks pass.

## Driver handoff format — updated 20 November 2026

The draft uses driver name, truck registration and truck fleet number (no trailer), shipment/pallet totals, dispatch's four SOS notices, pickups grouped by town, numbered offloads and PLEASE TRAVEL SAFELY. It uses actual assigned fleet records. Custom safety and dispatch notes remain editable; unchanged legacy standard notices refresh to the new template and must be saved before WhatsApp if marked dirty. Full shipment/order details remain in the review/history screens. Loading and offloading default to PDF order. In Driver instructions, drag the grip handles under Loading & offloading order to arrange pickup towns, warehouses within towns and delivery stops (Up/Down buttons remain for keyboard access); Save instructions keeps the selection. Reset to PDF order restores the defaults. The message preview and saved WhatsApp draft follow this order. The registration response is active in verified development; 35 feature tests, 990 total tests and isolated panel/ordering mouse/touch browser checks pass. No automatic sending occurs.

## Mobile dispatch — implemented 20 November 2026

The /start screen has its own Ceramic Tiles tile between Operations and QuickSend. It requires the existing sign-in and returns to Ceramic Tiles after login. On phones, the Ceramic Tiles route displays imported shipment cards with Unassigned/Assigned/All filters, assignment controls, the shared draggable stop editor and WhatsApp preview. The mobile workspace has its own vertical scroll area inside the Operations layout. There are no region selectors on this screen or its mobile header: admins see both authorized regional lists, while regional users retain their server-enforced scope. Saves use the selected shipment's actual region. Imports remain in the desktop web view. Both views read the same records and fleet identities.

Mobile saves the reviewed shipment version. A newer version shows Shipment updated—review before sending and requires another instruction review/save; stale expectedVersion saves are rejected server-side. Existing notes, assignments, history and saved ordering remain compatible. The review schema/functions are active in verified development. No production publishing occurred; installed production apps require a separate release. Browser verification uses synthetic services; no real records or messages are changed.

## Known limits / next steps
- Original PDFs are uploaded to Convex storage **after user confirmation** for newly imported revisions, and their storage IDs are recorded in version history. Duplicate and older versions are skipped. Until end-to-end validation succeeds, retain your source PDFs locally.
- Scanned/image-only PDFs are rejected; OCR not enabled.
- PDF uploads occur before the atomic DB import commit; if final validation fails, storage uploads may remain unlinked. Add orphan cleanup before high-volume rollout.
- Editable driver instructions and the manual WhatsApp handoff are coded; driver receipt/confirmation and enforcement of one active shipment per driver remain future work.
- **PDF reader fix verified 20 November 2026:** reproduced the PDF.js unminified entry collision in Next.js 16.1.7 Webpack with a generated shipment PDF. Switched to the equivalent pinned minified entry and matching bundled module worker. Actual Chrome PDF extraction, shipment parsing and repeated reads pass in an isolated Webpack fixture with external requests blocked. This verifies the browser reader using synthetic data; retrying the original customer PDF and authenticated import flow remains outstanding.
- In the authenticated FleetCore checkout, first verify that `.env.local` and the Convex CLI point to the existing FleetCore **development** deployment (not production). Only then run `npm ci`, `npx convex dev --once`, `npx convex codegen`, `npm run test:ceramic`, `npx tsc --noEmit`, targeted ESLint, and `npm run build`. Never use `npx convex deploy` without confirming the target and intended release.
- Test a batch containing new, duplicate, higher-version, older-version and same-version-conflict PDFs, plus driver/truck assignment and revision history.

## Production release gate — 20 November 2026

The feature branch contains the mobile dispatch and preserved calendar changes.
Local release checks pass: 990 tests, repository lint (0 errors, 64 existing
warnings), TypeScript via the successful Next.js production build, and all 33
pages generated. Feature CI now runs the full suite, TypeScript, lint and a
build with a non-live placeholder backend URL. No deployment is part of CI.

Keep the existing PR in draft until an authenticated development user verifies
new/duplicate/older/higher/conflicting PDF imports, revision history and archived
PDF access, truck/driver assignment, saved ordering and the manual WhatsApp
handoff on a physical phone. Synthetic browser checks have passed but do not
replace that real backend check. Keep original PDFs until this gate passes.

Verify the real Vercel production environment and its Convex deployment mapping
before rollout. Legacy mobile-audit comments say the live site uses the dev
backend; the deployment type alone does not establish isolation from live use.
Do not run the live upload audit as a release check. A separately authorized
release is needed for any main merge, production backend sync or publishing.

Release dependency preparation pins Next.js/eslint-config-next 16.4.6, official
SheetJS 0.20.3 and compatible security lockfile updates. React hooks lint remains
on the existing 7.0.1 baseline to preserve the repository lint freeze. The final
runtime audit reports 0 critical/high findings and 2 moderate UUID/ExcelJS
findings. ExcelJS only invokes UUID v4; the advisory concerns v3/v5/v6 when given
a buffer. Record that residual dependency risk during release review; no forced
ExcelJS downgrade or cross-major UUID override was applied. CI audits runtime
dependencies at high severity. A synthetic export round-trip retained all five
template sheets and 14,029 formulas. Mobile, drag, calendar and real Webpack PDF
checks were repeated after the updates. The obsolete Next.js 16.1 development
type cache was preserved in the local backup folder before regeneration.

## WhatsApp recipient choice — 20 November 2026

Open WhatsApp first asks Use system number or Choose manually. Manual mode can
use a different valid local/international number for this draft, or leave the
number blank to choose a contact in WhatsApp. Driver contact details and shipment
records are not edited by this choice. Missing/invalid system numbers default
to manual selection. Cancel/Escape closes the prompt, and reopening resets it.
The saved assignment, instruction and version-review gates still apply; WhatsApp
opens a draft and the user presses Send. The shared mobile/web modal scrolls on
short screens and uses an opaque surface for readability. Cache v83 refreshes
the installed app. Browser coverage includes all choices and invalid/missing
numbers without contacting WhatsApp or modifying real records.

## Guided mobile dispatch — 20 November 2026

Phones now use three short screens: Truck & driver → Stops → Review & send.
Next confirms/saves the assignment, then saves loading/delivery order and the
reviewed shipment version before entering review. Failed saves remain on the
current screen. Back retains draft values and the stop tab; leaving unsaved work
requires confirmation. A new shipment version resets the flow for another review.

Loading and Deliveries tabs show compact draggable rows. Move opens keyboard
Up/Down controls; delivery names expand to show addresses. A single bounded step
content area scrolls, with primary/back actions pinned below it. The review screen
has a compact route summary, expandable readable message and editable notes,
and inline system/manual WhatsApp choices. Edited review notes require Save
changes before sending. Manual recipient choices never change fleet records.

The desktop uploader, driver-message format and recipient dialog keep their existing
behavior. Shared instruction state keeps expectedVersion checks and persisted stop
order consistent. No backend change is required. Verified with 997 tests, TypeScript,
lint, build and synthetic Chrome workflows including failures, persistence, new
versions, touch dragging, long labels and short/narrow phones. Cache v85 refreshes
installed apps. Real driver messaging remains a deliberate operator action.
