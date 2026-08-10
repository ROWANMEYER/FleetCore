#!/usr/bin/env node
/* eslint-disable no-console */
// Desktop sidebar audit (1280x800): login, expand/collapse the sidebar and
// assert: no birthday bell, no tooltip pointer arrows on collapsed nav
// icons, enlarged nav icons (22px), and the FleetCore wordmark hidden when
// the sidebar is collapsed (icon-only rail with the logo mark).
//
// Usage: node scripts/verify-sidebar-desktop.mjs [baseUrl]
//   baseUrl defaults to http://localhost:3000
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = process.argv[2] || "http://localhost:3000";
const AUDIT_EMAIL = "admin@fleetcore.app";
const AUDIT_PASSWORD = "admin123";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function resolveChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const candidates = [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ];
  for (const c of candidates) {
    try {
      if (existsSync(c)) return c;
    } catch {
      /* ignore */
    }
  }
  return candidates[0];
}

async function main() {
  const profile = mkdtempSync(join(tmpdir(), "fc-sidebar-"));
  const chromePath = resolveChrome();
  const chrome = spawn(
    chromePath,
    [
      "--headless=new",
      "--remote-debugging-port=0",
      `--user-data-dir=${profile}`,
      "--window-size=1280,800",
      "--hide-scrollbars",
      "about:blank",
      ...(process.platform !== "win32" ? ["--no-sandbox", "--disable-dev-shm-usage"] : []),
    ],
    { stdio: "ignore" }
  );

  const getDebugPort = () =>
    new Promise((resolve, reject) => {
      const file = join(profile, "DevToolsActivePort");
      let tries = 0;
      const poll = () => {
        tries++;
        try {
          const content = readFileSync(file, "utf8");
          resolve(Number(content.split(/\r?\n/)[0]));
          return;
        } catch {
          if (tries > 100) return reject(new Error("Chrome debug port not found"));
          setTimeout(poll, 100);
        }
      };
      poll();
    });

  const steps = [];
  const consoleErrors = [];
  const step = (name, ok, detail = "") =>
    steps.push({ name, ok: !!ok, detail: ok ? detail || "ok" : detail || "failed" });

  let ws;
  let msgId = 0;
  const pending = new Map();
  const events = [];
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++msgId;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });

  try {
    const port = await getDebugPort();
    const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
    const page = targets.find((t) => t.type === "page");
    ws = new WebSocket(page.webSocketDebuggerUrl);

    await new Promise((resolve, reject) => {
      ws.onopen = resolve;
      ws.onerror = reject;
    });
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.id && pending.has(m.id)) {
        pending.get(m.id).resolve(m.result);
        pending.delete(m.id);
      } else if (m.method === "Runtime.exceptionThrown") {
        consoleErrors.push(m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text || "exception");
      } else if (m.method === "Log.entryAdded" && m.params.entry.level === "error") {
        consoleErrors.push(m.params.entry.text);
      }
    };
    await send("Runtime.enable");
    await send("Log.enable");
    await send("Page.enable");
    // Desktop viewport — the sidebar is hidden below md (768px).
    await send("Emulation.setDeviceMetricsOverride", {
      width: 1280,
      height: 800,
      deviceScaleFactor: 1,
      mobile: false,
    });

    const evalJs = async (expression) => {
      const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) return { error: r.exceptionDetails.text };
      return r.result.value;
    };
    const clickBySelector = (sel) =>
      evalJs(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (el) { el.click(); return true; } return false; })()`);
    const waitFor = async (fn, timeout = 15000, interval = 300) => {
      const start = Date.now();
      while (Date.now() - start < timeout) {
        try {
          const v = await fn();
          if (v) return v;
        } catch {
          /* keep polling */
        }
        await sleep(interval);
      }
      return null;
    };
    const waitPageReady = () => waitFor(async () => (await evalJs("document.readyState")) === "complete", 20000);
    const waitForSelector = (sel, timeout = 15000) => waitFor(() => evalJs(`!!document.querySelector(${JSON.stringify(sel)})`), timeout);
    const shot = async (name) => {
      const dir = join(process.cwd(), "mobile-walkthrough");
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      const r = await send("Page.captureScreenshot", { format: "png" });
      const file = join(dir, name);
      writeFileSync(file, Buffer.from(r.data, "base64"));
      return file;
    };

    // ── Login ────────────────────────────────────────────────────────────────
    await send("Page.navigate", { url: BASE + "/login" });
    await waitPageReady();
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
        if (!email || !password) return false;
        setNative(email, ${JSON.stringify(AUDIT_EMAIL)});
        setNative(password, ${JSON.stringify(AUDIT_PASSWORD)});
        const btn = document.querySelector('button[type="submit"]');
        if (btn) btn.click();
        return true;
      })()`);
      await sleep(1800);
      return (await evalJs(`location.pathname !== "/login"`)) ? true : null;
    }, 25000);
    step("1. Login (desktop viewport)", loggedIn, loggedIn ? "authenticated" : "login failed");

    // ── Sidebar present (expanded) ──────────────────────────────────────────
    const sidebar = await waitForSelector('aside[aria-label="Navigation"]', 15000);
    step("2. Sidebar visible (expanded)", !!sidebar);

    const expanded = await evalJs(`(() => {
      const aside = document.querySelector('aside[aria-label="Navigation"]');
      const wordmark = [...aside.querySelectorAll('span')].find(s => s.textContent.trim() === 'FleetCore');
      const navIcon = aside ? aside.querySelector('nav svg') : null;
      return {
        width: aside ? Math.round(aside.getBoundingClientRect().width) : 0,
        wordmarkVisible: !!wordmark && wordmark.getBoundingClientRect().width > 40,
        bellPresent: !!aside.querySelector('[aria-label^="Upcoming birthdays"]'),
        iconSize: navIcon ? Number(navIcon.getAttribute('width')) : 0,
      };
    })()`);
    step("3. Expanded: width ~256, wordmark visible, enlarged icons, no bell",
      expanded.width >= 240 && expanded.width <= 270 && expanded.wordmarkVisible && !expanded.bellPresent && expanded.iconSize >= 20,
      `width=${expanded.width} wordmark=${expanded.wordmarkVisible} iconSize=${expanded.iconSize} bell=${expanded.bellPresent}`);
    await shot("step-1-sidebar-expanded.png");

    // ── Collapse the sidebar ─────────────────────────────────────────────────
    await clickBySelector('[title="Collapse sidebar"]');
    const collapsed = await waitFor(
      () =>
        evalJs(`(() => { const a = document.querySelector('aside[aria-label="Navigation"]'); if (!a) return null; const w = Math.round(a.getBoundingClientRect().width); return Math.abs(w - 72) <= 3 ? w : null; })()`),
      8000
    );

    const coll = await evalJs(`(() => {
      const aside = document.querySelector('aside[aria-label="Navigation"]');
      const wordmark = [...aside.querySelectorAll('span')].find(s => s.textContent.trim() === 'FleetCore');
      const asideRect = aside ? aside.getBoundingClientRect() : null;
      const navIcon = aside ? aside.querySelector('nav svg') : null;
      return {
        width: asideRect ? Math.round(asideRect.width) : 0,
        // Wordmark must be hidden when collapsed (fades to ~0 width).
        wordmarkHidden: !!wordmark && wordmark.getBoundingClientRect().width < 5,
        iconSize: navIcon ? Number(navIcon.getAttribute('width')) : 0,
        bellPresent: !!aside.querySelector('[aria-label^="Upcoming birthdays"]'),
        tooltipArrows: !!aside.querySelector('[class*="border-r-["]'),
      };
    })()`);
    step("4. Collapsed: width ~72, wordmark hidden, enlarged icons", !!collapsed && coll.width >= 64 && coll.width <= 85 && coll.wordmarkHidden && coll.iconSize >= 20,
      `width=${coll.width} wordmarkHidden=${coll.wordmarkHidden} iconSize=${coll.iconSize}`);
    step("5. Collapsed: no bell icon in sidebar", !coll.bellPresent, coll.bellPresent ? "bell still present" : "bell removed");
    step("6. Collapsed: no tooltip pointer arrows", !coll.tooltipArrows, coll.tooltipArrows ? "arrow element still rendered" : "no arrow elements");
    await shot("step-2-sidebar-collapsed.png");

    // ── No console errors ───────────────────────────────────────────────────
    step("7. No console errors", consoleErrors.length === 0, consoleErrors.length ? consoleErrors.slice(0, 3).join(" | ") : "clean");

    // ── Report ──────────────────────────────────────────────────────────────
    const passed = steps.every((s) => s.ok);
    console.log(JSON.stringify({ steps, consoleErrors, passed: passed ? "PASSED" : "FAILED" }, null, 2));
  } finally {
    try {
      if (ws) ws.close();
    } catch {
      /* ignore */
    }
    chrome.kill();
    await sleep(300);
    try {
      rmSync(profile, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}

main().catch((e) => {
  console.error("FATAL:", e.message);
  process.exit(1);
});
