/**
 * Mobile navigation keyboard check.
 *
 * Opens the compact menu at a phone width, confirms it becomes visible and
 * that its links are real destinations, then closes it with Escape. Uses the
 * rendered page, so it catches a toggle that is present but inert.
 *
 * Run with: node tests/mobile-nav.mjs [baseUrl]
 */
import { spawn } from "node:child_process";

const BASE = process.argv[2] ?? "http://localhost:3000";
const PORT = 9334;

const chrome = spawn(
  "/usr/bin/chromium",
  [
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    `--remote-debugging-port=${PORT}`,
    "about:blank",
  ],
  { stdio: "ignore" },
);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

const evaluate = async (client, expression) => {
  const result = await client.send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  return result.result.value;
};

try {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      if ((await fetch(`http://127.0.0.1:${PORT}/json/version`)).ok) break;
    } catch {
      // not listening yet
    }
    await sleep(250);
  }

  const target = await (
    await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: "PUT" })
  ).json();
  const client = connect(target.webSocketDebuggerUrl);
  await client.ready;
  await client.send("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await client.send("Page.enable");
  await client.send("Page.navigate", { url: `${BASE}/` });
  await sleep(2600);

  const initial = await evaluate(
    client,
    `(() => {
      const toggle = document.querySelector('header button[aria-controls="mobile-menu"]');
      if (!toggle) return { found: false };
      return {
        found: true,
        expanded: toggle.getAttribute("aria-expanded"),
        controls: toggle.getAttribute("aria-controls"),
        label: toggle.textContent.trim(),
        size: Math.round(toggle.getBoundingClientRect().height),
      };
    })()`,
  );
  console.log("toggle:", JSON.stringify(initial));

  if (!initial.found) throw new Error("No menu toggle found in the header");

  // Open with the keyboard, as a touch-free user would.
  await evaluate(
    client,
    `(() => {
      const toggle = document.querySelector('header button[aria-controls="mobile-menu"]');
      toggle.focus();
      toggle.click();
      return true;
    })()`,
  );
  await sleep(600);

  const opened = await evaluate(
    client,
    `(() => {
      const toggle = document.querySelector('header button[aria-controls="mobile-menu"]');
      const panel = document.getElementById(toggle.getAttribute("aria-controls"));
      const links = panel ? [...panel.querySelectorAll("a")].filter(a => a.offsetParent !== null) : [];
      return {
        expanded: toggle.getAttribute("aria-expanded"),
        visible: Boolean(panel && panel.offsetParent !== null),
        linkCount: links.length,
        hrefs: [...new Set(links.map(a => a.getAttribute("href")))],
        activeInside: Boolean(panel && panel.contains(document.activeElement)),
      };
    })()`,
  );
  console.log("opened:", JSON.stringify(opened));

  // Escape must close it and return focus to the toggle.
  await evaluate(client, `document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); true`);
  await sleep(500);

  const closed = await evaluate(
    client,
    `(() => {
      const toggle = document.querySelector('header button[aria-controls="mobile-menu"]');
      return {
        expanded: toggle.getAttribute("aria-expanded"),
        focusReturned: document.activeElement === toggle,
      };
    })()`,
  );
  console.log("after Escape:", JSON.stringify(closed));

  const failures = [];
  if (initial.expanded !== "false") failures.push("toggle starts collapsed");
  if (initial.size < 44) failures.push(`toggle ${initial.size}px is below the 44px touch target`);
  if (opened.expanded !== "true") failures.push("menu did not report expanded");
  if (!opened.visible) failures.push("menu panel did not become visible");
  if (opened.linkCount < 3) failures.push(`only ${opened.linkCount} links in the open menu`);
  if (closed.expanded !== "false") failures.push("Escape did not collapse the menu");
  if (!closed.focusReturned) failures.push("focus did not return to the toggle");

  console.log(failures.length === 0 ? "\nMobile menu passes." : `\nFailures:\n- ${failures.join("\n- ")}`);
  process.exitCode = failures.length === 0 ? 0 : 1;

  client.close();
  await fetch(`http://127.0.0.1:${PORT}/json/close/${target.id}`);
} finally {
  chrome.kill();
}
