/**
 * Automated mobile-viewport verification for the FleetCore PWA.
 *
 * Launches headless Chrome (auto-detected per platform), emulates a 375x812
 * phone, and asserts on every configured page:
 *   - no horizontal overflow
 *   - mobile top bar / hamburger present
 *   - drawer opens (with Dashboard/Operations/Admin/Settings links) and closes
 *   - no console errors and no console warnings (except an allowlist of
 *     known-benign third-party/informational messages)
 *
 * Exits 1 (non-zero) if any assertion fails — suitable for CI.
 * Writes the JSON report to ./mobile-audit-report.json.
 *
 * Usage: node scripts/verify-mobile.mjs [url]
 * Env:   CHROME_PATH   (optional, path to Chrome/Chromium binary)
 *        AUDIT_URL     (optional, alternative to the positional arg)
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

const BASE = process.argv[2] || process.env.AUDIT_URL || "https://fleetcore-mu.vercel.app";
const PAGES = [
  "/dashboard",
  "/admin/trucks",
  "/settings",
  "/operations",
  "/operations/daily-planner/sheets",
];
const REPORT_FILE = join(process.cwd(), "mobile-audit-report.json");
const EXPECTED_NAV_LINKS = ["Dashboard", "Operations", "Admin", "Settings"];

/**
 * Warnings matching these are third-party/cosmetic, not app bugs.
 * Anything else fails the audit. Adding entries here is a conscious
 * decision — prefer fixing the app over allowlisting.
 */
const WARNING_ALLOWLIST = [
  /beforeinstallprompt/i, // Chrome info: prompt() deferred until user taps Install (standard PWA pattern)
  /form field element should have an id or name/i, // Chrome a11y hint, not a regression
  /No label associated with a form field/i, // Chrome a11y hint, not a regression
  /Download the React DevTools/i, // dev-only hint
  // Recharts v3 ResponsiveContainer logs this once per mount when the chart
  // container is measured before CSS layout settles (width/height -1 or 0).
  // Charts render correctly afterward; the audit still catches layout
  // regressions via the overflow and drawer assertions.
  /The width\(-?\d+\) and height\(-?\d+\) of chart should be greater than 0/i,
];

function resolveChrome() {
  if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH)) {
    return process.env.CHROME_PATH;
  }
  const candidates =
    process.platform === "win32"
      ? [
          "C:/Program Files/Google/Chrome/Application/chrome.exe",
          "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
          `${process.env.LOCALAPPDATA || ""}/Google/Chrome/Application/chrome.exe`,
        ]
      : process.platform === "darwin"
        ? ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"]
        : [
            "/usr/bin/google-chrome",
            "/usr/bin/google-chrome-stable",
            "/usr/bin/chromium",
            "/usr/bin/chromium-browser",
          ];
  const found = candidates.find((c) => c && existsSync(c));
  if (!found) {
    throw new Error("Chrome/Chromium not found. Set CHROME_PATH to point at the binary.");
  }
  return found;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = mkdtempSync(join(tmpdir(), "fc-mobile-"));
const flags = [
  "--headless=new",
  "--disable-gpu",
  "--no-first-run",
  "--no-default-browser-check",
  "--disable-extensions",
  "--remote-debugging-port=0", // dynamic port, read from DevToolsActivePort
  `--user-data-dir=${profile}`,
  "about:blank",
];
if (process.platform !== "win32") {
  flags.unshift("--no-sandbox", "--disable-dev-shm-usage");
}
const chrome = spawn(resolveChrome(), flags, { stdio: "ignore" });

/** Poll a predicate until it returns a truthy value or the timeout elapses. */
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
  return waitFor(
    () => {
      try {
        const content = readFileSync(portFile, "utf8");
        const port = parseInt(content.split("\n")[0], 10);
        return Number.isInteger(port) && port > 0 ? port : null;
      } catch {
        return null;
      }
    },
    18000,
    300
  );
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
        if (entry.level === "error") errors.push({ kind: "log", text: entry.text, url: entry.url });
        else if (entry.level === "warning") warnings.push({ kind: "log", text: entry.text, url: entry.url });
      } else if (msg.method === "Runtime.exceptionThrown") {
        const d = msg.params.exceptionDetails || {};
        const desc =
          (d.exception && (d.exception.description || d.exception.value)) || d.text || "Unknown exception";
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

async function main() {
  const port = await getDebugPort();
  await waitForEndpoint(`http://127.0.0.1:${port}/json/version`);
  const target = await fetch(
    `http://127.0.0.1:${port}/json/new?${encodeURIComponent(BASE + "/dashboard")}`,
    { method: "PUT" }
  ).then((r) => r.json());
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
    const r = await send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (r.exceptionDetails) return { error: r.exceptionDetails.text };
    return r.result.value;
  };

  const navigate = async (path) => {
    await send("Page.navigate", { url: BASE + path });
    // Wait for the document, then for the app to hydrate (hamburger present).
    // Polling instead of a fixed sleep avoids flakiness on slow CDN/hydration.
    await waitFor(async () => {
      const ready = await evalJs("document.readyState");
      return ready === "complete";
    }, 20000);
    await waitFor(
      () => evalJs(`!!document.querySelector('[aria-label="Open navigation"]')`),
      12000
    );
  };

  const report = { base: BASE, viewport: "375x812 (mobile emulation)", pages: [] };

  for (const path of PAGES) {
    await navigate(path);
    const info = await evalJs(`(() => {
      const d = document.documentElement;
      return {
        path: location.pathname,
        innerWidth: window.innerWidth,
        scrollWidth: d.scrollWidth,
        hasHamburger: !!document.querySelector('[aria-label="Open navigation"]'),
        h1: document.querySelector('h1') ? document.querySelector('h1').textContent : null,
      };
    })()`);

    // Drawer check on every page: open -> verify links -> close -> verify
    const drawer = await evalJs(`(async () => {
      const btn = document.querySelector('[aria-label="Open navigation"]');
      if (!btn) return { ok: false, reason: "hamburger not found" };
      btn.click();
      await new Promise((r) => setTimeout(r, 600));
      const aside = document.querySelector('aside');
      if (!aside) return { ok: false, reason: "aside not found" };
      const openOk = aside.className.includes('translate-x-0') && aside.getBoundingClientRect().width >= 200;
      const links = [...document.querySelectorAll('aside a')]
        .map((a) => a.textContent.trim())
        .filter(Boolean);
      const expected = ${JSON.stringify(EXPECTED_NAV_LINKS)};
      const linkSet = new Set(links);
      const linksOk = expected.every((l) => linkSet.has(l));
      const closeBtn = document.querySelector('[aria-label="Close navigation"]');
      if (closeBtn) closeBtn.click();
      await new Promise((r) => setTimeout(r, 500));
      const closedOk = aside.className.includes('-translate-x-full');
      return { ok: openOk && linksOk && !!closeBtn && closedOk, openOk, linksOk, closedOk, hasCloseBtn: !!closeBtn, links };
    })()`);

    // Route-detail flow (sheets page only): tap a load no -> detail panel opens
    // -> EDIT swaps to the in-panel edit form -> Cancel returns to detail -> close.
    // This is the regression guard for the double-overlay glitch class.
    let routeFlow = null;
    if (path === "/operations/daily-planner/sheets") {
      routeFlow = await evalJs(`(async () => {
        const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
        const waitFor = async (fn, timeout = 15000) => {
          const start = Date.now();
          for (;;) {
            const v = await fn();
            if (v) return v;
            if (Date.now() - start >= timeout) return null;
            await sleep(400);
          }
        };
        const PANEL = '[data-testid="route-detail-panel"]';
        const inPanel = (text) =>
          [...document.querySelectorAll(PANEL + ' button')].find((b) => b.textContent.trim() === text);
        const loadLink = await waitFor(() => document.querySelector('span[title^="View details for Load"]'));
        if (!loadLink) {
          return { ok: false, skipped: true, reason: "no load rows rendered (data-dependent)" };
        }
        loadLink.click();
        const panel = await waitFor(() => document.querySelector(PANEL));
        if (!panel) return { ok: false, skipped: false, reason: "detail panel did not open" };
        await sleep(500);
        const hasDetail = panel.textContent.includes("Route Detail");
        const editBtn = inPanel("EDIT");
        if (!editBtn) return { ok: false, skipped: false, reason: "EDIT button missing in panel" };
        editBtn.click();
        const saveShown = await waitFor(() => inPanel("Save Changes"), 8000);
        if (!saveShown) return { ok: false, skipped: false, reason: "edit form did not open in-panel" };
        const panelStillOpen = !!document.querySelector(PANEL);
        const backBtn = !!document.querySelector('[aria-label="Back to route details"]');
        const cancelBtn = inPanel("Cancel");
        if (!cancelBtn) return { ok: false, skipped: false, reason: "Cancel button missing in edit view" };
        cancelBtn.click();
        const backToDetail = await waitFor(
          () => !document.querySelector('[aria-label="Back to route details"]') && panel.textContent.includes("Route Detail"),
          6000
        );
        const closeBtn = document.querySelector('[aria-label="Close panel"]');
        if (closeBtn) closeBtn.click();
        await sleep(500);
        const panelClosed = !document.querySelector(PANEL);
        return {
          ok: true,
          skipped: false,
          hasDetail: !!hasDetail,
          editInPanel: panelStillOpen && backBtn,
          backToDetail: !!backToDetail,
          panelClosed,
        };
      })()`);
    }

    report.pages.push({
      requested: path,
      path: info.path,
      innerWidth: info.innerWidth,
      scrollWidth: info.scrollWidth,
      overflowPx: info.scrollWidth - info.innerWidth,
      hasHamburger: info.hasHamburger,
      h1: info.h1,
      drawer,
      routeFlow,
    });
  }

  report.warnings = warnings;
  report.errors = errors;

  // ── Assertions ────────────────────────────────────────────────
  const failures = [];
  for (const p of report.pages) {
    if (p.overflowPx > 0) failures.push(`${p.path}: horizontal overflow of ${p.overflowPx}px`);
    if (!p.hasHamburger) failures.push(`${p.path}: mobile header/hamburger missing`);
    if (p.drawer && !p.drawer.ok) {
      failures.push(`${p.path}: drawer check failed -> ${p.drawer.reason || JSON.stringify(p.drawer)}`);
    }
    if (p.routeFlow && !p.routeFlow.ok && !p.routeFlow.skipped) {
      failures.push(`${p.path}: route-detail flow failed -> ${p.routeFlow.reason || JSON.stringify(p.routeFlow)}`);
    }
  }
  for (const w of warnings) {
    if (!WARNING_ALLOWLIST.some((re) => re.test(w.text))) {
      failures.push(`console warning: ${w.text}`);
    }
  }
  for (const e of errors) {
    failures.push(`console error: ${e.text}`);
  }

  report.failures = failures;
  writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));

  const passed = failures.length === 0;
  console.log(
    passed
      ? `\nMOBILE AUDIT PASSED — ${report.pages.length} pages, ${warnings.length} warning(s) (all allowlisted), ${errors.length} error(s)`
      : `\nMOBILE AUDIT FAILED — ${failures.length} problem(s). Report: ${REPORT_FILE}`
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

main().catch((err) => {
  console.error("VERIFY FAILED:", err.message);
  try {
    chrome.kill();
  } catch {}
  for (let i = 0; i < 5; i++) {
    try {
      rmSync(profile, { recursive: true, force: true });
      break;
    } catch {
      void i;
    }
  }
  process.exit(1);
});
