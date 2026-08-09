/**
 * One-off mobile dashboard verification + screenshot.
 *
 * Launches headless Chrome emulating a 375x812 phone, signs in with the seed
 * admin credentials, opens /dashboard and asserts on the mobile-only layout:
 *   - no horizontal overflow
 *   - bottom tab bar present (mobile chrome intact)
 *   - visual section order: KPIs -> Revenue by Day -> Top Clients ->
 *     Month-to-Month -> Birthdays (Birthdays last, as reordered)
 *   - Completion KPI card spans the full row on phones (col-span-2)
 *   - compact filter tabs on mobile (px-3 vs px-5 on desktop)
 *   - no console errors
 *
 * Then captures a full-page screenshot to ./mobile-dashboard-375.png.
 *
 * Usage: node scripts/verify-mobile-dashboard.mjs [url]
 */
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = process.argv[2] || "https://fleetcore-mu.vercel.app";
const SHOT_FILE = join(process.cwd(), "mobile-dashboard-375.png");
const TAB_BAR_SELECTOR = '[aria-label="Bottom navigation"]';
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
const profile = mkdtempSync(join(tmpdir(), "fc-dash-"));
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
      } else if (msg.method === "Runtime.exceptionThrown") {
        const d = msg.params.exceptionDetails || {};
        errors.push(String((d.exception && (d.exception.description || d.exception.value)) || d.text).slice(0, 400));
      } else if (msg.method === "Runtime.consoleAPICalled" && msg.params.type === "error") {
        errors.push(msg.params.args.map((a) => a.value ?? a.description ?? "").join(" ").slice(0, 400));
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

async function waitForEndpoint(url, tries = 60) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {}
    await sleep(300);
  }
  throw new Error("Chrome debugging endpoint did not start");
}

async function main() {
  const port = await getDebugPort();
  await waitForEndpoint(`http://127.0.0.1:${port}/json/version`);
  const target = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(BASE + "/dashboard")}`, {
    method: "PUT",
  }).then((r) => r.json());
  const { ws, send, errors } = await makeClient(target.webSocketDebuggerUrl);

  await send("Page.enable");
  await send("Runtime.enable");
  await send("Log.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 375, height: 812, deviceScaleFactor: 3, mobile: true });

  const evalJs = async (expression) => {
    const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) return { __error: r.exceptionDetails.text };
    return r.result.value;
  };

  // ── Login ──────────────────────────────────────────────────────────────
  await send("Page.navigate", { url: BASE + "/login" });
  await waitFor(() => evalJs("document.readyState === 'complete'"), 20000);
  // Wait for React hydration: the form must render with handlers attached
  // (visible submit label) before we can drive it reliably.
  await waitFor(() => evalJs(`[...document.querySelectorAll('button')].some(b => b.textContent.includes('Sign in'))`), 15000);
  const loggedIn = await waitFor(async () => {
    // Already past /login? (e.g. pre-existing session in this profile)
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
      await new Promise(r => setTimeout(r, 250)); // let React state settle
      btn.click();
      return true;
    })()`);
    if (!filled) return null;
    // Poll for the router push to /dashboard + hydrated mobile chrome.
    for (let i = 0; i < 30; i++) {
      await sleep(500);
      const ok = await evalJs(`location.pathname === "/dashboard" && !!document.querySelector('${TAB_BAR_SELECTOR}')`);
      if (ok) return true;
      // Login error surfaced? then give up this attempt (retry loop will refill)
      if (await evalJs(`!![...document.querySelectorAll('p')].find(p => p.textContent.includes('Login failed') || p.textContent.includes('Enter your email'))`)) return null;
    }
    return null;
  }, 40000);
  if (!loggedIn) errors.push("Login failed");

  // ── Dashboard ──────────────────────────────────────────────────────────
  await send("Page.navigate", { url: BASE + "/dashboard" });
  await waitFor(() => evalJs("document.readyState === 'complete'"), 20000);
  // Wait for the KPI cards to hydrate (data-driven sections).
  await waitFor(() => evalJs(`!!document.querySelector('${TAB_BAR_SELECTOR}')`), 12000);
  await waitFor(() => evalJs(`[...document.querySelectorAll('button')].some(b => b.textContent.includes('Period'))`), 15000);
  await sleep(2500); // let charts/data settle

  const DASH_TABS = ["KPIs", "Revenue", "Clients", "Compare", "Birthdays"];

  // Find the dashboard's inner scroll container and measure whether its content
  // overflows the viewport (i.e. the page would need to scroll on mobile).
  const measure = async () =>
    await evalJs(`(() => {
      const main = document.querySelector('main');
      const scroller =
        [...(main ? main.querySelectorAll('*') : [])].find(
          (el) => el.scrollHeight > el.clientHeight + 5 &&
            ['auto', 'scroll'].includes(getComputedStyle(el).overflowY)
        ) || main;
      const d = document.documentElement;
      const tabBar = document.querySelector('[aria-label="Dashboard sections"]');
      const tabs = tabBar
        ? [...tabBar.querySelectorAll('button')].map((b) => b.textContent.trim())
        : [];
      const kpiRevenue = [...document.querySelectorAll('button')].find(b => b.textContent.includes('Revenue'));
      const completion = [...document.querySelectorAll('button')].find(b => b.textContent.includes('Completion'));
      const kpiGrid = kpiRevenue ? kpiRevenue.closest('.grid') : null;
      const dayTab = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Day');
      const pad = dayTab ? getComputedStyle(dayTab) : null;
      return {
        path: location.pathname,
        innerWidth: window.innerWidth,
        scrollWidth: d.scrollWidth,
        overflowPx: d.scrollWidth - window.innerWidth,
        hasBottomTabBar: !!document.querySelector('${TAB_BAR_SELECTOR}'),
        dashTabs: tabs,
        scrollerOverflowPx: scroller ? scroller.scrollHeight - scroller.clientHeight : null,
        titleVisible: (() => {
          // A hidden ANCESTOR (display:none, e.g. the hidden lg:flex wrapper)
          // still reports the h1's own display as "block", so test real
          // visibility: zero-size rect or a display:none ancestor = not rendered.
          const h1 = [...document.querySelectorAll('h1')].find((h) => h.textContent.trim() === 'Dashboard');
          if (!h1) return false;
          const r = h1.getBoundingClientRect();
          if (r.width === 0 && r.height === 0) return false;
          let node = h1;
          while (node && node !== document.body) {
            if (getComputedStyle(node).display === 'none') return false;
            node = node.parentElement;
          }
          return true;
        })(),
        // The dashboard itself no longer has a region select — it lives in the
        // mobile top bar only (aria-label "Region filter"). The compact bell
        // (BirthdayBell) sits in the dashboard filter row instead.
        dashboardRegionSelectCount:
          [...document.querySelectorAll('select[aria-label="Dashboard region filter"]')]
            .filter((s) => s.offsetParent !== null).length,
        topBarRegionSelectVisible: (() => {
          const sels = [...document.querySelectorAll('select[aria-label="Region filter"]')];
          return sels.filter((s) => s.offsetParent !== null).length === 1;
        })(),
        bellVisible: (() => {
          const bells = [...document.querySelectorAll('button[aria-label^="Upcoming birthdays"]')];
          return bells.filter((b) => b.offsetParent !== null).length === 1;
        })(),
        kpiGridWidth: kpiGrid ? Math.round(kpiGrid.getBoundingClientRect().width) : null,
        completionWidth: completion ? Math.round(completion.getBoundingClientRect().width) : null,
        filterTabPadding: pad ? pad.paddingLeft + '/' + pad.paddingTop : null,
      };
    })()`);

  const layout = await measure();
  console.log("LAYOUT (default tab):", JSON.stringify(layout, null, 2));

  // ── Assertions (default tab view) ──────────────────────────────────────
  const failures = [];
  if (layout.overflowPx > 0) failures.push(`horizontal overflow of ${layout.overflowPx}px`);
  if (!layout.hasBottomTabBar) failures.push("bottom tab bar missing");
  if (!layout.dashTabs || layout.dashTabs.length !== 5) {
    failures.push(`dashboard tab bar should have 5 tabs, got ${JSON.stringify(layout.dashTabs)}`);
  } else if (JSON.stringify(layout.dashTabs) !== JSON.stringify(DASH_TABS)) {
    failures.push(`dashboard tabs wrong order: ${JSON.stringify(layout.dashTabs)}`);
  }
  if (layout.scrollerOverflowPx == null || layout.scrollerOverflowPx > 0) {
    failures.push(
      `dashboard content overflows the viewport by ${layout.scrollerOverflowPx ?? "unknown"}px on the default tab (expected 0 — no scrolling)`
    );
  }
  // The mobile dashboard intentionally drops the page header: the h1 title row
  // is display:none below lg (it only exists for the desktop layout).
  if (layout.titleVisible) {
    failures.push("mobile dashboard header (h1) should be hidden — remove the dashboard header on phones");
  }
  if (layout.dashboardRegionSelectCount !== 0) {
    failures.push(`dashboard should have no region filter select on mobile, found ${layout.dashboardRegionSelectCount}`);
  }
  if (!layout.topBarRegionSelectVisible) {
    failures.push("top bar region filter select should be visible exactly once on mobile");
  }
  if (!layout.bellVisible) {
    failures.push("birthday bell should be visible exactly once on the mobile dashboard");
  }
  if (layout.kpiGridWidth && layout.completionWidth) {
    if (layout.completionWidth < layout.kpiGridWidth * 0.9) {
      failures.push(
        `Completion card width ${layout.completionWidth}px < 90% of grid ${layout.kpiGridWidth}px (should span full row)`
      );
    }
  } else {
    failures.push("could not measure KPI grid / Completion card");
  }
  if (layout.filterTabPadding && layout.filterTabPadding !== "10px/6px") {
    failures.push(`filter tab padding ${layout.filterTabPadding}, expected compact 10px/6px on mobile`);
  }

  // ── Switch through every dashboard tab and confirm no-scroll + visible content ──
  const tabChecks = [];
  for (const tab of DASH_TABS) {
    const clicked = await evalJs(`(async () => {
      const btn = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === ${JSON.stringify(tab)});
      if (!btn) return false;
      btn.click();
      await new Promise((r) => setTimeout(r, 900));
      return true;
    })()`);
    await sleep(400);
    const m = await measure();
    const visibleSection = await evalJs(`(() => {
      // The active tab shows a non-empty CollapsibleSection region
      const regions = [...document.querySelectorAll('main section [role="region"]')]
        .filter((r) => r.getBoundingClientRect().height > 0);
      return regions.length;
    })()`);
    tabChecks.push({
      tab,
      clicked,
      visibleSections: visibleSection,
      overflow: m.scrollerOverflowPx,
    });
    if (!clicked) failures.push(`could not click dashboard tab: ${tab}`);
    if (m.scrollerOverflowPx > 0) failures.push(`tab '${tab}' overflows by ${m.scrollerOverflowPx}px`);
    if (visibleSection < 1) failures.push(`tab '${tab}' shows no visible section content`);
    console.log(`TAB ${tab}:`, JSON.stringify(tabChecks[tabChecks.length - 1]));
  }

  // Back to the default tab for the screenshot
  await evalJs(`(async () => {
    const btn = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'KPIs');
    if (btn) btn.click();
    await new Promise((r) => setTimeout(r, 600));
  })()`);

  for (const e of errors) failures.push(`console error: ${e}`);

  // ── Full-page screenshot ───────────────────────────────────────────────
  // The dashboard scrolls inside an inner container (flex-1 overflow-y-auto)
  // inside <main>, so neither the document nor <main> grows. Find the deepest
  // scroller with real content, expand it to its content height, and unclip
  // every ancestor so captureBeyondViewport can grab the whole page.
  const fullHeight = await evalJs(`(() => {
    const main = document.querySelector('main');
    if (!main) return null;
    const scroller =
      [...main.querySelectorAll('*')].find(
        (el) => el.scrollHeight > el.clientHeight + 5 &&
          ['auto', 'scroll'].includes(getComputedStyle(el).overflowY)
      ) || main;
    const h = scroller.scrollHeight;
    // Save inline styles for restore, then break the flex-height chain:
    // scroller (flex-1 -> fixed content height), main, and the h-dvh wrapper.
    const saved = [];
    let node = scroller;
    while (node && node !== document.documentElement) {
      saved.push(node.dataset.fcPrevStyle = node.getAttribute('style') || '');
      node = node.parentElement;
    }
    scroller.style.flex = 'none';
    scroller.style.height = h + 'px';
    scroller.style.overflow = 'visible';
    main.style.height = h + 'px';
    main.style.overflow = 'visible';
    const root = main.parentElement;
    if (root) {
      root.style.height = 'auto';
      root.style.overflow = 'visible';
    }
    document.body.style.overflow = 'visible';
    document.documentElement.style.overflow = 'visible';
    return document.documentElement.scrollHeight;
  })()`);
  const shot = await send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: true,
    clip: { x: 0, y: 0, width: 375, height: fullHeight, scale: 2 },
  });
  await evalJs(`(() => {
    const main = document.querySelector('main');
    let node = main;
    while (node && node !== document.documentElement) {
      node.setAttribute('style', node.dataset.fcPrevStyle || '');
      node = node.parentElement;
    }
    document.body.style.overflow = '';
    document.documentElement.style.overflow = '';
  })()`);
  writeFileSync(SHOT_FILE, Buffer.from(shot.data, "base64"));
  console.log(`\nScreenshot saved: ${SHOT_FILE} (${fullHeight}px tall @2x)`);

  console.log(failures.length === 0 ? "\nDASHBOARD VERIFY PASSED ✅" : `\nDASHBOARD VERIFY FAILED:\n- ${failures.join("\n- ")}`);

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
  process.exit(failures.length === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("VERIFY FAILED:", err.message);
  try {
    chrome.kill();
  } catch {}
  try {
    rmSync(profile, { recursive: true, force: true });
  } catch {}
  process.exit(1);
});
