/**
 * First-impression audit.
 *
 * Measures where the important things actually land on a phone: what is visible
 * without scrolling, how tall the hero is, and how far down the primary action
 * and the product preview sit. The brief requires the entry point to be
 * reachable immediately, so these are the numbers that decide whether that
 * holds.
 *
 * Usage: node tests/audit-first-impression.mjs [baseUrl]
 */
import { spawn } from "node:child_process";

const BASE = process.argv[2] ?? "http://localhost:3000";
const PORT = 9343;
const VIEWPORTS = [
  { w: 320, h: 568, name: "iPhone SE (1st gen)" },
  { w: 390, h: 844, name: "iPhone 14/15" },
  { w: 1440, h: 900, name: "Desktop" },
];

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
  const y = (el) => el ? Math.round(el.getBoundingClientRect().top + scrollY) : null;
  const q = (s) => document.querySelector(s);
  const txt = (el) => el ? (el.textContent || "").trim().replace(/\\s+/g, " ").slice(0, 58) : null;

  const h1 = q("h1");
  const form = q("form");
  const primary = form ? form.querySelector("button[type=submit]") : null;
  const preview = q('[role=region]');
  const shortcuts = [...document.querySelectorAll("a[href*='/support?category=']")];
  const stats = q("main ul:last-of-type");

  // What is inside the first viewport, and how much of it is text.
  const inFold = [];
  document.querySelectorAll("h1, h2, p, form, a[href], button, [role=region]").forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.top < vh && r.bottom > 0 && r.height > 0) {
      inFold.push({ tag: el.tagName, top: Math.round(r.top), text: txt(el) });
    }
  });

  // First meaningful pixel of the preview: how far the user must scroll.
  return {
    vh,
    pageHeight: document.documentElement.scrollHeight,
    h1: { top: y(h1), text: txt(h1) },
    formTop: y(form),
    primaryTop: y(primary),
    primaryText: txt(primary),
    previewTop: y(preview),
    previewScrolls: preview ? Math.max(0, y(preview) - vh) : null,
    firstShortcutTop: shortcuts.length ? y(shortcuts[0]) : null,
    statsTop: y(stats),
    shortcutCount: shortcuts.length,
    fold: inFold.sort((a, b) => a.top - b.top),
  };
})()`;

try {
  await waitForDevtools();
  const target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: "PUT" })).json();
  const client = connect(target.webSocketDebuggerUrl);
  await client.ready;
  await client.send("Page.enable");
  await client.send("Runtime.enable");

  for (const v of VIEWPORTS) {
    await client.send("Emulation.setDeviceMetricsOverride", {
      width: v.w, height: v.h, deviceScaleFactor: 1, mobile: v.w < 700,
    });
    await client.send("Page.navigate", { url: BASE + "/" });
    await sleep(4000);

    const res = await client.send("Runtime.evaluate", { expression: PROBE, returnByValue: true });
    const d = res.result?.result?.value;
    if (!d) { console.log(`\n### ${v.name} — probe failed`); continue; }

    console.log(`\n${"=".repeat(72)}`);
    console.log(`### ${v.name}  ${v.w}x${v.h}`);
    console.log(`  page height      ${d.pageHeight}px  (${(d.pageHeight / d.vh).toFixed(1)} screens)`);
    console.log(`  h1 at            ${d.h1.top}px`);
    console.log(`  search form at   ${d.formTop}px`);
    console.log(`  primary button   ${d.primaryTop}px   "${d.primaryText}"`);
    console.log(`  first shortcut   ${d.firstShortcutTop}px  (${d.shortcutCount} chips)`);
    console.log(`  preview region   ${d.previewTop}px`);
    if (d.previewScrolls !== null) {
      console.log(`  -> preview needs ${d.previewScrolls}px of scrolling (${(d.previewScrolls / d.vh).toFixed(1)} screens)`);
    }
    console.log(`  stats block      ${d.statsTop}px`);
    console.log(`  visible without scrolling (${d.fold.length} items):`);
    for (const f of d.fold.slice(0, 18)) {
      console.log(`    +${String(f.top).padStart(4)}px ${f.tag.padEnd(7)} ${f.text ?? ""}`);
    }
  }

  client.close();
} catch (error) {
  console.error(error);
} finally {
  chrome.kill();
}
