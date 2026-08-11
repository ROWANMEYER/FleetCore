/**
 * Automated mobile refresh-button verification for the FleetCore PWA.
 *
 * Launches headless Chrome (auto-detected per platform), emulates a 375x812
 * phone, signs in as the admin seed user and asserts on the mobile top bar's
 * refresh button:
 *   - the button (aria-label "Refresh page") exists and is visible
 *   - clicking it spins the icon (animate-spin) for ~450ms
 *   - the page performs a FULL reload (window.location.reload) — detected via
 *     a window marker that disappears after the reload
 *   - after the reload the app restores on /dashboard, still logged in, with
 *     the refresh button and the four-tab bottom bar intact
 *   - no console errors (warnings beyond an allowlist fail too)
 *
 * Exits 1 (non-zero) if any assertion fails — suitable for CI.
 *
 * Usage: node scripts/verify-refresh-button.mjs [url]
 * Env:   CHROME_PATH   (optional, path to Chrome/Chromium binary)
 *        AUDIT_URL     (optional, alternative to the positional arg)
 *        AUDIT_EMAIL / AUDIT_PASSWORD (optional, default admin@fleetcore.app / admin123)
 */
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = process.argv[2] || process.env.AUDIT_URL || "http://localhost:3000";
const REFRESH_SELECTOR = '[aria-label="Refresh page"]';
const TAB_BAR_SELECTOR = '[aria-label="Bottom navigation"]';

/** Warnings matching these are third-party/cosmetic, not app bugs. */
const WARNING_ALLOWLIST = [
  /beforeinstallprompt/i,
  /form field element should have an id or name/i,
  /No label associated with a form field/i,
  /Download the React DevTools/i,
  /The width\(-?\d+\) and height\(-?\d+\) of chart should be greater than 0/i,
];

function resolveChrome() {
  if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
  const candidates =
    process.platform === "win32"
      ? [
          "C:/Program Files/Google/Chrome/Application/chrome.exe",
          "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
          `${process.env.LOCALAPPDATA || ""}/Google/Chrome/Application/chrome.exe`,
        ]
      : process.platform === "darwin"
        ? ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"]
        : ["/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser"];
  const found = candidates.find((c) => c && existsSync(c));
  if (!found) throw new Error("Chrome/Chromium not found. Set CHROME_PATH to point at the binary.");
  return found;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = mkdtempSync(join(tmpdir(), "fc-refresh-"));
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
if (process.platform !== "win32") flags.unshift("--no-sandbox", "--disable-dev-shm-usage");
const chrome = spawn(resolveChrome(), flags, { stdio: "ignore" });

async function waitFor(fn, timeoutMs = 12000, intervalMs = 300) {
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
    const errors = [];
    const warnings = [];
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.id && pending.has(msg.id)) {
        const { res, rej } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) rej(new Error(msg.error.message));
        else res(msg.result);
      } else if (msg.method === "Log.entryAdded") {
        const entry = msg.params.entry;
        if (entry.level === "error") errors.push({ kind: "log", text: entry.text });
        else if (entry.level === "warning") warnings.push({ kind: "log", text: entry.text });
      } else if (msg.method === "Runtime.exceptionThrown") {
        const d = msg.params.exceptionDetails || {};
        const desc = (d.exception && (d.exception.description || d.exception.value)) || d.text || "Unknown exception";
        errors.push({ kind: "exception", text: String(desc).slice(0, 500) });
      } else if (msg.method === "Runtime.consoleAPICalled") {
        const text = msg.params.args.map((a) => a.value ?? a.description ?? "").join(" ");
        if (msg.params.type === "error") errors.push({ kind: "console", text });
        else if (msg.params.type === "warning") warnings.push({ kind: "console", text });
      }
    };
    ws.onopen = () => {
      const send = (method, params = {}) =>
        new Promise((res, rej) => {
          const id = ++msgId;
          pending.set(id, { res, rej });
          ws.send(JSON.stringify({ id, method, params }));
        });
      resolve({ ws, send, errors, warnings });
    };
    ws.onerror = () => reject(new Error("WebSocket connection failed"));
  });
}

async function waitForEndpoint(url, tries = 60) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      /* retry */
    }
    await sleep(300);
  }
  throw new Error("Chrome debugging endpoint did not start");
}

async function main() {
  const port = await getDebugPort();
  await waitForEndpoint(`http://127.0.0.1:${port}/json/version`);
  const target = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(BASE + "/login")}`, {
    method: "PUT",
  }).then((r) => r.json());
  const { ws, send, errors, warnings } = await makeClient(target.webSocketDebuggerUrl);

  await send("Page.enable");
  await send("Runtime.enable");
  await send("Log.enable");
  await send("Emulation.setDeviceMetricsOverride", {
    width: 375,
    height: 812,
    deviceScaleFactor: 3,
    mobile: true,
  });

  const evalJs = async (expression) => {
    const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) return { __error: r.exceptionDetails.text };
    return r.result.value;
  };

  const failures = [];
  const report = { base: BASE, viewport: "375x812 (mobile emulation)", steps: {} };
  const ok = (name, pass, detail) => {
    report.steps[name] = { pass: !!pass, detail };
    if (!pass) failures.push(`${name}: ${detail}`);
  };

  // ── Authenticate ────────────────────────────────────────────────
  const AUDIT_EMAIL = process.env.AUDIT_EMAIL || "admin@fleetcore.app";
  const AUDIT_PASSWORD = process.env.AUDIT_PASSWORD || "admin123";

  await send("Page.navigate", { url: BASE + "/login" });
  await waitFor(() => evalJs("document.readyState === 'complete'"), 20000);
  const loggedIn = await waitFor(async () => {
    const hasForm = await evalJs(`!!document.querySelector('input[type="email"]')`);
    if (!hasForm) return (await evalJs(`location.pathname !== "/login"`)) ? true : null;
    const filled = await evalJs(`(async () => {
      const setNative = (el, value) => {
        const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value);
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
    await sleep(1500);
    return (await evalJs(`location.pathname !== "/login" && !!document.querySelector('${TAB_BAR_SELECTOR}')`)) ? true : null;
  }, 25000);

  ok("login", loggedIn, "admin sign-in reached /dashboard with the bottom tab bar");

  // ── Refresh button presence + visibility ─────────────────────────
  const presence = await waitFor(() => evalJs(`(() => {
    const btn = document.querySelector('${REFRESH_SELECTOR}');
    if (!btn) return null;
    const r = btn.getBoundingClientRect();
    return { visible: r.width > 0 && r.height > 0, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
  })()`));
  ok("button-present", !!presence?.visible, JSON.stringify(presence));

  // ── Click → spin → reload ────────────────────────────────────────
  // Marker survives until the reload wipes it — the reload detector.
  await evalJs(`window.__refreshMarker = true`);
  await evalJs(`document.querySelector('${REFRESH_SELECTOR}').click()`);

  const spinSeen = await waitFor(
    () => evalJs(`(() => {
      const icon = document.querySelector('${REFRESH_SELECTOR} svg');
      return icon && icon.classList.contains('animate-spin') ? true : null;
    })()`),
    700,
    40
  );
  ok("spin-observed", !!spinSeen, spinSeen ? "icon had animate-spin after click" : "icon never showed animate-spin");

  const reloaded = await waitFor(
    () => evalJs(`window.__refreshMarker === undefined ? true : null`),
    15000,
    200
  );
  ok("full-reload", !!reloaded, reloaded ? "window marker wiped — full page reload happened" : "no reload detected within 15s");

  // ── Post-reload restore ──────────────────────────────────────────
  const restored = await waitFor(() => evalJs(`(() => {
    if (location.pathname !== "/dashboard") return null;
    const btn = document.querySelector('${REFRESH_SELECTOR}');
    const bar = document.querySelector('${TAB_BAR_SELECTOR}');
    if (!btn || !bar) return null;
    const r = btn.getBoundingClientRect();
    const tabs = [...bar.querySelectorAll('a')].map((a) => a.textContent.trim()).filter(Boolean);
    return { path: location.pathname, btnVisible: r.width > 0, tabs };
  })()`), 20000);
  ok(
    "restored",
    !!restored && restored.path === "/dashboard" && restored.btnVisible && restored.tabs.join(",") === "Dashboard,Input,Admin,Sheets",
    JSON.stringify(restored)
  );

  for (const w of warnings) {
    if (!WARNING_ALLOWLIST.some((re) => re.test(w.text))) failures.push(`console warning: ${w.text}`);
  }
  for (const e of errors) failures.push(`console error: ${e.text}`);

  report.failures = failures;
  report.errors = errors;
  console.log(JSON.stringify(report, null, 2));

  const passed = failures.length === 0;
  console.log(
    passed
      ? "\nREFRESH BUTTON AUDIT PASSED"
      : `\nREFRESH BUTTON AUDIT FAILED — ${failures.length} problem(s)`
  );

  ws.close();
  chrome.kill();
  for (let i = 0; i < 5; i++) {
    try {
      rmSync(profile, { recursive: true, force: true });
      break;
    } catch {
      await sleep(500);
    }
  }
  process.exit(passed ? 0 : 1);
}

main().catch((err) => {
  console.error("VERIFY FAILED:", err.message);
  try {
    chrome.kill();
  } catch {}
  process.exit(1);
});
