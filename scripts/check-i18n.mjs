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
console.log(`OK — ${referenced.size} referenced keys, all resolvable.`);
