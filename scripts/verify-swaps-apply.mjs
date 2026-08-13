/**
 * Headless probe: swaps history Apply/Clear button behavior.
 *
 * The From/To inputs edit DRAFT dates; the list must NOT refilter until Apply
 * is clicked. To make the checks observable against real cards (the dev data
 * has no swaps in the current month, and the quick filter restricts to the
 * current period), the probe seeds ONE swap dated today by pairing an unpaired
 * truck with an unpaired trailer (`pairTruckAndTrailer` records a "Manual Pair"
 * swap with swapDate = now), verifies the UI flow, then restores the truck to
 * its unpaired state via `unpairByTruck` (which records a corresponding
 * "Manual Unpair" history entry — the truck itself is fully restored).
 *
 * Verifies:
 *   A. Picking a date (draft) leaves the visible swap list unchanged.
 *   B. Clicking Apply commits the drafts → a far-future From date empties the
 *      list and shows the empty state.
 *   C. Clicking Clear resets drafts AND the live filter → the list returns to
 *      its pre-filter state and the inputs are emptied.
 *   D. Zero console errors.
 *
 * Usage: node scripts/_probe-swaps-apply.mjs [url]
 */
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { ConvexHttpClient } = require("convex/browser");

const BASE = process.argv[2] || "http://localhost:3000";
const CONVEX_URL = process.env.CONVEX_URL || "https://quixotic-gopher-969.convex.cloud";
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
const profile = mkdtempSync(join(tmpdir(), "fc-swaps-apply-"));
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

let seededTruckId = null;
let seededTruckOriginalState = null;

try {
  console.log(`PROBE: ${BASE} convex=${CONVEX_URL}`);
  // ── Seed: pair an unpaired truck with an unpaired trailer (swap dated today) ──
  const convex = new ConvexHttpClient(CONVEX_URL);
  const unpairedTrucks = await convex.query("trucks:getWithoutTrailers", {});
  const allTrailers = await convex.query("fleet:getTrailers", {});
  const trucksWithTrailers = await convex.query("trucks:getAllWithTrailer", {});
  const takenTrailerIds = new Set((trucksWithTrailers || []).map((t) => t.currentTrailerId).filter(Boolean));
  const freeTrailer = (allTrailers || []).find((t) => !takenTrailerIds.has(t._id));
  if (!unpairedTrucks?.length || !freeTrailer) {
    console.log("SKIP: no unpaired truck + free trailer available to seed a swap");
  } else {
    seededTruckId = unpairedTrucks[0]._id;
    seededTruckOriginalState = { currentTrailerId: unpairedTrucks[0].currentTrailerId };
    await convex.mutation("trailerSwaps:pairTruckAndTrailer", {
      truckId: seededTruckId,
      trailerId: freeTrailer._id,
    });
    console.log(`SEEDED swap: truck ${unpairedTrucks[0].truckFleetNo} <- trailer ${freeTrailer.trailerFleetNoStr}`);
  }

  // ── Browser checks ──
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

  // ── Swaps history ──
  await send("Page.navigate", { url: BASE + "/operations/swaps/history" });
  await waitFor(() => evalJs("document.readyState === 'complete'"), 20000);
  await waitFor(
    () =>
      evalJs(`(() => {
        if (document.querySelectorAll('input[type="date"]').length >= 2) return true;
        const btn = [...document.querySelectorAll('button')].find(b => b.textContent.includes('Filter'));
        if (btn) { btn.click(); return true; }
        return false;
      })()`),
    25000
  );
  await sleep(1000);

  const cardCount = () =>
    evalJs(`[...document.querySelectorAll('div')].filter(d => d.textContent.trim().startsWith('TRUCK ')).length`);

  const baseline = await cardCount();
  check("swaps: seeded swap visible (Today filter)", baseline >= 1, `cards=${baseline}`);

  // A. Seed From+To drafts (July range) but do NOT click Apply.
  await evalJs(`(async () => {
    const setDate = (el, v) => {
      el.focus();
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, v);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    };
    const els = [...document.querySelectorAll('input[type="date"]')];
    setDate(els[0], "2026-07-01");
    setDate(els[1], "2026-07-31");
    await new Promise(r => setTimeout(r, 300));
    els[0].blur();
    els[1].blur();
    await new Promise(r => setTimeout(r, 300));
    return els.map(e => e.value);
  })()`);
  const afterDraft = await cardCount();
  check(
    "picking dates does NOT filter until Apply",
    afterDraft === baseline,
    `before=${baseline} afterDraft=${afterDraft}`
  );

  // B. Click Apply — drafts commit → far-future From empties the list.
  await evalJs(`(() => {
    const btn = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Apply');
    if (btn) btn.click();
    return !!btn;
  })()`);
  await sleep(900);
  const afterApply = await cardCount();
  const emptyShown = await evalJs(`document.body.innerText.includes('No swaps match')`);
  check(
    "Apply commits the filter (far-future range empties list)",
    afterApply === 0 && emptyShown,
    `cards=${afterApply} empty=${emptyShown}`
  );

  // C. Click Clear — drafts AND live filter reset → list returns to baseline.
  await evalJs(`(() => {
    const btn = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Clear');
    if (btn) btn.click();
    return !!btn;
  })()`);
  await sleep(900);
  const afterClear = await cardCount();
  const inputCleared = await evalJs(`[...document.querySelectorAll('input[type="date"]')].every(i => i.value === "")`);
  check(
    "Clear resets filter and inputs",
    afterClear === baseline && inputCleared,
    `cards=${afterClear} baseline=${baseline} inputsEmpty=${inputCleared}`
  );

  await sleep(600);
  check("console errors", consoleErrors.length === 0, consoleErrors.slice(0, 2).join(" | "));

  console.log(`\n── Swaps Apply button probe ──`);
  console.log(errors.length === 0 ? "✅ ALL CHECKS PASSED" : `❌ ${errors.length} FAILED: ${errors.join("; ")}`);
} catch (e) {
  console.log("PROBE ERROR:", e && e.stack ? e.stack : String(e));
} finally {
  // ── Cleanup: restore the truck to its unpaired state ──
  if (seededTruckId) {
    try {
      const convex = new ConvexHttpClient(CONVEX_URL);
      await convex.mutation("trailerSwaps:unpairByTruck", { truckId: seededTruckId });
      console.log("CLEANUP: truck unpaired (state restored)");
    } catch (e) {
      console.log("CLEANUP WARN:", e.message);
    }
  }
  try {
    chrome.kill();
    await sleep(500);
    rmSync(profile, { recursive: true, force: true });
  } catch {}
  process.exit(errors.length ? 1 : 0);
}
