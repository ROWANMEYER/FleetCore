# Ceramic Tiles — Stage 1 foundation (draft)

## Scope
- Inside FleetCore; existing Convex deployment, no second database.
- Microsoft 365 / Outlook automatic integration deliberately **excluded** (not approved by company tenant administrator).
- Trailers deliberately **excluded**; drivers and trucks are the only assignment records.
- Normal daily planner behaviour, routing and locked table contracts are unchanged.
- Feature code on a separate branch; **do not push to production** until verified.

## Implemented
1. Pure, deterministic parser at `src/lib/ceramic-tiles/parser.ts` for text extracted from SAP *LOADING / SHIPMENT PLAN* PDFs.
   - Shipment number, weight, pallet total, version, transporter, planned dates.
   - Multiple `DELIVER TO` blocks, multiple delivery orders per destination, `Collect @` location, item-level pallet estimate.
   - Page-header exclusion to avoid treating repeated shipment pallet totals as a line item.
   - Warnings for missing destinations, collection points, dates and repeated delivery numbers.
   - No OCR; scanned PDFs must be rejected with an explicit error.
2. Data model: `ceramicShipments` for active revision, `ceramicShipmentVersions` for immutable imported version history.
3. Region-scoped Convex endpoints: `previewBatch`, `commitBatch`, `list`, `versions`, `assign`, `fleetChoices`.
   - Existing FleetCore session token **required**; regional accounts are enforced server-side.
   - Atomic batch validation; maximum 25 shipments per commit.
   - Same version and same hash → duplicate (skip); lower version → older (skip).
   - Same version but different hash → conflict (blocks replacing existing data).
   - Higher version → latest shipment replaced, immutable version history retained, driver/truck assignments preserved.
4. Parser tests with synthetic/redacted PDF-like text (not real customer data).

## Remaining before end-to-end use
- Browser-side multi-PDF drag/drop and text extraction. A PDF-reading library must be installed and its lockfile updated before committing a working UI; **no external/CDN PDF library should be loaded without review**.
- Import preview, editable shipment/order verification, duplicate-version warnings, confirm action and stored file link. Do not send raw shipment PDFs to third parties.
- Add navigation into Operations without disturbing Daily Planner.
- Import driver/truck assignment screen and editable standard safety instructions, then WhatsApp handoff.
- Unit/integration tests for version mutations; run `npm test`, `npm run lint`, `npm run build` and `npx convex codegen` in a real FleetCore checkout using **development** Convex deployment.
- Test with real shipment plans locally (do not add customer PDFs to Git).

## Test evidence from existing real samples (local only)
- SH00130526 v1: one destination, two orders, valid planned dates.
- SH00130468 v5: six destination sections, twenty orders, valid planned dates.
- A bug counting the shipment pallet total as an order's pallet amount across page breaks was found and corrected.
- The test runs above validate the pure parser only; they **do not** prove the remote app builds or imports PDFs end-to-end.
