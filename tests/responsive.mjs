/**
 * Responsive overflow audit.
 *
 * Drives headless Chromium over the DevTools protocol at the widths named in
 * the brief and reports any element that extends past the viewport, so layout
 * regressions are caught from the rendered page rather than from markup.
 *
 * Run with: node tests/responsive.mjs [baseUrl]
 */
import { spawn } from "node:child_process";

const BASE = process.argv[2] ?? "http://localhost:3000";
const WIDTHS = [320, 360, 390, 768, 1024, 1440];
const PATHS = [
  "/",
  "/support",
  "/assist?category=metro&location=London%2C%20United%20Kingdom",
  // A place covered only by the official-source directory: it must stay
  // readable at every width even though no live provider answers for it.
  "/assist?category=weather&location=Tokyo%2C%20Japan",
  // A name that is a real city in more than one country: the disambiguation
  // prompt is a distinct surface and must not overflow on a phone.
  "/assist?category=metro&location=San%20Jose",
  // A bare country name: the "where in …?" prompt is another distinct surface,
  // and its inline field plus submit button must not overflow on a phone.
  "/assist?category=weather&location=Iceland",
];
const PORT = 9333;

const chrome = spawn(
  "/usr/bin/chromium",
  [
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    "--hide-scrollbars",
    `--remote-debugging-port=${PORT}`,
    "about:blank",
  ],
  { stdio: "ignore" },
);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForDevtools() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (response.ok) return;
    } catch {
      // Chromium is not listening yet.
    }
    await sleep(250);
  }
  throw new Error("Chromium did not expose the DevTools endpoint");
}

function connect(wsUrl) {
  const socket = new WebSocket(wsUrl);
  const pending = new Map();
  let nextId = 0;

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    const entry = pending.get(message.id);
    if (entry) {
      pending.delete(message.id);
      entry.resolve(message.result);
    }
  });

  const ready = new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve);
    socket.addEventListener("error", reject);
  });

  const send = (method, params = {}) =>
    new Promise((resolve) => {
      const id = (nextId += 1);
      pending.set(id, { resolve });
      socket.send(JSON.stringify({ id, method, params }));
    });

  return { ready, send, close: () => socket.close() };
}

const MEASURE = `(() => {
  const doc = document.documentElement;
  const limit = doc.clientWidth;
  const offenders = [];
  for (const el of document.querySelectorAll("body *")) {
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    const over = Math.round(rect.right - limit);
    const under = Math.round(-rect.left);
    if (over > 1 || under > 1) {
      offenders.push({
        over: Math.max(over, under),
        tag: el.tagName.toLowerCase(),
        cls: String(el.className || "").slice(0, 70),
      });
    }
  }
  offenders.sort((a, b) => b.over - a.over);
  return {
    scrollWidth: doc.scrollWidth,
    clientWidth: limit,
    overflow: doc.scrollWidth - limit,
    offenders: offenders.slice(0, 3),
  };
})()`;

async function audit(path, width) {
  const target = await (
    await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: "PUT" })
  ).json();
  const client = connect(target.webSocketDebuggerUrl);
  await client.ready;

  await client.send("Emulation.setDeviceMetricsOverride", {
    width,
    height: 900,
    deviceScaleFactor: 1,
    mobile: width < 768,
  });
  await client.send("Page.enable");

  // The situation page reads the traveller's own stored request. Seed it the
  // same way the flow would, so this audits the real page rather than the
  // empty state.
  const params = new URLSearchParams(path.includes("?") ? path.split("?")[1] : "");
  if (params.get("category")) {
    await client.send("Page.navigate", { url: `${BASE}/assist` });
    await sleep(600);
    await client.send("Runtime.evaluate", {
      expression: `localStorage.setItem("wayfinder.assistRequest.v1", JSON.stringify({
        category: ${JSON.stringify(params.get("category"))},
        location: ${JSON.stringify(params.get("location"))},
        locale: "en",
      }))`,
    });
  }

  await client.send("Page.navigate", { url: `${BASE}${path}` });
  await sleep(2600);

  const result = await client.send("Runtime.evaluate", {
    expression: MEASURE,
    returnByValue: true,
  });

  client.close();
  await fetch(`http://127.0.0.1:${PORT}/json/close/${target.id}`);
  return result.result.value;
}

try {
  await waitForDevtools();
  let failures = 0;

  for (const path of PATHS) {
    for (const width of WIDTHS) {
      const report = await audit(path, width);
      const bad = report.overflow > 1;
      if (bad) failures += 1;
      const label = bad ? "OVERFLOW" : "ok";
      console.log(
        `${label.padEnd(8)} ${String(width).padStart(4)}px  ${path}  ` +
          `(scroll ${report.scrollWidth} / client ${report.clientWidth})`,
      );
      if (bad) {
        for (const offender of report.offenders) {
          console.log(`           +${offender.over}px <${offender.tag} class="${offender.cls}">`);
        }
      }
    }
  }

  console.log(failures === 0 ? "\nNo horizontal overflow at any tested width." : `\n${failures} width(s) overflow.`);
  process.exitCode = failures === 0 ? 0 : 1;
} finally {
  chrome.kill();
}
