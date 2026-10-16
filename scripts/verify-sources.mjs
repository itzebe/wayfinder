/**
 * Verifies the official passenger-rights references.
 *
 * For every entry in RIGHTS_NOTES this checks two things against the live page:
 *   1. The URL resolves with a 2xx and is not a redirect to an archive.
 *   2. The verbatim `quote` still appears in the page, so the summary is still
 *      backed by text that is actually published there.
 *
 * The catalogue lives in TypeScript, so it is parsed here rather than imported.
 * Run with: npm run verify:sources
 */
import { readFileSync } from "node:fs";

const SOURCE = new URL("../src/lib/situation/passengerRights.ts", import.meta.url);
const UA = "WAYFINDER/1.0 (passenger-rights source verification)";

/** Collapses whitespace and normalises curly quotes so HTML formatting cannot cause a false miss. */
function normalise(value) {
  return value
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function decodeEntities(html) {
  return html
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"');
}

function stripTags(html) {
  return decodeEntities(html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " "));
}

function parseNotes(source) {
  const notes = [];
  const body = source.split("export const RIGHTS_NOTES")[1] ?? "";
  const blocks = body.split(/\n  \{\n/).slice(1);
  for (const block of blocks) {
    const field = (name) => {
      const match = block.match(new RegExp(`(?:^|\\n)\\s*${name}:\\s*\\n?\\s*"((?:[^"\\\\]|\\\\.)*)"`));
      return match ? match[1].replace(/\\"/g, '"').replace(/\\n/g, "\n") : undefined;
    };
    const id = field("id");
    const url = field("url");
    const quote = field("quote");
    if (id && url) notes.push({ id, url, quote });
  }
  return notes;
}

const notes = parseNotes(readFileSync(SOURCE, "utf8"));
if (notes.length === 0) {
  console.error("No rights notes parsed — the catalogue format may have changed.");
  process.exit(1);
}

let failures = 0;

/**
 * eCFR blocks automated requests to its HTML pages but publishes the same
 * regulation text through its documented versioner API. Same content, official
 * endpoint, no scraping.
 */
async function fetchEcfrText(url) {
  const match = url.match(/title-(\d+).*?part-(\d+)/i);
  if (!match) return null;
  const [, title, part] = match;
  const api = `https://www.ecfr.gov/api/versioner/v1/full/2026-01-01/title-${title}.xml?part=${part}`;
  const response = await fetch(api, {
    headers: { "user-agent": UA, "accept-encoding": "gzip" },
    signal: AbortSignal.timeout(40000),
  });
  if (!response.ok) return null;
  return await response.text();
}

for (const note of notes) {
  let html;
  let finalUrl = note.url;
  try {
    if (/ecfr\.gov/i.test(note.url)) {
      const text = await fetchEcfrText(note.url);
      if (text === null) {
        console.log(`FAIL  ${note.id}  eCFR API did not return part text  ${note.url}`);
        failures += 1;
        continue;
      }
      html = text;
    } else {
      let response;
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
          response = await fetch(note.url, {
            redirect: "follow",
            headers: { "user-agent": UA },
            signal: AbortSignal.timeout(25000),
          });
          break;
        } catch (error) {
          if (attempt === 3) throw error;
          await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
        }
      }
      finalUrl = response.url || note.url;
      if (!response.ok) {
        console.log(`FAIL  ${note.id}  HTTP ${response.status}  ${note.url}`);
        failures += 1;
        continue;
      }
      html = await response.text();
    }
  } catch (error) {
    console.log(`FAIL  ${note.id}  ${error.name}: ${error.message}`);
    failures += 1;
    continue;
  }

  const archived = /web\.archive\.org|archive\.is|wayback/i.test(finalUrl);
  const pageText = normalise(stripTags(html));
  const quoteFound = note.quote ? pageText.includes(normalise(note.quote)) : true;

  if (archived) {
    console.log(`FAIL  ${note.id}  redirected to an archive: ${finalUrl}`);
    failures += 1;
  } else if (!quoteFound) {
    console.log(`FAIL  ${note.id}  live page does not contain the verbatim quote  ${note.url}`);
    failures += 1;
  } else {
    console.log(`PASS  ${note.id}  quote verified on live page`);
  }
}

console.log(`\n${notes.length - failures}/${notes.length} rights references verified`);
process.exit(failures ? 1 : 0);
