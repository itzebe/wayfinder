/**
 * Country-only recovery.
 *
 * A bare country name ("Iceland") is not a coverage gap — the global forecast
 * covers Iceland — so the page must ask for a place inside it rather than
 * declaring that nothing serves them. This drives the real interface: open the
 * country-only page, type a city, submit, and confirm the situation page renders
 * live data for that city.
 *
 * Run with: node tests/country-only.mjs [baseUrl]
 */
import { spawn } from "node:child_process";

const BASE = process.argv[2] ?? "http://localhost:3000";
const PORT = 9336;

const chrome = spawn(
  "/usr/bin/chromium",
  ["--headless=new", "--no-sandbox", "--disable-gpu", `--remote-debugging-port=${PORT}`, "about:blank"],
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

async function clickReal(client, locateExpression) {
  await evaluate(
    client,
    `(() => {
      const el = ${locateExpression};
      if (el) el.scrollIntoView({ block: "center", behavior: "instant" });
      return true;
    })()`,
  );
  await sleep(150);
  const box = await evaluate(
    client,
    `(() => {
      const el = ${locateExpression};
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    })()`,
  );
  if (!box) throw new Error(`Element not found: ${locateExpression}`);
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

async function waitFor(client, locateExpression, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await evaluate(client, `Boolean(${locateExpression})`)) return true;
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

  // --- The country-only page must ask for a place, not report a verdict ---
  await client.send("Page.navigate", {
    url: `${BASE}/assist?category=weather&location=Iceland&locale=en`,
  });
  await waitFor(client, `Boolean(document.querySelector("h1"))`);

  const prompt = await evaluate(
    client,
    `(() => {
      const h1 = document.querySelector("h1");
      const body = document.body.innerText;
      return {
        heading: h1 ? h1.textContent.trim() : null,
        hasField: Boolean(document.querySelector("input#assist-place, input[placeholder]")),
        claimsNoCoverage: /no (live )?source covers/i.test(body),
        falseVerdict: /(not covered|no data|unavailable)/i.test(body),
      };
    })()`,
  );
  console.log("country-only prompt:", JSON.stringify(prompt));

  check(/Iceland/.test(prompt.heading || ""), "the prompt does not name the country");
  check(prompt.hasField, "there is no field to enter a place");
  check(!prompt.claimsNoCoverage, "the page claims no source covers a country the forecast covers");
  check(!prompt.falseVerdict, "the page reports a coverage verdict instead of asking for a place");

  // --- Answering with a city must render the real situation page ----------
  await typeReal(client, `document.querySelector("input[placeholder]")`, "Reykjavik");
  await sleep(300);
  await clickReal(
    client,
    `[...document.querySelectorAll('button')].find(b => /check this place/i.test(b.textContent || ""))`,
  );

  await waitFor(client, `location.search.includes("Reykjavik")`, 25000);
  await waitFor(client, `Boolean(document.querySelector("h1"))`, 25000);
  await sleep(3000);

  const page = await evaluate(
    client,
    `(() => {
      const body = document.body.innerText;
      const links = [...document.querySelectorAll('a[href^="http"]')].map(a => a.getAttribute("href"));
      return {
        url: location.pathname + location.search,
        headline: document.querySelector("h1")?.textContent ?? null,
        hasSources: /official sources/i.test(body),
        stillAsking: /where in iceland/i.test(body),
        place: /Reykjavik/.test(body),
        externalLinks: links.length,
      };
    })()`,
  );
  console.log("after answering with a city:", JSON.stringify(page, null, 2));

  check(page.url.includes("Reykjavik"), `the URL does not name the city (${page.url})`);
  check(!page.stillAsking, "the place prompt is still shown after a city was given");
  check(page.hasSources, "no official sources panel on the recovered page");
  check(page.place, "the city the user gave is missing from the page");
  check(page.externalLinks > 0, "no source link present");

  console.log(
    failures.length === 0
      ? "\nCountry-only recovery passes."
      : `\nFailures:\n- ${failures.join("\n- ")}`,
  );
  process.exitCode = failures.length === 0 ? 0 : 1;

  client.close();
  await fetch(`http://127.0.0.1:${PORT}/json/close/${target.id}`);
} finally {
  chrome.kill();
}
