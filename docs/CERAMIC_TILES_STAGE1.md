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
8. `npm run test:ceramic` runs all three Ceramic Tiles test files. The feature branch currently runs the tests before its Next.js build.

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
- **Still outstanding:** The feature-specific Convex schema/functions are not deployed to FleetCore development, so browser-to-database imports, PDF archive access, driver assignments and WhatsApp handoff have not been tested end to end. GitHub Actions runners did not start successfully; do not treat their jobs as passing.

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
- Dependencies, 15 Ceramic Tiles regression tests, TypeScript, targeted lint, and Next.js build all complete successfully.

It invokes `npx convex dev --once --env-file .env.local` only with the explicit deployment switch. It will not run `npx convex deploy`, select or create another deployment, push to production, merge the PR, or send WhatsApp messages.

**Important:** Older project agent notes also mention `dev:precise-chickadee-602` while other FleetCore documentation and the Vercel development setting identify `quixotic-gopher-969`. This discrepancy has **not** been resolved against the local CLI configuration. If the script detects it, stop and verify the actual development target in the Convex dashboard rather than modifying the script to bypass the safety guard. Do not share passwords, deployment keys or the contents of `.env.local` in chat.

After development deployment, test with a signed-in FleetCore development account: import one PDF, repeat it, import a higher version, verify history and original PDF links, assign a driver/truck, edit safety notes and manually open the WhatsApp draft. No production enablement until all checks pass.

## Known limits / next steps
- Original PDFs are uploaded to Convex storage **after user confirmation** for newly imported revisions, and their storage IDs are recorded in version history. Duplicate and older versions are skipped. Until end-to-end validation succeeds, retain your source PDFs locally.
- Scanned/image-only PDFs are rejected; OCR not enabled.
- PDF uploads occur before the atomic DB import commit; if final validation fails, storage uploads may remain unlinked. Add orphan cleanup before high-volume rollout.
- Editable driver instructions and the manual WhatsApp handoff are coded; driver receipt/confirmation and enforcement of one active shipment per driver remain future work.
- The pinned PDF.js worker compiled during the Next.js Turbopack preview build, but **actual in-browser PDF reading still needs verification**. If worker loading fails, self-host the matching installed worker rather than using an external CDN.
- In the authenticated FleetCore checkout, first verify that `.env.local` and the Convex CLI point to the existing FleetCore **development** deployment (not production). Only then run `npm ci`, `npx convex dev --once`, `npx convex codegen`, `npm run test:ceramic`, `npx tsc --noEmit`, targeted ESLint, and `npm run build`. Never use `npx convex deploy` without confirming the target and intended release.
- Test a batch containing new, duplicate, higher-version, older-version and same-version-conflict PDFs, plus driver/truck assignment and revision history.
