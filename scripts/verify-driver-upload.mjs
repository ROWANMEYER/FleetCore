/**
 * End-to-end driver photo upload verification for the FleetCore PWA.
 *
 * Launches headless Chrome, signs in as the admin seed user and drives the
 * real file input on the Admin → Drivers page to verify:
 *   - HEIC/HEIF photos (iPhone) are converted client-side and upload fine
 *     (the on-demand heic2any WASM path) — stored image is ≤900px
 *   - a >15MB JPEG (which the old cap rejected with "very large") uploads
 *     fine under the new 50MB cap
 *   - a fake/non-decodable image surfaces the friendly error toast instead
 *     of crashing
 * Each uploaded photo is removed afterwards so no test data is left behind.
 *
 * Exits 1 (non-zero) if any assertion fails — suitable for CI.
 *
 * Usage: node scripts/verify-driver-upload.mjs [url] [heicPath] [jpgPath] [fakePath]
 * Env:   CHROME_PATH   (optional, path to Chrome/Chromium binary)
 *        AUDIT_URL     (optional, alternative to the positional arg)
 *        AUDIT_EMAIL / AUDIT_PASSWORD (optional, default admin@fleetcore.app / admin123)
 *        AUDIT_MOBILE  (optional, set to 1 to emulate a 375x812 phone viewport)
 */
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = process.argv[2] || process.env.AUDIT_URL || "http://localhost:3000";
const TMP = process.env.TEMP || tmpdir();
const HEIC_FILE = process.argv[3] || join(TMP, "heictest", "sample.heic");
const JPG_FILE = process.argv[4] || join(TMP, "heictest", "big-photo.jpg");
const FAKE_FILE = process.argv[5] || join(TMP, "heictest", "fake.png");

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
const profile = mkdtempSync(join(tmpdir(), "fc-upload-"));
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
    const chooserEvents = [];
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.id && pending.has(msg.id)) {
        const { res, rej } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) rej(new Error(msg.error.message));
        else res(msg.result);
      } else if (msg.method === "Page.fileChooserOpened") {
        chooserEvents.push(msg.params);
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
      resolve({ ws, send, errors, warnings, chooserEvents });
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
  const { ws, send, errors, warnings, chooserEvents } = await makeClient(target.webSocketDebuggerUrl);

  await send("Page.enable");
  await send("Runtime.enable");
  await send("Log.enable");
  await send("DOM.enable");
  // Intercept the native file chooser so a trusted tap can be proven to open
  // it (the mobile camera-affordance test below uses this + fileChooserOpened).
  await send("Page.setInterceptFileChooserDialog", { enabled: true });

  if (process.env.AUDIT_MOBILE === "1") {
    await send("Emulation.setDeviceMetricsOverride", { width: 375, height: 812, deviceScaleFactor: 3, mobile: true });
  }

  const evalJs = async (expression) => {
    const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) return { __error: r.exceptionDetails.text };
    return r.result.value;
  };

  const failures = [];
  const report = { base: BASE, files: { heic: HEIC_FILE, jpg: JPG_FILE, fake: FAKE_FILE }, tests: [] };

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

  if (!loggedIn) {
    failures.push("Audit login failed — check AUDIT_EMAIL/AUDIT_PASSWORD.");
  }

  // ── Admin → Drivers ─────────────────────────────────────────────
  await send("Page.navigate", { url: BASE + "/admin/drivers" });
  await waitFor(() => evalJs("document.readyState === 'complete'"), 20000);
  await waitFor(() => evalJs(`location.pathname === "/admin/drivers" && !!document.querySelector('input[type="file"]')`), 25000);
  await sleep(1500);

  const getPhotoUrl = () =>
    evalJs(`(() => {
      const el = document.querySelector('.bg-cover');
      if (!el) return null;
      const bg = getComputedStyle(el).backgroundImage || '';
      const m = bg.match(/url\\(["']?(.+?)["']?\\)/);
      return m ? m[1] : bg;
    })()`);

  const hasTrash = () => evalJs(`!!document.querySelector('[aria-label="Remove photo"]')`);

  const ensureNoPhoto = async () => {
    if (await hasTrash()) {
      await evalJs(`document.querySelector('[aria-label="Remove photo"]').click()`);
      await waitFor(async () => !(await hasTrash()), 30000);
    }
  };

  // ── Mobile: camera affordance must be visible and tappable ───────
  // Regression guard (AUDIT_MOBILE=1) for the PWA bug where the banner's
  // h-full wrapper collapsed inside the flex-1 image area on phones and the
  // camera button floated above the card, clipped out of view by
  // overflow-hidden. Also proves a real (trusted) tap opens the native file
  // chooser and a chooser-set image uploads and renders.
  if (process.env.AUDIT_MOBILE === "1") {
    const cam = await evalJs(`(() => {
      const cam = document.querySelector('[title="Upload photo"], [title="Change photo"]');
      if (!cam) return null;
      const card = document.querySelector('[role="button"][aria-pressed]');
      if (!card) return null;
      const cr = cam.getBoundingClientRect();
      const cardR = card.getBoundingClientRect();
      const inside = cr.top >= cardR.top && cr.bottom <= cardR.bottom && cr.left >= cardR.left && cr.right <= cardR.right;
      const hit = document.elementFromPoint(cr.left + cr.width / 2, cr.top + cr.height / 2);
      const hitCam = !!(hit && (hit === cam || hit.closest('[title="Upload photo"], [title="Change photo"]')));
      return {
        visible: getComputedStyle(cam).display !== "none" && getComputedStyle(cam).visibility !== "hidden",
        inside,
        hitCam,
        x: Math.round(cr.left + cr.width / 2),
        y: Math.round(cr.top + cr.height / 2),
      };
    })()`);
    const cameraChecks = { visible: !!cam?.visible, insideCard: !!cam?.inside, tapTarget: !!cam?.hitCam, chooserOpened: false, photoRendered: false };
    report.mobileCamera = cameraChecks;
    if (!cam) {
      failures.push("mobile camera: button not found on the driver card");
    } else {
      if (!cameraChecks.visible) failures.push("mobile camera: button is not visible");
      if (!cameraChecks.insideCard) failures.push("mobile camera: button outside card bounds (clipped)");
      if (!cameraChecks.tapTarget) failures.push("mobile camera: button is not the tap target at its centre");
      const before = chooserEvents.length;
      await send("Input.dispatchMouseEvent", { type: "mousePressed", x: cam.x, y: cam.y, button: "left", clickCount: 1 });
      await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: cam.x, y: cam.y, button: "left", clickCount: 1 });
      const opened = await waitFor(() => (chooserEvents.length > before ? chooserEvents[chooserEvents.length - 1] : null), 8000, 200);
      if (!opened) {
        failures.push("mobile camera: trusted tap did not open the native file chooser");
      } else {
        cameraChecks.chooserOpened = true;
        // Set a real (tiny) PNG through the chooser → upload → photo renders.
        const png = Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
          "base64"
        );
        const pngPath = join(TMP, `fc-cam-${Date.now()}.png`);
        writeFileSync(pngPath, png);
        await send("DOM.setFileInputFiles", { files: [pngPath], backendNodeId: opened.backendNodeId });
        await sleep(500);
        rmSync(pngPath, { force: true });
        const rendered = await waitFor(
          () => evalJs(`!!document.querySelector('[title="Change photo"]') && !!document.querySelector('.bg-cover')`),
          25000,
          500
        );
        cameraChecks.photoRendered = !!rendered;
        if (!rendered) failures.push("mobile camera: chooser-set photo did not upload/render");
        await ensureNoPhoto();
      }
    }
  }

  const bodyText = () => evalJs(`document.body.innerText`);

  const uploadFile = async (filePath, label, { expectSuccess = true } = {}) => {
    await ensureNoPhoto();
    const started = Date.now();
    const { root } = await send("DOM.getDocument");
    const { nodeId } = await send("DOM.querySelector", { nodeId: root.nodeId, selector: 'input[type="file"]' });
    await send("DOM.setFileInputFiles", { nodeId, files: [filePath] });
    let photoUrl = null;
    let toast = null;
    const outcome = await waitFor(async () => {
      photoUrl = await getPhotoUrl();
      const text = await bodyText();
      if (expectSuccess) {
        if (photoUrl && text.includes("Photo uploaded")) return "success";
        if (text.includes("Could not") || text.includes("very large") || text.includes("Please choose")) {
          toast = text.split("\n").find((l) => /could not|very large|please choose/i.test(l)) || null;
          return "error-toast";
        }
      } else {
        if (text.includes("Could not convert this photo")) {
          toast = text.split("\n").find((l) => /could not convert this photo/i.test(l)) || "Could not convert this photo";
          return "error-toast";
        }
        if (photoUrl) return "unexpected-upload";
      }
      return null;
    }, 120000, 500);
    const elapsedMs = Date.now() - started;

    let dims = null;
    if (photoUrl) {
      dims = await evalJs(`new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve([img.naturalWidth, img.naturalHeight]);
        img.onerror = () => resolve(null);
        img.src = ${JSON.stringify(photoUrl)};
      })`);
    }

    const test = { label, file: filePath, outcome, elapsedMs, photoUrl, storedDims: dims, toast };
    report.tests.push(test);

    if (expectSuccess) {
      if (outcome !== "success") failures.push(`${label}: expected upload success, got ${outcome} (toast: ${toast})`);
      else if (!/convex\.cloud\/api\/storage\//.test(photoUrl || ""))
        failures.push(`${label}: photoUrl is not a Convex storage URL -> ${photoUrl}`);
    } else {
      if (outcome !== "error-toast") failures.push(`${label}: expected the friendly error toast, got ${outcome}`);
    }
    return test;
  };

  // Test 1 — real HEIC (iPhone photo), should convert + upload.
  const heic = await uploadFile(HEIC_FILE, "HEIC conversion + upload", { expectSuccess: true });
  if (heic.photoUrl && Array.isArray(heic.storedDims)) {
    const maxDim = Math.max(...heic.storedDims);
    if (maxDim > 900) failures.push(`HEIC: stored image not downscaled -> ${heic.storedDims.join("x")}`);
  }

  // Test 2 — 23MB JPEG (over the old 15MB cap), should upload.
  const jpg = await uploadFile(JPG_FILE, "23MB JPEG upload (over old 15MB cap)", { expectSuccess: true });
  if (jpg.photoUrl && Array.isArray(jpg.storedDims)) {
    const maxDim = Math.max(...jpg.storedDims);
    if (maxDim > 900) failures.push(`23MB JPEG: stored image not downscaled -> ${jpg.storedDims.join("x")}`);
  }

  // Test 3 — fake image, should surface the friendly error toast.
  const fake = await uploadFile(FAKE_FILE, "Non-image error path", { expectSuccess: false });

  // Clean up any photo left on the first driver.
  await ensureNoPhoto();

  for (const w of warnings) {
    if (!WARNING_ALLOWLIST.some((re) => re.test(w.text))) failures.push(`console warning: ${w.text}`);
  }
  for (const e of errors) failures.push(`console error: ${e.text}`);

  report.failures = failures;
  report.consoleErrors = errors.length;
  console.log(JSON.stringify(report, null, 2));

  const passed = failures.length === 0;
  console.log(passed ? "\nDRIVER UPLOAD AUDIT PASSED" : `\nDRIVER UPLOAD AUDIT FAILED — ${failures.length} problem(s)`);

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
