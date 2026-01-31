/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as customers from "../customers.js";
import type * as dailyRoutes from "../dailyRoutes.js";
import type * as dashboard from "../dashboard.js";
import type * as dataImport from "../dataImport.js";
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
import type * as invoices from "../invoices.js";
import type * as migrations from "../migrations.js";
import type * as recipients from "../recipients.js";
import type * as routes from "../routes.js";
import type * as templates_TransportReport from "../templates/TransportReport.js";
import type * as utils from "../utils.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  customers: typeof customers;
  dailyRoutes: typeof dailyRoutes;
  dashboard: typeof dashboard;
  dataImport: typeof dataImport;
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
  invoices: typeof invoices;
  migrations: typeof migrations;
  recipients: typeof recipients;
  routes: typeof routes;
  "templates/TransportReport": typeof templates_TransportReport;
  utils: typeof utils;
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
