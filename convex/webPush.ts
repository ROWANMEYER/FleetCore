"use node";

import { action, internalAction } from "./_generated/server";
import { api, internal } from "./_generated/api";
import webpush from "web-push";

/**
 * Web Push (PWA) sending logic — runs in the Node.js runtime because the
 * `web-push` package uses Node APIs.
 *
 * VAPID keys must be configured in the Convex environment:
 *   npx convex env set VAPID_PUBLIC_KEY  <public key>
 *   npx convex env set VAPID_PRIVATE_KEY <private key>
 *   npx convex env set VAPID_SUBJECT     mailto:ops@fleetcore.app
 */
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:ops@fleetcore.app";

function getWebPush(): typeof webpush {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    throw new Error(
      "VAPID keys not configured. Run: npx convex env set VAPID_PUBLIC_KEY <key> and npx convex env set VAPID_PRIVATE_KEY <key>"
    );
  }
  webpush.setVapidDetails(VAPID_SUBJECT, publicKey, privateKey);
  return webpush;
}

async function broadcast(
  ctx: any,
  title: string,
  body: string,
  url: string
): Promise<{ sent: number; removed: number; total: number }> {
  const webpush = getWebPush();
  const subs = await ctx.runQuery(internal.webPushSubscriptions.listSubscriptions);
  let sent = 0;
  let removed = 0;
  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: sub.keys },
        JSON.stringify({ title, body, url })
      );
      sent += 1;
    } catch (err: any) {
      // 404/410 means the subscription is gone — prune it so we don't retry forever
      if (err && (err.statusCode === 404 || err.statusCode === 410)) {
        await ctx.runMutation(internal.webPushSubscriptions.deleteSubscription, { id: sub._id });
        removed += 1;
      }
    }
  }
  return { sent, removed, total: subs.length };
}

/** Sends a test notification to every subscribed device (Settings → Send test). */
export const sendTest = action({
  args: {},
  handler: async (ctx) => {
    return await broadcast(ctx, "🔔 FleetCore", "Test notification — push is working!", "/");
  },
});

type DispatchResult = { skipped?: boolean; reason?: string; sent: number; removed: number; total: number };

async function runDailyDispatch(ctx: any): Promise<DispatchResult> {
  if (!process.env.VAPID_PRIVATE_KEY) {
    return { skipped: true, reason: "VAPID not configured", sent: 0, removed: 0, total: 0 };
  }
  const today = new Date().toISOString().split("T")[0];
  const routes = await ctx.runQuery(api.dailyRoutes.getForSheets, {
    startDate: today,
    endDate: today,
  });
  const count = Array.isArray(routes) ? routes.length : 0;
  const title = "📦 Today's Dispatch";
  const body =
    count > 0
      ? `${count} route${count === 1 ? "" : "s"} planned for today. Tap to open the sheets.`
      : "No routes planned for today.";
  return await broadcast(ctx, title, body, "/operations/daily-planner/sheets");
}

/** Daily dispatch summary — runs via cron and pushes to all subscribed devices. */
export const sendDailyDispatch = internalAction({
  args: {},
  handler: runDailyDispatch,
});
