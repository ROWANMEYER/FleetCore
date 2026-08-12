/**
 * Headless verification: driver-photo long-press lightbox.
 *
 * Seeds a driver with a real photo, then verifies:
 *   1. Admin → Drivers: long-press on the banner photo opens the lightbox
 *      (role=dialog, centered, backdrop blurred), the release-click does NOT
 *      flip the card, and the lightbox shows the full uncropped <img>.
 *   2. A quick tap on the card still flips it (long-press didn't break taps).
 *   3. Calendar: long-press on a birthday thumb opens the lightbox and does
 *      NOT open the WhatsApp link.
 *   4. Escape closes the lightbox; no console errors.
 *
 * Usage: node scripts/verify-longpress-photo.mjs
 * Env:   AUDIT_MOBILE=1 emulates a 375x812 phone.
 */
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ConvexHttpClient } from "convex/browser";

const BASE = process.env.AUDIT_URL || "http://localhost:3000";
const CONVEX_URL = "https://quixotic-gopher-969.convex.cloud";
const client = new ConvexHttpClient(CONVEX_URL);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── 1px PNGs (tiny, decode anywhere) — two distinct ones so the display crop
// (PNG_1PX) and the stored original (PNG_ORIG) have different storage URLs and
// the lightbox check can prove it shows the FULL original, not the crop.
const PNG_1PX =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const PNG_ORIG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

async function seed() {
  // The calendar query shows birthdays of the CURRENT month, and the first 6
  // SA ID digits encode YYMMDD — build the ID from today so the seeded driver
  // always has a birthday this month (2026-08-10 -> "260810").
  const now = new Date();
  const yy = String(now.getFullYear() % 100).padStart(2, "0");
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(Math.min(now.getDate(), 28)).padStart(2, "0");
  const idNumber = `${yy}${mm}${dd}5800085`;
  const drivers = await client.query("fleet:getDrivers", { includeInactive: true });
  // Reuse a leftover probe driver (keyed by driverId, which is unique) so a
  // crashed earlier run can't make createDriver throw "already exists".
  const existing = drivers.find((d) => d.driverId === "LPR-01");
  let driverId;
  if (existing) {
    driverId = existing._id;
  } else {
    try {
      driverId = await client.mutation("fleet:createDriver", {
        driverId: "LPR-01",
        driverName: "Longpress Test Driver",
        idNumber,
        phone: "0820000000",
        status: "active",
      });
    } catch (e) {
      // Raced with a parallel probe run — reuse the one that won.
      const again = await client.query("fleet:getDrivers", { includeInactive: true });
      const winner = again.find((d) => d.driverId === "LPR-01");
      if (!winner) throw e;
      driverId = winner._id;
    }
  }
  // Re-upload both images every run (idempotent) so photoUrl + photoOriginalUrl
  // are always set — the lightbox must show the ORIGINAL.
  await client.action("fleet:uploadDriverPhoto", {
    driverId,
    image: PNG_1PX,
    originalImage: PNG_ORIG,
  });
  const fresh = (await client.query("fleet:getDrivers", { includeInactive: true })).find(
    (d) => d.driverId === "LPR-01"
  );
  return {
    driverId,
    created: !existing,
    needsIdFix: existing ? existing.idNumber !== idNumber : false,
    photoUrl: fresh?.photoUrl || "",
    photoOriginalUrl: fresh?.photoOriginalUrl || "",
  };
}

async function cleanup(driverId) {
  try {
    await client.mutation("fleet:removeDriverPhoto", { driverId });
    await client.mutation("fleet:deleteDriver", { id: driverId });
  } catch (e) {
    console.error("cleanup failed:", e.message);
  }
}

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

const profile = mkdtempSync(join(tmpdir(), "fc-longpress-"));
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
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.id && pending.has(msg.id)) {
        const { res, rej } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) rej(new Error(msg.error.message));
        else res(msg.result);
      } else if (msg.method === "Log.entryAdded") {
        if (msg.params.entry.level === "error") errors.push({ kind: "log", text: msg.params.entry.text });
      } else if (msg.method === "Runtime.exceptionThrown") {
        const d = msg.params.exceptionDetails || {};
        const desc = (d.exception && (d.exception.description || d.exception.value)) || d.text || "Unknown exception";
        errors.push({ kind: "exception", text: String(desc).slice(0, 500) });
      } else if (msg.method === "Runtime.consoleAPICalled") {
        const text = msg.params.args.map((a) => a.value ?? a.description ?? "").join(" ");
        if (msg.params.type === "error") errors.push({ kind: "console", text });
      }
    };
    ws.onopen = () => {
      const send = (method, params = {}) =>
        new Promise((res, rej) => {
          const id = ++msgId;
          pending.set(id, { res, rej });
          ws.send(JSON.stringify({ id, method, params }));
        });
      resolve({ ws, send, errors });
    };
    ws.onerror = () => reject(new Error("WebSocket connection failed"));
  });
}

async function main() {
  const { driverId, created, needsIdFix, photoUrl, photoOriginalUrl } = await seed();
  if (needsIdFix) {
    // A leftover probe driver exists but with a stale birthday ID — point it at
    // the current month so the calendar check can find it.
    const now = new Date();
    const yy = String(now.getFullYear() % 100).padStart(2, "0");
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(Math.min(now.getDate(), 28)).padStart(2, "0");
    try {
      await client.mutation("fleet:updateDriver", {
        id: driverId,
        patch: {
          driverId: "LPR-01",
          driverName: "Longpress Test Driver",
          idNumber: `${yy}${mm}${dd}5800085`,
          phone: "0820000000",
          status: "active",
        },
      });
    } catch (e) {
      console.error("idNumber fix failed (calendar check may be skipped):", e.message);
    }
  }
  const failures = [];
  const report = { base: BASE, checks: [] };
  const check = (name, ok, detail = "") => {
    report.checks.push({ name, ok, detail });
    if (!ok) failures.push(`${name}${detail ? ` -> ${detail}` : ""}`);
  };

  try {
    const port = await getDebugPort();
    const target = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(BASE + "/login")}`, {
      method: "PUT",
    }).then((r) => r.json());
    const { ws, send, errors } = await makeClient(target.webSocketDebuggerUrl);

    await send("Page.enable");
    await send("Runtime.enable");
    await send("Log.enable");

    if (process.env.AUDIT_MOBILE === "1") {
      await send("Emulation.setDeviceMetricsOverride", { width: 375, height: 812, deviceScaleFactor: 3, mobile: true });
    }

    const evalJs = async (expression) => {
      const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) return { __error: r.exceptionDetails.text };
      return r.result.value;
    };

    // Long-press via CDP Input.dispatchTouchEvent / mouse: simulate pointerdown,
    // hold 750ms, then release. `elExpr` is a JS expression that evaluates to
    // the target element (a CSS selector or a scoped card query).
    const longPress = async (elExpr) => {
      await evalJs(`(() => {
        const el = (${elExpr});
        if (!el) return false;
        el.scrollIntoView({ block: 'center' });
        return true;
      })()`);
      // Let the scroll settle before reading coordinates — reading the rect in
      // the same tick as scrollIntoView gives a stale (pre-scroll) position.
      await sleep(500);
      const pos = await evalJs(`(() => {
        const el = (${elExpr});
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      })()`);
      if (!pos) return false;
      const type = process.env.AUDIT_MOBILE === "1" ? "touch" : "mouse";
      if (type === "touch") {
        await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: pos.x, y: pos.y }] });
        await sleep(750);
        await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      } else {
        await send("Input.dispatchMouseEvent", { type: "mousePressed", x: pos.x, y: pos.y, button: "left", clickCount: 1 });
        await sleep(750);
        await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: pos.x, y: pos.y, button: "left", clickCount: 1 });
      }
      await sleep(400);
      return true;
    };

    // ── Login ──────────────────────────────────────────────────────
    await send("Page.navigate", { url: BASE + "/login" });
    await waitFor(() => evalJs("document.readyState === 'complete'"), 20000);
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
        if (!email || !password) return;
        setNative(email, "admin@fleetcore.app");
        setNative(password, "admin123");
        document.querySelector('button[type="submit"]')?.click();
      })()`);
      await sleep(1500);
      return (await evalJs(`location.pathname !== "/login"`)) ? true : null;
    }, 25000);
    check("login", !!loggedIn, "login failed");

    // ── Admin → Drivers: long-press banner photo ────────────────────
    // Scope to the SEEDED driver's card (the page shows many drivers and the
    // first photo'd card may belong to real data — never assert on it). The
    // seeded driver may sit beyond the first page of cards, so type its name
    // into the search box first — the filtered list then shows only it.
    const CARD_EXPR = `(() => {
      const cards = [...document.querySelectorAll('[role="button"][aria-pressed]')];
      return cards.find((c) => (c.textContent || "").includes("Longpress Test Driver")) || null;
    })()`;
    await send("Page.navigate", { url: BASE + "/admin/drivers" });
    await waitFor(() => evalJs("document.readyState === 'complete'"), 20000);
    const pageReady = await waitFor(
      () => evalJs(`location.pathname === "/admin/drivers" && !!document.querySelector('input[placeholder*="Search name"]')`),
      25000
    );
    if (pageReady) {
      // Filter to the seeded driver so its card is on the visible page.
      await evalJs(`(async () => {
        const input = document.querySelector('input[placeholder*="Search name"]');
        if (!input) return;
        const setNative = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        setNative.call(input, 'Longpress');
        input.dispatchEvent(new Event('input', { bubbles: true }));
      })()`);
      await sleep(800);
    }
    const cardReady = await waitFor(
      () => evalJs(`!!(${CARD_EXPR}?.querySelector('[title="Hold to view full photo"]'))`),
      25000
    );
    check("drivers: card with photo rendered", !!cardReady, "no long-press target found");

    // Long-press → lightbox opens, card must NOT flip.
    const LONGPRESS_TARGET = `${CARD_EXPR}?.querySelector('[title="Hold to view full photo"]')`;
    const didPress = await longPress(LONGPRESS_TARGET);
    const lightbox = await waitFor(() => evalJs(`!!document.querySelector('[role="dialog"][aria-modal="true"] img')`), 6000);
    const flipped = await evalJs(`document.querySelectorAll('[role="button"][aria-pressed="true"]').length`);
    const lpSrc = await evalJs(
      `document.querySelector('[role="dialog"][aria-modal="true"] img')?.getAttribute("src") || ""`
    );
    const backdropBlur = await evalJs(`(() => {
      const d = document.querySelector('[role="dialog"][aria-modal="true"]');
      if (!d) return "no dialog";
      const bg = d.firstElementChild;
      if (!bg) return "no backdrop";
      const cs = getComputedStyle(bg);
      return (cs.backdropFilter || cs.webkitBackdropFilter || "none").slice(0, 40);
    })()`);
    check("long-press opens lightbox", !!lightbox);
    check("long-press does not flip card", flipped === 0, `flipped=${flipped}`);
    check("lightbox has full image src", typeof lpSrc === "string" && lpSrc.startsWith("http"), `src=${lpSrc.slice(0, 60)}`);
    check("backdrop is blurred", /blur/.test(backdropBlur), backdropBlur);
    // The lightbox must show the FULL (uncropped) original, not the display
    // crop — the two seeded storage URLs are different so this is provable.
    check(
      "lightbox shows the full original (not the crop)",
      !!photoOriginalUrl && lpSrc === photoOriginalUrl && lpSrc !== photoUrl,
      `display=${photoUrl.slice(0, 50)} lightbox=${lpSrc.slice(0, 50)}`
    );

    // Pinch-zoom inside the lightbox: two touch points spread apart must
    // increase the image's scale (data-lightbox-img transform). Only on touch
    // emulation — desktop uses mouse, which can't pinch.
    if (process.env.AUDIT_MOBILE === "1") {
      const scaleBefore = await evalJs(`(() => {
        const w = document.querySelector('[data-lightbox-img]');
        if (!w) return null;
        const m = getComputedStyle(w).transform.match(/matrix\\(([^,]+),/);
        return m ? parseFloat(m[1]) : 1;
      })()`);
      await send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [
          { x: 130, y: 380 },
          { x: 245, y: 380 },
        ],
      });
      await send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [
          { x: 80, y: 380 },
          { x: 295, y: 380 },
        ],
      });
      await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await sleep(400);
      const scaleAfter = await evalJs(`(() => {
        const w = document.querySelector('[data-lightbox-img]');
        if (!w) return null;
        const m = getComputedStyle(w).transform.match(/matrix\\(([^,]+),/);
        return m ? parseFloat(m[1]) : 1;
      })()`);
      check(
        "pinch zooms the lightbox image",
        typeof scaleBefore === "number" && typeof scaleAfter === "number" && scaleAfter > scaleBefore + 0.1,
        `scale ${scaleBefore} -> ${scaleAfter}`
      );
    }

    // Escape closes it.
    await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    const closedAfterEsc = await waitFor(() => evalJs(`!document.querySelector('[role="dialog"][aria-modal="true"]')`), 4000);
    check("escape closes lightbox", !!closedAfterEsc);

    // Quick tap still flips the card (long-press didn't break normal taps).
    await evalJs(`${CARD_EXPR}?.click()`);
    await sleep(900);
    const flippedCount = await evalJs(`document.querySelectorAll('[role="button"][aria-pressed="true"]').length`);
    check("quick tap still flips card", flippedCount === 1, `flipped=${flippedCount}`);
    await evalJs(`document.querySelector('[role="button"][aria-pressed="true"]')?.click()`);
    await sleep(900);

    // ── Calendar: long-press thumb does NOT navigate the WhatsApp link ──
    await send("Page.navigate", { url: BASE + "/calendar" });
    await waitFor(() => evalJs("document.readyState === 'complete'"), 20000);
    const thumbReady = await waitFor(
      () => evalJs(`!!document.querySelector('a[title*="happy birthday"] [title="Hold to view full photo"]')`),
      20000
    );
    if (!thumbReady) {
      check("calendar: thumb with photo rendered", false, "birthday thumb not found (seed a birthday driver or check the month)");
    } else {
      check("calendar: thumb with photo rendered", true);
      const urlBefore = await evalJs("location.href");
      await longPress(`document.querySelector('a[title*="happy birthday"] [title="Hold to view full photo"]')`);
      const calLightbox = await waitFor(() => evalJs(`!!document.querySelector('[role="dialog"][aria-modal="true"] img')`), 6000);
      await sleep(300);
      const urlAfter = await evalJs("location.href");
      check("calendar long-press opens lightbox", !!calLightbox);
      check("calendar long-press does not navigate link", urlBefore === urlAfter, `${urlBefore} -> ${urlAfter}`);
      // close
      await evalJs(`document.querySelector('[role="dialog"][aria-modal="true"]')?.click()`);
      await sleep(400);
    }

    // ── Console errors ──────────────────────────────────────────────
    for (const e of errors) failures.push(`console error: ${e.text}`);
    report.consoleErrors = errors.length;

    report.failures = failures;
    console.log(JSON.stringify(report, null, 2));
    console.log(failures.length === 0 ? "\nLONGPRESS PROBE PASSED" : `\nLONGPRESS PROBE FAILED — ${failures.length} problem(s)`);

    ws.close();
  } finally {
    if (created) await cleanup(driverId);
    chrome.kill();
    for (let i = 0; i < 5; i++) {
      try {
        rmSync(profile, { recursive: true, force: true });
        break;
      } catch {
        await sleep(500);
      }
    }
  }
  process.exit(failures.length === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("PROBE FAILED:", err.message);
  try {
    chrome.kill();
  } catch {}
  try {
    rmSync(profile, { recursive: true, force: true });
  } catch {}
  process.exit(1);
});
