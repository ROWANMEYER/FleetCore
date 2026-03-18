/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as adminSettings from "../adminSettings.js";
import type * as attachments from "../attachments.js";
import type * as backfillStatus from "../backfillStatus.js";
import type * as cleanupTrailerSwaps from "../cleanupTrailerSwaps.js";
import type * as cleanup_trucks from "../cleanup_trucks.js";
import type * as crons from "../crons.js";
import type * as customers from "../customers.js";
import type * as dailyAvailability from "../dailyAvailability.js";
import type * as dailyOps from "../dailyOps.js";
import type * as dailyRoutes from "../dailyRoutes.js";
import type * as damageLogs from "../damageLogs.js";
import type * as dashboard from "../dashboard.js";
import type * as dataImport from "../dataImport.js";
import type * as displaySettings from "../displaySettings.js";
import type * as drivers from "../drivers.js";
import type * as emailTemplates from "../emailTemplates.js";
import type * as emails from "../emails.js";
import type * as finance_allocations from "../finance/allocations.js";
import type * as finance_dashboard from "../finance/dashboard.js";
import type * as finance_deleteAgeSnapshot from "../finance/deleteAgeSnapshot.js";
import type * as finance_getAgeSnapshotRows from "../finance/getAgeSnapshotRows.js";
import type * as finance_getAgeSnapshotSummary from "../finance/getAgeSnapshotSummary.js";
import type * as finance_getAgeSnapshots from "../finance/getAgeSnapshots.js";
import type * as finance_importAgeSnapshot from "../finance/importAgeSnapshot.js";
import type * as finance_lib_parseAgeAnalysis from "../finance/lib/parseAgeAnalysis.js";
import type * as finance_lib_validateAgeRows from "../finance/lib/validateAgeRows.js";
import type * as finance_payments from "../finance/payments.js";
import type * as fleet from "../fleet.js";
import type * as fleetSetup from "../fleetSetup.js";
import type * as fleetStatus from "../fleetStatus.js";
import type * as health from "../health.js";
import type * as http from "../http.js";
import type * as invoices from "../invoices.js";
import type * as migrations from "../migrations.js";
import type * as myDay from "../myDay.js";
import type * as notifications from "../notifications.js";
import type * as pdp from "../pdp.js";
import type * as pdpReport from "../pdpReport.js";
import type * as recipients from "../recipients.js";
import type * as resetFlags from "../resetFlags.js";
import type * as routes from "../routes.js";
import type * as seed from "../seed.js";
import type * as settings from "../settings.js";
import type * as tasks from "../tasks.js";
import type * as templates_TransportReport from "../templates/TransportReport.js";
import type * as trailerRenewals from "../trailerRenewals.js";
import type * as trailerSwaps from "../trailerSwaps.js";
import type * as trailers from "../trailers.js";
import type * as truckRenewals from "../truckRenewals.js";
import type * as trucks from "../trucks.js";
import type * as utils from "../utils.js";
import type * as vehicleLicences from "../vehicleLicences.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  adminSettings: typeof adminSettings;
  attachments: typeof attachments;
  backfillStatus: typeof backfillStatus;
  cleanupTrailerSwaps: typeof cleanupTrailerSwaps;
  cleanup_trucks: typeof cleanup_trucks;
  crons: typeof crons;
  customers: typeof customers;
  dailyAvailability: typeof dailyAvailability;
  dailyOps: typeof dailyOps;
  dailyRoutes: typeof dailyRoutes;
  damageLogs: typeof damageLogs;
  dashboard: typeof dashboard;
  dataImport: typeof dataImport;
  displaySettings: typeof displaySettings;
  drivers: typeof drivers;
  emailTemplates: typeof emailTemplates;
  emails: typeof emails;
  "finance/allocations": typeof finance_allocations;
  "finance/dashboard": typeof finance_dashboard;
  "finance/deleteAgeSnapshot": typeof finance_deleteAgeSnapshot;
  "finance/getAgeSnapshotRows": typeof finance_getAgeSnapshotRows;
  "finance/getAgeSnapshotSummary": typeof finance_getAgeSnapshotSummary;
  "finance/getAgeSnapshots": typeof finance_getAgeSnapshots;
  "finance/importAgeSnapshot": typeof finance_importAgeSnapshot;
  "finance/lib/parseAgeAnalysis": typeof finance_lib_parseAgeAnalysis;
  "finance/lib/validateAgeRows": typeof finance_lib_validateAgeRows;
  "finance/payments": typeof finance_payments;
  fleet: typeof fleet;
  fleetSetup: typeof fleetSetup;
  fleetStatus: typeof fleetStatus;
  health: typeof health;
  http: typeof http;
  invoices: typeof invoices;
  migrations: typeof migrations;
  myDay: typeof myDay;
  notifications: typeof notifications;
  pdp: typeof pdp;
  pdpReport: typeof pdpReport;
  recipients: typeof recipients;
  resetFlags: typeof resetFlags;
  routes: typeof routes;
  seed: typeof seed;
  settings: typeof settings;
  tasks: typeof tasks;
  "templates/TransportReport": typeof templates_TransportReport;
  trailerRenewals: typeof trailerRenewals;
  trailerSwaps: typeof trailerSwaps;
  trailers: typeof trailers;
  truckRenewals: typeof truckRenewals;
  trucks: typeof trucks;
  utils: typeof utils;
  vehicleLicences: typeof vehicleLicences;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
