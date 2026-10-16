/**
 * Live read-only check against the real official endpoints.
 *
 * This is deliberately separate from the fixture suite and is not part of
 * `npm run verify`, because it needs outbound network access and depends on
 * third-party availability. It answers one question the fixtures cannot: is each
 * official source still reachable and still shaped the way the adapter expects?
 *
 * Run with `npm run test:live`. A failure here means an adapter needs updating,
 * not that the platform is broken — the runtime already degrades to an explicit
 * unavailable state with a link to the official page.
 */

import { composeAssistance } from "@/lib/assist/engine";

interface Check {
  name: string;
  category: Parameters<typeof composeAssistance>[0]["category"];
  countryCode: string;
  region?: string;
  city: string;
  /** Substrings that must appear somewhere in the page when the source is up. */
  expect?: string[];
}

const CHECKS: Check[] = [
  { name: "TfL London Underground", category: "metro", countryCode: "GB", city: "London" },
  { name: "MTA New York subway", category: "metro", countryCode: "US", city: "New York" },
  { name: "Caltrans road notices (CA)", category: "road", countryCode: "US", city: "Sacramento" },
  { name: "NWS alerts (CA)", category: "weather", countryCode: "US", region: "CA", city: "Los Angeles" },
  { name: "DWD warnings (DE)", category: "weather", countryCode: "DE", city: "Fulda" },
  { name: "GOV.UK public information", category: "public_service", countryCode: "GB", city: "London" },
  // The global, keyless forecast: proves the free source that replaces the paid
  // web search is still reachable and still shaped the way the adapter expects.
  { name: "Open-Meteo forecast (NG)", category: "weather", countryCode: "NG", city: "Lagos" },
  { name: "Open-Meteo forecast (JP)", category: "weather", countryCode: "JP", city: "Tokyo" },
];

async function main(): Promise<void> {
  let reachable = 0;
  let unavailable = 0;
  let broken = 0;

  for (const check of CHECKS) {
    const started = Date.now();
    let line: string;
    try {
      const page = await composeAssistance({
        category: check.category,
        countryCode: check.countryCode,
        region: check.region,
        city: check.city,
        locale: "en",
      });
      const ms = Date.now() - started;
      const responded = page.respondingProviders.length > 0;

      if (responded) {
        reachable += 1;
        const missing = (check.expect ?? []).filter(
          (needle) => !JSON.stringify(page.conditions).includes(needle),
        );
        if (missing.length > 0) {
          broken += 1;
          line = `SHAPE  ${check.name} — responded but missing ${missing.join(", ")} (${ms}ms)`;
        } else {
          line = `OK     ${check.name} — ${page.conditions.length} condition(s), state ${page.overallState} (${ms}ms)`;
        }
      } else {
        unavailable += 1;
        line = `EMPTY  ${check.name} — no provider responded; state ${page.overallState} (${ms}ms)`;
        if (page.coverageGaps.length > 0) {
          line += `\n         gap: ${page.coverageGaps[0].message}`;
        }
      }
    } catch (error) {
      broken += 1;
      line = `ERROR  ${check.name} — ${error instanceof Error ? error.message : String(error)}`;
    }
    console.log(line);
  }

  console.log(
    `\n${reachable} reachable, ${unavailable} unavailable, ${broken} broken ` +
      `(of ${CHECKS.length})`,
  );
  console.log(
    "A source being unavailable is reported, not hidden: the UI shows the last " +
      "valid result as stale, or an explicit unavailable state with the official link.",
  );
  // Only a genuine adapter/schema break fails the run. Third-party downtime or
  // an empty (but well-formed) feed is reported and tolerated.
  if (broken > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
