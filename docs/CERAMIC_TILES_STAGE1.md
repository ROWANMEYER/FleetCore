# Ceramic Tiles — Stage 1: bulk shipment importer

## Confirmed decisions
- Feature lives under **FleetCore → Operations → Ceramic Tiles**.
- Existing FleetCore Convex backend; **no separate database**.
- Manual drag-and-drop or file picker from Outlook-saved PDFs. Microsoft 365/Exchange mailbox access is **excluded** because tenant administrative approval was not available.
- The feature reads **multiple PDFs at once** and shows a review stage before committing.
- Match drivers and trucks against existing FleetCore records. **No trailer selection** in this feature.
- UI follows the existing neutral glass-card theme and teal accent.
- No production data, project deployments or live imports touched during implementation.

## Code committed on feature branch
1. `src/lib/ceramic-tiles/pdfReader.ts`: browser-only PDF.js reader. Lines are reconstructed from X/Y coordinates because SAP fields often occupy separate PDF text runs. All document extraction runs on the user's device; no third-party parsing service.
2. `src/lib/ceramic-tiles/parser.ts`: pure SAP plan parser. Extracts shipment ID, version, total weight, total pallets, transporter, planned dates; each destination has individual delivery orders with collection warehouses, weights and item pallet estimates.
3. `src/app/operations/ceramic-tiles/page.tsx`: up-to-25-file drag/drop or file picker, per-file errors, editable shipment and order review, shipment/version comparison, import confirmation, latest imported shipment list, driver/truck assignment, and revision detail view.
4. `convex/schema.ts`, `convex/ceramicTilesFields.ts`, `convex/ceramicTiles.ts`: active shipment and immutable revision tables; authenticated, region-scoped import preview, atomic batch commit, duplicate checks, version conflict detection, saved version history, fleet selection and assignment.
5. Pinned PDF.js package in `package.json` and `package-lock.json` and added new module to `convex/_generated/api.d.ts`.
6. Added an Operations navigation tab and a separate GitHub Actions workflow for parser tests, TypeScript and lint checks.

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
- **Important:** The end-to-end Next.js/browser/Convex build is not yet confirmed. Initial GitHub Actions jobs failed without exposed step logs; this is not evidence that the application passed verification. Do not merge or deploy without successful checks.

## Known limits / next steps
- Original PDFs are **not** stored in Convex yet. The reviewed shipment snapshot, SHA-256 fingerprint and original PDF are saved. Keep the downloaded PDFs.
- Scanned/image-only PDFs are rejected; OCR not enabled.
- PDF uploads occur before the atomic DB import commit; if final validation fails, storage uploads may remain unlinked. Add orphan cleanup before high-volume rollout.
- Driver instruction templates, editable standard safety instructions, WhatsApp message handoff, driver confirmation and one-active-shipment-per-driver rules are a future stage.
- Verify the PDF.js worker resolves in Next.js 16 webpack; if worker bundling fails, self-host the matching worker from the installed package (not an external CDN).
- In a real FleetCore checkout run `npm ci`, `npx convex codegen`, `npx vitest run src/lib/ceramic-tiles/parser.test.ts`, `npx tsc --noEmit`, `npx eslint ...`, and `npm run build` with the **development** environment.
- Test a batch containing new, duplicate, higher-version, older-version and same-version-conflict PDFs, plus driver/truck assignment and revision history.
