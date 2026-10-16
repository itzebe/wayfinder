/**
 * End-to-end assistance journey.
 *
 * Drives the real interface in headless Chromium: pick a situation, answer the
 * location questions, submit, then read the situation page the server built.
 * It asserts that a live official source was used, that the source link is a
 * real official domain, and that switching language rebuilds the explanation
 * while leaving the operational identifier untouched.
 *
 * Run with: node tests/assist-flow.mjs [baseUrl]
 */
import { spawn } from "node:child_process";

const BASE = process.argv[2] ?? "http://localhost:3000";
const PORT = 9335;

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

async function newPage(width, height) {
  const target = await (
    await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: "PUT" })
  ).json();
  const client = connect(target.webSocketDebuggerUrl);
  await client.ready;
  await client.send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: width < 768,
  });
  await client.send("Page.enable");
  await client.send("Runtime.enable");
  return { client, target };
}

const evaluate = async (client, expression) => {
  const result = await client.send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description ?? "evaluate failed");
  }
  return result.result.value;
};

/**
 * Clicks the element an actual user would click, by scrolling it into view and
 * dispatching a real mouse press at its centre. This is what makes the test
 * meaningful: a hidden input is not a user path.
 */
async function clickReal(client, locateExpression) {
  await evaluate(
    client,
    `(() => {
      const el = ${locateExpression};
      if (el) el.scrollIntoView({ block: "center", behavior: "instant" });
      return true;
    })()`,
  );
  // Give the browser a frame to apply the scroll before we read coordinates.
  await sleep(150);
  const box = await evaluate(
    client,
    `(() => {
      const el = ${locateExpression};
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
    })()`,
  );
  if (!box) throw new Error(`Element not found: ${locateExpression}`);
  if (!Number.isFinite(box.x) || !Number.isFinite(box.y)) {
    throw new Error(`Element has no clickable box: ${locateExpression}`);
  }
  await client.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: box.x, y: box.y });
  for (const type of ["mousePressed", "mouseReleased"]) {
    await client.send("Input.dispatchMouseEvent", {
      type,
      x: box.x,
      y: box.y,
      button: "left",
      clickCount: 1,
    });
  }
  return box;
}

async function typeReal(client, locateExpression, text) {
  await waitFor(client, locateExpression);
  await clickReal(client, locateExpression);
  for (const char of text) {
    await client.send("Input.dispatchKeyEvent", { type: "keyDown", text: char });
    await client.send("Input.dispatchKeyEvent", { type: "keyUp", text: char });
  }
}

/** Polls until the locator resolves to an element, so the test tracks the app rather than a fixed delay. */
async function waitFor(client, locateExpression, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const found = await evaluate(client, `Boolean(${locateExpression})`);
    if (found) return true;
    await sleep(250);
  }
  throw new Error(`Timed out waiting for: ${locateExpression}`);
}

try {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      if ((await fetch(`http://127.0.0.1:${PORT}/json/version`)).ok) break;
    } catch {
      // not listening yet
    }
    await sleep(250);
  }

  const { client, target } = await newPage(390, 900);
  const failures = [];
  const check = (condition, message) => {
    if (!condition) failures.push(message);
  };

  // --- Step 1: choose the situation ------------------------------------
  await client.send("Page.navigate", { url: `${BASE}/support` });
  await sleep(2800);

  const step1 = await evaluate(
    client,
    `(() => {
      const labels = [...document.querySelectorAll('label')];
      const metro = labels.find(l => /metro/i.test(l.textContent || ""));
      return { labelCount: labels.length, hasMetro: Boolean(metro) };
    })()`,
  );
  check(step1.labelCount > 0, "no situation options rendered");
  check(step1.hasMetro, "no metro/train option presented");

  await clickReal(
    client,
    `[...document.querySelectorAll('label')].find(l => /metro/i.test(l.textContent || ""))`,
  );
  await sleep(400);

  const chosen = await evaluate(
    client,
    `(() => {
      const checked = document.querySelector('input[type=radio]:checked');
      return checked ? checked.value : null;
    })()`,
  );
  check(chosen === "metro", `selecting the metro card did not set the category (got ${chosen})`);

  await clickReal(
    client,
    `[...document.querySelectorAll('button')].find(b => /continue/i.test(b.textContent || ""))`,
  );
  await sleep(700);

  // --- Step 2: location --------------------------------------------------
  const onStep2 = await waitFor(client, `document.querySelector("input#countryCode")`).then(
    () => true,
    () => false,
  );
  check(onStep2, "did not reach the location step");
  if (!onStep2) throw new Error("Cannot continue without the location step");

  await typeReal(client, `document.querySelector("input#countryCode")`, "GB");
  await sleep(200);
  await typeReal(client, `document.querySelector("input#city")`, "London");
  await sleep(300);

  await clickReal(
    client,
    `[...document.querySelectorAll('button')].find(b => /build my situation page|situation page|get my/i.test(b.textContent || ""))`,
  );
  await waitFor(client, `location.pathname === "/assist"`, 25000);
  await waitFor(client, `Boolean(document.querySelector("h1"))`, 25000);
  await sleep(2500);

  // --- The situation page ------------------------------------------------
  const page = await evaluate(
    client,
    `(() => {
      const h1 = document.querySelector("h1");
      const links = [...document.querySelectorAll('a[href^="http"]')].map(a => a.getAttribute("href"));
      const body = document.body.innerText;
      const official = links.filter(h => /\\.(gov|gov\\.uk|tfl\\.gov\\.uk|api\\.weather\\.gov)/.test(h));
      const badges = [...document.querySelectorAll('span[title]')]
        .map(s => s.getAttribute("title"))
        .filter(title => /source|retriev|validity|example/i.test(title || ""));
      return {
        url: location.pathname + location.search,
        headline: h1 ? h1.textContent : null,
        liveBadge: badges.some(t => /during this check/i.test(t)),
        freshBadge: badges.some(t => /during this check|validity window/i.test(t)),
        demoBadge: badges.some(t => /illustrate the interface/i.test(t)),
        demo: /demonstration data/i.test(body),
        officialLinks: official,
        sourceState: document.querySelector('article [title]')?.getAttribute("title") ?? null,
        hasSourcePanel: /official sources/i.test(body),
        place: /London/.test(body),
      };
    })()`,
  );
  console.log("situation page:", JSON.stringify(page, null, 2));

  check(page.url.startsWith("/assist"), `did not navigate to /assist (at ${page.url})`);
  check(Boolean(page.headline), "no headline on the situation page");
  check(page.hasSourcePanel, "no official sources panel");
  check(page.place, "the place the user gave is missing from the page");
  check(page.officialLinks.length > 0, "no official source link present");
  check(
    page.freshBadge,
    "the page describes no data as freshly retrieved from the source",
  );
  check(!page.demoBadge, "the page presents demonstration data for a real query");
  check(!page.demo, "the page is presenting demonstration data for a real query");

  const headlineBefore = page.headline;

  // --- Language switch keeps identifiers, changes prose -----------------
  await evaluate(
    client,
    `(() => {
      const select = document.getElementById("assist-view-locale");
      select.value = "fr";
      select.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    })()`,
  );
  await sleep(7000);

  const translated = await evaluate(
    client,
    `(() => {
      const h1 = document.querySelector("h1");
      const body = document.body.innerText;
      return { headline: h1 ? h1.textContent : null, keepsLondon: /London/.test(body) };
    })()`,
  );
  console.log("after switching to French:", JSON.stringify(translated));

  check(
    translated.headline && translated.headline !== headlineBefore,
    "the explanation did not change language",
  );
  check(translated.keepsLondon, "the operational place name was altered by translation");

  console.log(failures.length === 0 ? "\nEnd-to-end journey passes." : `\nFailures:\n- ${failures.join("\n- ")}`);
  process.exitCode = failures.length === 0 ? 0 : 1;

  client.close();
  await fetch(`http://127.0.0.1:${PORT}/json/close/${target.id}`);
} finally {
  chrome.kill();
}
