/**
 * Automated verification for the All Regions inline region-change dropdown.
 *
 * Launches headless Chrome (desktop viewport), signs in as the seeded admin,
 * opens /all-regions, then:
 *   1. Opens the Region dropdown on the first route row
 *   2. Asserts all three options are present (Garden Route / Eastern Cape /
 *      Unassigned)
 *   3. Picks a different region than the row's current one and waits for the
 *      badge to update (proves the mutation round-trip)
 *   4. Reverts the change (net-zero on the dev database)
 *   5. Reports console errors
 *
 * Exits 1 (non-zero) if any assertion fails.
 * Usage: node scripts/verify-all-regions-region.mjs [url]
 * Env:   CHROME_PATH  (optional, path to Chrome/Chromium binary)
 */
import { spawn } from "node:child_process";
import {
  mkdtempSync,
  rmSync,
  readFileSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = process.argv[2] || process.env.AUDIT_URL || "https://fleetcore-mu.vercel.app";
const AUDIT_EMAIL = process.env.AUDIT_EMAIL || "admin@fleetcore.app";
const AUDIT_PASSWORD = process.env.AUDIT_PASSWORD || "admin123";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = mkdtempSync(join(tmpdir(), "fc-region-"));

function resolveChrome() {
  if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH)) {
    return process.env.CHROME_PATH;
  }
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
if (process.platform !== "win32") {
  flags.unshift("--no-sandbox", "--disable-dev-shm-usage");
}
const chrome = spawn(resolveChrome(), flags, { stdio: "ignore" });

async function waitFor(fn, timeoutMs = 10000, intervalMs = 400) {
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
  return waitFor(
    () => {
      try {
        const content = readFileSync(portFile, "utf8");
        const port = parseInt(content.split("\n")[0], 10);
        return Number.isInteger(port) && port > 0 ? port : null;
      } catch {
        return null;
      }
    },
    18000,
    300
  );
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
        if (msg.params.entry.level === "error") {
          errors.push({ kind: "log", text: msg.params.entry.text, url: msg.params.entry.url });
        }
      } else if (msg.method === "Runtime.exceptionThrown") {
        const d = msg.params.exceptionDetails || {};
        errors.push({
          kind: "exception",
          text: String((d.exception && (d.exception.description || d.exception.value)) || d.text || "Unknown").slice(0, 500),
        });
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
  const port = await getDebugPort();
  await waitFor(async () => {
    try {
      return (await fetch(`http://127.0.0.1:${port}/json/version`)).ok;
    } catch {
      return null;
    }
  }, 15000, 300);
  const target = await fetch(
    `http://127.0.0.1:${port}/json/new?${encodeURIComponent(BASE + "/login")}`,
    { method: "PUT" }
  ).then((r) => r.json());
  const { send, errors } = await makeClient(target.webSocketDebuggerUrl);

  await send("Page.enable");
  await send("Runtime.enable");
  await send("Log.enable");
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });

  const evalJs = async (expression) => {
    const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) return { error: r.exceptionDetails.text };
    return r.result.value;
  };

  const results = [];
  const check = (name, ok, detail) => {
    results.push({ name, ok: !!ok, detail: detail || "" });
    console.log(`${ok ? "PASS" : "FAIL"} — ${name}${detail ? ` (${detail})` : ""}`);
  };

  try {
    // ── Login ──────────────────────────────────────────────────────────────
    await send("Page.navigate", { url: BASE + "/login" });
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
    check("admin login", !!loggedIn, loggedIn ? "" : "login did not complete");

    // ── Navigate to All Regions ────────────────────────────────────────────
    await send("Page.navigate", { url: BASE + "/all-regions" });
    const badges = await waitFor(async () => {
      const n = await evalJs(
        `document.querySelectorAll('button[title="Change region"], button[title="Assign region"]').length`
      );
      return n > 0 ? n : null;
    }, 25000);
    check("region table loaded", !!badges, badges ? `${badges} region cells found` : "no region cells rendered");

    // ── Open the first row's dropdown ─────────────────────────────────────
    const opened = await evalJs(`(() => {
      const el = document.querySelector('button[title="Change region"], button[title="Assign region"]');
      if (!el) return false;
      el.click();
      return true;
    })()`);
    check("dropdown opened on click", opened === true);

    const options = await waitFor(async () => {
      const txt = await evalJs(`(() => {
        const labels = [...document.querySelectorAll('button')].map((b) => (b.textContent || '').trim());
        const uniq = [...new Set(labels)];
        const found = ['Garden Route', 'Eastern Cape', 'Unassigned'].filter((o) => uniq.includes(o));
        return found.length === 3 ? found : null;
      })()`);
      return txt;
    }, 10000);
    check(
      "all three region options shown",
      Array.isArray(options) && ["Garden Route", "Eastern Cape", "Unassigned"].every((o) => options.includes(o)),
      Array.isArray(options) ? options.join(" / ") : "options not found"
    );

    // Current badge label (may be "Garden Route", "Eastern Cape", or "— assign")
    const current = await evalJs(`(() => {
      const el = document.querySelector('button[title="Change region"], button[title="Assign region"]');
      return el ? el.textContent.trim() : "";
    })()`);
    const currentRegion =
      current.includes("Garden Route") ? "garden_route"
      : current.includes("Eastern Cape") ? "eastern_cape"
      : null;
    const target = currentRegion === "garden_route" ? "Eastern Cape" : "Garden Route";
    check(
      "current region detected",
      currentRegion !== null || current.includes("assign"),
      `badge text: ${JSON.stringify(current)}`
    );

    // ── Pick the other region → badge must update (mutation round-trip) ───
    const picked = await evalJs(`(() => {
      const btns = [...document.querySelectorAll('button')].filter((b) => b.textContent.trim() === ${JSON.stringify(target)});
      if (!btns.length) return false;
      btns[0].click();
      return true;
    })()`);
    check("alternative region picked", picked === true);

    const updated = await waitFor(async () => {
      const txt = await evalJs(`(() => {
        const el = document.querySelector('button[title="Change region"]');
        return el ? el.textContent.trim() : "";
      })()`);
      return txt && txt.includes(target) ? txt : null;
    }, 20000);
    check("badge updated after save", !!updated, updated ? `now shows: ${updated}` : "badge did not change");

    // ── Revert to the original region (net-zero) ──────────────────────────
    const revertPicked = await evalJs(`(() => {
      const el = document.querySelector('button[title="Change region"], button[title="Assign region"]');
      if (!el) return false;
      el.click();
      return true;
    })()`);
    const revertTarget = currentRegion === "garden_route" ? "Garden Route" : "Eastern Cape";
    if (revertPicked) {
      await sleep(400);
      const pickedRevert = await evalJs(`(() => {
        const btns = [...document.querySelectorAll('button')].filter((b) => b.textContent.trim() === ${JSON.stringify(revertTarget)});
        if (!btns.length) return false;
        btns[0].click();
        return true;
      })()`);
      const reverted = await waitFor(async () => {
        const txt = await evalJs(`(() => {
          const el = document.querySelector('button[title="Change region"]');
          return el ? el.textContent.trim() : "";
        })()`);
        return txt && txt.includes(revertTarget) ? txt : null;
      }, 20000);
      check("region reverted (net-zero)", !!reverted, reverted ? `back to: ${reverted}` : "revert failed");
    } else {
      check("region reverted (net-zero)", false, "could not reopen dropdown to revert");
    }

    // ── Console errors ────────────────────────────────────────────────────
    await sleep(800);
    const appErrors = errors.filter(
      (e) => !/favicon|Failed to load resource/i.test(e.text)
    );
    check("no console errors", appErrors.length === 0, appErrors.length ? appErrors[0].text.slice(0, 200) : "");
  } catch (err) {
    check("script ran without exception", false, err.message);
  } finally {
    try {
      await send("Browser.close");
    } catch { /* ignore */ }
    chrome.kill();
    try {
      rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
    } catch { /* Windows may keep profile files locked briefly — ignore */ }
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Fatal:", err);
  chrome.kill();
  try {
    rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
  } catch { /* ignore */ }
  process.exit(1);
});
