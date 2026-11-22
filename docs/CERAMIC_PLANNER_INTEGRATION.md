# Ceramic assignment, Daily Planner and spreadsheets

## Confirmed workflow

1. User uploads and reviews the PDF, then imports the shipment.
2. User chooses an existing driver, truck and planning date (default: today in
   South Africa), then saves the assignment.
3. One main load appears in Daily Planner for that planning date.
4. The monthly Ceramic table updates for the planning date's month.
5. Matching local collection/delivery stops update the local-load table using the
   same driver/truck/date. **Local legs never create additional Planner loads.**

The owner confirmed that spreadsheets mean FleetCore tables with Excel exports,
not files on the PC. Both tables are available under Ceramic Tiles → Monthly &
local-load spreadsheets, including for signed-in mobile users. The export reads every report page and uses the template sheet names for the
selected month, for example `November_2026` and `Locals_November_2026`.

Local detection is case-insensitive: Cashbuild (including Cash Build), or Italtile
with George in its store name or a separate George town/postcode address line.
Other Italtile branches and a George street in another town do not qualify.
Matching collection points are grouped by warehouse; delivery stops retain their
own delivery-reference identity even when their names match.

## Transaction and preservation rules

- Import alone does not create Planner/reporting work.
- The assignment mutation updates the shipment, one dedicated Planner route and
  one indexed assignment snapshot in the same Convex transaction.
- Concurrent retries use the shipment identity and Convex conflict retries. They
  cannot create additional routes or report records.
- Reassignment changes the same route and report snapshot. Changing the planning
  date moves the row to its new reporting month.
- Existing manual routes, loads, rates, kilometres and notes are not replaced.
- Completed, locked or invoiced linked routes cannot be reassigned.
- A deleted linked route is flagged and must be restored rather than recreated.
- A revised PDF does not silently change accepted planning/reporting data. Save
  its assignment after review. If its Planner load was manually edited, sync
  refuses to overwrite those changes.
- A shipment already referenced by Planner/reports cannot be deleted through the
  Ceramic importer. Source PDFs and historical revisions remain intact.
- Existing unassigned/legacy shipments are not backfilled automatically.

The new `ceramicAssignments` table owns assignment/report snapshots and has
`by_shipment` and `by_region_routeDate` indexes. Existing tables receive only
optional fields; no data migration, copying or replacement is involved.

## Access

Server-side session and region checks protect assignment and reporting. Public
mobile shipment browsing, fleet choices and driver-instruction editing remain
available. Saving a Planner-linked assignment now requires normal sign-in; an
anonymous Ceramic endpoint cannot grant write access to general Planner data.

## Monthly template and saved amounts

The report follows the supplied `CERAMICS MARCH 2026.ods`: 32 main columns,
warehouse order, company header, original headings, row heights, column widths,
colours, borders, merged cells, number formats and footer formulas. The local
sheet retains RegNo, Drywer, Dat, Van, Na, Prys and Shipment No. Both FleetCore
and Excel use the same layout model. Capacity extends beyond the original 45
main rows and 22 local rows, with the footer ranges moving accordingly.

Only layout metadata, headings and formulas are included in source control.
Historical March shipments, drivers and amounts are not imported or embedded.
The reporting month follows the saved assignment planning date.

The main amounts window edits rate per ton, one combined Stops charge and load
notes. It shows distinct delivery locations detected from the assigned PDF;
collections are excluded and multiple orders at one location count once.
Chargeable-stop rules and the price per stop await owner confirmation, so no
stop charge is calculated or defaulted automatically. Unknown charges stay blank.

Cross border does not apply: its input is hidden and the template column remains
blank. Historical cross-border notes remain stored. The original template's
Stops and Drops columns/formulas remain; the combined known charge appears only
in Stops, with Drops blank. Existing stored Stops/Drops values are preserved
until the user explicitly edits the combined charge, avoiding data migrations.

The Local loads section is absent from the main amounts window. The separate
Local loads report still lists detected locals and opens its own local amounts
window for Van/Na/Prys. Main amount edits preserve existing local prices, and
local edits preserve main amounts. Values are saved on the assignment snapshot.
Empty amounts stay blank;
explicit zero remains zero. Saves require sign-in, region access, the accepted
PDF version and a matching billing revision. Completed, locked or invoiced
routes reject edits. Reassignment preserves saved amounts; a changed PDF must
be reviewed before the amounts can be exported again.

The template calculates freight as rate per ton multiplied by 34, adds the
combined Stops charge, and allocates the total to warehouses by loaded weight.
Recognised warehouse codes are 1100, 1600, 3000, 2100, 1900, 1200/1201, 1500
and 1700. Unmapped sources are shown for review and block financial export.
Missing prices or local locations also block export instead of becoming zero.

At the owner's explicit request, the original formulas are preserved, including
VAT on loaded weight and the footer counts linked to the old January workbook.
The Excel file retains a native external-workbook link; unavailable count
results show `#REF!`. The original loaded-weight footer subtotal behaviour is
also retained. These formulas are not corrected or replaced with current-month
counts. No external workbook is fetched by FleetCore.

Automatic Customer Rates tariff matching and invoice creation remain outside
this change. Report billing does not change existing Planner pricing or Customer
Rates calculations. Planner numeric aggregates still require their own review.

## Validation

- Baseline full suite: 1,100 tests across 66 files. After the editor simplification,
  all 100 Ceramic tests pass across 12 files, including delivery-only stop counts,
  preserved billing values, combined-charge export and assignment/report lifecycle.
- Strict TypeScript and targeted lint pass; existing unrelated lint warnings remain.
- Optimized Webpack build passes (34 routes). In the temporary copy, Turbopack
  cannot resolve the shared dependency junction; this is a validation-copy path
  restriction, not a source compilation failure.
- A fresh anonymous local Convex backend accepts the schema and functions.
- Browser: synthetic PDF upload → review/import → assignment → one Planner load,
  one monthly row and two local rows. Downloaded Excel sheets and weight totals
  were read back and checked.
- Real local Convex transactions: four concurrent retries, month move/restore,
  one route/one load/one snapshot, and invalid-session rejection all pass.
- Mobile: planning-date control and saving a changed date verified at 390px.
- Saved report amounts survive browser refresh; stale simultaneous edits reject.
- Browser-downloaded native Excel file was checked for both month-specific sheets,
  saved rate 1,100, freight 37,400, total 38,900, local total 5,400, formulas,
  blank optional inputs and the original external-workbook relationship. These
  checks use synthetic local fixtures, not real development shipments.
- Artifact Tool recalculation and rendering checked the generated workbook's
  main, warehouse, total and local sections against the source layout.
- The original ODS SHA-256 remains
  `6d2faf53bde2511dd60b2b3a28b9266a3d2bfdc8e541486637d0a4e1575243ea`.

No production deployment or real-shipment backfill is part of this change.

## Development availability

The additive schema/functions are deployed only to `dev:quixotic-gopher-969`.
The template update's before/after counts and checksums match for the existing
assignment, all 1,125 Daily Planner routes, four shipments/four revisions, four
rate sheets, 13 fuel prices and the empty tariff-history table. A user-created
assignment already present before the update was preserved. No real shipments
were assigned, backfilled or priced by this validation.
The localhost development server was restarted to discover the new route;
`http://localhost:3000/operations/ceramic-tiles/reports` returns HTTP 200.
Normal sign-in is required for saving assignments and viewing reports.
Changes remain on `codex/ceramic-planner-integration`; no GitHub push or
production release was performed.

## Editor simplification verification

The main editor contains no Cross border or Local loads inputs. At 390px the
PDF delivery list, combined Stops charge and save controls remain usable.
Synthetic browser saves confirmed that main edits preserve both local prices,
and local edits preserve rate per ton and the combined Stops charge. The revised
download contains Stops 1,600, Drops blank, Cross border blank, main total 42,400
and local total 5,500. The original main/footer formulas and external link remain.
All values in this check are synthetic. No Convex backend changes or deployment
were needed for this UI update; the existing development server remains running.

## Guided web shipment workspace

The owner approved the Guided workspace proposal. The desktop shipment page now
has a work queue with Prepare / To send / All filters and a selected shipment
workspace. Upload is a compact action that opens the existing PDF review/import
controls. Import & continue selects the first newly imported/revised shipment.
PDF history and deletion are secondary More actions; history opens in a dialog.

The sequence is Review PDF -> Assign load -> Driver instructions -> Send to driver.
Save & continue awaits the existing assignment transaction, then opens the
existing stop-order/safety/notes/WhatsApp preview editor for that shipment.
Only a successful save advances the step; incomplete assignments remain on the
form. The success message confirms the main Planner load and both report updates.

Ready is derived from a complete current-version Planner assignment and saved
instruction review at least as recent as the shipment's last update. A later
assignment or PDF revision requires review again. Readiness survives refresh;
it is not a browser-only completion flag. Opening WhatsApp still opens a draft
for the user to review and send. This implementation sends no messages.

Queue/region changes protect unsaved instruction edits and cannot interrupt a
save. Assignment drafts remain keyed by shipment. Revised PDFs leave an open
instruction draft available for review, with save/share blocked until the
assignment is current. Pricing remains a separate reporting task and never
blocks dispatch. The existing mobile shipment workflow is retained.

Validation: all 1,110 tests across 68 files pass, including 105 Ceramic tests
across 13 files. Strict TypeScript, targeted lint and the optimized Webpack build
also pass. A synthetic PDF was uploaded/imported in
the browser, advanced automatically into assignment, rejected missing fleet
choices, then advanced into instructions after assignment saved. Saving the
instructions marked it Ready. The local audit confirmed exactly one additional
route, one main load and one assignment snapshot. No development/production
records or backend source were modified by this UI update.

The final browser check confirmed Ready after refresh, preserved saved driver
notes, and the archived original PDF in the history dialog. The new shipment
has two local report rows, and the earlier synthetic shipment's billing is
unchanged. Browser console errors are empty. Narrow desktop (800px) and the
regular desktop layout were checked; temporary viewport overrides were reset.
The original development shipment URL responds with HTTP 200.


## Saved WhatsApp handoff correction

Ready to send now opens a dedicated Send to driver view built from saved notes
and stop order. It has an enabled Open WhatsApp action, recipient choice and
Copy message fallback, without depending on editor draft state. Missing or
invalid driver phone numbers offer manual entry or the WhatsApp contact chooser.
Missing fleet records display a reason and a Review assignment action.

Embedded instruction editing uses Save & continue to WhatsApp (or Continue to
WhatsApp when already saved). It has no disabled WhatsApp control. Successful
saves keep the same shipment selected and open the To send queue. The initial
queue follows saved work: Prepare when work remains, otherwise To send.
After opening a draft or copying the message, the user can choose Next shipment
needing action when another shipment needs preparation. FleetCore does not
claim the message was sent and introduces no automatic Sent status.

Validation: 1,114 tests across 69 files passed; targeted lint and the optimized
Webpack build with TypeScript passed. Synthetic browser checks confirmed save
to handoff without changing selection, a contact chooser without a phone,
per-message manual number normalization, exact saved notes in the link and
clipboard, next-shipment navigation, and review required after reassignment.
No message was sent, no real shipment was changed, and no backend source or
production deployment was changed for this correction.

The final browser refresh opens To send automatically when all shipments are
prepared. Open WhatsApp remains enabled after refresh; browser console errors
are empty. The isolated data audit still has exactly two shipments, two
assignments and two routes, with one main Planner load per assignment. Monthly
and local report checks confirm prior pricing is preserved. The original local
development screen was restored on port 3000 and returns HTTP 200.
