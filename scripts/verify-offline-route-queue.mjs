/**
 * Headless probe: offline route entry + sync.
 *
 * The Input page must keep working without a network: truck/trailer/driver
 * selects keep their cached values, saving a route while offline puts it in the
 * localStorage queue (fleetcor_offline_route_queue), and reconnecting replays
 * the queue into real routes — exactly once, thanks to the offlineKey
 * idempotency key.
 *
 * Verifies:
 *   A. While offline, the truck select still lists fleet trucks (cache fallback).
 *   B. Saving a route while offline shows the queued banner and stores one item
 *      in the offline queue (with a stable offlineKey).
 *   C. Coming back online auto-syncs: the queue empties and the route exists
 *      server-side with the same offlineKey.
 *   D. Replaying the same payload (simulated) does NOT create a duplicate —
 *      createDailyRoute returns the existing route id.
 *
 * Usage: node scripts/verify-offline-route-queue.mjs [url]
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
const profile = mkdtempSync(join(tmpdir(), "fc-offline-queue-"));
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
let socket;

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

const waitFor = async (fn, timeoutMs = 25000) => {
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

let createdRouteId = null;
let queuedOfflineKey = null;
let queuedRouteDate = null;
let sessionToken = null;

try {
  console.log(`PROBE: ${BASE} convex=${CONVEX_URL}`);

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
  });

  // Offline entry is a mobile/field feature — emulate a phone viewport so the
  // Input page's mobile instance (which the daily-planner layout renders inside
  // an `lg:hidden` container, hidden on desktop) is the visible one.
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await send("Runtime.enable");
  await send("Page.enable");
  await send("Network.enable");

  // ── Login (online) ──
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

  // ── Visit the Input page ONLINE first so the fleet cache is populated ──
  await send("Page.navigate", { url: BASE + "/operations/daily-planner/input" });
  await waitFor(() => evalJs("document.readyState === 'complete'"), 20000);
  const truckOptionsReady = await waitFor(
    () =>
      evalJs(`(() => {
        const sel = [...document.querySelectorAll('select')].find(x => (x.options[0]?.textContent || '').includes('Select Truck'));
        return sel && sel.options.length > 1 ? sel.options.length : null;
      })()`),
    30000
  );
  check("input page: truck select populated online", !!truckOptionsReady, `options=${truckOptionsReady}`);
  sessionToken = await evalJs(`localStorage.getItem('fleetcore-session-token')`);
  await sleep(800); // let the cache write-through effects land

  // ── Go OFFLINE ──
  await send("Network.emulateNetworkConditions", {
    offline: true,
    latency: 0,
    downloadThroughput: 0,
    uploadThroughput: 0,
  });
  await sleep(1200);
  const navigatorOffline = await evalJs(`navigator.onLine`);
  check("network emulated offline", navigatorOffline === false, `navigator.onLine=${navigatorOffline}`);

  // A. Fleet selects still work offline (cached fallback).
  const truckSel = await evalJs(`(() => {
    const sel = [...document.querySelectorAll('select')].find(x => (x.options[0]?.textContent || '').includes('Select Truck'));
    return sel ? { first: sel.options[0]?.textContent?.trim(), count: sel.options.length } : null;
  })()`);
  check("A. truck select populated offline (cache)", truckSel && truckSel.count > 1, JSON.stringify(truckSel));

  // ── Fill the form offline ──
  const filled = await evalJs(`(async () => {
    const findSel = (ph) => [...document.querySelectorAll('select')].find(s => (s.options[0]?.textContent || '').includes(ph));
    const setNative = (el, value) => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set.call(el, value);
      el.dispatchEvent(new Event("change", { bubbles: true }));
    };
    const truck = findSel("Select Truck"), trailer = findSel("Select Trailer"), driver = findSel("Select Driver");
    if (!truck || !driver || truck.options.length < 2 || driver.options.length < 2) return { ok: false, why: "selects" };
    setNative(truck, truck.options[1].value);
    if (trailer && trailer.options.length > 1) setNative(trailer, trailer.options[1].value);
    setNative(driver, driver.options[1].value);
    const setIn = (el, value) => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, value);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    };
    const km = [...document.querySelectorAll('input')].find(i => i.type === 'number');
    if (km) setIn(km, "125");
    await new Promise(r => setTimeout(r, 200));
    return { ok: true, truck: truck.options[1].value, driver: driver.options[1].value };
  })()`);
  check("form header filled offline", filled && filled.ok === true, filled && filled.why);

  // Add one load (all client-side — must work offline).
  const loadAdded = await evalJs(`(async () => {
    const setNative = (el, value) => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, value);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    };
    const byPh = (ph) => [...document.querySelectorAll('input')].find(i => i.placeholder === ph);
    const client = byPh("Client Name");
    const from = byPh("Pickup Location");
    const to = byPh("Drop Location");
    if (!client || !from || !to) return { ok: false, why: "inputs missing" };
    setNative(client, "OFFLINE AUDIT CLIENT");
    setNative(from, "GEORGE");
    setNative(to, "KNYSNA");
    const nums = [...document.querySelectorAll('input[placeholder="0.00"]')];
    if (nums[0]) setNative(nums[0], "10");
    if (nums[1]) setNative(nums[1], "150");
    await new Promise(r => setTimeout(r, 200));
    return { ok: true };
  })()`);
  check("load form filled offline", loadAdded && loadAdded.ok === true, loadAdded && loadAdded.why);

  const addClicked = await waitFor(async () => {
    const done = await evalJs(`(() => {
      const btn = [...document.querySelectorAll('button')].find(b => b.textContent.includes('Add Load') && !b.disabled);
      if (!btn) return null;
      btn.click();
      return true;
    })()`);
    if (done) await sleep(300);
    return done;
  }, 15000);
  check("Add Load clicked offline", !!addClicked);

  // ── Save offline → queued ──
  const saveClicked = await evalJs(`(() => {
    const btn = [...document.querySelectorAll('button')].find(b => b.textContent.includes('Save Route'));
    if (!btn) return false;
    btn.click();
    return true;
  })()`);
  check("Save Route clicked", !!saveClicked);

  const queuedBanner = await waitFor(
    () =>
      evalJs(`(() => {
        const queueRaw = localStorage.getItem('fleetcor_offline_route_queue');
        const queue = queueRaw ? JSON.parse(queueRaw) : [];
        const banner = document.body.innerText.includes('saved offline');
        return queue.length === 1 && banner ? queue : null;
      })()`),
    15000
  );
  check("B. offline save queued (banner + 1 item)", !!queuedBanner);
  if (queuedBanner && queuedBanner[0]) {
    queuedOfflineKey = queuedBanner[0].payload.offlineKey;
    queuedRouteDate = queuedBanner[0].payload.routeDate;
    check("   queue item has stable offlineKey", typeof queuedOfflineKey === "string" && queuedOfflineKey.length > 8);
  }

  // ── Back ONLINE → auto-sync ──
  await send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 0,
    downloadThroughput: -1,
    uploadThroughput: -1,
  });
  const synced = await waitFor(async () => {
    const empty = await evalJs(`(() => {
      const raw = localStorage.getItem('fleetcor_offline_route_queue');
      const q = raw ? JSON.parse(raw) : [];
      return q.length === 0;
    })()`);
    if (!empty) return false;
    await sleep(1200); // let the server-side insert land
    return true;
  }, 30000);
  check("C. queue emptied after reconnect", !!synced);

  // Verify the route exists server-side with the same offlineKey.
  const convex = new ConvexHttpClient(CONVEX_URL);
  if (sessionToken && queuedRouteDate && queuedOfflineKey) {
    const routes = await convex.query("dailyRoutes:getForSheets", {
      startDate: queuedRouteDate,
      endDate: queuedRouteDate,
      token: sessionToken,
      region: undefined,
    });
    const found = (routes || []).find((r) => r.offlineKey === queuedOfflineKey);
    createdRouteId = found ? found._id : null;
    check(
      "C. route exists server-side with same offlineKey",
      !!found,
      createdRouteId ? `id=${createdRouteId}` : "not found"
    );

    // D. Idempotency: replaying the identical payload must NOT duplicate.
    if (found) {
      const replayId = await convex.mutation("dailyRoutes:createDailyRoute", {
        routeDate: queuedRouteDate,
        driverName: found.driverName,
        truckFleetNoStr: found.truckFleetNoStr,
        truckFleetNo: found.truckFleetNoStr,
        trailerFleetNoStr: found.trailerFleetNoStr,
        kilometers: found.kilometers || 0,
        notes: found.notes || "",
        region: found.region || "garden_route",
        token: sessionToken,
        loads: (found.loads || []).map((l) => ({
          client: l.client,
          quantity: l.quantity,
          quantityType: l.quantityType,
          rate: l.rate,
          rateType: l.rateType,
          fromLocations: l.fromLocations || [],
          toLocations: l.toLocations || [],
        })),
        offlineKey: queuedOfflineKey,
      });
      check("D. replay with same offlineKey returns existing id (no duplicate)", replayId === createdRouteId, `replay=${replayId} original=${createdRouteId}`);
    }
  } else {
    check("C. route exists server-side with same offlineKey", false, "missing token/date/key");
  }

  console.log(`\n── Offline route queue probe ──`);
  console.log(errors.length === 0 ? "✅ ALL CHECKS PASSED" : `❌ ${errors.length} FAILED: ${errors.join("; ")}`);
} catch (e) {
  console.log("PROBE ERROR:", e && e.stack ? e.stack : String(e));
} finally {
  // ── Cleanup: delete the audited route ──
  if (createdRouteId && sessionToken) {
    try {
      const convex = new ConvexHttpClient(CONVEX_URL);
      await convex.mutation("dailyRoutes:deleteDailyRoute", { id: createdRouteId, token: sessionToken });
      console.log("CLEANUP: audited route deleted");
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
