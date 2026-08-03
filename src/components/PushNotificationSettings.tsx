"use client";

import { useEffect, useState } from "react";
import { useAction, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { BellRing, Send, Smartphone, Trash2 } from "lucide-react";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";

type InitState = {
  supported: boolean;
  permission: NotificationPermission | "unsupported";
};

/**
 * Web Push settings for the installed PWA. Requires:
 *  - HTTPS (Vercel) so the Push API is available
 *  - NEXT_PUBLIC_VAPID_PUBLIC_KEY in the frontend env
 *  - VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY set in the Convex env
 *
 * SSR-safe: the initial render is a neutral placeholder on both server and
 * client; the real UI appears after a deferred mount-time check.
 */
export function PushNotificationSettings() {
  const [init, setInit] = useState<InitState | null>(null);
  const [granted, setGranted] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [configured, setConfigured] = useState(!!VAPID_PUBLIC_KEY);

  const saveSubscription = useMutation(api.webPushSubscriptions.saveSubscription);
  const removeSubscription = useMutation(api.webPushSubscriptions.removeSubscription);
  const sendTest = useAction(api.webPush.sendTest);

  useEffect(() => {
    let mounted = true;
    const detect = async () => {
      const supported =
        typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window;
      const permission =
        supported && "Notification" in window ? Notification.permission : "unsupported";
      // Defer to a microtask so the first paint is identical on server + client
      // (avoids React hydration mismatches), and the state update isn't
      // synchronous inside the effect.
      await Promise.resolve();
      if (!mounted) return;
      setInit({ supported, permission });
      if (!supported) return;
      navigator.serviceWorker
        .ready.then((reg) => reg.pushManager.getSubscription())
        .then((sub) => {
          if (mounted) setSubscribed(!!sub);
        })
        .catch(() => {});
    };
    detect();
    return () => {
      mounted = false;
    };
  }, []);

  const enable = async () => {
    if (!init?.supported) return;
    setBusy(true);
    setStatus("");
    try {
      if (!VAPID_PUBLIC_KEY) {
        setConfigured(false);
        setStatus(
          "Push is not configured yet - the VAPID public key is missing from the environment."
        );
        return;
      }
      if (Notification.permission === "denied") {
        setStatus(
          "Notifications are blocked in this browser. Allow them in the site settings first."
        );
        return;
      }
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setStatus("Permission not granted - enable notifications to continue.");
        return;
      }
      setGranted(true);
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
        });
      }
      const json = sub.toJSON();
      await saveSubscription({
        endpoint: json.endpoint || "",
        keys: { p256dh: json.keys?.p256dh || "", auth: json.keys?.auth || "" },
        userAgent: navigator.userAgent,
      });
      setSubscribed(true);
      setStatus("Subscribed! Notifications are enabled on this device.");
    } catch (err) {
      setStatus("Failed to subscribe: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    setStatus("");
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await sub.unsubscribe();
        await removeSubscription({ endpoint: sub.endpoint });
      }
      setSubscribed(false);
      setStatus("Unsubscribed from push notifications.");
    } catch (err) {
      setStatus("Failed to unsubscribe: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    setBusy(true);
    setStatus("");
    try {
      const res = (await sendTest()) as { sent?: number };
      setStatus(`Test notification sent to ${res.sent ?? 0} device(s).`);
    } catch (err) {
      setStatus("Test failed: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setBusy(false);
    }
  };

  if (!init) {
    return <p className="text-sm text-[var(--nav-text-color)]">Checking push support…</p>;
  }

  if (!init.supported) {
    return (
      <p className="text-sm text-[var(--nav-text-color)]">
        <Smartphone className="w-4 h-4 inline mr-2 -mt-0.5" />
        Push notifications are not available in this browser. Install the app on a phone (Chrome or
        Safari) to enable them.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${
            subscribed
              ? "bg-green-50 text-green-700 border-green-300"
              : "bg-[var(--card-bg)] text-[var(--nav-text-color)] border-[var(--card-border)]"
          }`}
        >
          <BellRing className="w-3.5 h-3.5" />
          {subscribed ? "Enabled on this device" : "Not enabled on this device"}
        </span>
        <span className="text-xs text-[var(--nav-text-color)]">
          Permission:{" "}
          <span className="font-medium">{granted ? "granted" : init.permission}</span>
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        {!subscribed ? (
          <button
            onClick={enable}
            disabled={busy}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-gradient-to-br from-[#06B6D4] to-[#0891B2] text-white hover:opacity-90 shadow-sm disabled:opacity-40 transition-opacity"
          >
            <BellRing className="w-4 h-4" />
            {busy ? "Working…" : "Enable notifications"}
          </button>
        ) : (
          <button
            onClick={disable}
            disabled={busy}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border border-[var(--card-border)] text-[var(--nav-text-color)] hover:bg-[var(--card-bg)] disabled:opacity-40 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            Disable
          </button>
        )}
        <button
          onClick={test}
          disabled={busy || !subscribed}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border border-[var(--card-border)] text-[var(--nav-text-color)] hover:bg-[var(--card-bg)] disabled:opacity-40 transition-colors"
        >
          <Send className="w-4 h-4" />
          Send test notification
        </button>
      </div>

      {!configured && (
        <p className="text-xs text-amber-600 border border-amber-200 bg-amber-50 rounded-md px-3 py-2">
          VAPID public key is not set (NEXT_PUBLIC_VAPID_PUBLIC_KEY) - subscribing will fail until
          the admin adds it to the environment.
        </p>
      )}

      {status && <p className="text-xs text-[var(--nav-text-color)]">{status}</p>}

      <p className="text-xs text-[var(--nav-text-color)] leading-relaxed">
        You will get a daily dispatch summary (routes planned for today) and expiry alerts on this
        device. Requires the app to be installed and notifications allowed.
      </p>
    </div>
  );
}
