/**
 * Hero breakdown — measures the vertical cost of each block inside the hero.
 *
 * The mobile hero is over two screens tall, so the fix depends on knowing which
 * block owns the height. Reports each child in order with its height, so the
 * expensive ones are identified rather than guessed.
 *
 * Usage: node tests/audit-hero.mjs [baseUrl]
 */
import { spawn } from "node:child_process";

const BASE = process.argv[2] ?? "http://localhost:3000";
const PORT = 9345;

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
  const hero = document.querySelector("main > section");
  const grid = hero.querySelector(".shell");
  const cols = [...grid.children];
  const describe = (el, depth) => {
    const r = el.getBoundingClientRect();
    const kids = depth < 2 ? [...el.children].map((c) => describe(c, depth + 1)) : [];
    return {
      tag: el.tagName, cls: (el.className || "").toString().slice(0, 40),
      h: Math.round(r.height), top: Math.round(r.top + scrollY),
      text: (el.textContent || "").trim().replace(/\\s+/g, " ").slice(0, 40),
      kids,
    };
  };
  return {
    heroHeight: Math.round(hero.getBoundingClientRect().height),
    viewport: window.innerHeight,
    columns: cols.map((c) => describe(c, 0)),
  };
})()`;

try {
  await waitForDevtools();
  const target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: "PUT" })).json();
  const client = connect(target.webSocketDebuggerUrl);
  await client.ready;
  await client.send("Page.enable");
  await client.send("Runtime.enable");

  for (const [w, h, name] of [[390, 844, "iPhone 14/15"], [1440, 900, "Desktop"]]) {
    await client.send("Emulation.setDeviceMetricsOverride", {
      width: w, height: h, deviceScaleFactor: 1, mobile: w < 700,
    });
    await client.send("Page.navigate", { url: BASE + "/" });
    await sleep(3800);

    const res = await client.send("Runtime.evaluate", { expression: PROBE, returnByValue: true });
    const d = res.result?.result?.value;
    if (!d) { console.log(`\n### ${name} — probe failed`); continue; }

    console.log(`\n${"=".repeat(70)}`);
    console.log(`### ${name} ${w}x${h} — hero is ${d.heroHeight}px = ` +
      `${(d.heroHeight / d.viewport).toFixed(2)} screens`);

    const walk = (node, depth) => {
      if (node.h < 8) return;
      console.log(`  ${"  ".repeat(depth)}${node.tag.padEnd(6)} h=${String(node.h).padStart(4)} ` +
        `@${String(node.top).padStart(5)}  ${node.text}`);
      for (const kid of node.kids) walk(kid, depth + 1);
    };
    for (const col of d.columns) walk(col, 0);
  }

  client.close();
} catch (error) {
  console.error(error);
} finally {
  chrome.kill();
}
