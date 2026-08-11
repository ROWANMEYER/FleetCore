/**
 * Driver flip-card verification for the FleetCore PWA.
 *
 * Launches headless Chrome, signs in as the admin seed user and checks the
 * Admin → Drivers flip cards:
 *   - tapping a card spins it to the back (Licence & Permit panel is the
 *     topmost painted element at the card's centre)
 *   - tapping again spins it back to the front (driver name/ID is topmost)
 *   - the Edit button opens the edit form WITHOUT flipping the card
 *   - only one card can be flipped at a time
 *   - no console errors (warnings beyond an allowlist fail too)
 *
 * Exits 1 (non-zero) if any assertion fails — suitable for CI.
 *
 * Usage: node scripts/verify-driver-flip.mjs [url]
 * Env:   CHROME_PATH   (optional, path to Chrome/Chromium binary)
 *        AUDIT_URL     (optional, alternative to the positional arg)
 *        AUDIT_EMAIL / AUDIT_PASSWORD (optional, default admin@fleetcore.app / admin123)
 */
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = process.argv[2] || process.env.AUDIT_URL || "http://localhost:3000";

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
const profile = mkdtempSync(join(tmpdir(), "fc-flip-"));
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

  const evalJs = async (expression) => {
    const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) return { __error: r.exceptionDetails.text };
    return r.result.value;
  };

  const failures = [];
  const report = { base: BASE, checks: [] };
  const check = (name, ok, detail = "") => {
    report.checks.push({ name, ok, detail });
    if (!ok) failures.push(`${name}${detail ? ` -> ${detail}` : ""}`);
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
    return (await evalJs(`location.pathname !== "/login"`)) ? true : null;
  }, 25000);
  check("login", !!loggedIn, "login failed");

  // ── Admin → Drivers ─────────────────────────────────────────────
  await send("Page.navigate", { url: BASE + "/admin/drivers" });
  await waitFor(() => evalJs("document.readyState === 'complete'"), 20000);
  const cardsReady = await waitFor(
    () => evalJs(`location.pathname === "/admin/drivers" && document.querySelectorAll('[role="button"][aria-pressed]').length >= 1`),
    25000
  );
  check("driver cards rendered", !!cardsReady, "no flip cards found");

  const flipCount = () => evalJs(`document.querySelectorAll('[role="button"][aria-pressed]').length`);
  const flippedCount = () => evalJs(`document.querySelectorAll('[role="button"][aria-pressed="true"]').length`);
  const topmostAt = (selector) =>
    evalJs(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      if (!hit) return null;
      return hit.closest('div,span') ? (hit.textContent || '').trim().slice(0, 80) : '';
    })()`);
  const backVisible = () => topmostAt('[role="button"][aria-pressed]');

  // 1 — tap the first card → back face should be painted on top.
  await evalJs(`document.querySelector('[role="button"][aria-pressed]').click()`);
  await sleep(900);
  const afterFirstFlip = await backVisible();
  check("flip to back", (await flippedCount()) === 1, `flipped count=${await flippedCount()}`);
  check("back face on top", typeof afterFirstFlip === "string" && /Licence|Permit|PDP|Birthday/i.test(afterFirstFlip), `topmost="${afterFirstFlip}"`);

  // 2 — tap again → front face should return.
  await evalJs(`document.querySelector('[role="button"][aria-pressed]').click()`);
  await sleep(900);
  const afterSecondFlip = await backVisible();
  check("flip back to front", (await flippedCount()) === 0, `flipped count=${await flippedCount()}`);
  check(
    "front face on top",
    typeof afterSecondFlip === "string" && !/Licence|Permit|PDP|Birthday|Member/i.test(afterSecondFlip) && afterSecondFlip.length > 0,
    `topmost="${afterSecondFlip}"`
  );

  // 3 — only one card flips at a time (flip first, then second).
  await evalJs(`document.querySelectorAll('[role="button"][aria-pressed]')[0].click()`);
  await sleep(900);
  const secondBefore = await flippedCount();
  await evalJs(`document.querySelectorAll('[role="button"][aria-pressed]')[1].click()`);
  await sleep(900);
  const secondAfter = await flippedCount();
  check("only one card flipped at a time", secondBefore === 1 && secondAfter === 1, `${secondBefore} -> ${secondAfter}`);
  // unflip the second card
  await evalJs(`document.querySelector('[role="button"][aria-pressed="true"]').click()`);
  await sleep(900);

  // 4 — the Edit button must NOT flip the card.
  const flipBeforeEdit = await flippedCount();
  await evalJs(`document.querySelector('[role="button"][aria-pressed] [title="Edit"]').click()`);
  await sleep(600);
  const editOpened = await waitFor(() => evalJs(`document.body.textContent.includes("Editing")`), 8000);
  const flipAfterEdit = await flippedCount();
  check("edit opens form", !!editOpened);
  check("edit does not flip card", flipBeforeEdit === flipAfterEdit, `${flipBeforeEdit} -> ${flipAfterEdit}`);
  // close the edit form via Cancel
  await evalJs(`[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === "Cancel").click()`);
  await sleep(600);

  // 4b — pressing Enter on a focused inner button (keyboard users) must NOT
  // flip the card (keydown bubbles to the wrapper's handler — guarded).
  await evalJs(`(() => {
    const btn = document.querySelector('[role="button"][aria-pressed] [title="Deactivate"], [role="button"][aria-pressed] [title="Activate"]');
    if (!btn) return false;
    btn.focus();
    btn.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    return document.activeElement === btn;
  })()`);
  await sleep(600);
  check("keyboard Enter on inner button does not flip", (await flippedCount()) === 0, `flipped count=${await flippedCount()}`);

  // 5 — Delete button must NOT flip the card either.
  const flipBeforeDelete = await flippedCount();
  await evalJs(`document.querySelector('[role="button"][aria-pressed] [title="Delete"]').click()`);
  await sleep(600);
  const deleteDialog = await waitFor(() => evalJs(`document.body.innerText.includes("Delete this driver?")`), 8000);
  const flipAfterDelete = await flippedCount();
  check("delete dialog opens", !!deleteDialog);
  check("delete does not flip card", flipBeforeDelete === flipAfterDelete, `${flipBeforeDelete} -> ${flipAfterDelete}`);
  await evalJs(`[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === "Cancel").click()`);
  await sleep(600);

  for (const w of warnings) {
    if (!WARNING_ALLOWLIST.some((re) => re.test(w.text))) failures.push(`console warning: ${w.text}`);
  }
  for (const e of errors) failures.push(`console error: ${e.text}`);

  report.failures = failures;
  report.consoleErrors = errors.length;
  console.log(JSON.stringify(report, null, 2));

  const passed = failures.length === 0;
  console.log(passed ? "\nDRIVER FLIP AUDIT PASSED" : `\nDRIVER FLIP AUDIT FAILED — ${failures.length} problem(s)`);

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
