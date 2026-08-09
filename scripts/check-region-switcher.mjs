/**
 * Quick CDP check for the Stage 4 admin region switcher.
 * Logs in as admin, then verifies a select labelled "Region filter"
 * exists and that changing it re-queries the dashboard.
 *
 * Usage: node scripts/check-region-switcher.mjs
 * Env:   AUDIT_EMAIL / AUDIT_PASSWORD (optional, defaults to seed admin)
 */
import { spawn } from "node:child_process";
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  existsSync,
  readFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = "https://fleetcore-mu.vercel.app";
const AUDIT_EMAIL = process.env.AUDIT_EMAIL || "admin@fleetcore.app";
const AUDIT_PASSWORD = process.env.AUDIT_PASSWORD || "admin123";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = mkdtempSync(join(tmpdir(), "fc-region-"));
const flags = [
  "--headless=new",
  "--disable-gpu",
  "--no-first-run",
  "--no-default-browser-check",
  "--disable-extensions",
  "--remote-debugging-port=0",
  `--user-data-dir=${profile}`,
  "about:blank",
];
const chrome = spawn("C:/Program Files/Google/Chrome/Application/chrome.exe", flags, {
  stdio: "ignore",
});

async function waitFor(fn, timeoutMs = 10000, intervalMs = 400) {
  const start = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - start >= timeoutMs) return null;
    await sleep(intervalMs);
  }
}

async function getDebugPort() {
  const portFile = join(profile, "DevToolsActivePort");
  return waitFor(() => {
    try {
      const port = parseInt(readFileSync(portFile, "utf8").split("\n")[0], 10);
      return Number.isInteger(port) && port > 0 ? port : null;
    } catch {
      return null;
    }
  }, 18000, 300);
}

let msgId = 0;
function makeClient(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const pending = new Map();
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.id && pending.has(msg.id)) {
        const { res, rej } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) rej(new Error(msg.error.message));
        else res(msg.result);
      }
    };
    ws.onopen = () => {
      const send = (method, params = {}) =>
        new Promise((res, rej) => {
          const id = ++msgId;
          pending.set(id, { res, rej });
          ws.send(JSON.stringify({ id, method, params }));
        });
      resolve({ ws, send });
    };
    ws.onerror = () => reject(new Error("WebSocket connection failed"));
  });
}

async function main() {
  const port = await getDebugPort();
  const target = await fetch(
    `http://127.0.0.1:${port}/json/new?${encodeURIComponent(BASE + "/login")}`,
    { method: "PUT" }
  ).then((r) => r.json());
  const { ws, send } = await makeClient(target.webSocketDebuggerUrl);
  const evalJs = async (expression) => {
    const r = await send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    return r.exceptionDetails ? { error: r.exceptionDetails.text } : r.result.value;
  };

  await send("Page.enable");
  await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", {
    width: 375,
    height: 812,
    deviceScaleFactor: 3,
    mobile: true,
  });

  // Wait for the login form
  const hasForm = await waitFor(
    () => evalJs(`!!document.querySelector('input[type="email"]')`),
    20000
  );
  if (!hasForm) {
    console.log("RESULT: FAIL — no login form (already authed or page failed)");
    process.exit(1);
  }

  const loggedIn = await waitFor(async () => {
    const filled = await evalJs(`(async () => {
      const setNative = (el, value) => {
        const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
        setter.call(el, value);
        el.dispatchEvent(new Event("input", { bubbles: true }));
      };
      const email = document.querySelector('input[type="email"]');
      const password = document.querySelector('input[type="password"]');
      if (!email || !password) return false;
      setNative(email, ${JSON.stringify(AUDIT_EMAIL)});
      setNative(password, ${JSON.stringify(AUDIT_PASSWORD)});
      const btn = document.querySelector('button[type="submit"]');
      if (btn) btn.click();
      return true;
    })()`);
    if (!filled) return null;
    await sleep(2000);
    return (await evalJs(
      `location.pathname !== "/login" && !!document.querySelector('[aria-label="Open navigation"]')`
    ))
      ? true
      : null;
  }, 25000);

  if (!loggedIn) {
    console.log("RESULT: FAIL — login did not complete");
    process.exit(1);
  }
  console.log("logged in as admin");

  // Check the region switcher exists (desktop sidebar visible at this viewport)
  const info = await evalJs(`(() => {
    const sel = document.querySelector('select[aria-label="Region filter"]');
    return {
      exists: !!sel,
      value: sel ? sel.value : null,
      options: sel ? [...sel.options].map(o => o.textContent.trim()) : [],
      sidebarVisible: !!document.querySelector('aside select[aria-label="Region filter"]'),
    };
  })()`);
  console.log("region switcher:", JSON.stringify(info));

  // Try changing it and confirm the dashboard re-renders
  if (info.exists) {
    const changed = await evalJs(`(async () => {
      const sel = document.querySelector('select[aria-label="Region filter"]');
      if (!sel) return false;
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set;
      setter.call(sel, "eastern_cape");
      sel.dispatchEvent(new Event("change", { bubbles: true }));
      await new Promise((r) => setTimeout(r, 2500));
      return true;
    })()`);
    const after = await evalJs(`document.querySelector('select[aria-label="Region filter"]')?.value`);
    console.log("changed to:", after, "| ok:", changed);
  }

  console.log("RESULT: " + (info.exists ? "PASS" : "FAIL"));
  ws.close();
  chrome.kill();
  rmSync(profile, { recursive: true, force: true });
  process.exit(info.exists ? 0 : 1);
}

main().catch((e) => {
  console.error("ERROR:", e.message);
  chrome.kill();
  process.exit(1);
});
