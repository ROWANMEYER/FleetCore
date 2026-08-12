/**
 * Headless verification: driver-photo crop editor.
 *
 * Seeds a driver, then drives the real file input on Admin → Drivers to
 * verify the crop flow:
 *   1. Picking a file opens the crop editor (role=dialog "Crop photo").
 *   2. The + zoom button scales the image up (transform changes).
 *   3. Confirming uploads BOTH the cropped square (photoUrl) and the
 *      untouched original (photoOriginalUrl) — the two storage URLs differ.
 *   4. The card shows the cropped photo afterwards.
 *   5. Escape cancels the crop editor without uploading.
 *   6. No console errors.
 *
 * Exits 1 (non-zero) if any assertion fails — suitable for CI.
 *
 * Usage: node scripts/verify-driver-crop.mjs
 * Env:   CHROME_PATH   (optional, path to Chrome/Chromium binary)
 *        AUDIT_URL     (optional, alternative to the default URL)
 *        AUDIT_EMAIL / AUDIT_PASSWORD (optional)
 *        AUDIT_MOBILE  (optional, set to 1 to emulate a 375x812 phone)
 */
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ConvexHttpClient } from "convex/browser";

const BASE = process.env.AUDIT_URL || "http://localhost:3000";
const CONVEX_URL = "https://quixotic-gopher-969.convex.cloud";
const client = new ConvexHttpClient(CONVEX_URL);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// A real (non-trivial) JPEG so the crop math has something to work with:
// 2x2 opaque red PNG (decodes anywhere, natural dims known).
const PNG_2PX =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mP8z8BQDzD+Z2BgYAAAAHsBAcG1f3uHAAAAAElFTkSuQmCC";

async function seed() {
  const drivers = await client.query("fleet:getDrivers", { includeInactive: true });
  const existing = drivers.find((d) => d.driverId === "CROP-01");
  let driverId;
  if (existing) {
    driverId = existing._id;
  } else {
    try {
      driverId = await client.mutation("fleet:createDriver", {
        driverId: "CROP-01",
        driverName: "Crop Test Driver",
        idNumber: "9001015800085",
        phone: "0821111111",
        status: "active",
      });
    } catch (e) {
      const again = await client.query("fleet:getDrivers", { includeInactive: true });
      const winner = again.find((d) => d.driverId === "CROP-01");
      if (!winner) throw e;
      driverId = winner._id;
    }
  }
  return { driverId, created: !existing };
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

const profile = mkdtempSync(join(tmpdir(), "fc-crop-"));
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
  const { driverId, created } = await seed();
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
    await send("DOM.enable");

    if (process.env.AUDIT_MOBILE === "1") {
      await send("Emulation.setDeviceMetricsOverride", { width: 375, height: 812, deviceScaleFactor: 3, mobile: true });
    }

    const evalJs = async (expression) => {
      const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) return { __error: r.exceptionDetails.text };
      return r.result.value;
    };

    // ── Login ──────────────────────────────────────────────────────
    const AUDIT_EMAIL = process.env.AUDIT_EMAIL || "admin@fleetcore.app";
    const AUDIT_PASSWORD = process.env.AUDIT_PASSWORD || "admin123";
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
        setNative(email, ${JSON.stringify(AUDIT_EMAIL)});
        setNative(password, ${JSON.stringify(AUDIT_PASSWORD)});
        document.querySelector('button[type="submit"]')?.click();
      })()`);
      await sleep(1500);
      return (await evalJs(`location.pathname !== "/login"`)) ? true : null;
    }, 25000);
    check("login", !!loggedIn, "login failed");

    // ── Admin → Drivers ────────────────────────────────────────────
    await send("Page.navigate", { url: BASE + "/admin/drivers" });
    await waitFor(() => evalJs("document.readyState === 'complete'"), 20000);
    const ready = await waitFor(
      () => evalJs(`location.pathname === "/admin/drivers" && !!document.querySelector('input[type="file"]')`),
      25000
    );
    check("drivers page ready", !!ready);

    // Scope every selector to the SEEDED driver's card (the page shows many
    // drivers, and the first card may belong to real data — never touch it).
    const CARD_EXPR = `(() => {
      const cards = [...document.querySelectorAll('[role="button"][aria-pressed]')];
      return cards.find((c) => (c.textContent || "").includes("Crop Test Driver")) || null;
    })()`;
    const cardExists = () => evalJs(`!!${CARD_EXPR}`);
    const waitForCard = () => waitFor(cardExists, 25000);
    const hasTrash = () => evalJs(`!!(${CARD_EXPR}?.querySelector('[aria-label="Remove photo"]'))`);
    const ensureNoPhoto = async () => {
      if (await hasTrash()) {
        await evalJs(`${CARD_EXPR}?.querySelector('[aria-label="Remove photo"]')?.click()`);
        await waitFor(async () => !(await hasTrash()), 30000);
      }
    };
    await waitForCard();
    await ensureNoPhoto();

    // Write the fixture file so the file input can be set.
    const pngPath = join(tmpdir(), `fc-crop-${Date.now()}.png`);
    writeFileSync(pngPath, Buffer.from(PNG_2PX.split(",")[1], "base64"));

    // Tag the seeded card's file input with a data attribute so CDP can target
    // exactly it (the page has one input per driver card).
    const setFile = async () => {
      await evalJs(`${CARD_EXPR}?.querySelector('input[type="file"]')?.setAttribute('data-crop-input', '1')`);
      const { root } = await send("DOM.getDocument");
      const { nodeId } = await send("DOM.querySelector", {
        nodeId: root.nodeId,
        selector: 'input[data-crop-input="1"]',
      });
      await send("DOM.setFileInputFiles", { nodeId, files: [pngPath] });
    };

    // 1. Pick → crop editor opens.
    await setFile();
    const cropOpened = await waitFor(() => evalJs(`!!document.querySelector('[aria-label="Crop photo"]')`), 10000, 250);
    check("picking a photo opens the crop editor", !!cropOpened);

    if (cropOpened) {
      // 2. Zoom in via the + button → the image transform scale changes.
      const transformBefore = await evalJs(`(() => {
        const img = document.querySelector('[aria-label="Crop photo"] img');
        return img ? getComputedStyle(img).transform : null;
      })()`);
      await evalJs(`(() => {
        const btn = [...document.querySelectorAll('[aria-label="Crop photo"] button')].find((b) => b.getAttribute('aria-label') === 'Zoom in');
        btn?.click();
        return !!btn;
      })()`);
      await sleep(400);
      const transformAfter = await evalJs(`(() => {
        const img = document.querySelector('[aria-label="Crop photo"] img');
        return img ? getComputedStyle(img).transform : null;
      })()`);
      check(
        "zoom button scales the crop image",
        !!transformBefore && !!transformAfter && transformBefore !== transformAfter,
        `${transformBefore} -> ${transformAfter}`
      );

      // 3. Escape cancels without uploading.
      await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
      await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
      const closedByEsc = await waitFor(() => evalJs(`!document.querySelector('[aria-label="Crop photo"]')`), 4000);
      const noPhotoAfterCancel = await hasTrash();
      check("escape closes the crop editor", !!closedByEsc);
      check("escape-cancel does not upload", !noPhotoAfterCancel);

      // 4. Pick again, zoom, and CONFIRM → uploads crop + original.
      await setFile();
      const reopened = await waitFor(() => evalJs(`!!document.querySelector('[aria-label="Crop photo"]')`), 10000, 250);
      check("crop editor reopens", !!reopened);
      if (reopened) {
        await evalJs(`(() => {
          const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Use photo'));
          btn?.click();
          return !!btn;
        })()`);
        const uploaded = await waitFor(
          () =>
            evalJs(
              `!!(${CARD_EXPR}?.querySelector('[title="Change photo"]')) && !!(${CARD_EXPR}?.querySelector('.bg-cover'))`
            ),
          30000,
          500
        );
        check("confirm uploads the cropped photo", !!uploaded);
      }
    }

    // 5. Backend state: photoUrl AND photoOriginalUrl set, different URLs.
    const fresh = (await client.query("fleet:getDrivers", { includeInactive: true })).find(
      (d) => d.driverId === "CROP-01"
    );
    check("photoUrl stored", !!fresh?.photoUrl);
    check("photoOriginalUrl stored", !!fresh?.photoOriginalUrl);
    check(
      "original differs from the crop",
      !!fresh?.photoUrl && !!fresh?.photoOriginalUrl && fresh.photoUrl !== fresh.photoOriginalUrl,
      `${fresh?.photoUrl?.slice(0, 50)} vs ${fresh?.photoOriginalUrl?.slice(0, 50)}`
    );

    // Clean up the fixture + photo (scoped to the seeded card only).
    rmSync(pngPath, { force: true });
    await ensureNoPhoto();

    for (const e of errors) failures.push(`console error: ${e.text}`);
    report.consoleErrors = errors.length;
    report.failures = failures;
    console.log(JSON.stringify(report, null, 2));
    console.log(failures.length === 0 ? "\nCROP AUDIT PASSED" : `\nCROP AUDIT FAILED — ${failures.length} problem(s)`);

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
  console.error("CROP AUDIT FAILED:", err.message);
  try {
    chrome.kill();
  } catch {}
  try {
    rmSync(profile, { recursive: true, force: true });
  } catch {}
  process.exit(1);
});
