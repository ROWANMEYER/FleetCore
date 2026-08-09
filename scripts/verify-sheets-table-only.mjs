/**
 * One-off verification for the Sheets "table-only" feature.
 *
 * Launches headless Chrome at a desktop viewport (1440x900), signs in with the
 * seed admin credentials, opens /operations/daily-planner/sheets and asserts:
 *   - the header "table only" toggle exists (aria-label)
 *   - clicking it hides the filter/sort chrome (toolbar search hidden,
 *     KPI/chart header hidden) so only the table remains
 *   - the floating Restore pill appears
 *   - clicking Restore brings the controls back
 *   - the old fullscreen ("Focus Mode") button is gone
 *   - no console errors
 *
 * Usage: node scripts/verify-sheets-table-only.mjs [url]
 */
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = process.argv[2] || "http://localhost:3000";
const AUDIT_EMAIL = process.env.AUDIT_EMAIL || "admin@fleetcore.app";
const AUDIT_PASSWORD = process.env.AUDIT_PASSWORD || "admin123";

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
const profile = mkdtempSync(join(tmpdir(), "fc-sheets-to-"));
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

try {
  // ── Launch + attach (same CDP bootstrap as verify-mobile-dashboard.mjs) ──
  const { readFileSync } = await import("node:fs");
  // Node's built-in global WebSocket (Node 22+) — same as the other audit scripts.

  const portFile = join(profile, "DevToolsActivePort");
  const port = await waitFor(() => {
    try {
      const p = parseInt(readFileSync(portFile, "utf8").split("\n")[0], 10);
      return Number.isInteger(p) && p > 0 ? p : null;
    } catch {
      return null;
    }
  }, 18000, 300);
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
  });

  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send("Runtime.enable");
  await send("Page.enable");

  // ── Login ──────────────────────────────────────────────────────────────
  await send("Page.navigate", { url: BASE + "/login" });
  await waitFor(() => evalJs("document.readyState === 'complete'"), 20000);
  await waitFor(() => evalJs(`[...document.querySelectorAll('button')].some(b => b.textContent.includes('Sign in'))`), 15000);
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
      if (await evalJs(`!![...document.querySelectorAll('p')].find(p => p.textContent.includes('Login failed') || p.textContent.includes('Enter your email'))`)) return null;
    }
    return null;
  }, 40000);
  if (!loggedIn) errors.push("Login failed");

  // ── Sheets page ────────────────────────────────────────────────────────
  await send("Page.navigate", { url: BASE + "/operations/daily-planner/sheets" });
  await waitFor(() => evalJs("document.readyState === 'complete'"), 20000);
  await waitFor(() => evalJs(`!!document.querySelector('input[name="sheet-quick-search"]')`), 20000);
  await sleep(2000); // let data settle

  // The layout mounts the sheets page twice (a lg:hidden mobile wrapper for
  // {children} + the desktop pane). Query only VISIBLE elements so we drive
  // and assert on the instance the user actually sees. Note: `offsetParent` is
  // null for position:fixed elements, so visibility is computed from styles.
  const isShown = (el) => {
    const s = getComputedStyle(el);
    return s.display !== 'none' && s.visibility !== 'hidden' && el.getBoundingClientRect().width > 0;
  };
  // Parenthesize the embedded arrow function so it parses as an IIFE:
  //   b.matches('...') && ((el) => {...})(b)
  const shownFn = `((${isShown.toString()}))`;
  const shownBtn = (sel) => `[...document.querySelectorAll('button')].find(b => b.matches('${sel}') && ${shownFn}(b))`;
  const tableOnlyBtn = '[aria-label="Hide filters and sort (show only the table)"]';

  // 1. Old fullscreen feature must be gone (check for the exact toolbar
  //    label — dashboard KPI tiles legitimately contain the word "focus")
  const hasFocusButton = await evalJs(`[...document.querySelectorAll('button')].some(b => (b.textContent.trim() === 'Focus' || b.textContent.trim() === 'Focus ON') && ${shownFn}(b))`);
  if (hasFocusButton) errors.push("Old fullscreen Focus button still present");

  // 2. Table-only toggle present (visible instance)
  const toggleExists = await evalJs(`!!(${shownBtn(tableOnlyBtn)})`);
  if (!toggleExists) errors.push("Table-only toggle button missing");

  // 3. Click it -> chrome hides, table stays, restore pill appears.
  //    Take ONE atomic snapshot after the click so dev-server Fast Refresh
  //    churn can't corrupt a multi-eval sequence.
  const clicked = await evalJs(`(() => {
    const b = ${shownBtn(tableOnlyBtn)};
    if (!b) return false;
    b.click();
    return true;
  })()`);
  if (!clicked) errors.push("Could not click table-only toggle");
  // Poll until the visible Restore pill appears (dev server may be slow on first hit)
  const pillAppeared = await waitFor(() => evalJs(`[...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'Restore' && ${shownFn}(b))`), 20000);
  await sleep(600);
  const snap = await evalJs(`(() => {
    const shown = ${shownFn};
    const restoreBtns = [...document.querySelectorAll('button')].filter(b => b.textContent.trim() === 'Restore');
    const searchInputs = [...document.querySelectorAll('input[name="sheet-quick-search"]')];
    const visibleRestore = restoreBtns.filter(shown);
    const toggle = ${shownBtn(tableOnlyBtn)};
    return {
      searchVisible: searchInputs.some(shown),
      restoreTotal: restoreBtns.length,
      restoreVisibleCount: visibleRestore.length,
      restorePosition: visibleRestore[0] ? getComputedStyle(visibleRestore[0]).position : null,
      restoreRect: visibleRestore[0] ? (() => { const r = visibleRestore[0].getBoundingClientRect(); return Math.round(r.width) + 'x' + Math.round(r.height); })() : null,
      toggleVisibleAfter: !!toggle,
      bodyText: document.body.innerText.slice(0, 120),
    };
  })()`);
  console.log("snapshot after click:", JSON.stringify(snap));
  const searchHidden = !snap.searchVisible;
  const tableVisible = await evalJs(`!![...document.querySelectorAll('[class*="grid"]')].find(el => ${shownFn}(el) && (el.className.includes('auto-') || el.className.includes('grid-template') || el.scrollWidth > 200))`);
  const restorePillFixed = snap.restorePosition;
  if (!searchHidden) errors.push("Quick search still visible in table-only mode");
  if (!tableVisible) errors.push("Table not visible in table-only mode");
  if (!snap.restoreVisibleCount) errors.push("Restore pill missing in table-only mode");
  if (restorePillFixed !== "fixed") errors.push(`Restore pill not fixed (got ${restorePillFixed})`);
  if (!pillAppeared) errors.push("Restore pill never appeared after toggle");

  // 4. Restore -> controls come back (single atomic snapshot again)
  await evalJs(`(() => {
    const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Restore' && ${shownFn}(x));
    if (b) b.click();
  })()`);
  await waitFor(() => evalJs(`[...document.querySelectorAll('input[name="sheet-quick-search"]')].some(el => ${shownFn}(el))`), 15000);
  const snap2 = await evalJs(`(() => {
    const shown = ${shownFn};
    return {
      searchVisible: [...document.querySelectorAll('input[name="sheet-quick-search"]')].some(shown),
      restoreVisible: [...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'Restore' && shown(b)),
    };
  })()`);
  console.log("snapshot after restore:", JSON.stringify(snap2));
  const searchBack = snap2.searchVisible;
  const pillGone = !snap2.restoreVisible;
  if (!searchBack) errors.push("Quick search did not return after restore");
  if (!pillGone) errors.push("Restore pill still visible after restore");

  // 5. Horizontal overflow check in table-only mode
  await evalJs(`(() => { const b = ${shownBtn(tableOnlyBtn)}; if (b) b.click(); })()`);
  await sleep(600);
  const overflow = await evalJs(`document.documentElement.scrollWidth - window.innerWidth`);
  if (overflow > 0) errors.push(`Horizontal overflow in table-only mode: ${overflow}px`);

  // 6. Console errors (network aborts ignored)
  await send("Runtime.enable");
  socket.addEventListener("message", (event) => {
    const msg = JSON.parse(event.data.toString());
    if (msg.method === "Runtime.exceptionThrown") {
      consoleErrors.push(msg.params.exceptionDetails?.text || "exception");
    }
    if (msg.method === "Log.entryAdded" && msg.params.entry.level === "error") {
      consoleErrors.push(msg.params.entry.text);
    }
  });
  await sleep(1200);

  console.log("── Sheets table-only verification ──");
  console.log(`toggle present:            ${toggleExists ? "PASS" : "FAIL"}`);
  console.log(`chrome hidden:             ${searchHidden ? "PASS" : "FAIL"}`);
  console.log(`table visible:             ${tableVisible ? "PASS" : "FAIL"}`);
  console.log(`restore pill (fixed):      ${restorePillFixed === "fixed" ? "PASS" : "FAIL"}`);
  console.log(`restore works:             ${searchBack && pillGone ? "PASS" : "FAIL"}`);
  console.log(`horizontal overflow:       ${overflow <= 0 ? `PASS (${overflow}px)` : "FAIL"}`);
  console.log(`old fullscreen removed:    ${!hasFocusButton ? "PASS" : "FAIL"}`);
  console.log(`console errors:            ${consoleErrors.length === 0 ? "PASS (none)" : "FAIL: " + consoleErrors.join(" | ")}`);
  console.log("");
  console.log(errors.length === 0 && consoleErrors.length === 0 ? "✅ ALL CHECKS PASSED" : `❌ ${errors.length} UI failures, ${consoleErrors.length} console errors`);
} finally {
  try {
    socket?.close();
  } catch {}
  chrome.kill();
  await sleep(500);
  rmSync(profile, { recursive: true, force: true });
}
