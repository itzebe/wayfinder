/**
 * Keyboard-only completion of the country-only place prompt.
 *
 * A bare country name ("Iceland") names no place to look up, so WAYFINDER asks
 * for a city before it can report anything. That prompt is the one screen a
 * traveller reaches when their answer was too coarse, so it has to be usable
 * without a mouse: reachable by Tab, visibly focused, typeable, submittable with
 * Enter, and followed by a real situation page.
 *
 * This drives the rendered interface over the DevTools protocol and asserts the
 * keyboard path end to end. Measuring the focus ring from CSS would not be
 * enough — a ring can be present in the stylesheet and still be unreachable — so
 * every step here is a real key event and every assertion reads the resulting
 * state.
 *
 * It also guards the two honesty rules the prompt depends on:
 *
 *   - The prompt must appear without spending a POST /api/assist round trip. The
 *     country-level coverage is published, so the page already knows no source
 *     can answer "Iceland"; building the situation first would burn 0.3-1.2s in
 *     production to learn what we knew.
 *   - Germany, which DWD answers nationwide, must NOT be preempted. Asking a
 *     traveller for a city when a source can already answer would hide a real
 *     page behind an unnecessary question.
 *
 * Requests are counted from CDP `Network` events rather than by patching
 * `window.fetch`. A patched counter is destroyed by the very navigation it is
 * meant to observe, so it silently reads zero and the guard proves nothing.
 *
 * Run with: node tests/keyboard-place-prompt.mjs [baseUrl]
 */
import { spawn } from "node:child_process";

const BASE = process.argv[2] ?? "http://localhost:3000";
const PORT = 9340;

const chrome = spawn(
  "/usr/bin/chromium",
  ["--headless=new", "--no-sandbox", "--disable-gpu", `--remote-debugging-port=${PORT}`, "about:blank"],
  { stdio: "ignore" },
);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function connect(wsUrl) {
  const socket = new WebSocket(wsUrl);
  const pending = new Map();
  const events = [];
  let nextId = 0;
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.method) events.push(message);
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
  return { ready, send, events, close: () => socket.close() };
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
  await client.send("Network.enable");
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

async function waitFor(client, locateExpression, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await evaluate(client, `Boolean(${locateExpression})`)) return true;
    await sleep(150);
  }
  throw new Error(`Timed out waiting for: ${locateExpression}`);
}

/** Every POST to /api/assist seen since the page was opened. */
function assistPosts(client) {
  return client.events
    .filter(
      (event) =>
        event.method === "Network.requestWillBeSent" &&
        event.params.request.method === "POST" &&
        event.params.request.url.includes("/api/assist"),
    )
    .map((event) => event.params.request.url);
}

/** Wait until the page's own catalogue fetch has come back. */
async function waitForCatalogue(client, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const seen = client.events.some(
      (event) =>
        event.method === "Network.responseReceived" &&
        event.params.response.url.includes("/api/assist") &&
        event.params.type === "Fetch",
    );
    if (seen) return true;
    await sleep(150);
  }
  throw new Error("the catalogue never loaded, so the shortcut could not be exercised");
}

/** One realistic keystroke, so the input receives a real key event. */
async function pressKey(client, char) {
  const code = char.toUpperCase();
  await client.send("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: char,
    code: /^[a-z]$/i.test(char) ? `Key${code}` : undefined,
    windowsVirtualKeyCode: code.charCodeAt(0),
    text: char,
  });
  await client.send("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: char,
    code: /^[a-z]$/i.test(char) ? `Key${code}` : undefined,
    windowsVirtualKeyCode: code.charCodeAt(0),
  });
}

async function pressTab(client, { shift = false } = {}) {
  const modifiers = shift ? 8 : 0;
  for (const type of ["keyDown", "keyUp"]) {
    await client.send("Input.dispatchKeyEvent", {
      type,
      key: "Tab",
      code: "Tab",
      windowsVirtualKeyCode: 9,
      modifiers,
    });
  }
}

/** Enter must carry `text` to activate the focused control, not just a code. */
async function pressEnter(client) {
  await client.send("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "Enter",
    code: "Enter",
    windowsVirtualKeyCode: 13,
    text: "\r",
  });
  await client.send("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "Enter",
    code: "Enter",
    windowsVirtualKeyCode: 13,
  });
}

/**
 * Tab until `match` describes the focused element, or fail.
 *
 * Returns the number of stops, so a test can report how far the control was
 * from the top of the page rather than only that it was reachable.
 */
async function tabUntil(client, match, { shift = false, limit = 60 } = {}) {
  for (let stop = 1; stop <= limit; stop += 1) {
    await pressTab(client, { shift });
    await sleep(40);
    if (await evaluate(client, `Boolean(${match})`)) return stop;
  }
  throw new Error(`could not reach ${match} with ${limit} Tab stops`);
}

/** The focus indicator on the focused element, plus the documented token. */
const FOCUS_READING = `(() => {
  const el = document.activeElement;
  if (!el) return null;
  const s = getComputedStyle(el);
  const token = getComputedStyle(document.documentElement).getPropertyValue("--color-accent-600").trim();
  const probe = document.createElement("span");
  probe.style.color = token;
  document.body.appendChild(probe);
  const accent = getComputedStyle(probe).color;
  probe.remove();
  return {
    tag: el.tagName,
    name: (el.textContent || el.value || "").trim().slice(0, 40),
    outlineStyle: s.outlineStyle,
    outlineWidth: s.outlineWidth,
    outlineColor: s.outlineColor,
    accent,
  };
})()`;

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

  // --- 1. Open the flow and enter a bare country, by keyboard only ----------
  await client.send("Page.navigate", { url: `${BASE}/support?category=weather` });
  await waitFor(client, `document.querySelector("input#location")`);
  // The shortcut only exists once the published coverage has arrived. Waiting for
  // the page's own catalogue response makes the zero-POST assertion meaningful:
  // submitting earlier would fall back to the engine by design, not by defect.
  await waitForCatalogue(client);
  await sleep(300);

  const stopsToLocation = await tabUntil(
    client,
    `document.activeElement?.id === "location"`,
  );
  console.log(`reached the location field after ${stopsToLocation} Tab stop(s)`);
  await tabUntil(client, `document.activeElement?.id === "assist-locale"`);
  await tabUntil(client, `document.activeElement?.id === "location"`, { shift: true });

  for (const char of "Iceland") await pressKey(client, char);
  await sleep(150);
  const typedCountry = await evaluate(client, `document.querySelector("input#location").value`);
  check(typedCountry === "Iceland", `the country was not typed into the field (got ${JSON.stringify(typedCountry)})`);

  // Submit with Enter from the field, which is how a keyboard user submits a
  // form whose submit control is the last stop.
  const postsBeforeSubmit = assistPosts(client).length;
  await pressEnter(client);

  // --- 2. The prompt must arrive, and must not cost a round trip -----------
  await waitFor(
    client,
    `[...document.querySelectorAll("button")].some(b => /check this place/i.test(b.textContent || ""))`,
    25000,
  );
  await sleep(400);

  const postsForPrompt = assistPosts(client).length - postsBeforeSubmit;
  console.log(`POSTs before the prompt appeared: ${postsForPrompt}`);
  check(
    postsForPrompt === 0,
    `the prompt waited for ${postsForPrompt} /api/assist round trip(s) it did not need`,
  );

  const prompt = await evaluate(
    client,
    `(() => {
      const body = document.body.innerText;
      return {
        heading: document.querySelector("h1")?.textContent.trim() ?? null,
        fields: document.querySelectorAll("form input").length,
        claimsNoCoverage: /no (live )?source covers/i.test(body),
        falseVerdict: /(not covered|no data|unavailable)/i.test(body),
      };
    })()`,
  );
  console.log("prompt:", JSON.stringify(prompt));
  check(/Where in Iceland/i.test(prompt.heading || ""), `the prompt does not name the country (${prompt.heading})`);
  check(prompt.fields === 1, `expected one field in the prompt, found ${prompt.fields}`);
  check(!prompt.claimsNoCoverage, "the page claims no source covers a country the forecast covers");
  check(!prompt.falseVerdict, "the page reports a coverage verdict instead of asking for a place");

  // --- 3. Reach the field, then the submit control, by keyboard ------------
  const stopsToField = await tabUntil(client, `document.activeElement?.tagName === "INPUT"`);
  console.log(`reached the place field after ${stopsToField} Tab stop(s) from the top`);

  const fieldFocus = await evaluate(client, FOCUS_READING);
  console.log("field focus:", JSON.stringify(fieldFocus));
  check(fieldFocus?.outlineStyle === "solid", `the field's focus ring is not solid (${fieldFocus?.outlineStyle})`);
  check(fieldFocus?.outlineWidth === "2px", `the field's focus ring is not 2px (${fieldFocus?.outlineWidth})`);
  check(
    fieldFocus?.outlineColor === fieldFocus?.accent,
    `the field's focus ring is not the accent token (${fieldFocus?.outlineColor} vs ${fieldFocus?.accent})`,
  );

  // While the field is empty the submit control is disabled, so the browser
  // correctly skips it in the Tab order. Assert that, because a control that is
  // focusable while it cannot be used is its own defect.
  await pressTab(client);
  await sleep(120);
  const whileEmpty = await evaluate(client, FOCUS_READING);
  console.log("next stop while empty:", JSON.stringify(whileEmpty));
  check(
    !/check this place/i.test(whileEmpty?.name || ""),
    "the disabled submit control was focusable before a city was given",
  );

  // Back to the field, then type — all with the keyboard.
  await pressTab(client, { shift: true });
  await sleep(120);
  const backOnField = await evaluate(client, `document.activeElement?.tagName === "INPUT"`);
  check(backOnField, "Shift+Tab did not return focus to the place field");

  for (const char of "Reykjavik") await pressKey(client, char);
  await sleep(200);
  const typedCity = await evaluate(client, `document.activeElement?.value ?? ""`);
  check(typedCity === "Reykjavik", `the city was not typed into the focused field (got ${JSON.stringify(typedCity)})`);

  const submitEnabled = await evaluate(
    client,
    `[...document.querySelectorAll("form button[type=submit]")].every(b => !b.disabled)`,
  );
  check(submitEnabled, "the submit control stayed disabled after a city was typed");

  // The submit control must now be the next stop, and must show a ring too.
  await pressTab(client);
  await sleep(120);
  const submitFocus = await evaluate(client, FOCUS_READING);
  console.log("submit focus:", JSON.stringify(submitFocus));
  check(
    /check this place/i.test(submitFocus?.name || ""),
    `Tab did not move from the field to the submit control (landed on ${JSON.stringify(submitFocus?.name)})`,
  );
  check(submitFocus?.outlineStyle === "solid", `the submit control's focus ring is not solid (${submitFocus?.outlineStyle})`);
  check(submitFocus?.outlineWidth === "2px", `the submit control's focus ring is not 2px (${submitFocus?.outlineWidth})`);
  check(
    submitFocus?.outlineColor === submitFocus?.accent,
    `the submit control's focus ring is not the accent token (${submitFocus?.outlineColor} vs ${submitFocus?.accent})`,
  );

  // Enter on the focused submit control completes the form.
  await pressEnter(client);

  // --- 4. The keyboard journey must land on the real situation page --------
  await waitFor(client, `location.search.includes("Reykjavik")`, 25000);
  await waitFor(
    client,
    `Boolean(document.querySelector("h1")) && /official sources/i.test(document.body.innerText)`,
    25000,
  );
  await sleep(500);

  const result = await evaluate(
    client,
    `(() => {
      const body = document.body.innerText;
      const links = [...document.querySelectorAll('a[href^="http"]')].map(a => a.getAttribute("href"));
      return {
        url: location.pathname + location.search,
        heading: document.querySelector("h1")?.textContent.trim() ?? null,
        stillAsking: /where in iceland/i.test(body),
        hasSources: /official sources/i.test(body),
        namesCity: /Reykjavik/i.test(body),
        externalLinks: links.length,
      };
    })()`,
  );
  console.log("after submitting with Enter:", JSON.stringify(result, null, 2));
  check(result.url.includes("Reykjavik"), `the URL does not name the city (${result.url})`);
  check(!result.stillAsking, "the place prompt is still shown after a city was submitted");
  check(result.hasSources, "the recovered page has no official sources panel");
  check(result.namesCity, "the city the traveller gave is missing from the page");
  check(result.externalLinks > 0, "the recovered page carries no source link");

  // --- 5. Germany must still reach its real page, not the prompt ----------
  // DWD answers Germany nationwide, so a place is not needed. Preempting it
  // would hide a real page behind a question the traveller cannot improve.
  const postsBeforeGermany = assistPosts(client).length;
  await client.send("Page.navigate", { url: `${BASE}/assist?category=weather&location=Germany&locale=en` });
  await waitFor(client, `Boolean(document.querySelector("h1"))`, 25000);
  await waitFor(
    client,
    `[...document.querySelectorAll("button")].some(b => /check this place/i.test(b.textContent || "")) || /official sources/i.test(document.body.innerText)`,
    25000,
  );
  await sleep(600);

  const germanyPosts = assistPosts(client).length - postsBeforeGermany;
  const germany = await evaluate(
    client,
    `(() => {
      const body = document.body.innerText;
      return {
        askedForPlace: [...document.querySelectorAll("button")].some(b => /check this place/i.test(b.textContent || "")),
        hasSources: /official sources/i.test(body),
        namesGermany: /German/i.test(body),
        falseVerdict: /no (live )?source covers/i.test(body),
      };
    })()`,
  );
  console.log("Germany (nationwide source):", JSON.stringify(germany));
  check(!germany.askedForPlace, "Germany was asked for a place even though a nationwide source answers it");
  check(germany.hasSources, "Germany's real page did not render its sources");
  check(germany.namesGermany, "Germany's page does not name the German source");
  check(!germany.falseVerdict, "Germany's page reports a false no-coverage verdict");
  // A real page means the engine was actually consulted; zero POSTs here would
  // mean the page was rendered from something other than a live query.
  check(germanyPosts > 0, "Germany's page rendered without ever consulting the engine");

  console.log(
    failures.length === 0
      ? "\nThe country-only prompt is completable by keyboard alone."
      : `\nFailures:\n- ${failures.join("\n- ")}`,
  );
  process.exitCode = failures.length === 0 ? 0 : 1;

  client.close();
  await fetch(`http://127.0.0.1:${PORT}/json/close/${target.id}`);
} finally {
  chrome.kill();
}
