/**
 * Automated mobile admin-page verification for the FleetCore PWA.
 *
 * Launches headless Chrome (auto-detected per platform), emulates a 375x812
 * phone, signs in as the admin seed user and asserts on the admin pages:
 *   - the admin hamburger bar is gone on mobile (no "Toggle navigation"
 *     button; the section-nav bar is hidden below md) — admins navigate via
 *     the /admin hub cards instead
 *   - the KPI cards (Total / Active / Inactive) render as one compact row
 *     (3 buttons on the same row, smaller than before)
 *   - no console errors (warnings beyond an allowlist fail too)
 *
 * Exits 1 (non-zero) if any assertion fails — suitable for CI.
 *
 * Usage: node scripts/verify-admin-mobile.mjs [url]
 * Env:   CHROME_PATH   (optional, path to Chrome/Chromium binary)
 *        AUDIT_URL     (optional, alternative to the positional arg)
 *        AUDIT_EMAIL / AUDIT_PASSWORD (optional, default admin@fleetcore.app / admin123)
 */
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = process.argv[2] || process.env.AUDIT_URL || "http://localhost:3000";
const ADMIN_PAGES = [
  "/admin",
  "/admin/trucks",
  "/admin/trailers",
  "/admin/drivers",
  "/admin/subcontractors",
  "/admin/users",
];
// Pages that render the Total / Active / Inactive KPI cards.
const KPI_PAGES = new Set(["/admin/trucks", "/admin/trailers", "/admin/drivers", "/admin/subcontractors"]);
const TAB_BAR_SELECTOR = '[aria-label="Bottom navigation"]';

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
const profile = mkdtempSync(join(tmpdir(), "fc-admin-"));
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
  await send("Emulation.setDeviceMetricsOverride", { width: 375, height: 812, deviceScaleFactor: 3, mobile: true });

  const evalJs = async (expression) => {
    const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) return { __error: r.exceptionDetails.text };
    return r.result.value;
  };

  const failures = [];
  const report = { base: BASE, viewport: "375x812 (mobile emulation)", pages: [] };

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

  if (!loggedIn) {
    errors.push({ kind: "auth", text: "Audit login failed — check AUDIT_EMAIL/AUDIT_PASSWORD." });
  }

  for (const path of ADMIN_PAGES) {
    await send("Page.navigate", { url: BASE + path });
    await waitFor(() => evalJs("document.readyState === 'complete'"), 20000);
    // Full app boot + route: tab bar present, then page content rendered
    // (data pages show a skeleton until Convex queries resolve).
    await waitFor(
      () => evalJs(`location.pathname === ${JSON.stringify(path)} && !!document.querySelector('${TAB_BAR_SELECTOR}')`),
      15000
    );
    await waitFor(() => evalJs(`!!document.querySelector('h1')`), 15000);

    const page = await evalJs(`(() => {
      const hamburger = document.querySelector('[aria-label="Toggle navigation"]');
      const adminNav = [...document.querySelectorAll('div')].find(
        (d) => typeof d.className === 'string' && d.className.includes('hidden md:block')
      );
      const adminNavVisible = adminNav ? getComputedStyle(adminNav).display !== 'none' : false;
      // KPI row: the grid whose first button reads "Total"
      const grid = [...document.querySelectorAll('div.grid')].find((g) => {
        const first = g.querySelector(':scope > button');
        return first && first.textContent.includes('Total');
      });
      let kpi = null;
      if (grid) {
        const btns = [...grid.querySelectorAll(':scope > button')];
        const rects = btns.map((b) => {
          const r = b.getBoundingClientRect();
          return { top: Math.round(r.top), left: Math.round(r.left), w: Math.round(r.width) };
        });
        const sameRow = rects.every((r, i) => i === 0 || Math.abs(r.top - rects[0].top) <= 1);
        kpi = {
          count: btns.length,
          sameRow,
          labels: btns.map((b) => b.textContent.trim()),
          rects,
        };
      }
      return {
        path: location.pathname,
        h1: document.querySelector('h1') ? document.querySelector('h1').textContent : null,
        hamburger: !!hamburger,
        adminNavVisibleOnMobile: adminNavVisible,
        kpi,
        hasTabBar: !!document.querySelector('${TAB_BAR_SELECTOR}'),
      };
    })()`);

    const expectsKpi = KPI_PAGES.has(path);
    const kpiOk = expectsKpi ? page.kpi && page.kpi.count === 3 && page.kpi.sameRow : true;
    if (page.hamburger) failures.push(`${path}: admin hamburger still present on mobile`);
    if (page.adminNavVisibleOnMobile) failures.push(`${path}: admin section-nav bar still visible on mobile`);
    if (page.path !== path) failures.push(`${path}: landed on ${page.path}`);
    if (!page.hasTabBar) failures.push(`${path}: bottom tab bar missing`);
    if (expectsKpi && !kpiOk) failures.push(`${path}: KPI cards not one compact row -> ${JSON.stringify(page.kpi)}`);
    report.pages.push({ ...page, kpiOk });
  }

  for (const w of warnings) {
    if (!WARNING_ALLOWLIST.some((re) => re.test(w.text))) failures.push(`console warning: ${w.text}`);
  }
  for (const e of errors) failures.push(`console error: ${e.text}`);

  report.failures = failures;
  report.errors = errors;
  console.log(JSON.stringify(report, null, 2));

  const passed = failures.length === 0;
  console.log(passed ? "\nADMIN MOBILE AUDIT PASSED" : `\nADMIN MOBILE AUDIT FAILED — ${failures.length} problem(s)`);

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
