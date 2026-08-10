/**
 * End-to-end verification of the mobile sheets summary + export flow:
 *
 *   1. Mobile viewport (375x812) + login as the seeded admin
 *   2. Sheets screen -> click Minimize -> floating Restore pill appears
 *   3. Tap the seeded TEST-01 route card -> route detail overlay (KPI cards) opens
 *   4. While the overlay is open the restore pill gains the summary-graph icon
 *   5. Tap the graph icon -> Route Summary bottom sheet (KPI cards + charts)
 *   6. Export row (Excel / CSV / JSON / PDF) -> click CSV -> file downloads
 *   7. Close the sheet; assert no console errors / horizontal overflow
 *
 * Reuses the launch/login/mobile-emulation plumbing from verify-mobile.mjs.
 *
 * Usage: node scripts/verify-mobile-sheets-summary.mjs [url]
 * Env:   CHROME_PATH    (optional, path to Chrome/Chromium binary)
 *        AUDIT_URL      (optional, alternative to the positional arg)
 *        AUDIT_EMAIL    (optional, default admin@fleetcore.app)
 *        AUDIT_PASSWORD (optional, default admin123)
 *
 * Requires a route for TODAY with truckFleetNoStr "TEST-01":
 *   node scripts/seed-test-route.mjs create
 */
import { spawn } from "node:child_process";
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  readdirSync,
  existsSync,
  readFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = process.argv[2] || process.env.AUDIT_URL || "http://localhost:3000";
const AUDIT_EMAIL = process.env.AUDIT_EMAIL || "admin@fleetcore.app";
const AUDIT_PASSWORD = process.env.AUDIT_PASSWORD || "admin123";

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
const profile = mkdtempSync(join(tmpdir(), "fc-sheetflow-"));
const downloadDir = mkdtempSync(join(tmpdir(), "fc-sheetflow-dl-"));
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
        errors.push({
          kind: "exception",
          text: String(d.exception?.description || d.exception?.value || d.text || "Unknown exception").slice(0, 500),
        });
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
  // Create the tab at about:blank, THEN navigate explicitly. Creating it with
  // the app URL (/json/new?<url>) yields a null-origin document in which
  // localStorage is denied ("Access is denied for this document") — the app
  // swallows that error, so sessions silently never persist.
  const target = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, {
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
  try {
    await send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: downloadDir, eventsEnabled: true });
  } catch {
    await send("Page.setDownloadBehavior", { behavior: "allow", downloadPath: downloadDir });
  }

  const evalJs = async (expression) => {
    const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) return { error: r.exceptionDetails.text };
    return r.result.value;
  };

  const clickBySelector = (sel) => evalJs(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (el) { el.click(); return true; } return false; })()`);
  const clickByText = (text, tag = "button") =>
    evalJs(`(() => { const el = [...document.querySelectorAll('${tag}')].find(b => b.textContent.trim() === ${JSON.stringify(text)}); if (el) { el.click(); return true; } return false; })()`);
  const clickContaining = (text, tag = "button") =>
    evalJs(`(() => { const el = [...document.querySelectorAll('${tag}')].find(b => b.textContent.includes(${JSON.stringify(text)})); if (el) { el.click(); return true; } return false; })()`);

  const waitPageReady = () => waitFor(async () => (await evalJs("document.readyState")) === "complete", 20000);
  const waitForSelector = (sel, timeout = 15000) =>
    waitFor(() => evalJs(`!!document.querySelector(${JSON.stringify(sel)})`), timeout);
  const waitForText = (text, timeout = 15000) =>
    waitFor(() => evalJs(`document.body && document.body.innerText.includes(${JSON.stringify(text)})`), timeout);

  const report = { base: BASE, viewport: "375x812 (mobile emulation)", steps: [] };
  const step = (name, ok, details) => report.steps.push({ name, ok: !!ok, details });

  // ── Login ────────────────────────────────────────────────────────────────
  await send("Page.navigate", { url: BASE + "/login" });
  await waitPageReady();
  const loggedIn = await waitFor(async () => {
    const hasForm = await evalJs(`!!document.querySelector('input[type="email"]')`);
    if (!hasForm) return (await evalJs(`location.pathname !== "/login"`)) ? true : null;
    await evalJs(`(async () => {
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
    await sleep(1500);
    return (await evalJs(`location.pathname !== "/login" && !!document.querySelector('[aria-label="Bottom navigation"]')`)) ? true : null;
  }, 25000);
  const tokenAfterLogin = await evalJs(`localStorage.getItem('fleetcore-session-token')`);
  step("1. Login", loggedIn, loggedIn ? `authenticated, mobile tab bar visible (token ${tokenAfterLogin ? "stored" : "MISSING"})` : "login failed");

  // ── Sheets screen ────────────────────────────────────────────────────────
  // Full page navigation — the session token now persists in localStorage, so
  // the app restores the session on reload and renders the sheets screen.
  await send("Page.navigate", { url: BASE + "/operations/daily-planner/sheets" });
  await waitPageReady();
  await waitFor(() => evalJs(`location.pathname === "/operations/daily-planner/sheets"`), 15000);
  const minimizeBtn = await waitForSelector('[aria-label="Minimize toolbar and navigation"]', 20000);
  const diag = minimizeBtn
    ? null
    : await evalJs(`(() => ({
        path: location.pathname,
        search: location.search,
        title: document.title,
        hasTabBar: !!document.querySelector('[aria-label="Bottom navigation"]'),
        hasSheetsH1: !!document.querySelector('h1'),
        h1: document.querySelector('h1') ? document.querySelector('h1').textContent : null,
        hasSkeleton: !!document.querySelector('.skeleton-shimmer'),
        bodyText: (document.body ? document.body.innerText : "").slice(0, 300),
      }))()`);
  step("2. Mobile sheets screen", minimizeBtn, minimizeBtn ? "Minimize button present" : `did not render — ${JSON.stringify(diag)}`);

  // Route card for the seeded route (fallback: tap Today first)
  let routeCard = await waitForSelector('[aria-label="View details for Truck TEST-01"]', 10000);
  if (!routeCard) {
    await clickByText("Today");
    routeCard = await waitForSelector('[aria-label="View details for Truck TEST-01"]', 10000);
  }
  step("3. TEST-01 route card visible", !!routeCard, routeCard ? "found 'View details for Truck TEST-01'" : "route card missing — seed today's route first");

  // ── Minimize ─────────────────────────────────────────────────────────────
  const GRAPH_ICON_SEL = '[aria-label="Show route summary and export of visible routes"]';
  const minimized = await clickBySelector('[aria-label="Minimize toolbar and navigation"]');
  const pill = await waitFor(() => evalJs(`(() => {
    const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Restore');
    if (!b) return false;
    const r = b.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  })()`), 8000);
  step("4. Minimize -> floating Restore pill", minimized && pill, pill ? "Restore pill visible" : "pill did not appear");

  // ── Graph icon on the pill — available immediately, no route selected ────
  const graphIcon = await waitFor(() => evalJs(`(() => {
    const b = document.querySelector(${JSON.stringify(GRAPH_ICON_SEL)});
    if (!b) return false;
    const r = b.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  })()`), 8000);
  step("5. Summary-graph icon on pill as soon as minimized", !!graphIcon, graphIcon ? "graph icon visible with no route selected" : "graph icon missing");

  // ── Open the route (detail overlay with KPI cards) — the pill must NOT
  //    float over the detail view; it only belongs to the enlarged cards ────
  const opened = await clickBySelector('[aria-label="View details for Truck TEST-01"]');
  const panel = await waitForSelector('[data-testid="route-detail-panel"]', 10000);
  const kpis = await waitForText("TOTAL REVENUE", 10000);
  const pillHidden = await waitFor(() => evalJs(`(() => {
    const b = document.querySelector(${JSON.stringify(GRAPH_ICON_SEL)});
    if (!b) return true;
    const r = b.getBoundingClientRect();
    return r.width === 0 || r.height === 0;
  })()`), 8000);
  step("6. Route detail overlay open (pill hidden)", opened && panel && kpis && pillHidden, panel && kpis && pillHidden ? "panel + KPI strip visible, pill hidden" : `panel=${!!panel} kpis=${!!kpis} pillHidden=${!!pillHidden}`);

  // ── Close the detail panel -> back on the enlarged cards view; the pill
  //    (with the graph icon) returns ────────────────────────────────────────
  await clickBySelector('[aria-label="Close panel"]');
  const pillBack = await waitFor(() => evalJs(`(() => {
    const b = document.querySelector(${JSON.stringify(GRAPH_ICON_SEL)});
    if (!b) return false;
    const r = b.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  })()`), 8000);

  // ── Tap the graph icon -> Route Summary sheet (aggregate of visible) ─────
  const iconClicked = await clickBySelector(GRAPH_ICON_SEL);
  const sheetHeader = await waitForText("Route Summary", 8000);
  // The label is styled with Tailwind's `uppercase`, so innerText reads
  // "EXPORT ROUTE DATA" — compare case-insensitively.
  const exportLabel = await waitFor(
    () => evalJs(`document.body.innerText.toLowerCase().includes("export route data")`),
    8000
  );
  // The headings are styled with Tailwind's `uppercase` — compare lowercase.
  const statusMix = await waitFor(
    () => evalJs(`document.body.innerText.toLowerCase().includes("status mix")`),
    8000
  );
  // The Revenue by Route card must NOT be in the summary sheet.
  const revenueByRouteGone = await waitFor(
    () => evalJs(`!document.body.innerText.toLowerCase().includes("revenue by route")`),
    8000
  );
  const exportButtons = await evalJs(`(() => {
    const labels = ["Excel", "CSV", "JSON", "PDF"];
    return labels.every(l => [...document.querySelectorAll('button')].some(b => b.textContent.includes(l)));
  })()`);
  step("7. Route Summary sheet opens (no revenue-by-route card)", iconClicked && sheetHeader && exportLabel && statusMix && revenueByRouteGone && exportButtons && pillBack,
    sheetHeader && exportLabel && statusMix && revenueByRouteGone && exportButtons && pillBack ? "panel closed, pill returned, sheet header + KPI cards + status mix + 4 export buttons, no revenue-by-route" : `pillBack=${!!pillBack} header=${!!sheetHeader} exportLabel=${!!exportLabel} statusMix=${!!statusMix} revByRouteGone=${!!revenueByRouteGone} buttons=${!!exportButtons}`);

  // ── Export: click CSV, expect a download ─────────────────────────────────
  const csvClicked = await clickContaining("CSV");
  const dlFile = await waitFor(() => {
    try {
      const files = readdirSync(downloadDir);
      const f = files.find((x) => x.endsWith(".csv") && !x.endsWith(".crdownload"));
      return f ? join(downloadDir, f) : null;
    } catch {
      return null;
    }
  }, 12000, 400);
  step("8. CSV export downloads", csvClicked && !!dlFile, dlFile ? `downloaded ${dlFile}` : "no CSV download captured");

  // ── Close the sheet ──────────────────────────────────────────────────────
  const closed = await clickBySelector('[aria-label="Close route summary"]');
  const sheetGone = await waitFor(() => evalJs(`!document.body.innerText.includes("Route Summary")`), 5000);
  step("9. Sheet closes", closed && sheetGone, sheetGone ? "summary sheet closed" : "sheet still open");

  // ── Layout / console assertions ──────────────────────────────────────────
  const layout = await evalJs(`(() => {
    const d = document.documentElement;
    return { innerWidth: window.innerWidth, scrollWidth: d.scrollWidth, overflowPx: d.scrollWidth - window.innerWidth };
  })()`);
  const overflow = layout.overflowPx > 0;
  step("10. No horizontal overflow (375px)", !overflow, `${layout.overflowPx}px overflow (innerWidth ${layout.innerWidth})`);

  const failures = [];
  for (const s of report.steps) if (!s.ok) failures.push(`${s.name}: ${s.details}`);
  for (const w of warnings) if (!WARNING_ALLOWLIST.some((re) => re.test(w.text))) failures.push(`console warning: ${w.text}`);
  for (const e of errors) failures.push(`console error: ${e.text}`);

  report.warnings = warnings;
  report.errors = errors;
  report.failures = failures;
  writeFileSync(join(process.cwd(), "mobile-sheets-summary-report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));

  const passed = failures.length === 0;
  console.log(passed ? "\nMOBILE SHEETS SUMMARY FLOW PASSED" : `\nMOBILE SHEETS SUMMARY FLOW FAILED — ${failures.length} problem(s)`);

  ws.close();
  chrome.kill();
  for (const dir of [profile, downloadDir]) {
    for (let i = 0; i < 5; i++) {
      try {
        rmSync(dir, { recursive: true, force: true });
        break;
      } catch {
        await sleep(500);
      }
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
