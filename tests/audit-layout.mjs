/**
 * Layout audit — measures real rendered geometry.
 *
 * Reports the things a code review cannot see: how far down the primary action
 * sits, how tall each section is on a phone, which interactive elements are
 * below the 44px touch-target minimum, and which text nodes may fail contrast.
 *
 * Usage: node tests/audit-layout.mjs [baseUrl]
 */
import { spawn } from "node:child_process";

const BASE = process.argv[2] ?? "http://localhost:3000";
const PORT = 9342;
const WIDTHS = [320, 390, 768, 1440];

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

/** Runs in the page: gathers geometry and computed-style facts. */
const PROBE = `(() => {
  const out = { pageHeight: document.documentElement.scrollHeight,
                viewport: window.innerWidth,
                sections: [], smallTargets: [], lowContrast: [], headings: [],
                overflow: [] };

  const label = (el) => {
    const t = (el.getAttribute("aria-label") || el.textContent || "").trim().replace(/\\s+/g, " ");
    return t.slice(0, 46) || el.tagName.toLowerCase();
  };

  // Section geometry, in document order.
  document.querySelectorAll("main > section, main > div > section, section").forEach((s) => {
    const r = s.getBoundingClientRect();
    const h2 = s.querySelector("h2");
    out.sections.push({ id: s.id || "(none)", top: Math.round(r.top + scrollY),
                       height: Math.round(r.height), heading: h2 ? label(h2) : "" });
  });

  // Every heading, for structure review.
  document.querySelectorAll("h1,h2,h3").forEach((h) => {
    out.headings.push({ tag: h.tagName, text: label(h).slice(0, 60) });
  });

  // Interactive elements below the 44px touch minimum.
  document.querySelectorAll("a[href], button, input, select, textarea, [role=button]").forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none") return;
    if (r.height < 44 || r.width < 44) {
      out.smallTargets.push({ tag: el.tagName, label: label(el),
        w: Math.round(r.width), h: Math.round(r.height) });
    }
  });

  // Elements extending past the viewport.
  document.querySelectorAll("body *").forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.width === 0) return;
    if (r.right > window.innerWidth + 1 || r.left < -1) {
      out.overflow.push({ tag: el.tagName, label: label(el),
        left: Math.round(r.left), right: Math.round(r.right) });
    }
  });

  // Rough contrast check on text nodes: ratio of computed colour to the nearest
  // opaque background ancestor.
  const parse = (c) => {
    const m = c.match(/rgba?\\(([^)]+)\\)/);
    if (!m) return null;
    const p = m[1].split(",").map((v) => parseFloat(v));
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const lum = ({ r, g, b }) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const bgOf = (el) => {
    let n = el;
    while (n && n !== document.documentElement) {
      const c = parse(getComputedStyle(n).backgroundColor);
      if (c && c.a > 0.5) return c;
      n = n.parentElement;
    }
    return { r: 255, g: 255, b: 255, a: 1 };
  };
  document.querySelectorAll("p, span, li, a, h1, h2, h3, td, th, label").forEach((el) => {
    if (el.children.length) return;
    const text = (el.textContent || "").trim();
    if (!text) return;
    const cs = getComputedStyle(el);
    const fg = parse(cs.color);
    if (!fg || fg.a < 0.6) return;
    const bg = bgOf(el);
    const l1 = lum(fg), l2 = lum(bg);
    const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    const size = parseFloat(cs.fontSize);
    const bold = parseInt(cs.fontWeight, 10) >= 700;
    const large = size >= 24 || (size >= 18.66 && bold);
    const min = large ? 3 : 4.5;
    if (ratio < min) {
      out.lowContrast.push({ text: text.slice(0, 40), ratio: Math.round(ratio * 100) / 100,
        min, size: Math.round(size), color: cs.color });
    }
  });

  return out;
})()`;

try {
  await waitForDevtools();
  const target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: "PUT" })).json();
  const client = connect(target.webSocketDebuggerUrl);
  await client.ready;
  await client.send("Page.enable");
  await client.send("Runtime.enable");

  for (const w of WIDTHS) {
    await client.send("Emulation.setDeviceMetricsOverride", {
      width: w, height: 844, deviceScaleFactor: 1, mobile: w < 700,
    });
    await client.send("Page.navigate", { url: BASE + "/" });
    await sleep(4000);

    const res = await client.send("Runtime.evaluate", {
      expression: PROBE, returnByValue: true, awaitPromise: false,
    });
    const data = res.result?.result?.value;
    if (!data) { console.log(`\n### ${w}px — probe failed`); continue; }

    console.log(`\n${"=".repeat(72)}`);
    console.log(`### ${w}px viewport — page height ${data.pageHeight}px ` +
      `(${(data.pageHeight / 844).toFixed(1)} phone screens)`);
    console.log(`\nSections:`);
    for (const s of data.sections) {
      console.log(`  ${String(s.top).padStart(6)}px  h=${String(s.height).padStart(5)}  ` +
        `#${s.id.padEnd(16)} ${s.heading}`);
    }
    if (data.smallTargets.length) {
      console.log(`\nTouch targets under 44px (${data.smallTargets.length}):`);
      for (const t of data.smallTargets.slice(0, 14)) {
        console.log(`  ${t.tag.padEnd(8)} ${t.w}x${t.h}  "${t.label}"`);
      }
    }
    if (data.overflow.length) {
      console.log(`\nOverflowing elements (${data.overflow.length}):`);
      for (const o of data.overflow.slice(0, 10)) {
        console.log(`  ${o.tag} [${o.left}..${o.right}] "${o.label}"`);
      }
    }
    if (data.lowContrast.length) {
      console.log(`\nPossible contrast failures (${data.lowContrast.length}):`);
      for (const c of data.lowContrast.slice(0, 14)) {
        console.log(`  ${c.ratio}:1 (need ${c.min}) ${c.size}px "${c.text}"`);
      }
    }
  }

  client.close();
} catch (error) {
  console.error(error);
} finally {
  chrome.kill();
}
