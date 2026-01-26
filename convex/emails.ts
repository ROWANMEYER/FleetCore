import { action } from "./_generated/server";
import { v } from "convex/values";
import { Resend } from "resend";
import { api } from "./_generated/api";
import { calculateLoadAmount } from "./utils";

export const sendLoadReportEmail = action({
  args: {
    recipientIds: v.array(v.id("recipients")),
    startDate: v.string(),
    endDate: v.string(),
    subject: v.string(),
    completedOnly: v.optional(v.boolean()),
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

    // 3. Generate HTML (Server-side)
    const html = generateHtmlReport(data, args.startDate, args.endDate);

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

// Helper to format currency (ZAR)
const formatZAR = (value: number) =>
  new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    minimumFractionDigits: 2,
  }).format(value);

// Helper for unit mapping
const unitMap: Record<string, string> = {
  tons: "t",
  pallets: "pallets",
  bales: "bales",
  bags: "bags",
};

function generateHtmlReport(data: any, startDate: string, endDate: string) {
  const rows = data.loads
    .map(
      (load: any) => {
        const unit = unitMap[load.quantityType] || load.quantityType || "";
        const rateType = load.rateType || "per_unit";
        const amount = calculateLoadAmount(load.quantity, load.rate, rateType);
        
        const qtyDisplay = rateType === "flat" ? "Flat" : `${load.quantity} ${unit}`;

        return `
        <tr>
            <td style="padding: 8px; border: 1px solid #ddd; white-space: nowrap;">${load.routeDate}</td>
            <td style="padding: 8px; border: 1px solid #ddd; white-space: nowrap;">${load.truckFleetNo}</td>
            <td style="padding: 8px; border: 1px solid #ddd; white-space: nowrap;">${load.trailerFleetNo || "-"}</td>
            <td style="padding: 8px; border: 1px solid #ddd; white-space: nowrap;">${load.driverName}</td>
            <td style="padding: 8px; border: 1px solid #ddd;">${load.clientName}</td>
            <td style="padding: 8px; border: 1px solid #ddd;">${Array.isArray(load.fromLocation) ? load.fromLocation.join(" → ") : load.fromLocation}</td>
            <td style="padding: 8px; border: 1px solid #ddd;">${Array.isArray(load.toLocation) ? load.toLocation.join(" → ") : load.toLocation}</td>
            <td style="padding: 8px; border: 1px solid #ddd; text-align: right; white-space: nowrap;">${formatZAR(load.rate)}</td>
        </tr>
    `
      }
    )
    .join("");

  return `
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 12px; }
            th { background-color: #f4f4f4; text-align: left; padding: 8px; border: 1px solid #ddd; }
            .summary { margin-top: 30px; padding: 15px; background-color: #f9f9f9; border: 1px solid #eee; }
            .header { margin-bottom: 20px; border-bottom: 2px solid #333; padding-bottom: 10px; }
            .footer { margin-top: 40px; font-size: 11px; color: #888; border-top: 1px solid #eee; padding-top: 10px; }
        </style>
    </head>
    <body>
        <div class="header">
            <h2>Transport Report</h2>
            <p><strong>Period:</strong> ${startDate} to ${endDate}</p>
        </div>

        <table>
            <thead>
                <tr>
                    <th>Date</th>
                    <th>Truck</th>
                    <th>Trailer</th>
                    <th>Driver</th>
                    <th>Client</th>
                    <th>From</th>
                    <th>To</th>
                    <th style="text-align: right;">Rate</th>
                </tr>
            </thead>
            <tbody>
                ${rows}
            </tbody>
        </table>

        <div class="summary">
            <h3>Summary</h3>
            <table style="width: auto;">
                <tr>
                    <td style="border: none; padding: 5px 15px 5px 0;"><strong>Total Loads:</strong></td>
                    <td style="border: none; padding: 5px;">${data.summary.totalLoads}</td>
                </tr>
                <tr>
                    <td style="border: none; padding: 5px 15px 5px 0;"><strong>Total Distance:</strong></td>
                    <td style="border: none; padding: 5px;">${data.summary.totalKm} km</td>
                </tr>
                <tr>
                    <td style="border: none; padding: 5px 15px 5px 0;"><strong>Total Revenue:</strong></td>
                    <td style="border: none; padding: 5px;">${formatZAR(Number(data.summary.totalRevenue))}</td>
                </tr>
            </table>
        </div>

        <hr style="margin-top:24px;margin-bottom:16px;" />

        <div style="font-size:13px;line-height:1.6;color:#333;">
          <strong>Rowan Meyer</strong><br/>
          Anton Le Roux Vervoer<br/>
          2 Meul Straat<br/>
          George Industria<br/>
          George, 6536<br/>
          📞 063 257 0340<br/>
          📞 044 874 2292<br/>
          ✉️ <a href="mailto:rowan@alrpt.co.za">rowan@alrpt.co.za</a><br/>
          🌐 <a href="https://antonlerouxvervoer.co.za">antonlerouxvervoer.co.za</a>
        </div>
    </body>
    </html>
    `;
}
