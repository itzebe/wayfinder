#!/usr/bin/env node
/**
 * Translation coverage check.
 *
 * Fails when the UI references a message key that the English catalogue does
 * not define, or when a locale claims "full" coverage but is missing keys.
 * Template-literal families such as `need.${need}.title` are expanded from the
 * same domain constants the UI uses, so a new situation type cannot silently
 * fall back to English.
 *
 * Run with: npm run check:i18n
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const SRC = join(ROOT, "src");
const MESSAGES_FILE = join(SRC, "lib/i18n/messages.ts");
const LOCALES_FILE = join(SRC, "lib/i18n/locales.ts");
const SCHEMAS_FILE = join(SRC, "lib/validation/schemas.ts");

function walk(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return walk(path);
    return /\.(ts|tsx)$/.test(path) ? [path] : [];
  });
}

/** Reads one `const <name>: Messages = { ... };` block and returns its keys. */
function readCatalogue(source, name) {
  const start = source.indexOf(`const ${name}: Messages = {`);
  if (start === -1) throw new Error(`catalogue "${name}" not found`);
  const end = source.indexOf("\n};", start);
  const body = source.slice(start, end);
  return new Set([...body.matchAll(/^\s*"([^"]+)":/gm)].map((m) => m[1]));
}

/** Reads `{ code: "...", coverage: "..." }` entries from the locale registry. */
function readLocales(source) {
  return [...source.matchAll(/\{\s*code:\s*"([^"]+)"[^}]*coverage:\s*"([^"]+)"/g)].map(
    ([, code, coverage]) => ({ code, coverage }),
  );
}

const messagesSource = readFileSync(MESSAGES_FILE, "utf8");
const english = readCatalogue(messagesSource, "en");
const locales = readLocales(readFileSync(LOCALES_FILE, "utf8"));
const schemasSource = readFileSync(SCHEMAS_FILE, "utf8");

const needsBlock = schemasSource.match(/ASSISTANCE_NEEDS = \[([^\]]+)\]/);
if (!needsBlock) throw new Error("ASSISTANCE_NEEDS not found");
const needs = [...needsBlock[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);

const states = ["live", "cached", "stale", "unavailable", "demo"];
const disruptionLabels = ["high", "elevated", "moderate", "low"];

const referenced = new Set([
  ...needs.flatMap((need) => [`need.${need}.title`, `need.${need}.body`]),
  ...states.flatMap((state) => [`state.${state}`, `state.${state}.desc`]),
  // Server-composed prose families built from the domain enums.
  ...needs.map((need) => `headline.${need}`),
  ...needs.map((need) => `fallback.problem.${need}`),
  ...disruptionLabels.map((label) => `headline.disruption.${label}`),
]);

for (const file of walk(SRC)) {
  if (file.endsWith("messages.ts")) continue;
  const text = readFileSync(file, "utf8");
  for (const [, key] of text.matchAll(/\bt\(\s*"([^"]+)"/g)) referenced.add(key);
}

const unresolved = [...referenced].filter((key) => !english.has(key)).sort();
if (unresolved.length > 0) {
  console.error("Keys referenced in code but missing from the English catalogue:");
  for (const key of unresolved) console.error(`  ${key}`);
  process.exit(1);
}

let failed = false;
for (const { code, coverage } of locales) {
  if (code === "en") continue;
  const catalogue = readCatalogue(messagesSource, code);
  const missing = [...referenced].filter((key) => !catalogue.has(key)).sort();
  const covered = referenced.size - missing.length;

  if (missing.length === 0) {
    if (coverage !== "full") {
      console.error(`${code}: marked "partial" but covers every referenced key.`);
      failed = true;
    } else {
      console.log(`${code}: ${covered}/${referenced.size} keys`);
    }
    continue;
  }

  if (coverage === "full") {
    console.error(`${code}: marked "full" but is missing ${missing.length} keys:`);
    for (const key of missing.slice(0, 20)) console.error(`  ${key}`);
    failed = true;
  } else {
    console.log(`${code}: ${covered}/${referenced.size} keys (partial, falls back to English)`);
  }
}

if (failed) process.exit(1);

/**
 * Hardcoded user-facing JSX text.
 *
 * The key-coverage check above cannot see a literal written straight into JSX, so
 * a string like `{x ? "May apply to your route" : "General guidance"}` passed every
 * check while leaking English into a Spanish page. This looks for text nodes and
 * string-literal branches that reach the DOM without going through `t()`.
 *
 * Only files that render UI are scanned, and the allowlist covers values that are
 * legitimately language-independent (identifiers, codes, sample data).
 */
const UI_DIRS = ["src/components", "src/app"];

/** Tailwind utility signatures — a class list, never prose. */
const TAILWIND = /(^|\s)(h|w|p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|gap|text|bg|border|rounded|flex|grid|size|min-h|max-w|inset|leading|tracking|space|items|justify|font|overflow|opacity|shadow)-/;

/** Values that are legitimately language-independent. */
const ALLOW = [
  /^[\w.\-:/+@#%°]+$/,               // single tokens: codes, units, URLs
  /^[\d\s.,:%°+\-]+(rem|px|em|%)?$/, // numbers, units and CSS lengths
  /^[A-Z]{2,4}$/,                     // IATA/ICAO-style codes
];

/**
 * Two shapes reach the DOM without `t()`:
 *   1. a ternary with string branches — how the rights badge leaked;
 *   2. a bare JSX text node.
 * Object-literal fields (source registries, metadata) are excluded: they hold
 * proper nouns and are not the bug this guards against.
 */
const TERNARY = /\?\s*"([^"]{4,})"\s*:\s*"([^"]{4,})"/g;
const JSX_TEXT = />\s*([A-Z][^<>{}"']{6,}?)\s*</g;

const isProse = (value) => {
  if (ALLOW.some((re) => re.test(value))) return false;
  if (TAILWIND.test(value)) return false;
  const words = value.split(/\s+/).filter(Boolean);
  return words.length >= 2 && /[a-z]{3}/.test(value);
};

const leaks = [];
for (const dir of UI_DIRS) {
  for (const file of walk(join(ROOT, dir))) {
    if (file.endsWith("messages.ts")) continue;
    if (file.includes("/api/")) continue;
    const text = readFileSync(file, "utf8");
    text.split("\n").forEach((line, index) => {
      const trimmed = line.trim();
      if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) return;
      if (/\b(className|class|style|cn\(|shadow)\b/.test(line)) return;

      for (const pattern of [TERNARY, JSX_TEXT]) {
        pattern.lastIndex = 0;
        for (const match of line.matchAll(pattern)) {
          const value = (match[1] ?? match[2] ?? "").trim();
          if (!value || !isProse(value)) continue;
          leaks.push(`${file.replace(ROOT + "/", "")}:${index + 1}  ${value.slice(0, 70)}`);
        }
      }
    });
  }
}

if (leaks.length > 0) {
  console.error("\nHardcoded user-facing text that bypasses the message catalogue:");
  for (const leak of leaks) console.error(`  ${leak}`);
  console.error("\nMove these into src/lib/i18n/messages.ts and reference them with t().");
  process.exit(1);
}

console.log(`OK — ${referenced.size} referenced keys, all resolvable, no hardcoded UI text.`);
