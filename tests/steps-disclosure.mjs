/**
 * Recommended-steps disclosure.
 *
 * Drives the real situation page and asserts the rule the brief states for the
 * action list: an action marked "do this now" is never behind the disclosure,
 * and the control itself is operable and correctly described for assistive tech.
 *
 * The failure this guards against is invisible to a fold-arithmetic unit test
 * unless the ordering is reproduced: a delay with a connection emits
 * now, now, soon, now, now, so the plan is not grouped by priority and slicing
 * at the first non-"now" step hides two immediate actions. The assertion that
 * catches it is set equality — the immediate actions visible while collapsed
 * must equal those present when expanded, because expanding must never be the
 * only way to reach an immediate action.
 *
 * Run with: node tests/steps-disclosure.mjs [baseUrl]
 */
import { spawn } from "node:child_process";

const BASE = process.argv[2] ?? "http://localhost:3000";
const PORT = 9352;

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

/**
 * Reads the rendered action list.
 *
 * `nowLabel` is the localised badge text, so the "immediate" classification comes
 * from what the traveller can read rather than from DOM order.
 */
const readList = (nowLabel) => `(() => {
  const section = document.getElementById("steps");
  if (!section) return { ok: false };
  const list = section.querySelector("ol");
  if (!list) return { ok: false };
  const re = new RegExp(${JSON.stringify(nowLabel)}, "i");
  const items = [...list.querySelectorAll("li")].map((li) => {
    const heading = li.querySelector("h3");
    return {
      title: heading ? heading.textContent.trim() : (li.textContent || "").trim().slice(0, 60),
      now: re.test(li.textContent || ""),
    };
  });
  const button = [...section.querySelectorAll("button")].find((b) => b.hasAttribute("aria-expanded"));
  return {
    ok: true,
    items,
    nowTitles: items.filter((i) => i.now).map((i) => i.title),
    button: button
      ? {
          text: button.textContent.trim(),
          expanded: button.getAttribute("aria-expanded"),
          controls: button.getAttribute("aria-controls"),
          tag: button.tagName,
          tabIndex: button.tabIndex,
        }
      : null,
    listId: list.id || null,
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

  const target = await (
    await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: "PUT" })
  ).json();
  const client = connect(target.webSocketDebuggerUrl);
  await client.ready;
  await client.send("Page.enable");
  await client.send("Runtime.enable");

  const evaluate = async (expression) =>
    (await client.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }))
      .result.value;

  const failures = [];
  const check = (condition, message) => {
    if (!condition) failures.push(message);
  };
  const sameSet = (a, b) => {
    const left = [...new Set(a)].sort();
    const right = [...new Set(b)].sort();
    return left.length === right.length && left.every((value, index) => value === right[index]);
  };

  async function loadSituation({ need, withConnection, locale = "en", width = 1280, height = 900 }) {
    await client.send("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: width < 700,
    });
    await client.send("Page.navigate", { url: `${BASE}/` });
    await sleep(700);

    const request = {
      need,
      flightNumber: "BA123",
      travelDate: new Date().toISOString().slice(0, 10),
      originAirport: "LHR",
      destinationAirport: "JFK",
      ...(withConnection
        ? { connectionAirport: "MAD", connectionFlightNumber: "IB6251", connectionMinutes: 55 }
        : {}),
      locale,
    };
    await evaluate(
      `window.localStorage.setItem("wayfinder.request.v1", ${JSON.stringify(JSON.stringify(request))})`,
    );
    await client.send("Page.navigate", { url: `${BASE}/situation?locale=${locale}` });

    for (let attempt = 0; attempt < 40; attempt += 1) {
      await sleep(1000);
      if (await evaluate(`Boolean(document.getElementById("steps"))`)) break;
    }
    await sleep(1200);
  }

  /** Activates the disclosure with a real key press, the way a keyboard user would. */
  async function pressKey(key, code, keyCode, text) {
    await evaluate(`document.querySelector('#steps button[aria-expanded]').focus()`);
    await client.send("Input.dispatchKeyEvent", {
      type: "keyDown", key, code,
      windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode, ...(text ? { text } : {}),
    });
    await client.send("Input.dispatchKeyEvent", {
      type: "keyUp", key, code,
      windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode, ...(text ? { text } : {}),
    });
    await sleep(500);
  }

  // --- the case that regressed: a delay with a connection --------------------
  await loadSituation({ need: "delayed", withConnection: true });

  const collapsed = await evaluate(readList("do this now"));
  check(collapsed.ok, "the steps section did not render");
  if (collapsed.ok) {
    check(
      collapsed.nowTitles.length > 0,
      "no immediate action was visible while collapsed — the page must lead with what to do now",
    );
    check(
      collapsed.button && collapsed.button.expanded === "false",
      `the disclosure should start collapsed, got ${collapsed.button && collapsed.button.expanded}`,
    );
    check(
      collapsed.button && collapsed.button.controls && collapsed.listId === collapsed.button.controls,
      "aria-controls does not point at the rendered list",
    );
    check(
      collapsed.button && collapsed.button.tag === "BUTTON",
      `the disclosure is a ${collapsed.button && collapsed.button.tag}, not a button`,
    );
    check(
      collapsed.button && collapsed.button.tabIndex >= 0,
      "the disclosure is not reachable by keyboard",
    );
    check(
      collapsed.button && /show all \d+ steps?/i.test(collapsed.button.text),
      `unexpected collapsed label: ${collapsed.button && collapsed.button.text}`,
    );
  }

  const collapsedNow = collapsed.ok ? collapsed.nowTitles : [];

  // --- keyboard: focus and activate with Enter ------------------------------
  await evaluate(`document.querySelector('#steps button[aria-expanded]').focus()`);
  const focused = await evaluate(
    `document.activeElement === document.querySelector('#steps button[aria-expanded]')`,
  );
  check(focused, "the disclosure could not take focus");

  // A button activates on Enter at keydown. Chrome only runs the default action
  // when the event carries `text`, so it is set here; without it the dispatch is
  // a no-op and the test would blame the component.
  await pressKey("Enter", "Enter", 13, "\r");

  const expanded = await evaluate(readList("do this now"));
  check(expanded.ok, "the steps section vanished after expanding");
  if (expanded.ok && collapsed.ok) {
    check(expanded.button && expanded.button.expanded === "true", "Enter did not set aria-expanded=true");
    check(
      expanded.items.length > collapsed.items.length,
      `expanding did not reveal more steps (${collapsed.items.length} -> ${expanded.items.length})`,
    );
    check(
      expanded.button && /show only the first \d+ steps?/i.test(expanded.button.text),
      `unexpected expanded label: ${expanded.button && expanded.button.text}`,
    );
    check(
      expanded.button && collapsed.button && expanded.button.controls === collapsed.button.controls,
      "aria-controls changed between states",
    );
    // The core assertion: expanding must not be the only way to reach an
    // immediate action. If a "now" step appears only after expanding, the
    // traveller could act on the wrong priority.
    const revealedOnlyOnExpand = expanded.nowTitles.filter((title) => !collapsedNow.includes(title));
    check(
      revealedOnlyOnExpand.length === 0,
      `expanding revealed immediate actions that should already be visible: ${revealedOnlyOnExpand.join(" | ")}`,
    );
    check(
      sameSet(collapsedNow, expanded.nowTitles),
      `the immediate actions differ between collapsed and expanded:\n    collapsed: ${collapsedNow.join(" | ")}\n    expanded:  ${expanded.nowTitles.join(" | ")}`,
    );
  }

  // --- keyboard: collapse again with Space ---------------------------------
  await pressKey(" ", "Space", 32, " ");
  const recollapsed = await evaluate(readList("do this now"));
  check(recollapsed.ok, "the steps section vanished after collapsing");
  if (recollapsed.ok && collapsed.ok) {
    check(recollapsed.button && recollapsed.button.expanded === "false", "Space did not set aria-expanded=false");
    check(
      recollapsed.items.length === collapsed.items.length,
      `collapsing did not restore the collapsed list (${recollapsed.items.length} vs ${collapsed.items.length})`,
    );
    check(
      sameSet(recollapsed.nowTitles, collapsedNow),
      "the immediate-action set changed after a collapse cycle",
    );
  }

  // --- every need: expanding must never be required to reach an action ------
  for (const need of ["cancelled", "delayed", "options", "gate_change", "announcement"]) {
    await loadSituation({ need, withConnection: false });
    const before = await evaluate(readList("do this now"));
    if (!before.ok) {
      check(false, `${need}: the steps section did not render`);
      continue;
    }
    check(before.nowTitles.length > 0, `${need}: no immediate action visible by default`);
    if (!before.button) continue;

    await pressKey("Enter", "Enter", 13, "\r");
    const after = await evaluate(readList("do this now"));
    check(after.ok, `${need}: the steps section vanished after expanding`);
    if (!after.ok) continue;
    const revealed = after.nowTitles.filter((title) => !before.nowTitles.includes(title));
    check(revealed.length === 0, `${need}: expanding revealed immediate actions: ${revealed.join(" | ")}`);
  }

  // --- mobile ---------------------------------------------------------------
  await loadSituation({ need: "delayed", withConnection: true, width: 390, height: 844 });
  const mobile = await evaluate(readList("do this now"));
  check(mobile.ok, "mobile: the steps section did not render");
  if (mobile.ok) {
    check(mobile.nowTitles.length > 0, "mobile: no immediate action visible by default");
    check(mobile.button && mobile.button.expanded === "false", "mobile: the disclosure should start collapsed");
  }
  check(
    await evaluate(`document.documentElement.scrollWidth <= window.innerWidth + 1`),
    "mobile: the page overflows horizontally at 390px",
  );
  const touchTarget = await evaluate(
    `(() => {
      const button = document.querySelector('#steps button[aria-expanded]');
      if (!button) return 0;
      return Math.round(button.getBoundingClientRect().height);
    })()`,
  );
  check(touchTarget >= 44, `mobile: the disclosure is ${touchTarget}px tall, expected >= 44px`);

  // --- Spanish --------------------------------------------------------------
  await loadSituation({ need: "delayed", withConnection: true, locale: "es" });
  const spanish = await evaluate(readList("hazlo ahora"));
  check(spanish.ok, "es: the steps section did not render");
  if (spanish.ok) {
    check(spanish.button && spanish.button.expanded === "false", "es: the disclosure should start collapsed");
    check(
      spanish.button && /ver los \d+ pasos/i.test(spanish.button.text),
      `es: the disclosure label is not Spanish: ${spanish.button && spanish.button.text}`,
    );
    check(
      spanish.button && !/show all|show only/i.test(spanish.button.text),
      `es: English leaked into the disclosure label: ${spanish.button && spanish.button.text}`,
    );
    check(spanish.nowTitles.length > 0, "es: no immediate action visible by default");
    if (spanish.button) {
      await pressKey("Enter", "Enter", 13, "\r");
      const spanishExpanded = await evaluate(readList("hazlo ahora"));
      check(spanishExpanded.ok, "es: the steps section vanished after expanding");
      if (spanishExpanded.ok) {
        const revealed = spanishExpanded.nowTitles.filter((t) => !spanish.nowTitles.includes(t));
        check(revealed.length === 0, `es: expanding revealed immediate actions: ${revealed.join(" | ")}`);
      }
    }
  }

  if (failures.length > 0) {
    console.error("Steps-disclosure failures:");
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exitCode = 1;
  } else {
    console.log("OK — immediate actions stay visible; disclosure is operable and localised.");
  }
} finally {
  chrome.kill();
}
