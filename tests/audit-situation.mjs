/**
 * Situation-page audit.
 *
 * Walks the real flow to a real situation page, then measures the vertical
 * order and cost of every section. The brief requires the four questions —
 * what we know, what it means, what to do next, what is unconfirmed — to be
 * easy to distinguish and for actions to outrank technical metadata, so this
 * reports where each section actually lands.
 *
 * Usage: node tests/audit-situation.mjs [baseUrl]
 */
import { spawn } from "node:child_process";

const BASE = process.argv[2] ?? "http://localhost:3000";
const PORT = 9346;

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
  socket.addEventListener("message", (event) => {
    const msg = JSON.parse(event.data);
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
  return { ready, send, close: () => socket.close() };
}

const PROBE = `(() => {
  const vh = window.innerHeight;
  const out = { vh, pageHeight: document.documentElement.scrollHeight, sections: [], overflow: [], small: [] };
  const label = (el) => (el.getAttribute("aria-label") || el.textContent || "").trim().replace(/\\s+/g, " ").slice(0, 44);

  document.querySelectorAll("main section, main > div > section, main article").forEach((s) => {
    const r = s.getBoundingClientRect();
    if (r.height < 20) return;
    const h = s.querySelector("h2, h3");
    out.sections.push({ id: s.id || "", top: Math.round(r.top + scrollY),
      height: Math.round(r.height), heading: h ? label(h) : "" });
  });

  document.querySelectorAll("body *").forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.width === 0) return;
    if (r.right > window.innerWidth + 1 || r.left < -1) {
      out.overflow.push({ tag: el.tagName, label: label(el),
        left: Math.round(r.left), right: Math.round(r.right) });
    }
  });

  document.querySelectorAll("a[href], button, [role=tab]").forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    if (r.height < 44 || r.width < 44) {
      out.small.push({ tag: el.tagName, label: label(el), w: Math.round(r.width), h: Math.round(r.height) });
    }
  });

  // The unpublished-details disclosure: absent fields must be folded away, and
  // the status verdict must stay visible even when it is "cannot confirm".
  const status = document.querySelector("#status");
  if (status) {
    const buttons = [...status.querySelectorAll("button")];
    out.disclosure = {
      toggleCount: buttons.length,
      collapsed: buttons.filter((b) => b.getAttribute("aria-expanded") === "false").length,
      visibleRows: [...status.querySelectorAll("dt")].map((d) => (d.textContent || "").trim()),
      statusHeight: Math.round(status.getBoundingClientRect().height),
    };
  }

  return out;
})()`;

try {
  await waitForDevtools();
  const target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: "PUT" })).json();
  const client = connect(target.webSocketDebuggerUrl);
  await client.ready;
  await client.send("Page.enable");
  await client.send("Runtime.enable");

  const evaluate = async (expression) => {
    const res = await client.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    return res.result?.result?.value;
  };

  for (const [w, h, name] of [[390, 844, "iPhone 14/15"], [1440, 900, "Desktop"]]) {
    await client.send("Emulation.setDeviceMetricsOverride", {
      width: w, height: h, deviceScaleFactor: 1, mobile: w < 700,
    });

    // Build a real situation through the real flow.
    await client.send("Page.navigate", { url: BASE + "/help" });
    await sleep(3500);

    await evaluate(`(() => {
      const r = document.querySelector('input[type=radio][value="cancelled"]') || document.querySelector('input[type=radio]');
      if (r) r.click();
      return true;
    })()`);
    await sleep(500);
    await evaluate(`(() => {
      const c = [...document.querySelectorAll("button")].find((b) => /continue|next/i.test(b.textContent || ""));
      if (c) c.click();
      return true;
    })()`);
    await sleep(800);
    await evaluate(`(() => {
      const setNative = (el, v) => {
        const proto = el instanceof window.HTMLSelectElement ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(proto, "value").set.call(el, v);
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      };
      for (const el of document.querySelectorAll("input")) {
        const lbl = (el.closest("label")?.textContent || "") + " " + (el.id || "");
        if (el.type === "text" && /flight/i.test(lbl)) setNative(el, "BA123");
        if (el.type === "date") setNative(el, "2026-10-16");
      }
      return true;
    })()`);
    await sleep(500);
    await evaluate(`(() => {
      const go = [...document.querySelectorAll("button")].find((b) => /build my situation/i.test(b.textContent || "") && !b.disabled);
      if (go) go.click();
      return true;
    })()`);

    for (let i = 0; i < 40; i += 1) {
      await sleep(1000);
      const path = await evaluate("location.pathname");
      const busy = await evaluate("!!document.querySelector('.skeleton')");
      if (path === "/situation" && !busy) break;
    }
    await sleep(1500);

    const res = await client.send("Runtime.evaluate", { expression: PROBE, returnByValue: true });
    const d = res.result?.result?.value;
    if (!d) { console.log(`\n### ${name} — probe failed`); continue; }

    console.log(`\n${"=".repeat(72)}`);
    console.log(`### SITUATION PAGE — ${name} ${w}x${h}`);
    console.log(`  page height ${d.pageHeight}px (${(d.pageHeight / d.vh).toFixed(1)} screens)`);
    console.log(`\n  Sections in document order:`);
    for (const s of d.sections) {
      console.log(`    @${String(s.top).padStart(5)}px  h=${String(s.height).padStart(5)}  ` +
        `${s.heading}${s.id ? "  (#" + s.id + ")" : ""}`);
    }
    if (d.small.length) {
      console.log(`\n  Targets under 44px (${d.small.length}):`);
      for (const t of d.small.slice(0, 12)) console.log(`    ${t.tag.padEnd(8)} ${t.w}x${t.h}  "${t.label}"`);
    }
    if (d.disclosure) {
      console.log(`\n  Status disclosure:`);
      console.log(`    toggles=${d.disclosure.toggleCount} collapsed=${d.disclosure.collapsed} height=${d.disclosure.statusHeight}px`);
      console.log(`    visible rows: ${d.disclosure.visibleRows.join(" | ")}`);
    }
    if (d.overflow.length) {
      console.log(`\n  Overflowing (${d.overflow.length}):`);
      for (const o of d.overflow.slice(0, 8)) console.log(`    ${o.tag} [${o.left}..${o.right}] "${o.label}"`);
    }
  }

  client.close();
} catch (error) {
  console.error(error);
} finally {
  chrome.kill();
}
