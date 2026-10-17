/**
 * Screenshot capture for visual review.
 *
 * Drives headless Chromium over the DevTools protocol and writes full-page
 * PNGs so the rendered interface can be inspected rather than inferred from
 * markup. Optionally runs a script inside the page before capturing, which is
 * how the flow screens (which need interaction) get captured.
 *
 * Usage: node tests/shots.mjs [baseUrl] [outDir]
 */
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = process.argv[2] ?? "http://localhost:3000";
const OUT = process.argv[3] ?? ".agent_tmp/shots";
const PORT = 9341;

mkdirSync(OUT, { recursive: true });

const SHOTS = [
  { name: "01-landing-desktop", path: "/", w: 1440, h: 900, full: true },
  { name: "02-landing-mobile", path: "/", w: 390, h: 844, full: true },
  { name: "03-landing-320", path: "/", w: 320, h: 700, full: true },
  { name: "04-help-desktop", path: "/help", w: 1440, h: 900, full: true },
  { name: "05-help-mobile", path: "/help", w: 390, h: 844, full: true },
  { name: "06-support-mobile", path: "/support", w: 390, h: 844, full: true },
  { name: "07-limitations-desktop", path: "/limitations", w: 1440, h: 900, full: true },
  { name: "08-accessibility-desktop", path: "/accessibility", w: 1440, h: 900, full: true },
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

try {
  await waitForDevtools();
  const target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: "PUT" })).json();
  const client = connect(target.webSocketDebuggerUrl);
  await client.ready;
  await client.send("Page.enable");
  await client.send("Runtime.enable");

  for (const shot of SHOTS) {
    await client.send("Emulation.setDeviceMetricsOverride", {
      width: shot.w, height: shot.h, deviceScaleFactor: 1, mobile: shot.w < 700,
    });
    await client.send("Page.navigate", { url: BASE + shot.path });
    await sleep(shot.wait ?? 3500);

    const metrics = await client.send("Page.getLayoutMetrics");
    const content = metrics.result.cssContentSize;
    const height = shot.full ? Math.min(Math.ceil(content.height), 12000) : shot.h;

    const result = await client.send("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: shot.full,
      clip: { x: 0, y: 0, width: shot.w, height, scale: 1 },
    });
    if (result.result?.data) {
      writeFileSync(`${OUT}/${shot.name}.png`, Buffer.from(result.result.data, "base64"));
      console.log(`  ${shot.name}  ${shot.w}x${height}`);
    } else {
      console.log(`  ${shot.name}  FAILED`);
    }
  }

  client.close();
} catch (error) {
  console.error(error);
} finally {
  chrome.kill();
}
