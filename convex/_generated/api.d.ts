/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as dailyRoutes from "../dailyRoutes.js";
import type * as dashboard from "../dashboard.js";
import type * as dataImport from "../dataImport.js";
import type * as emailTemplates from "../emailTemplates.js";
import type * as emails from "../emails.js";
import type * as fleet from "../fleet.js";
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
  dailyRoutes: typeof dailyRoutes;
  dashboard: typeof dashboard;
  dataImport: typeof dataImport;
  emailTemplates: typeof emailTemplates;
  emails: typeof emails;
  fleet: typeof fleet;
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
