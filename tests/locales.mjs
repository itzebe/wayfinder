/**
 * Locale rebuild check.
 *
 * Loads the situation page once, then drives the in-page language control
 * through every supported language. For each one it asserts that the headline
 * actually changed and that the operational place name survived translation, so
 * a locale that only re-renders the chrome is caught.
 *
 * Run with: node tests/locales.mjs [baseUrl]
 */
import { spawn } from "node:child_process";

const BASE = process.argv[2] ?? "http://localhost:3000";
const PORT = 9338;
const LOCALES = ["en", "es", "fr", "de", "pt", "ar", "zh", "ja", "hi"];
const QUERY = "category=metro&countryCode=GB&city=London";

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
    width: 1280,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await client.send("Page.enable");

  const evaluate = async (expression) =>
    (await client.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }))
      .result.value;

  await client.send("Page.navigate", { url: `${BASE}/assist?${QUERY}` });
  await sleep(1200);

  // The situation page reads the traveller's own stored request. Seed it the
  // same way the flow would, so this test exercises the real page rather than
  // the empty state.
  await evaluate(
    `(() => {
      localStorage.setItem("wayfinder.assistRequest.v1", JSON.stringify({
        category: "metro",
        countryCode: "GB",
        city: "London",
        locale: "en",
      }));
      return true;
    })()`,
  );
  await client.send("Page.navigate", { url: `${BASE}/assist?${QUERY}` });
  await sleep(8000);

  const seen = new Map();
  const failures = [];

  for (const locale of LOCALES) {
    await evaluate(
      `(() => {
        const select = document.getElementById("assist-view-locale");
        select.value = ${JSON.stringify(locale)};
        select.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      })()`,
    );
    await sleep(6500);

    const snapshot = await evaluate(
      `(() => {
        const h1 = document.querySelector("h1");
        return {
          dir: document.documentElement.dir,
          lang: document.documentElement.lang,
          headline: h1 ? h1.textContent : null,
          body: document.body.innerText.slice(0, 4000),
        };
      })()`,
    );

    const repeated = [...seen.entries()].find(([, value]) => value === snapshot.headline);
    if (repeated) {
      failures.push(`${locale} produced the same headline as ${repeated[0]}`);
    }
    if (locale === "ar" && snapshot.dir !== "rtl") failures.push("Arabic did not switch the document to RTL");
    if (locale !== "ar" && snapshot.dir !== "ltr") failures.push(`${locale} left the document in ${snapshot.dir}`);
    if (!snapshot.body.includes("London")) failures.push(`${locale} lost the place name London`);
    if (!snapshot.body.includes("Transport for London")) {
      failures.push(`${locale} lost the official source name`);
    }

    seen.set(locale, snapshot.headline);
    console.log(
      `${locale.padEnd(3)} dir=${snapshot.dir.padEnd(3)} ${(snapshot.headline ?? "").slice(0, 78)}`,
    );
  }

  const distinct = new Set(seen.values());
  if (distinct.size < LOCALES.length) {
    failures.push(`only ${distinct.size} distinct headlines across ${LOCALES.length} locales`);
  }

  console.log(failures.length === 0 ? "\nAll locales rebuild the situation page." : `\nFailures:\n- ${failures.join("\n- ")}`);
  process.exitCode = failures.length === 0 ? 0 : 1;

  client.close();
  await fetch(`http://127.0.0.1:${PORT}/json/close/${target.id}`);
} finally {
  chrome.kill();
}
