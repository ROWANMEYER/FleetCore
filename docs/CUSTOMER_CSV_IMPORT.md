# Import Age Analysis customers into Fleetcore

Open **Admin → Clients → Import Age Analysis CSV**. Select the Age Analysis CSV,
review the counts and rows, then click **Import ready customers**. The importer
does not write anything until that button is pressed. Filter the preview to
**Skipped / conflicts** to see rows requiring correction before a later import.

## Mapping

| CSV column | Existing Fleetcore customer field |
|---|---|
| Rekno | Account number (text, including leading zeroes) |
| Name | Customer name and canonical normalized name |
| Contact | Contact person |
| Email | Email |
| Telephone | Phone; Mobile is used if Telephone is blank |
| Delivery Address 1–3 | Address; falls back to postal lines and postal code |
| Tax Reference | VAT number |
| Blocked | Yes → inactive, No → active |
| Note | Customer notes; wins over the label columns below when present |
| Aliases, COD, Mobile, Fax, additional postal details | Customer notes |

Other accounting-specific fields, including credit limits, price lists, tax
settings, currency and terms, are not imported. No balances or rate-master
records are created.

## Export

**Admin → Clients → Export CSV** writes the clients matching the current search
and status filter to `fleetcore-clients_<date>.csv`. The file uses the mapping
above, so it can be selected in the importer again without editing it. Addresses
are written as a single quoted multi-line `Delivery Address 1` cell and note text
is written verbatim to `Note`. A UTF-8 BOM is included so Excel preserves
leading zeroes in `Rekno`. Clients without an account number export with a blank
`Rekno` and are skipped if the file is imported, so a toast reports them.

## Existing customers and duplicate rows

- Import is **add-only**. Existing customers matched by account number or
  canonical name are kept unchanged, including inactive customers.
- Every occurrence of a duplicate name/account within the file is excluded
  rather than selecting an arbitrary account. Fleetcore requires unique
  customer names; resolve ambiguous rows in the source CSV and import again.
- Blank names and `*** MISSING DESCRIPTION ***` records are skipped.
- The backend independently checks permissions, sizes, names and account
  numbers for every batch. Concurrent imports and retries do not create
  duplicate customers.
- Work is saved in batches of 100. If a later batch fails, earlier successful
  batches remain saved. Retry the remaining rows or reload the file; existing
  customers will be skipped. Progress reports completed batches.
- CSV limit: 10 MB and 10,000 rows. Quoted commas, escaped quotes, multiline
  fields, CRLF and UTF-8 BOM are supported. Invalid CSV structure stops the
  preview with an explanatory error.

## Supplied export validation

`age-track-customers-2026-09-26.csv`: 2,337 rows, of which 166 are blocked.
Before checking existing Fleetcore customers: 2,032 eligible rows, 303 rows
excluded for repeated normalized names and two missing-description rows.
No customer records were imported as part of building or testing this feature.

## Implementation and verification

New files: `convex/customerImport.ts`, `convex/customerImportRules.ts`,
`src/lib/clients/ageAnalysisCsv.ts`, its test file, and
`src/components/admin/CustomerCsvImport.tsx`.

Updated: Clients page, generated API bindings, shared handler-test suite and
`UPDATES.md`. No schema, package or existing-customer changes.

Public mutation: `customerImport.importAgeAnalysis`, requiring an admin session.
All 490 tests pass; TypeScript and feature lint pass. Tests cover parsing,
mapping, duplicate handling, inactive-account preservation, server permissions,
bounded batches and retry safety. The exact supplied export was also parsed
successfully. The existing repository-wide splash-screen lint errors remain
outside this change.
