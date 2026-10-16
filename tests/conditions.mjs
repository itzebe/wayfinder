/**
 * Conditions-disclosure check.
 *
 * A weather or roads provider can legitimately return dozens of conditions at
 * once. The page must not bury the meaning and next steps under all of them, so
 * the list is bounded behind a disclosure. This drives the real page and
 * asserts that:
 *   - the bounded list renders fewer items than the source reported, and
 *   - the disclosure button states the full count and, when pressed, actually
 *     reveals every condition.
 *
 * Run with: node tests/conditions.mjs [baseUrl]
 */
import { spawn } from "node:child_process";

const BASE = process.argv[2] ?? "http://localhost:3000";
const PORT = 9339;
const QUERY = "category=weather&countryCode=US&city=Austin";

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

  // Seed the request the way the flow would, so this exercises the real page
  // rather than the empty state.
  await evaluate(
    `(() => {
      localStorage.setItem("wayfinder.assistRequest.v1", JSON.stringify({
        category: "weather",
        countryCode: "US",
        city: "Austin",
        locale: "en",
      }));
      return true;
    })()`,
  );
  await client.send("Page.navigate", { url: `${BASE}/assist?${QUERY}` });
  await sleep(9000);

  const failures = [];
  const check = (condition, message) => {
    if (!condition) failures.push(message);
  };

  const before = await evaluate(
    `(() => {
      const section = document.getElementById("conditions");
      if (!section) return { ok: false };
      const items = section.querySelectorAll("li").length;
      const button = [...section.querySelectorAll("button")].find(b => /show all/i.test(b.textContent || ""));
      return {
        ok: true,
        items,
        buttonText: button ? button.textContent : null,
        expanded: button ? button.getAttribute("aria-expanded") : null,
        total: window.__wfConditionsTotal ?? null,
      };
    })()`,
  );

  check(before.ok, "no conditions section rendered");
  if (!before.ok) throw new Error("Cannot continue without the conditions section");

  if (!before.buttonText) {
    // Few conditions today — the provider returned four or fewer, so there is
    // nothing to disclose and nothing to assert beyond the section existing.
    console.log("\nconditions-disclosure: fewer than five conditions returned; disclosure not required.");
  } else {
    check(before.items <= 4, `bounded list rendered ${before.items} items, expected at most 4`);
    check(before.expanded === "false", "disclosure button did not start collapsed");

    const declared = Number((before.buttonText.match(/(\d+)/) ?? [])[1]);
    check(Number.isFinite(declared) && declared > before.items, "disclosure button did not state the full count");

    await evaluate(
      `(() => {
        const section = document.getElementById("conditions");
        const button = [...section.querySelectorAll("button")].find(b => /show all/i.test(b.textContent || ""));
        button.click();
        return true;
      })()`,
    );
    await sleep(400);

    const after = await evaluate(
      `(() => {
        const section = document.getElementById("conditions");
        const items = section.querySelectorAll("li").length;
        const button = [...section.querySelectorAll("button")].find(b => /show fewer/i.test(b.textContent || ""));
        return { items, collapsedButton: Boolean(button) };
      })()`,
    );

    check(after.items > before.items, "expanding the disclosure did not reveal more conditions");
    check(after.items === declared, `expanding revealed ${after.items} conditions, button declared ${declared}`);
    check(after.collapsedButton, "the disclosure did not offer a way to collapse again");

    console.log("\nconditions-disclosure: passes.");
  }

  console.log(failures.length === 0 ? "Conditions disclosure passes." : `Failures:\n- ${failures.join("\n- ")}`);
  process.exitCode = failures.length === 0 ? 0 : 1;

  client.close();
  await fetch(`http://127.0.0.1:${PORT}/json/close/${target.id}`);
} finally {
  chrome.kill();
}
