/**
 * One-off headless probe: sheets date-range inputs must only apply a filter on
 * a REAL selection — not while the user browses months in the native picker.
 *
 * Simulates both behaviors on the compact header's From input
 * (name="sheet-from-date"):
 *   A. "Month browsing" — set a different value + dispatch only `input`
 *      events, then blur (the browser fires `input` mid-browse but `change`
 *      only on a real pick). The committed filter (observed via the persisted
 *      SHEETS_UI_KEY fromDate) must NOT change, and the input must revert to
 *      the committed date on blur.
 *   B. "Real selection" — set a value, dispatch `input` AND the native
 *      `change` event, then blur. The committed filter MUST update (localStorage
 *      fromDate changes) and the input keeps the chosen date.
 *
 * Usage: node scripts/_probe-date-commit.mjs [url]
 */
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = process.argv[2] || "http://localhost:3000";
const AUDIT_EMAIL = process.env.AUDIT_EMAIL || "admin@fleetcore.app";
const AUDIT_PASSWORD = process.env.AUDIT_PASSWORD || "admin123";
const UI_KEY = "fleetcore-sheets-ui-v1";

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
const profile = mkdtempSync(join(tmpdir(), "fc-date-commit-"));
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
      consoleErrors.push("console.error: " + (msg.params.args || []).map((a) => a.value ?? a.description ?? "").join(" "));
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
  await waitFor(() => evalJs(`!!document.querySelector('input[name="sheet-single-date"]')`), 25000);
  await sleep(1200);

  // Default mode is "single" — switch to Range so the From/To inputs render.
  const switched = await evalJs(`(() => {
    const isShown = (el) => {
      const s = getComputedStyle(el);
      return s.display !== "none" && s.visibility !== "hidden" && el.getBoundingClientRect().width > 0;
    };
    const btn = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === "Range" && isShown(b));
    if (!btn) return false;
    btn.click();
    return true;
  })()`);
  check("switched to Range mode", !!switched);
  const inputReady = await waitFor(
    () => evalJs(`!!document.querySelector('input[name="sheet-from-date"]')`),
    15000
  );
  check("range From input present (compact header)", !!inputReady);
  await sleep(800);

  const readCommitted = () =>
    evalJs(`(() => {
      try {
        const p = JSON.parse(localStorage.getItem(${JSON.stringify(UI_KEY)}) || "{}");
        return { from: p.fromDate || null, to: p.toDate || null };
      } catch { return null; }
    })()`);
  // Read the From input's displayed value + the committed filter.
  const readFromInput = () =>
    evalJs(`(() => {
      const el = document.querySelector('input[name="sheet-from-date"]');
      return el ? el.value : null;
    })()`);

  const committedBefore = await readCommitted();
  const inputBefore = await readFromInput();
  console.log("before:", JSON.stringify({ committed: committedBefore, input: inputBefore }));

  const testDate = "2026-07-01";

  // ── A. Month browsing: input events only, then blur (no native change) ──
  const browseResult = await evalJs(`(async () => {
    const el = document.querySelector('input[name="sheet-from-date"]');
    if (!el) return { error: "input not found" };
    el.focus();
    const setNative = (el, value) => {
      const proto = HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    };
    // Simulate a couple of month-navigation ticks in the calendar popup.
    setNative(el, "2026-06-01");
    await new Promise(r => setTimeout(r, 150));
    setNative(el, ${JSON.stringify(testDate)});
    await new Promise(r => setTimeout(r, 150));
    const duringBrowse = el.value; // draft while "browsing"
    el.blur();
    await new Promise(r => setTimeout(r, 300));
    const afterBlur = el.value; // should have reverted to the committed date
    return { duringBrowse, afterBlur };
  })()`);
  console.log("browse sim:", JSON.stringify(browseResult));
  const committedAfterBrowse = await readCommitted();
  const localStorageUnchanged = JSON.stringify(committedAfterBrowse) === JSON.stringify(committedBefore);
  check(
    "browsing months does NOT change the committed filter",
    localStorageUnchanged,
    JSON.stringify(committedAfterBrowse)
  );
  check(
    "draft reverts to committed date on blur",
    browseResult.afterBlur === inputBefore,
    `during=${browseResult.duringBrowse} after=${browseResult.afterBlur} committed=${inputBefore}`
  );

  // ── B. Real selection: input + native change, then blur ──
  const pickResult = await evalJs(`(async () => {
    const el = document.querySelector('input[name="sheet-from-date"]');
    if (!el) return { error: "input not found" };
    el.focus();
    const setNative = (el, value) => {
      const proto = HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    };
    setNative(el, ${JSON.stringify(testDate)});
    await new Promise(r => setTimeout(r, 150));
    // Real picker commit = the browser's native change event.
    el.dispatchEvent(new Event("change", { bubbles: true }));
    await new Promise(r => setTimeout(r, 300));
    const afterChange = el.value;
    el.blur();
    await new Promise(r => setTimeout(r, 300));
    const afterBlur = el.value;
    return { afterChange, afterBlur };
  })()`);
  console.log("pick sim:", JSON.stringify(pickResult));
  const committedAfterPick = await readCommitted();
  check(
    "a real selection DOES change the committed filter",
    committedAfterPick?.from === testDate,
    JSON.stringify(committedAfterPick)
  );
  check("input keeps the picked date", pickResult.afterBlur === testDate, `after=${pickResult.afterBlur}`);

  await sleep(600);
  check("console errors", consoleErrors.length === 0, consoleErrors.join(" | ") || "none");

  console.log("── Date-commit probe ──");
  console.log(errors.length === 0 ? "✅ ALL CHECKS PASSED" : `❌ ${errors.length} failures`);
} finally {
  try {
    socket?.close();
  } catch {}
  chrome.kill();
  await sleep(500);
  rmSync(profile, { recursive: true, force: true });
}
