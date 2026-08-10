/**
 * Step-by-step visual walkthrough of the mobile sheets summary + export flow.
 *
 * Drives a real browser session (headless Chrome, 375x812 phone emulation) and
 * saves a screenshot + DOM narration at every stage so you can see exactly what
 * the app should look like and what to tap:
 *
 *   Step 1  Sheets screen (header + route cards)
 *   Step 2  Minimized view — floating Restore pill WITH the graph icon
 *           (available as soon as the screen is minimized, no route needed)
 *   Step 3  Route detail overlay open — icon still on the pill
 *   Step 4  Route Summary sheet (aggregate KPIs + charts + export row)
 *   Step 5  CSV export downloaded
 *
 * Screenshots land in ./mobile-walkthrough/step-N-*.png
 *
 * Requires a route for TODAY with truckFleetNoStr "TEST-01":
 *   node scripts/seed-test-route.mjs create
 *
 * Usage: node scripts/walkthrough-mobile-sheets.mjs [url]
 * Env:   CHROME_PATH, AUDIT_EMAIL, AUDIT_PASSWORD (same as verify-mobile.mjs)
 */
import { spawn } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
  readdirSync,
  readFileSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ConvexHttpClient } from "convex/browser";

const BASE = process.argv[2] || process.env.AUDIT_URL || "http://localhost:3000";
const AUDIT_EMAIL = process.env.AUDIT_EMAIL || "admin@fleetcore.app";
const AUDIT_PASSWORD = process.env.AUDIT_PASSWORD || "admin123";
const SHOT_DIR = join(process.cwd(), "mobile-walkthrough");
mkdirSync(SHOT_DIR, { recursive: true });

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
  if (!found) throw new Error("Chrome/Chromium not found. Set CHROME_PATH.");
  return found;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = mkdtempSync(join(tmpdir(), "fc-walk-"));
const downloadDir = mkdtempSync(join(tmpdir(), "fc-walk-dl-"));
const chrome = spawn(resolveChrome(), [
  "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
  "--disable-extensions", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank",
], { stdio: "ignore" });

async function waitFor(fn, timeoutMs = 15000, intervalMs = 400) {
  const start = Date.now();
  for (;;) { const v = await fn(); if (v) return v; if (Date.now() - start >= timeoutMs) return null; await sleep(intervalMs); }
}

async function main() {
  // 0. Create a valid session server-side (reliable auth, no form flakiness)
  const convex = new ConvexHttpClient("https://quixotic-gopher-969.convex.cloud");
  const token = `walk-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  await convex.action("users:login", { email: AUDIT_EMAIL, password: AUDIT_PASSWORD, token, device: "walkthrough" });

  const port = await waitFor(() => {
    try {
      const c = readFileSync(join(profile, "DevToolsActivePort"), "utf8");
      const p = parseInt(c.split("\n")[0], 10);
      return Number.isInteger(p) && p > 0 ? p : null;
    } catch { return null; }
  });
  await waitFor(() => fetch(`http://127.0.0.1:${port}/json/version`).then((r) => r.ok).catch(() => false));
  const target = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" }).then((r) => r.json());

  let msgId = 0;
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  const pending = new Map();
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.id && pending.has(msg.id)) {
      const { res, rej } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) rej(new Error(msg.error.message)); else res(msg.result);
    }
  };
  const send = (method, params = {}) => new Promise((res, rej) => {
    const id = ++msgId; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params }));
  });
  const evalJs = async (expression) => {
    const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) return { error: r.exceptionDetails.text };
    return r.result.value;
  };

  await send("Page.enable"); await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 375, height: 812, deviceScaleFactor: 2, mobile: true });
  try {
    await send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: downloadDir, eventsEnabled: true });
  } catch {
    await send("Page.setDownloadBehavior", { behavior: "allow", downloadPath: downloadDir });
  }

  const shot = async (name) => {
    const r = await send("Page.captureScreenshot", { format: "png" });
    const file = join(SHOT_DIR, name);
    writeFileSync(file, Buffer.from(r.data, "base64"));
    return file;
  };
  const clickSel = (sel) => evalJs(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (el) { el.click(); return true; } return false; })()`);
  const snapshot = () => evalJs(`(() => {
    const visible = (el) => { if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const btnTexts = [...document.querySelectorAll('button')].filter(visible).map(b => b.textContent.trim().replace(/\\s+/g, ' ')).filter(Boolean);
    return {
      path: location.pathname,
      heading: document.querySelector('h1')?.textContent ?? null,
      sectionHeadings: [...document.querySelectorAll('h2, h3')].map(h => h.textContent.trim()).slice(0, 8),
      visibleButtons: [...new Set(btnTexts)].slice(0, 14),
      hasMinimize: visible(document.querySelector('[aria-label="Minimize toolbar and navigation"]')),
      hasRestorePill: [...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'Restore' && visible(b)),
      hasGraphIcon: visible(document.querySelector('[aria-label="Show route summary and export of visible routes"]')),
      hasDetailPanel: visible(document.querySelector('[data-testid="route-detail-panel"]')),
      hasKpiStrip: document.body.innerText.includes('TOTAL REVENUE'),
      hasSummarySheet: document.body.innerText.includes('Route Summary'),
      hasExportRow: document.body.innerText.toLowerCase().includes('export route data'),
      bodySnippet: document.body.innerText.slice(0, 200).replace(/\\n+/g, ' | '),
    };
  })()`);

  // Auth: inject the session token before the app boots
  await send("Page.navigate", { url: BASE + "/login" });
  await waitFor(async () => (await evalJs("document.readyState")) === "complete", 20000);
  await evalJs(`localStorage.setItem('fleetcore-session-token', ${JSON.stringify(token)}); true`);
  await evalJs(`location.reload(); true`);
  await waitFor(async () => (await evalJs("document.readyState")) === "complete", 20000);
  await waitFor(() => evalJs(`!!document.querySelector('[aria-label="Bottom navigation"]')`), 20000);

  // Go to Sheets
  await send("Page.navigate", { url: BASE + "/operations/daily-planner/sheets" });
  await waitFor(async () => (await evalJs("document.readyState")) === "complete", 20000);
  await waitFor(() => evalJs(`location.pathname === "/operations/daily-planner/sheets"`), 15000);
  await waitFor(() => evalJs(`!!document.querySelector('[aria-label="Minimize toolbar and navigation"]')`), 20000);
  const cardSel = '[aria-label="View details for Truck TEST-01"]';
  const hasCard = await waitFor(() => evalJs(`!!document.querySelector(${JSON.stringify(cardSel)})`), 15000);
  if (!hasCard) throw new Error("TEST-01 route card not found — seed today's route first (node scripts/seed-test-route.mjs create)");

  const steps = [];
  const step = async (n, title, waitForDone, extra) => {
    const done = waitForDone ? await waitForDone() : true;
    const dom = await snapshot();
    const file = await shot(`step-${n}-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}.png`);
    const record = { step: n, title, screenshot: file, ok: !!done, dom };
    if (extra) record.extra = extra;
    steps.push(record);
    return record;
  };

  // ── Step 1: sheets screen ──
  await step(1, "Sheets screen", null);

  // ── Step 2: minimize — pill appears WITH the summary-graph icon (no
  //     route selected needed; the function is available as soon as the
  //     screen is maximized) ──
  await clickSel('[aria-label="Minimize toolbar and navigation"]');
  await step(2, "Minimized with Restore pill + graph icon", () =>
    waitFor(() => evalJs(`(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Restore'); if (!b) return false; const r = b.getBoundingClientRect(); return r.width > 0 && r.height > 0; })()`), 8000));

  // ── Step 3: open a route — the icon stays (and the pill floats above the
  //     detail/KPI view) ──
  await clickSel(cardSel);
  await step(3, "Route detail open, icon still on pill", async () => {
    const panel = await waitFor(() => evalJs(`!!document.querySelector('[data-testid="route-detail-panel"]')`), 10000);
    const icon = await waitFor(() => evalJs(`(() => { const b = document.querySelector('[aria-label="Show route summary and export of visible routes"]'); if (!b) return false; const r = b.getBoundingClientRect(); return r.width > 0 && r.height > 0; })()`), 8000);
    return panel && icon;
  });

  // ── Step 4: tap the graph icon → Route Summary sheet (aggregate of the
  //     visible routes) ──
  await clickSel('[aria-label="Show route summary and export of visible routes"]');
  await step(4, "Route Summary sheet with export row", async () => {
    const header = await waitFor(() => evalJs(`document.body.innerText.includes("Route Summary")`), 8000);
    const exportRow = await waitFor(() => evalJs(`document.body.innerText.toLowerCase().includes("export route data")`), 8000);
    const aggregate = await waitFor(() => evalJs(`document.body.innerText.toLowerCase().includes("revenue by route")`), 8000);
    return header && exportRow && aggregate;
  });

  // ── Step 5: export CSV ──
  const csvClicked = await evalJs(`(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.includes('CSV')); if (b) { b.click(); return true; } return false; })()`);
  const dl = await waitFor(() => {
    try {
      const f = readdirSync(downloadDir).find((x) => x.endsWith(".csv") && !x.endsWith(".crdownload"));
      return f ? join(downloadDir, f) : null;
    } catch { return null; }
  }, 12000, 400);
  await step(5, "CSV export downloaded", null, { csvClicked: !!csvClicked, downloaded: dl ? `${dl.split(/[\\/]/).pop()}` : null });

  const report = { base: BASE, viewport: "375x812", steps };
  writeFileSync(join(process.cwd(), "mobile-walkthrough-report.json"), JSON.stringify(report, null, 2));

  console.log("WALKTHROUGH COMPLETE — screenshots:");
  for (const s of steps) console.log(`  Step ${s.step}: ${s.title} → ${s.screenshot}`);
  console.log(`\nFull DOM narration: mobile-walkthrough-report.json\n`);
  for (const s of steps) {
    console.log(`── Step ${s.step}: ${s.title} (${s.ok ? "OK" : "MISSING"}) ──`);
    console.log("   buttons:", JSON.stringify(s.dom.visibleButtons));
    console.log("   headings:", JSON.stringify(s.dom.sectionHeadings));
    console.log("   flags:", JSON.stringify({ hasMinimize: s.dom.hasMinimize, hasRestorePill: s.dom.hasRestorePill, hasGraphIcon: s.dom.hasGraphIcon, hasDetailPanel: s.dom.hasDetailPanel, hasKpiStrip: s.dom.hasKpiStrip, hasSummarySheet: s.dom.hasSummarySheet, hasExportRow: s.dom.hasExportRow }));
    if (s.extra) console.log("   extra:", JSON.stringify(s.extra));
  }

  ws.close(); chrome.kill();
  for (let i = 0; i < 5; i++) { try { rmSync(profile, { recursive: true, force: true }); break; } catch { await sleep(400); } }
  process.exit(0);
}
main().catch((err) => { console.error("WALKTHROUGH FAILED:", err.message); try { chrome.kill(); } catch {} process.exit(1); });
