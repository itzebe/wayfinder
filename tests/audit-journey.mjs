/**
 * Journey audit — walks the real flow in a browser and reports what happened.
 *
 * This is the honest end-to-end check: it types into the real inputs, clicks the
 * real buttons, and reports which screen it landed on and what the page said.
 * If a step is broken, this says so rather than asserting it works.
 *
 * Usage: node tests/audit-journey.mjs [baseUrl]
 */
import { spawn } from "node:child_process";

const BASE = process.argv[2] ?? "http://localhost:3000";
const PORT = 9344;

const chrome = spawn("/usr/bin/chromium", [
  "--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
  `--remote-debugging-port=${PORT}`, "about:blank",
], { stdio: "ignore" });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForDevtools() {
  for (let i = 0; i < 80; i += 1) {
    try { if ((await fetch(`http://127.0.0.1:${PORT}/json/version`)).ok) return; } catch {}
    await sleep(250);
  }
  throw new Error("DevTools endpoint never appeared");
}

function connect(wsUrl) {
  const socket = new WebSocket(wsUrl);
  const pending = new Map();
  let nextId = 0;
  const events = [];
  socket.addEventListener("message", (event) => {
    const msg = JSON.parse(event.data);
    if (msg.method) { events.push(msg); return; }
    const entry = pending.get(msg.id);
    if (entry) { pending.delete(msg.id); entry.resolve(msg); }
  });
  const ready = new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve);
    socket.addEventListener("error", reject);
  });
  const send = (method, params = {}) => new Promise((resolve) => {
    const id = (nextId += 1);
    pending.set(id, { resolve });
    socket.send(JSON.stringify({ id, method, params }));
  });
  return { ready, send, close: () => socket.close(), events };
}

try {
  await waitForDevtools();
  const target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: "PUT" })).json();
  const client = connect(target.webSocketDebuggerUrl);
  await client.ready;
  await client.send("Page.enable");
  await client.send("Runtime.enable");
  await client.send("Log.enable");
  await client.send("Network.enable");

  const evaluate = async (expression) => {
    const res = await client.send("Runtime.evaluate", {
      expression, returnByValue: true, awaitPromise: true,
    });
    if (res.result?.exceptionDetails) {
      return { error: res.result.exceptionDetails.text };
    }
    return res.result?.result?.value;
  };

  const errors = [];

  console.log("JOURNEY AUDIT — flight disruption path\n");

  // --- Step 1: landing page -------------------------------------------------
  await client.send("Emulation.setDeviceMetricsOverride", {
    width: 390, height: 844, deviceScaleFactor: 1, mobile: true,
  });
  await client.send("Page.navigate", { url: BASE + "/" });
  await sleep(3500);
  console.log(`1. landing            h1="${(await evaluate("document.querySelector('h1')?.textContent?.trim()"))?.slice(0, 50)}"`);

  // --- Step 2: describe a flight cancellation in the hero -------------------
  const typed = await evaluate(`(() => {
    const ta = document.querySelector("form textarea");
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
    setter.call(ta, "my flight was cancelled and I have a connection");
    ta.dispatchEvent(new Event("input", { bubbles: true }));
    return ta.value;
  })()`);
  console.log(`2. typed description  "${String(typed).slice(0, 46)}"`);

  await sleep(700);
  const hint = await evaluate(`(() => {
    const form = document.querySelector("form");
    const p = form.querySelector("[aria-live]");
    return p ? p.textContent.trim().replace(/\\s+/g, " ") : null;
  })()`);
  console.log(`   routing hint       "${hint}"`);

  // --- Step 3: submit -------------------------------------------------------
  await evaluate(`document.querySelector("form button[type=submit]").click()`);
  await sleep(3500);
  const url1 = await evaluate("location.pathname + location.search");
  console.log(`3. after submit       -> ${url1}`);

  // --- Step 4: fill the flight form ----------------------------------------
  const formInfo = await evaluate(`(() => {
    const inputs = [...document.querySelectorAll("input, textarea, select")].map((el) => ({
      id: el.id, type: el.type, label: el.closest("label")?.textContent?.trim().slice(0, 34) || "",
    })).filter((i) => i.type !== "hidden");
    const h = document.querySelector("h1,h2");
    return { heading: h?.textContent?.trim().slice(0, 60), inputs: inputs.slice(0, 14) };
  })()`);
  console.log(`4. form heading       "${formInfo?.heading}"`);
  console.log(`   inputs present     ${formInfo?.inputs?.length ?? 0}`);

  // Choose "cancelled" if the situation picker is showing.
  const picked = await evaluate(`(() => {
    const radio = document.querySelector('input[type=radio][value="cancelled"]')
      || document.querySelector('input[type=radio]');
    if (!radio) return null;
    radio.click();
    return radio.value;
  })()`);
  if (picked) console.log(`   picked need        "${picked}"`);
  await sleep(600);

  // Advance past the situation step if a continue button is present.
  await evaluate(`(() => {
    const btns = [...document.querySelectorAll("button")];
    const cont = btns.find((b) => /continue|next/i.test(b.textContent || ""));
    if (cont) { cont.click(); return true; }
    return false;
  })()`);
  await sleep(900);

  // Fill flight number and date.
  const filled = await evaluate(`(() => {
    const out = {};
    const setNative = (el, value) => {
      const proto = el instanceof window.HTMLTextAreaElement
        ? window.HTMLTextAreaElement.prototype
        : el instanceof window.HTMLSelectElement
          ? window.HTMLSelectElement.prototype
          : window.HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
      setter.call(el, value);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    };
    for (const el of document.querySelectorAll("input, select")) {
      const label = (el.closest("label")?.textContent || "") + " " + (el.id || "");
      if (el.type === "hidden" || el.type === "radio") continue;
      if (/flight/i.test(label) && el.type === "text") { setNative(el, "BA123"); out.flight = el.id || "ok"; }
      else if (el.type === "date") { setNative(el, "2026-10-16"); out.date = el.id || "ok"; }
    }
    return out;
  })()`);
  console.log(`5. filled             ${JSON.stringify(filled)}`);
  await sleep(500);

  // Submit the flight form.
  const submitted = await evaluate(`(() => {
    const btns = [...document.querySelectorAll("button")];
    const go = btns.find((b) => /find|search|get help|continue|check|build my situation/i.test(b.textContent || "") && !b.disabled);
    if (go) { go.click(); return go.textContent.trim().slice(0, 30); }
    return null;
  })()`);
  console.log(`6. submitted          button="${submitted}"`);

  // Wait for the situation to build (live provider calls take a moment).
  let url2 = null;
  let state = null;
  for (let i = 0; i < 40; i += 1) {
    await sleep(1000);
    url2 = await evaluate("location.pathname + location.search");
    state = await evaluate(`(() => {
      const h1 = document.querySelector("h1");
      const badge = document.querySelector("[role=status], .skeleton");
      const h2s = [...document.querySelectorAll("h2")].map((h) => h.textContent.trim().slice(0, 40));
      return { h1: h1?.textContent?.trim().slice(0, 70), loading: !!badge, sections: h2s.slice(0, 10) };
    })()`);
    if (url2 && url2.startsWith("/situation") && !state?.loading) break;
    if (i === 12 && !url2?.startsWith("/situation")) break;
  }
  console.log(`7. landed on          ${url2}`);
  console.log(`   page h1            "${state?.h1}"`);
  console.log(`   sections           ${JSON.stringify(state?.sections)}`);

  const finalText = await evaluate(`document.body.innerText.replace(/\\s+/g, " ").slice(0, 700)`);
  console.log(`\n   visible text:\n   ${String(finalText).slice(0, 640)}`);

  // Console errors.
  for (const ev of client.events) {
    if (ev.method === "Runtime.exceptionThrown") {
      errors.push(ev.params.exceptionDetails?.text || "exception");
    }
    if (ev.method === "Log.entryAdded" && ev.params.entry.level === "error") {
      errors.push(ev.params.entry.text);
    }
  }
  console.log(`\nconsole errors: ${errors.length}`);
  for (const e of errors.slice(0, 8)) console.log(`  - ${String(e).slice(0, 150)}`);

  client.close();
} catch (error) {
  console.error(error);
} finally {
  chrome.kill();
}
