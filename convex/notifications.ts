import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";

export const checkStageReminders = internalAction({
  handler: async (ctx) => {
    const settings = await ctx.runQuery(internal.settings.getAppSettingsInternal);
    if (!settings?.pushToken) return;

    const now = Date.now();
    const DAY_MS = 86400000;

    const active = await ctx.runQuery(internal.pdp.getActiveApplications);
    console.log("Active applications count:", active.length);

    for (const app of active) {
      if (typeof app.driverId !== "string" || !app.driverId || app.driverId.trim() === "") {
        console.warn("Skipping app with invalid driverId:", app);
        continue;
      }
      const driver = await ctx.runQuery(internal.drivers.getDriver, { driverId: app.driverId });
      const name = driver?.driverName ?? "A driver";

      if (app.departedAt && !app.returnAt) {
        const daysSince = (now - app.departedAt) / DAY_MS;
        if (daysSince >= settings.stage1AlertDays) {
          await sendPushNotification(settings.pushToken, "⏳ PDP Return Overdue", `${name} departed ${Math.floor(daysSince)} days ago with no return logged.`, {
            driverId: String(app.driverId),
          });
        }
        continue;
      }

      const docsPresent =
        (Array.isArray(app.docAttachmentIds) && app.docAttachmentIds.length > 0) ||
        (typeof app.docsNotes === "string" && app.docsNotes.trim().length > 0);

      if (app.returnAt && !docsPresent) {
        const daysSince = (now - app.returnAt) / DAY_MS;
        if (daysSince >= settings.stage2AlertDays) {
          await sendPushNotification(
            settings.pushToken,
            "📄 Documents Not Submitted",
            `${name} returned ${Math.floor(daysSince)} days ago but docs not submitted.`,
            { driverId: String(app.driverId) }
          );
        }
        continue;
      }

      if (app.returnAt && docsPresent && !app.card?.collectedAt) {
        const base = typeof app.updatedAt === "number" ? app.updatedAt : app.returnAt;
        const daysSince = (now - base) / DAY_MS;
        if (daysSince >= settings.stage3AlertDays) {
          await sendPushNotification(
            settings.pushToken,
            "💳 Card Not Collected",
            `${name}'s card has not been collected after ${Math.floor(daysSince)} days.`,
            { driverId: String(app.driverId) }
          );
        }
      }
    }
  },
});

export const checkExpiryReminders = internalAction({
  handler: async (ctx) => {
    const settings = await ctx.runQuery(internal.settings.getAppSettingsInternal);
    if (!settings?.pushToken) return;

    const drivers = await ctx.runQuery(internal.drivers.getAllDrivers, {});
    const now = Date.now();
    const DAY_MS = 86400000;

    for (const driver of drivers) {
      if (!driver.pdpExpiryDate) continue;
      const expiryMs = new Date(driver.pdpExpiryDate).getTime();
      if (Number.isNaN(expiryMs)) continue;

      const daysUntil = Math.floor((expiryMs - now) / DAY_MS);

      const thresholds = [
        { days: 90, enabled: settings.expiryReminder90 },
        { days: 60, enabled: settings.expiryReminder60 },
        { days: 30, enabled: settings.expiryReminder30 },
      ];

      for (const t of thresholds) {
        if (t.enabled && daysUntil <= t.days && daysUntil >= t.days - 3) {
          await sendPushNotification(
            settings.pushToken,
            `⚠️ PDP Expiry in ${daysUntil} days`,
            `${driver.driverName}'s PDP expires on ${driver.pdpExpiryDate}.`,
            { driverId: String(driver._id) }
          );
        }
      }

      if (daysUntil < 0) {
        await sendPushNotification(
          settings.pushToken,
          "🚨 PDP Expired",
          `${driver.driverName}'s PDP expired ${Math.abs(daysUntil)} days ago.`,
          { driverId: String(driver._id) }
        );
      }
    }
  },
});

async function sendPushNotification(token: string, title: string, body: string, data: Record<string, string>) {
  await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ to: token, title, body, data, sound: "default" }),
  });
}

