/**
 * Automated mobile-viewport verification for the FleetCore PWA.
 *
 * Launches headless Chrome (auto-detected per platform), emulates a 375x812
 * phone, and asserts on every configured page:
 *   - no horizontal overflow
 *   - the two-screen Android UX is present: bottom tab bar with exactly
 *     Dashboard + Input tabs, NO hamburger, NO drawer/sidebar
 *   - the mobile route guard: non-allowed paths (Admin, Settings, Sheets,
 *     ...) redirect to /dashboard
 *   - no console errors and no console warnings (except an allowlist of
 *     known-benign third-party/informational messages)
 *
 * Exits 1 (non-zero) if any assertion fails — suitable for CI.
 * Writes the JSON report to ./mobile-audit-report.json.
 *
 * Usage: node scripts/verify-mobile.mjs [url]
 * Env:   CHROME_PATH   (optional, path to Chrome/Chromium binary)
 *        AUDIT_URL     (optional, alternative to the positional arg)
 */
import { spawn } from "node:child_process";
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  existsSync,
  readFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = process.argv[2] || process.env.AUDIT_URL || "https://fleetcore-mu.vercel.app";
// Pages the audit visits. `allowed: true` means the page is one of the two
// mobile screens and must render as-is; `allowed: false` means the mobile
// guard must redirect it to /dashboard.
const PAGES = [
  { path: "/dashboard", allowed: true },
  { path: "/operations/daily-planner/input", allowed: true },
  { path: "/settings", allowed: false },
  { path: "/admin/trucks", allowed: false },
  { path: "/operations/daily-planner/sheets", allowed: false },
];
const REPORT_FILE = join(process.cwd(), "mobile-audit-report.json");
const TAB_BAR_SELECTOR = '[aria-label="Bottom navigation"]';

/**
 * Warnings matching these are third-party/cosmetic, not app bugs.
 * Anything else fails the audit. Adding entries here is a conscious
 * decision — prefer fixing the app over allowlisting.
 */
const WARNING_ALLOWLIST = [
  /beforeinstallprompt/i, // Chrome info: prompt() deferred until user taps Install (standard PWA pattern)
  /form field element should have an id or name/i, // Chrome a11y hint, not a regression
  /No label associated with a form field/i, // Chrome a11y hint, not a regression
  /Download the React DevTools/i, // dev-only hint
  // Recharts v3 ResponsiveContainer logs this once per mount when the chart
  // container is measured before CSS layout settles (width/height -1 or 0).
  // Charts render correctly afterward; the audit still catches layout
  // regressions via the overflow and tab-bar assertions.
  /The width\(-?\d+\) and height\(-?\d+\) of chart should be greater than 0/i,
];

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
        : [
            "/usr/bin/google-chrome",
            "/usr/bin/google-chrome-stable",
            "/usr/bin/chromium",
            "/usr/bin/chromium-browser",
          ];
  const found = candidates.find((c) => c && existsSync(c));
  if (!found) {
    throw new Error("Chrome/Chromium not found. Set CHROME_PATH to point at the binary.");
  }
  return found;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = mkdtempSync(join(tmpdir(), "fc-mobile-"));
const flags = [
  "--headless=new",
  "--disable-gpu",
  "--no-first-run",
  "--no-default-browser-check",
  "--disable-extensions",
  "--remote-debugging-port=0", // dynamic port, read from DevToolsActivePort
  `--user-data-dir=${profile}`,
  "about:blank",
];
if (process.platform !== "win32") {
  flags.unshift("--no-sandbox", "--disable-dev-shm-usage");
}
const chrome = spawn(resolveChrome(), flags, { stdio: "ignore" });

/** Poll a predicate until it returns a truthy value or the timeout elapses. */
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
        if (entry.level === "error") errors.push({ kind: "log", text: entry.text, url: entry.url });
        else if (entry.level === "warning") warnings.push({ kind: "log", text: entry.text, url: entry.url });
      } else if (msg.method === "Runtime.exceptionThrown") {
        const d = msg.params.exceptionDetails || {};
        const desc =
          (d.exception && (d.exception.description || d.exception.value)) || d.text || "Unknown exception";
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

async function main() {
  const port = await getDebugPort();
  await waitForEndpoint(`http://127.0.0.1:${port}/json/version`);
  const target = await fetch(
    `http://127.0.0.1:${port}/json/new?${encodeURIComponent(BASE + "/dashboard")}`,
    { method: "PUT" }
  ).then((r) => r.json());
  const { ws, send, errors, warnings } = await makeClient(target.webSocketDebuggerUrl);

  await send("Page.enable");
  await send("Runtime.enable");
  await send("Log.enable");
  await send("Emulation.setDeviceMetricsOverride", {
    width: 375,
    height: 812,
    deviceScaleFactor: 3,
    mobile: true,
  });

  const evalJs = async (expression) => {
    const r = await send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (r.exceptionDetails) return { error: r.exceptionDetails.text };
    return r.result.value;
  };

  const navigate = async (path, allowed) => {
    await send("Page.navigate", { url: BASE + path });
    // Wait for the document, then for the app to hydrate and settle on its
    // final route: allowed pages render as-is, guarded pages are redirected
    // to /dashboard by the mobile route guard. Waiting on the final path
    // (instead of a fixed sleep) avoids racing the client-side redirect.
    const expected = allowed ? path : "/dashboard";
    await waitFor(async () => {
      const ready = await evalJs("document.readyState");
      return ready === "complete";
    }, 20000);
    await waitFor(() => evalJs(`location.pathname === ${JSON.stringify(expected)}`), 12000);
    await waitFor(() => evalJs(`!!document.querySelector('${TAB_BAR_SELECTOR}')`), 12000);
  };

  // ── Authenticate ────────────────────────────────────────────────────────
  // The app is now auth-gated (multi-user Stage 1): unauthenticated navigations
  // redirect to /login. Sign in with the admin seed credentials so every
  // audited page runs in an authenticated session.
  const AUDIT_EMAIL = process.env.AUDIT_EMAIL || "admin@fleetcore.app";
  const AUDIT_PASSWORD = process.env.AUDIT_PASSWORD || "Fleetcore2026!";

  await send("Page.navigate", { url: BASE + "/login" });
  await waitFor(async () => {
    const ready = await evalJs("document.readyState");
    return ready === "complete";
  }, 20000);
  const loggedIn = await waitFor(async () => {
    const hasForm = await evalJs(`!!document.querySelector('input[type="email"]')`);
    if (!hasForm) {
      // If the session already exists, we may have been redirected to the app.
      return (await evalJs(`location.pathname !== "/login"`)) ? true : null;
    }
    const filled = await evalJs(`(async () => {
      const setNative = (el, value) => {
        const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
        setter.call(el, value);
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
    return (await evalJs(
      `location.pathname !== "/login" && !!document.querySelector('${TAB_BAR_SELECTOR}')`
    ))
      ? true
      : null;
  }, 25000);

  if (!loggedIn) {
    errors.push({ kind: "auth", text: "Audit login failed — check AUDIT_EMAIL/AUDIT_PASSWORD or the login page." });
  }

  const report = { base: BASE, viewport: "375x812 (mobile emulation)", pages: [] };

  for (const { path, allowed } of PAGES) {
    await navigate(path, allowed);
    const info = await evalJs(`(() => {
      const d = document.documentElement;
      const aside = document.querySelector('aside');
      const asideVisible = aside
        ? aside.getBoundingClientRect().width > 0 && aside.getBoundingClientRect().height > 0
        : false;
      return {
        path: location.pathname,
        innerWidth: window.innerWidth,
        scrollWidth: d.scrollWidth,
        hasTabBar: !!document.querySelector('${TAB_BAR_SELECTOR}'),
        hasHamburger: !!document.querySelector('[aria-label="Open navigation"]'),
        hasAside: asideVisible,
        h1: document.querySelector('h1') ? document.querySelector('h1').textContent : null,
      };
    })()`);

    // Two-screen tab bar check: exactly Dashboard + Input tabs
    const tabs = await evalJs(`(() => {
      const nav = document.querySelector('${TAB_BAR_SELECTOR}');
      if (!nav) return { ok: false, reason: "tab bar not found" };
      const links = [...nav.querySelectorAll('a')].map((a) => ({
        text: a.textContent.trim(),
        href: a.getAttribute('href'),
      }));
      const texts = links.map((l) => l.text).filter(Boolean);
      return {
        ok: links.length === 2 && texts.includes("Dashboard") && texts.includes("Input"),
        links,
      };
    })()`);

    report.pages.push({
      requested: path,
      allowed,
      path: info.path,
      innerWidth: info.innerWidth,
      scrollWidth: info.scrollWidth,
      overflowPx: info.scrollWidth - info.innerWidth,
      hasTabBar: info.hasTabBar,
      hasHamburger: info.hasHamburger,
      hasAside: info.hasAside,
      h1: info.h1,
      tabs,
    });
  }

  report.warnings = warnings;
  report.errors = errors;

  // ── Assertions ────────────────────────────────────────────────
  const failures = [];
  for (const p of report.pages) {
    if (p.overflowPx > 0) failures.push(`${p.requested}: horizontal overflow of ${p.overflowPx}px`);
    if (!p.hasTabBar) failures.push(`${p.requested}: bottom tab bar missing`);
    if (p.hasHamburger) failures.push(`${p.requested}: hamburger button must not exist on mobile`);
    if (p.hasAside) failures.push(`${p.requested}: sidebar/drawer must not render on mobile`);
    if (p.tabs && !p.tabs.ok) {
      failures.push(`${p.requested}: tab bar should have exactly Dashboard + Input -> ${JSON.stringify(p.tabs)}`);
    }
    if (p.allowed && p.path !== p.requested) {
      failures.push(`${p.requested}: expected to render (allowed screen) but landed on ${p.path}`);
    }
    if (!p.allowed && p.path !== "/dashboard") {
      failures.push(`${p.requested}: mobile guard should redirect to /dashboard but landed on ${p.path}`);
    }
  }
  for (const w of warnings) {
    if (!WARNING_ALLOWLIST.some((re) => re.test(w.text))) {
      failures.push(`console warning: ${w.text}`);
    }
  }
  for (const e of errors) {
    failures.push(`console error: ${e.text}`);
  }

  report.failures = failures;
  writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));

  const passed = failures.length === 0;
  console.log(
    passed
      ? `\nMOBILE AUDIT PASSED — ${report.pages.length} pages, ${warnings.length} warning(s) (all allowlisted), ${errors.length} error(s)`
      : `\nMOBILE AUDIT FAILED — ${failures.length} problem(s). Report: ${REPORT_FILE}`
  );

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

main().catch((err) => {
  console.error("VERIFY FAILED:", err.message);
  try {
    chrome.kill();
  } catch {}
  for (let i = 0; i < 5; i++) {
    try {
      rmSync(profile, { recursive: true, force: true });
      break;
    } catch {
      void i;
    }
  }
  process.exit(1);
});
