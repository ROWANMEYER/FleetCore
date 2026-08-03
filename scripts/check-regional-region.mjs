/**
 * CDP check: when the regional user (eastern_cape) opens the route-input page,
 * the Region select must default to "eastern_cape" and be disabled (locked).
 *
 * Usage: node scripts/check-regional-region.mjs
 * Env:   REGIONAL_EMAIL / REGIONAL_PASSWORD (optional)
 */
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = "https://fleetcore-mu.vercel.app";
const REGIONAL_EMAIL = process.env.REGIONAL_EMAIL || "regional@fleetcore.app";
const REGIONAL_PASSWORD = process.env.REGIONAL_PASSWORD || "Fleetcore2026!";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = mkdtempSync(join(tmpdir(), "fc-regional-"));
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

  const hasForm = await waitFor(
    () => evalJs(`!!document.querySelector('input[type="email"]')`),
    20000
  );
  if (!hasForm) {
    console.log("RESULT: FAIL — no login form");
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
      setNative(email, ${JSON.stringify(REGIONAL_EMAIL)});
      setNative(password, ${JSON.stringify(REGIONAL_PASSWORD)});
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
  console.log("logged in as", REGIONAL_EMAIL);

  // Navigate to the input page (retry if the guard bounces us on a cold deploy)
  await send("Page.navigate", { url: BASE + "/operations/daily-planner/input" });
  let page = null;
  for (let attempt = 0; attempt < 4 && !page; attempt++) {
    await waitFor(async () => {
      const ready = await evalJs("document.readyState");
      return ready === "complete" ? true : null;
    }, 20000);
    await sleep(2500);
    page = await evalJs(`(() => {
      const selects = [...document.querySelectorAll("select")];
      const region = selects.find((s) =>
        [...s.options].map((o) => o.textContent.trim()).join("|") === "Garden Route|Eastern Cape"
      );
      return region ? true : null;
    })()`);
    if (!page) {
      const path = await evalJs("location.pathname");
      if (path !== "/operations/daily-planner/input") {
        console.log("bounced to", path, "- retrying navigation");
        await send("Page.navigate", { url: BASE + "/operations/daily-planner/input" });
        await sleep(1500);
      }
    }
  }

  const info = await evalJs(`(() => {
    const selects = [...document.querySelectorAll("select")];
    const region = selects.find((s) =>
      [...s.options].map((o) => o.textContent.trim()).join("|") === "Garden Route|Eastern Cape"
    );
    return {
      found: !!region,
      value: region ? region.value : null,
      disabled: region ? region.disabled : null,
      helperText: document.body.textContent.includes("Locked to your region (Eastern Cape)"),
    };
  })()`);
  console.log("region select:", JSON.stringify(info));

  const pass = info.found && info.value === "eastern_cape" && info.disabled === true && info.helperText;
  console.log("RESULT: " + (pass ? "PASS" : "FAIL"));
  ws.close();
  chrome.kill();
  rmSync(profile, { recursive: true, force: true });
  process.exit(pass ? 0 : 1);
}

main().catch((e) => {
  console.error("ERROR:", e.message);
  chrome.kill();
  process.exit(1);
});
