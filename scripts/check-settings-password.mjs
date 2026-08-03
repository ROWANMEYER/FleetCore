/**
 * Quick CDP check for the Settings "Sign-in Password" section.
 * Logs in as admin, opens /settings, and verifies:
 *   - the "Sign-in Password" section + 3 password fields exist
 *   - client-side validation shows "Passwords do not match"
 *   - the Update button enables with a valid form
 * (Deliberately does NOT submit, so the admin password is never changed.)
 *
 * Usage: node scripts/check-settings-password.mjs
 * Env:   AUDIT_EMAIL / AUDIT_PASSWORD (optional, defaults to seed admin)
 */
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = "https://fleetcore-mu.vercel.app";
const AUDIT_EMAIL = process.env.AUDIT_EMAIL || "admin@fleetcore.app";
const AUDIT_PASSWORD = process.env.AUDIT_PASSWORD || "Fleetcore2026!";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = mkdtempSync(join(tmpdir(), "fc-settings-"));
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
const chrome = spawn("C:/Program Files/Google/Chrome/Application/chrome.exe", flags, {
  stdio: "ignore",
});

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
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.id && pending.has(msg.id)) {
        const { res, rej } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) rej(new Error(msg.error.message));
        else res(msg.result);
      }
    };
    ws.onopen = () => {
      const send = (method, params = {}) =>
        new Promise((res, rej) => {
          const id = ++msgId;
          pending.set(id, { res, rej });
          ws.send(JSON.stringify({ id, method, params }));
        });
      resolve({ ws, send });
    };
    ws.onerror = () => reject(new Error("WebSocket connection failed"));
  });
}

async function main() {
  const port = await getDebugPort();
  const target = await fetch(
    `http://127.0.0.1:${port}/json/new?${encodeURIComponent(BASE + "/login")}`,
    { method: "PUT" }
  ).then((r) => r.json());
  const { ws, send } = await makeClient(target.webSocketDebuggerUrl);
  const evalJs = async (expression) => {
    const r = await send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    return r.exceptionDetails ? { error: r.exceptionDetails.text } : r.result.value;
  };

  await send("Page.enable");
  await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", {
    width: 375,
    height: 812,
    deviceScaleFactor: 3,
    mobile: true,
  });

  const hasForm = await waitFor(
    () => evalJs(`!!document.querySelector('input[type="email"]')`),
    20000
  );
  if (!hasForm) {
    console.log("RESULT: FAIL — no login form");
    process.exit(1);
  }

  const loggedIn = await waitFor(async () => {
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
    await sleep(2000);
    return (await evalJs(
      `location.pathname !== "/login" && !!document.querySelector('[aria-label="Open navigation"]')`
    ))
      ? true
      : null;
  }, 25000);

  if (!loggedIn) {
    console.log("RESULT: FAIL — login did not complete");
    process.exit(1);
  }
  console.log("logged in as admin");

  // Navigate to settings. The AppShell guard can bounce us to /login then
  // /dashboard while the session query resolves (slow on a cold dev deployment),
  // so retry the navigation once the session is warm.
  await send("Page.navigate", { url: BASE + "/settings" });
  let section = null;
  for (let attempt = 0; attempt < 4 && !section; attempt++) {
    await waitFor(async () => {
      const ready = await evalJs("document.readyState");
      return ready === "complete" ? true : null;
    }, 20000);
    await sleep(2000);
    section = await evalJs(`(() => {
      const heading = [...document.querySelectorAll("h2")].find((h) => h.textContent.trim() === "Sign-in Password");
      return heading ? true : null;
    })()`);
    if (!section) {
      const path = await evalJs("location.pathname");
      if (path !== "/settings") {
        console.log("bounced to", path, "- retrying navigation");
        await send("Page.navigate", { url: BASE + "/settings" });
        await sleep(1500);
      }
    }
  }

  // Section presence
  section = await evalJs(`(() => {
    const headings = [...document.querySelectorAll("h2")].map((h) => h.textContent.trim());
    const inputs = [...document.querySelectorAll('input[type="password"]')].map((i) => i.placeholder || "");
    const btn = [...document.querySelectorAll("button")].find((b) => b.textContent.includes("Update Password"));
    return {
      hasSection: headings.includes("Sign-in Password"),
      headings,
      pwInputs: inputs,
      hasUpdateBtn: !!btn,
    };
  })()`);
  console.log("section:", JSON.stringify(section));
  if (!section.hasSection || !section.hasUpdateBtn || section.pwInputs.length < 3) {
    console.log("RESULT: FAIL — sign-in password section incomplete");
    ws.close();
    chrome.kill();
    rmSync(profile, { recursive: true, force: true });
    process.exit(1);
  }

  // Client-side validation: mismatched confirm shows an error and disables submit.
  // NOTE: scope inputs to the Sign-in Password section — the legacy Admin
  // Password section also has a password input earlier in the DOM.
  const scopeInputs = `(() => {
    const heading = [...document.querySelectorAll("h2")].find((h) => h.textContent.trim() === "Sign-in Password");
    const section = heading ? heading.closest(".glass-card-premium") : null;
    return section ? [...section.querySelectorAll('input[type="password"]')] : [];
  })()`;
  const mismatch = await evalJs(`(async () => {
    const setNative = (el, value) => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      setter.call(el, value);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    };
    const inputs = ${scopeInputs};
    if (inputs.length < 3) return { error: "section inputs not found: " + inputs.length };
    // inputs are ordered: current, new, confirm
    setNative(inputs[0], "whatever1");
    setNative(inputs[1], "BrandNewPass1!");
    setNative(inputs[2], "DifferentPass2!");
    await new Promise((r) => setTimeout(r, 400));
    const btn = [...document.querySelectorAll("button")].find((b) => b.textContent.includes("Update Password"));
    return {
      mismatchShown: document.body.textContent.includes("Passwords do not match"),
      btnDisabled: btn ? btn.disabled : null,
    };
  })()`);
  console.log("mismatch validation:", JSON.stringify(mismatch));

  // Matching confirm: error clears, button enables
  const match = await evalJs(`(async () => {
    const setNative = (el, value) => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      setter.call(el, value);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    };
    const inputs = ${scopeInputs};
    if (inputs.length < 3) return { error: "section inputs not found: " + inputs.length };
    setNative(inputs[2], "BrandNewPass1!");
    await new Promise((r) => setTimeout(r, 400));
    const btn = [...document.querySelectorAll("button")].find((b) => b.textContent.includes("Update Password"));
    return {
      mismatchGone: !document.body.textContent.includes("Passwords do not match"),
      btnEnabled: btn ? !btn.disabled : null,
    };
  })()`);
  console.log("valid form:", JSON.stringify(match));

  const pass =
    section.hasSection &&
    section.hasUpdateBtn &&
    mismatch.mismatchShown === true &&
    mismatch.btnDisabled === true &&
    match.mismatchGone === true &&
    match.btnEnabled === true;

  console.log("RESULT: " + (pass ? "PASS" : "FAIL"));
  ws.close();
  chrome.kill();
  rmSync(profile, { recursive: true, force: true });
  process.exit(pass ? 0 : 1);
}

main().catch((e) => {
  console.error("ERROR:", e.message);
  chrome.kill();
  process.exit(1);
});
