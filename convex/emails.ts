import { action } from "./_generated/server";
import { v } from "convex/values";
import { Resend } from "resend";
import { api } from "./_generated/api";

import { renderTransportReport } from "./templates/TransportReport";

// Resend sender — set RESEND_FROM once a domain is verified (e.g.
// "FleetCore <reports@yourdomain.co.za>"). The onboarding@resend.dev fallback
// only delivers to the account owner's own email address.
const SENDER = process.env.RESEND_FROM || "FleetCore <onboarding@resend.dev>";

/**
 * Escape user-supplied strings before they reach the transport-report HTML.
 * Unlike QuickSend (whose data comes from the DB), sendSummaryEmail renders
 * client-supplied rows, so markup in e.g. a client name must never leak into
 * the email body.
 */
const escapeHtml = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/** Shared recipient validation — resolves ids to verified emails. */
async function resolveRecipientEmails(ctx: any, recipientIds: string[]): Promise<string[]> {
  const allRecipients = await ctx.runQuery(api.recipients.list);
  const validEmails: string[] = [];
  for (const id of recipientIds) {
    const match = allRecipients.find((r: any) => r._id === id);
    if (match && match.email) validEmails.push(match.email);
  }
  if (validEmails.length === 0) {
    throw new Error("No valid recipients selected. Please select at least one recipient.");
  }
  return validEmails;
}

/**
 * Emails the routes currently visible on the mobile Route Summary sheet as a
 * QuickSend-style HTML transport report (table + totals) — no attachment.
 * The rows are the client-side filtered set (search/filters/date mode applied),
 * passed up as flat export rows exactly like the CSV/Excel/JSON/PDF exports.
 */
export const sendSummaryEmail = action({
  args: {
    recipientIds: v.array(v.id("recipients")),
    subject: v.string(),
    dateRange: v.string(),
    rows: v.array(
      v.object({
        date: v.string(),
        truck: v.string(),
        trailer: v.string(),
        driver: v.string(),
        client: v.string(),
        from: v.string(),
        to: v.string(),
        routeKm: v.number(),
        amount: v.number(),
        ratePerKm: v.number(),
        status: v.string(),
        // Driver photo URL from the sheets rows (decorated onto routes by the
        // sheets page) so the summary email renders the driver photo too.
        driverPhotoUrl: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      throw new Error("Email configuration error: API key missing.");
    }
    if (args.rows.length === 0) {
      throw new Error("No routes to email.");
    }

    const validEmails = await resolveRecipientEmails(ctx, args.recipientIds);

    // Map flat export rows into the transport-report renderer's load shape,
    // HTML-escaping every user-supplied string first (see escapeHtml above).
    const loads = args.rows.map((r) => ({
      routeDate: escapeHtml(r.date),
      truckFleetNo: escapeHtml(r.truck),
      trailerFleetNo: escapeHtml(r.trailer),
      // Passed raw (not escapeHtml'd): the transport report's driver column
      // sanitizes the name itself, so escaping here would double-encode "&"
      // in names like "J&J TRANSPORT". Same for the photo URL.
      driverName: r.driver,
      driverPhotoUrl: r.driverPhotoUrl || "",
      clientName: escapeHtml(r.client),
      fromLocation: r.from ? r.from.split(",").map(escapeHtml) : [],
      toLocation: r.to ? r.to.split(",").map(escapeHtml) : [],
      rate: r.amount,
      distance: r.routeKm,
    }));

    const [startDate, endDate] = args.dateRange.split(" to ");
    const html = renderTransportReport({
      data: {
        loads,
        summary: {
          totalLoads: args.rows.length,
          totalKm: args.rows.reduce((s, r) => s + r.routeKm, 0),
          totalRevenue: args.rows.reduce((s, r) => s + r.amount, 0),
        },
      },
      startDate: startDate || args.dateRange,
      endDate: endDate || args.dateRange,
      activeColumns: ["date", "truck", "trailer", "driver", "client", "from", "to", "rate", "distance"],
      columnNotes: [],
    });

    const resend = new Resend(apiKey);
    const result = await resend.emails.send({
      from: SENDER,
      to: validEmails,
      subject: args.subject,
      html,
    });

    if (result.error) {
      console.error("Resend Error:", result.error);
      // Surface Resend's real reason — it reaches the UI toast so the user
      // doesn't need a console to understand what went wrong.
      throw new Error(`Email delivery failed: ${result.error.message}`);
    }

    return { success: true };
  },
});

export const sendLoadReportEmail = action({
  args: {
    recipientIds: v.array(v.id("recipients")),
    startDate: v.string(),
    endDate: v.string(),
    subject: v.string(),
    completedOnly: v.optional(v.boolean()),
    activeColumns: v.optional(v.array(v.string())),
    columnNotes: v.optional(v.array(v.object({
      column: v.string(),
      note: v.string(),
    }))),
    // Region scoping: the session token (and admin region override) flow through
    // so the report data is scoped server-side exactly like the UI queries.
    token: v.optional(v.union(v.string(), v.null())),
    region: v.optional(v.union(v.literal("garden_route"), v.literal("eastern_cape"), v.null())),
  },
  handler: async (ctx, args) => {
    const apiKey = process.env.RESEND_API_KEY;

    if (!apiKey) {
      throw new Error("Email configuration error: API key missing.");
    }

    // 1. Validate Recipients
    const allRecipients = await ctx.runQuery(api.recipients.list);
    const validEmails: string[] = [];

    for (const id of args.recipientIds) {
      const match = allRecipients.find((r: any) => r._id === id);
      if (match && match.email) {
        validEmails.push(match.email);
      }
    }

    if (validEmails.length === 0) {
      throw new Error("No valid recipients selected. Please select at least one recipient.");
    }

    // 2. Fetch Data (Backend-first filtering & calculation)
    const data = await ctx.runQuery(api.dailyRoutes.getQuickSendReport, {
      startDate: args.startDate,
      endDate: args.endDate,
      completedOnly: args.completedOnly,
      token: args.token,
      region: args.region ?? undefined,
    });

    if (data.loads.length === 0) {
      // Backend safe return
      console.log("No loads found, skipping email.");
      return { success: false, message: "No loads found for this period." };
    }

    // Default columns if not provided
    const defaultColumns = ["date", "truck", "trailer", "driver", "client", "from", "to", "rate"];
    const activeColumns = args.activeColumns || defaultColumns;

    // 3. Generate HTML (Shared Renderer)
    const html = renderTransportReport({
      data,
      startDate: args.startDate,
      endDate: args.endDate,
      activeColumns,
      columnNotes: args.columnNotes || [],
    });

    // 4. Send Email
    const resend = new Resend(apiKey);

    // NOTE: Using Resend’s verified sender for development. 
    // Replace with fleetcore.app once domain is verified.
    const result = await resend.emails.send({
      from: SENDER,
      to: validEmails,
      subject: args.subject,
      html: html,
    });

    if (result.error) {
      console.error("Resend Error:", result.error);
      throw new Error(`Email delivery failed: ${result.error.message}`);
    }

    return { success: true };
  },
});

