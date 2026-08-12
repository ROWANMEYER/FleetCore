/**
 * Headless probe: the commit-on-select date behavior (CommitDateInput) on the
 * three screens it was newly wired into:
 *   - /all-regions   (Range From input — switch to Range tab first)
 *   - /dashboard     (Range From input — Range is the default mode)
 *   - /operations/swaps/history (From input — open the filter panel first)
 *
 * For each screen it proves:
 *   A. "Month browsing" — focus, set a different value + dispatch ONLY `input`,
 *      then blur. The committed filter must NOT change and the input must
 *      revert to the committed date on blur.
 *   B. "Real selection" — focus, set a value, dispatch `input` AND the native
 *      `change`, then blur. The input must KEEP the chosen date (so the
 *      query-driving state updated).
 *
 * Usage: node scripts/_probe-date-commit-all.mjs [url]
 */
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
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
const profile = mkdtempSync(join(tmpdir(), "fc-date-commit-all-"));
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

  // Browser-side helpers injected once per page load.
  const HELPERS = `(() => {
    window.__setNative = (el, value) => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, value);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    };
    window.__fireChange = (el) => el.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  })()`;

  /**
   * Navigate, run an idempotent per-screen setup (switch mode / open panel),
   * then verify browse-vs-pick on the FIRST date input.
   */
  async function verifyScreen(label, path, setupJs, browseValue, pickValue, seedValue, checkTo) {
    console.log(`\n── ${label} ──`);
    await send("Page.navigate", { url: BASE + path });
    await waitFor(() => evalJs("document.readyState === 'complete'"), 20000);
    const ready = await waitFor(
      () =>
        evalJs(`(async () => {
          ${HELPERS};
          ${setupJs};
          const inputs = [...document.querySelectorAll('input[type="date"]')];
          return inputs.length >= 1 ? { count: inputs.length, path: location.pathname } : null;
        })()`),
      25000
    );
    if (!ready) {
      check(`${label}: date input found`, false, "no date inputs after 25s setup");
      return;
    }
    await sleep(900);

    // Screens whose input starts empty (swaps filter) get a first real pick to
    // establish a committed baseline before the browse-vs-pick checks.
    if (seedValue) {
      await evalJs(`(async () => {
        const el = document.querySelector('input[type="date"]');
        el.focus();
        window.__setNative(el, ${JSON.stringify(seedValue)});
        window.__fireChange(el);
        await new Promise(r => setTimeout(r, 300));
        el.blur();
        await new Promise(r => setTimeout(r, 300));
        return el.value;
      })()`);
    }

    const target = await evalJs(`(() => {
      const el = document.querySelector('input[type="date"]');
      if (!el) return null;
      el.scrollIntoView({ block: "center" });
      return { value: el.value, count: document.querySelectorAll('input[type="date"]').length };
    })()`);
    if (!target) {
      check(`${label}: input present`, false);
      return;
    }
    const committed = target.value;
    check(`${label}: committed date present`, /^\d{4}-\d{2}-\d{2}$/.test(committed), committed);

    // A. Month browsing: focus, input events only, then blur (no native change).
    const browse = await evalJs(`(async () => {
      const el = document.querySelector('input[type="date"]');
      el.focus();
      window.__setNative(el, ${JSON.stringify(browseValue)});
      await new Promise(r => setTimeout(r, 150));
      const duringBrowse = el.value;
      el.blur();
      await new Promise(r => setTimeout(r, 300));
      const afterBlur = el.value;
      return { duringBrowse, afterBlur };
    })()`);
    check(
      `${label}: browse does NOT commit`,
      browse.afterBlur === committed,
      `during=${browse.duringBrowse} after=${browse.afterBlur} committed=${committed}`
    );

    // B. Real selection: focus, input + native change, then blur.
    const pick = await evalJs(`(async () => {
      const el = document.querySelector('input[type="date"]');
      el.focus();
      window.__setNative(el, ${JSON.stringify(pickValue)});
      window.__fireChange(el);
      await new Promise(r => setTimeout(r, 300));
      const afterChange = el.value;
      el.blur();
      await new Promise(r => setTimeout(r, 300));
      const afterBlur = el.value;
      return { afterChange, afterBlur };
    })()`);
    check(`${label}: real selection commits`, pick.afterBlur === pickValue, `after=${pick.afterBlur} picked=${pickValue}`);

    // The To input (2nd date input) commits independently — proving the
    // closure-sensitive `onChange(startDate, v)` wiring stays fresh.
    if (checkTo) {
      const toPick = await evalJs(`(async () => {
        const els = [...document.querySelectorAll('input[type="date"]')];
        if (els.length < 2) return { error: "no To input" };
        const el = els[1];
        el.focus();
        window.__setNative(el, ${JSON.stringify(pickValue)});
        window.__fireChange(el);
        await new Promise(r => setTimeout(r, 300));
        el.blur();
        await new Promise(r => setTimeout(r, 300));
        const fromStill = els[0].value;
        return { to: el.value, fromStill };
      })()`);
      check(
        `${label} To commits independently`,
        toPick.to === pickValue && toPick.fromStill === pickValue,
        `to=${toPick.to} fromStill=${toPick.fromStill}`
      );
    }
  }

  // all-regions: switch to Range mode (idempotent — clicking Range when already
  // in range mode is harmless).
  await verifyScreen(
    "all-regions Range From",
    "/all-regions",
    `(() => {
      if (document.querySelectorAll('input[type="date"]').length < 2) {
        const btn = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === "Range");
        if (btn) btn.click();
      }
      return true;
    })()`,
    "2026-07-01",
    "2026-07-05"
  );

  // dashboard: Range is the default FilterBar mode.
  await verifyScreen(
    "dashboard Range From",
    "/dashboard",
    `(() => true)()`,
    "2026-07-01",
    "2026-07-05",
    null,
    true
  );

  // swaps history: open the filter panel (Filter button toggles it; only click
  // when the From/To inputs aren't visible yet).
  await verifyScreen(
    "swaps history From",
    "/operations/swaps/history",
    `(() => {
      if (document.querySelectorAll('input[type="date"]').length < 2) {
        const btn = [...document.querySelectorAll('button')].find(b => b.textContent.includes('Filter'));
        if (btn) btn.click();
      }
      return true;
    })()`,
    "2026-07-01",
    "2026-07-05",
    "2026-08-01",
    true
  );

  await sleep(600);
  check("console errors", consoleErrors.length === 0, consoleErrors.slice(0, 2).join(" | "));

  console.log(`\n── Date-commit (all screens) probe ──`);
  console.log(errors.length === 0 ? "✅ ALL CHECKS PASSED" : `❌ ${errors.length} FAILED: ${errors.join("; ")}`);
} finally {
  try {
    chrome.kill();
    await sleep(500);
    rmSync(profile, { recursive: true, force: true });
  } catch {}
  process.exit(errors.length ? 1 : 0);
}
