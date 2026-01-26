import { action } from "./_generated/server";
import { v } from "convex/values";
import { Resend } from "resend";
import { api } from "./_generated/api";
import { calculateLoadAmount } from "./utils";

import { renderTransportReport } from "./templates/TransportReport";

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
      const match = allRecipients.find((r) => r._id === id);
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
      from: "FleetCore <onboarding@resend.dev>",
      to: validEmails,
      subject: args.subject,
      html: html,
    });

    if (result.error) {
      console.error("Resend Error:", result.error);
      throw new Error("Email delivery failed. Please try again later.");
    }

    return { success: true };
  },
});

