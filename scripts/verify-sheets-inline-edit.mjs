/**
 * Headless verification: inline Amount + Notes editing in the web sheets table.
 *
 * Seeds a sandbox route for today (unique truck per run, per-unit load
 * qty=10 rate=100 => R 1 000,00), signs in as admin, opens
 * /operations/daily-planner/sheets, then on the VISIBLE table instance:
 *   1. Clicks the Amount cell of the probe row and types 2500
 *      (backend converts back to rate 250; displayed amount must be R 2 500,00)
 *   2. Clicks the Notes cell and types a shipment ref
 *      (route-level notes must render)
 *   3. Regression: Origin cell still edits
 *   4. Reloads the page — the edits must survive a fresh server query
 *   5. Re-reads the route via Convex to confirm persistence
 *   6. Asserts zero console errors
 * Cleans up (deletes the sandbox route) before exiting.
 *
 * Usage: node scripts/verify-sheets-inline-edit.mjs [url]
 */
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ConvexHttpClient } from "convex/browser";

const BASE = process.argv[2] || "http://localhost:3000";
const AUDIT_EMAIL = process.env.AUDIT_EMAIL || "admin@fleetcore.app";
const AUDIT_PASSWORD = process.env.AUDIT_PASSWORD || "admin123";
const client = new ConvexHttpClient("https://quixotic-gopher-969.convex.cloud");
// Unique truck per run so the probe row can never collide with leftovers or
// real data (a previous run's crashed cleanup once left a TEST-01 behind).
const TRUCK = "TX-" + Date.now().toString(36).toUpperCase();

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

// ── Seed the sandbox route ──────────────────────────────────────────────
const today = new Date().toISOString().slice(0, 10);
const seeded = await client.mutation("dailyRoutes:createDailyRoute", {
  routeDate: today,
  driverName: "Audit Edit Driver",
  truckFleetNoStr: TRUCK,
  kilometers: 60,
  loads: [
    {
      client: "Audit Edit Client",
      quantity: "10",
      quantityType: "tons",
      rate: "100",
      rateType: "per_unit",
      fromLocations: ["Pretoria"],
      toLocations: ["Johannesburg"],
      loadId: "L-EDIT-1",
    },
  ],
});
const routeId = typeof seeded === "string" ? seeded : seeded?._id;
if (!routeId) {
  console.log("SEED_FAILED=" + JSON.stringify(seeded));
  process.exit(1);
}
console.log("SEEDED_ROUTE=" + routeId);

const profile = mkdtempSync(join(tmpdir(), "fc-sheets-edit-"));
const flags = [
  "--headless=new",
  "--disable-gpu",
  "--no-first-run",
  "--no-default-browser-check",
  "--disable-extensions",
  "--remote-debugging-port=0",
  `--user-data-dir=${profile}`,
  "--window-size=1440,900",
  "about:blank",
];
if (process.platform !== "win32") flags.unshift("--no-sandbox", "--disable-dev-shm-usage");
const chrome = spawn(resolveChrome(), flags, { stdio: "ignore" });

let nextId = 1;
const pending = new Map();
const consoleErrors = [];
let socket;

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

const waitFor = async (fn, timeoutMs = 20000) => {
  const start = Date.now();
  for (;;) {
    let v;
    try {
      v = await fn();
    } catch {
      v = null;
    }
    if (v) return v;
    if (Date.now() - start >= timeoutMs) return null;
    await sleep(400);
  }
};

const errors = [];
const evalJs = async (expression) => {
  const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) return { __error: r.exceptionDetails.text };
  return r.result.value;
};

const check = (name, ok, detail) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) errors.push(name);
};

try {
  const portFile = join(profile, "DevToolsActivePort");
  const port = await waitFor(() => {
    try {
      const p = parseInt(readFileSync(portFile, "utf8").split("\n")[0], 10);
      return Number.isInteger(p) && p > 0 ? p : null;
    } catch {
      return null;
    }
  }, 18000);
  if (!port) throw new Error("DevTools port not ready");

  const waitForEndpoint = async (url, tries = 60) => {
    for (let i = 0; i < tries; i++) {
      try {
        const res = await fetch(url);
        if (res.ok) return;
      } catch {}
      await sleep(300);
    }
    throw new Error("CDP endpoint not ready: " + url);
  };
  await waitForEndpoint(`http://127.0.0.1:${port}/json/version`);
  const target = await fetch(
    `http://127.0.0.1:${port}/json/new?${encodeURIComponent(BASE + "/login")}`,
    { method: "PUT" }
  ).then((r) => r.json());

  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    socket.addEventListener("open", res, { once: true });
    socket.addEventListener("error", rej, { once: true });
  });
  socket.addEventListener("message", (event) => {
    const msg = JSON.parse(event.data.toString());
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result);
    }
    if (msg.method === "Runtime.exceptionThrown") {
      consoleErrors.push(msg.params.exceptionDetails?.text || "exception");
    }
    if (msg.method === "Runtime.consoleAPICalled" && msg.params.type === "error") {
      consoleErrors.push(
        "console.error: " + (msg.params.args || []).map((a) => a.value ?? a.description ?? "").join(" ")
      );
    }
    if (msg.method === "Log.entryAdded" && msg.params.entry.level === "error") {
      consoleErrors.push(msg.params.entry.text);
    }
  });

  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send("Runtime.enable");
  await send("Log.enable");
  await send("Page.enable");

  // ── Login ──
  await send("Page.navigate", { url: BASE + "/login" });
  await waitFor(() => evalJs("document.readyState === 'complete'"), 20000);
  const loggedIn = await waitFor(async () => {
    if (await evalJs(`location.pathname !== "/login"`)) return true;
    const filled = await evalJs(`(async () => {
      const setNative = (el, value) => {
        const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value);
        el.dispatchEvent(new Event("input", { bubbles: true }));
      };
      const email = document.querySelector('input[type="email"]');
      const password = document.querySelector('input[type="password"]');
      const btn = [...document.querySelectorAll('button')].find(b => b.textContent.includes('Sign in'));
      if (!email || !password || !btn || btn.disabled) return false;
      setNative(email, ${JSON.stringify(AUDIT_EMAIL)});
      setNative(password, ${JSON.stringify(AUDIT_PASSWORD)});
      await new Promise(r => setTimeout(r, 250));
      btn.click();
      return true;
    })()`);
    if (!filled) return null;
    for (let i = 0; i < 30; i++) {
      await sleep(500);
      if (await evalJs(`location.pathname !== "/login"`)) return true;
    }
    return null;
  }, 40000);
  check("login", !!loggedIn);

  // ── Sheets page ──
  await send("Page.navigate", { url: BASE + "/operations/daily-planner/sheets" });
  await waitFor(() => evalJs("document.readyState === 'complete'"), 20000);
  // Wait for the TEST-01 row to appear in a visible table instance
  const isShown = (el) => {
    const s = getComputedStyle(el);
    return s.display !== "none" && s.visibility !== "hidden" && el.getBoundingClientRect().width > 0;
  };
  const shownFn = `((${isShown.toString()}))`;
  const rowReady = await waitFor(() => evalJs(`(() => {
    const shown = ${shownFn};
    for (const grid of document.querySelectorAll('[class*="grid"]')) {
      if (!shown(grid)) continue;
      const row = [...grid.children].find(c => c.textContent.includes(${JSON.stringify(TRUCK)}));
      if (row) return true;
    }
    return false;
  })()`), 30000);
  check("probe row visible", !!rowReady);

  // Helper: locate the visible table root (container holding header + rows),
  // then find the header index + TEST-01 row. Table DOM shape:
  //   <div overflow-auto>            <- root
  //     <div class="grid" (header)>
  //     <div class="divide-y">
  //       <div class="grid">row</div>
  const tableRootSrc = `(() => {
    const shown = ${shownFn};
    for (const root of document.querySelectorAll('[class*="overflow-auto"]')) {
      if (!shown(root)) continue;
      const hasTestRow = [...root.querySelectorAll('[class*="divide-y"] [class*="grid"]')].some((r) => r.textContent.includes(${JSON.stringify(TRUCK)}));
      if (hasTestRow) return root;
    }
    return null;
  })`;
  const tableRoot = tableRootSrc;
  const cellLookup = async (headerText) => {
    const res = await evalJs(`(() => {
      const root = (${tableRoot.toString()})();
      if (!root) return { error: 'table root not found' };
      const headerRow = root.querySelector(':scope > div[class*="grid"]');
      if (!headerRow) return { error: 'header row not found' };
      const colIdx = [...headerRow.children].findIndex((h) => h.textContent.trim().toUpperCase().includes(${JSON.stringify(headerText.toUpperCase())}));
      if (colIdx < 0) return { error: 'column not found: ' + ${JSON.stringify(headerText)} };
      const row = [...root.querySelectorAll('[class*="divide-y"] [class*="grid"]')].find((r) => r.textContent.includes(${JSON.stringify(TRUCK)}));
      if (!row) return { error: 'row not found' };
      const cell = row.children[colIdx];
      if (!cell) return { error: 'cell not found' };
      return { colIdx, cellText: cell.textContent };
    })()`);
    if (res?.__error) return { error: "eval threw: " + res.__error };
    return res;
  };
  const readCell = async (headerText) => {
    const res = await cellLookup(headerText);
    if (res?.error) return null;
    return res.cellText;
  };
  const editCell = async (headerText, value) => {
    const res = await evalJs(`(async () => {
      const root = (${tableRoot.toString()})();
      if (!root) return { error: 'table root not found' };
      const headerRow = root.querySelector(':scope > div[class*="grid"]');
      if (!headerRow) return { error: 'header row not found' };
      const colIdx = [...headerRow.children].findIndex((h) => h.textContent.trim().toUpperCase().includes(${JSON.stringify(headerText.toUpperCase())}));
      if (colIdx < 0) return { error: 'column not found: ' + ${JSON.stringify(headerText)} };
      const row = [...root.querySelectorAll('[class*="divide-y"] [class*="grid"]')].find((r) => r.textContent.includes(${JSON.stringify(TRUCK)}));
      if (!row) return { error: 'row not found' };
      const cell = row.children[colIdx];
      if (!cell) return { error: 'cell not found' };
      const clickable = cell.querySelector('div[title*="Click to edit"], div[title*="edit amount"], div[title*="edit"]') || cell;
      const foundClickable = clickable !== cell;
      clickable.click();
      await new Promise((r) => setTimeout(r, 500));
      const input = cell.querySelector('input');
      if (!input) {
        return {
          error: 'no input after click',
          cellText: cell.textContent,
          cellTitle: cell.getAttribute('title'),
          colIdx,
          foundClickable,
          clickableTitle: clickable.getAttribute && clickable.getAttribute('title'),
          cellHtml: cell.innerHTML.slice(0, 200),
          rowText: row.textContent.slice(0, 80),
          hasInputsInRow: row.querySelectorAll('input').length,
        };
      }
      const proto = HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(input, ${JSON.stringify(value)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 200));
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      return { ok: true };
    })()`);
    if (res?.error) throw new Error("editCell " + headerText + ": " + res.error + " | " + JSON.stringify(res));
    return res;
  };

  // 1. Amount edit: 1000 -> 2500
  await editCell("Amount", "2500");
  const amountShown = await waitFor(() => readCell("Amount"), 15000);
  console.log("amount cell after edit:", JSON.stringify(amountShown));
  check("amount cell shows R 2 500,00", !!amountShown && amountShown.includes("2 500,00"), String(amountShown));

  // 2. Notes edit
  const notesValue = "SHIPMENT SH12345 PROBE";
  await editCell("Notes", notesValue);
  const notesShown = await waitFor(() => readCell("Notes"), 15000);
  console.log("notes cell after edit:", JSON.stringify(notesShown));
  check("notes cell shows edited text", !!notesShown && notesShown.includes("SH12345"), String(notesShown));

  // 3. Origin regression
  await editCell("Origin", "Centurion");
  const originShown = await waitFor(() => readCell("Origin"), 15000);
  console.log("origin cell after edit:", JSON.stringify(originShown));
  check("origin cell shows edited text", !!originShown && originShown.includes("CENTURION"), String(originShown));

  // 3.5 Reload the page — if the DB really has the edits, they must survive a
  // full reload (fresh query from the server, no client cache).
  await send("Page.navigate", { url: BASE + "/operations/daily-planner/sheets" });
  await waitFor(() => evalJs("document.readyState === 'complete'"), 20000);
  await sleep(2500); // let the query rehydrate after reload
  const reloadDiag = await evalJs(`(() => {
    const truck = ${JSON.stringify(TRUCK)};
    const shown = ${shownFn};
    const found = [...document.querySelectorAll('[class*="grid"]')].filter(g => shown(g) && g.textContent.includes(truck)).length;
    const inRows = [...document.querySelectorAll('[class*="divide-y"] [class*="grid"]')].filter(r => r.textContent.includes(truck)).length;
    const roots = [...document.querySelectorAll('[class*="overflow-auto"]')].filter(r => shown(r) && r.textContent.includes(truck)).length;
    return { found, inRows, roots, path: location.pathname, body: document.body.innerText.includes(truck) };
  })()`);
  console.log("reload diag:", JSON.stringify(reloadDiag));
  // Single-eval lookup (the nested-await cellLookup is flaky inside waitFor in
  // headless, so we use the same flat expression the trace uses).
  const reloadLookup = () =>
    evalJs(`(() => {
      const shown = ${shownFn};
      const truck = ${JSON.stringify(TRUCK)};
      const roots = [...document.querySelectorAll('[class*="overflow-auto"]')].filter(r => shown(r) && r.textContent.includes(truck));
      const root = roots[0];
      if (!root) return null;
      const firstGrid = root.querySelector(':scope > div[class*="grid"]');
      if (!firstGrid) return null;
      const colIdx = [...firstGrid.children].findIndex(h => h.textContent.trim().toUpperCase().includes('AMOUNT'));
      if (colIdx < 0) return null;
      const row = [...root.querySelectorAll('[class*="divide-y"] [class*="grid"]')].find(r => r.textContent.includes(truck));
      if (!row) return null;
      return row.children[colIdx] ? row.children[colIdx].textContent : null;
    })()`);
  const reloaded = await waitFor(reloadLookup, 20000);
  console.log("amount cell after reload:", JSON.stringify(reloaded));
  check("amount persists across reload", !!reloaded && reloaded.includes("2 500,00"), String(reloaded));

  // 4. Persistence via Convex (backend truth)
  await sleep(1500);
  const route = await client.query("dailyRoutes:getRoutesByDate", { routeDate: today });
  const saved = (route || []).find((r) => r._id === routeId);
  const load0 = saved?.loads?.[0] || {};
  const qty = parseFloat(String(load0.quantity || "0").replace(",", "."));
  const rate = parseFloat(String(load0.rate || "0").replace(",", "."));
  const derivedAmount = (load0.rateType === "flat" || load0.rateType === "full") ? rate : qty * rate;
  console.log(
    "backend saved: rate=" + load0.rate + " qty=" + load0.quantity + " derivedAmount=" + derivedAmount +
    " notes=" + JSON.stringify(saved?.notes) + " from=" + JSON.stringify(load0.fromLocations)
  );
  check("backend rate = 250 (2500/10)", rate === 250, "rate=" + load0.rate);
  check("backend derived amount = 2500", Math.abs(derivedAmount - 2500) < 0.01, "amount=" + derivedAmount);
  check("backend notes persisted", saved?.notes === notesValue, JSON.stringify(saved?.notes));
  check("backend origin persisted", load0.fromLocations?.[0] === "Centurion", JSON.stringify(load0.fromLocations));

  await sleep(800);
  check("console errors", consoleErrors.length === 0, consoleErrors.join(" | ") || "none");

  console.log("── Sheets inline-edit probe ──");
  console.log(errors.length === 0 ? "✅ ALL CHECKS PASSED" : `❌ ${errors.length} failures`);
} finally {
  try {
    socket?.close();
  } catch {}
  chrome.kill();
  await sleep(500);
  rmSync(profile, { recursive: true, force: true });
  try {
    await client.mutation("dailyRoutes:deleteDailyRoute", { id: routeId });
    console.log("CLEANED_UP_ROUTE=" + routeId);
  } catch (e) {
    console.log("CLEANUP_FAILED=" + e.message);
  }
}
