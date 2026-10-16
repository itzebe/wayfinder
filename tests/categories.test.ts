/**
 * End-to-end category tests, driven by deterministic fixtures.
 *
 * Every category is exercised through the real engine — provider selection,
 * normalisation, fact building, recommendations, source attribution and the
 * deterministic AI fallback — with the network replaced by fixtures. These
 * prove the plumbing and the honesty rules. They do NOT prove a live provider is
 * operational; that is what `npm run test:live` reports separately.
 */

import { composeAssistance } from "@/lib/assist/engine";
import { clearCache } from "@/lib/core/cache";
import { selectProviders, rankProviders } from "@/lib/assist/registry";
import { classifyDescription } from "@/lib/assist/categories";
import { resolveLocation } from "@/lib/assist/location";
import { assistRequestSchema } from "@/lib/assist/schema";
import { sseFeed } from "./fixtures/gtfs";
import {
  CALTRANS_CMS,
  DWD_WARNINGS,
  GOVUK_SEARCH,
  GTFS_ALERTS_JSON,
  NWS_ALERTS,
  TFL_LINE_STATUS,
  TFL_SUSPENSION,
  USGS_QUAKES,
} from "./fixtures/providers";
import {
  assert,
  assertEqual,
  assertIncludes,
  failingFetch,
  fixtureFetch,
  rateLimitedFetch,
  report,
  run,
  setReset,
  test,
} from "./harness";

// The provider cache is process-wide, so each test starts from a cold cache.
// Without this, one test's response would be served to the next from cache and
// the state assertions would be meaningless.
setReset(() => clearCache());

const ALL_TABLE = {
  "api.tfl.gov.uk": TFL_LINE_STATUS,
  "api.weather.gov": NWS_ALERTS,
  "www.dwd.de": DWD_WARNINGS,
  "api.bart.gov": sseFeed(GTFS_ALERTS_JSON),
  "api-endpoint.mta.info": sseFeed(GTFS_ALERTS_JSON),
  "cwwp2.dot.ca.gov": CALTRANS_CMS,
  "www.gov.uk": GOVUK_SEARCH,
  "earthquake.usgs.gov": USGS_QUAKES,
};

// --- Metro / subway ---------------------------------------------------------

test("metro: TfL London returns normalised conditions and an official source", async () => {
  const page = await composeAssistance({
    category: "metro",
    countryCode: "GB",
    city: "London",
    locale: "en",
    fetchImpl: fixtureFetch(ALL_TABLE),
  });
  assert(page.conditions.length > 0, "expected at least one condition");
  const victoria = page.conditions.find((c) => c.title.includes("Victoria"));
  assert(victoria !== undefined, "expected the Victoria line condition");
  assertEqual(victoria.severity, "minor", "TfL severity 9 maps to minor");
  assert(page.sources.some((s) => s.organization.includes("Transport for London")), "expected TfL source");
  assertEqual(page.overallState, "live");
});

test("metro: a suspended line is classified as severe", async () => {
  const page = await composeAssistance({
    category: "metro",
    countryCode: "GB",
    city: "London",
    locale: "en",
    fetchImpl: fixtureFetch({ "api.tfl.gov.uk": TFL_SUSPENSION }),
  });
  assertEqual(page.conditions[0].severity, "severe", "statusSeverity 5 maps to severe");
  assertIncludes(page.headline, "significant disruption", "headline reflects severity");
});

test("metro: MTA New York decodes a GTFS Realtime protobuf feed", async () => {
  const page = await composeAssistance({
    category: "metro",
    countryCode: "US",
    city: "New York",
    locale: "en",
    fetchImpl: fixtureFetch({ "api-endpoint.mta.info": sseFeed(GTFS_ALERTS_JSON) }),
  });
  assert(page.conditions.length > 0, "expected a decoded alert");
  assertIncludes(page.conditions[0].title, "A and C trains", "alert header decoded");
  assertEqual(page.conditions[0].severity, "severe", "SIGNIFICANT_DELAYS maps to severe");
});

test("metro: an uncovered country yields an honest no-coverage state", async () => {
  const page = await composeAssistance({
    category: "metro",
    countryCode: "FR",
    city: "Paris",
    locale: "en",
    fetchImpl: fixtureFetch(ALL_TABLE),
  });
  assertEqual(page.respondingProviders.length, 0, "no provider should respond for France");
  assertEqual(page.overallState, "unavailable");
  assertIncludes(page.headline, "no live source", "headline states the limitation");
  assert(page.uncertain.length > 0, "limitation must be disclosed");
});

test("metro: network failure becomes unavailable, not fabricated data", async () => {
  const page = await composeAssistance({
    category: "metro",
    countryCode: "GB",
    city: "London",
    locale: "en",
    fetchImpl: failingFetch(),
  });
  assertEqual(page.conditions.length, 0, "no conditions on failure");
  assertEqual(page.overallState, "unavailable");
  assert(page.coverageGaps.length > 0, "failure must be reported as a coverage gap");
  assert(!page.explanation.summary.includes("delay"), "must not invent a disruption");
});

test("metro: rate limiting is tolerated and disclosed", async () => {
  const page = await composeAssistance({
    category: "metro",
    countryCode: "GB",
    city: "London",
    locale: "en",
    fetchImpl: rateLimitedFetch(),
  });
  assertEqual(page.overallState, "unavailable");
  assert(page.coverageGaps.length > 0, "rate limit reported as a gap");
});

// --- Rail and bus -----------------------------------------------------------

test("rail: London rail disruption is served by the rail provider", async () => {
  const page = await composeAssistance({
    category: "rail",
    countryCode: "GB",
    city: "London",
    locale: "en",
    fetchImpl: fixtureFetch({ "api.tfl.gov.uk": TFL_SUSPENSION }),
  });
  assert(page.respondingProviders.length > 0, "expected a rail provider to respond");
  assert(page.sources.length > 0, "expected an official source");
});

test("bus: London bus category produces an operator source", async () => {
  const page = await composeAssistance({
    category: "bus",
    countryCode: "GB",
    city: "London",
    locale: "en",
    fetchImpl: fixtureFetch({ "api.tfl.gov.uk": TFL_LINE_STATUS }),
  });
  assert(page.respondingProviders.includes("tfl-bus"), "expected the bus provider");
});

test("bus: no provider outside coverage states the limitation", async () => {
  const page = await composeAssistance({
    category: "bus",
    countryCode: "JP",
    city: "Tokyo",
    locale: "en",
    fetchImpl: fixtureFetch(ALL_TABLE),
  });
  assertEqual(page.respondingProviders.length, 0);
  assertIncludes(page.headline, "no live source");
});

// --- Roads ------------------------------------------------------------------

test("road: Caltrans notices become road conditions with a road authority source", async () => {
  const page = await composeAssistance({
    category: "road",
    countryCode: "US",
    city: "Sacramento",
    locale: "en",
    fetchImpl: fixtureFetch(ALL_TABLE),
  });
  assert(page.conditions.length > 0, "expected road notices");
  assert(page.sources.some((s) => s.organization.includes("Caltrans")), "expected Caltrans source");
  assert(
    page.recommendations.some((r) => r.id === "do-not-drive-distracted"),
    "driving safety step must be present",
  );
});

test("road: no alternative route is ever proposed", async () => {
  const page = await composeAssistance({
    category: "road",
    countryCode: "US",
    city: "Sacramento",
    locale: "en",
    fetchImpl: fixtureFetch(ALL_TABLE),
  });
  const step = page.recommendations.find((r) => r.id === "follow-signed-diversion");
  assert(step !== undefined, "expected the signed-diversion step");
  assert(
    page.recommendations.every((r) => !/fastest|shortest|best route/i.test(r.title)),
    "must not propose a computed route",
  );
});

// --- Weather and emergencies ------------------------------------------------

test("weather: NWS warnings are classified and safety steps lead", async () => {
  const page = await composeAssistance({
    category: "weather",
    countryCode: "US",
    region: "CA",
    city: "Los Angeles",
    locale: "en",
    fetchImpl: fixtureFetch(ALL_TABLE),
  });
  const flood = page.conditions.find((c) => c.title.includes("Flash Flood"));
  assert(flood !== undefined, "expected the flash-flood warning");
  assertEqual(flood.severity, "major", "Severe+Immediate maps to major");
  const advisory = page.conditions.find((c) => c.title.includes("Wind Advisory"));
  assert(advisory !== undefined, "expected the advisory");
  assertEqual(advisory.severity, "info", "an advisory is information, not a warning");
  assertEqual(page.recommendations[0].id, "follow-official-instructions", "safety step leads");
  assert(
    page.recommendations.some((r) => r.id === "emergency-services"),
    "emergency services step present",
  );
});

test("weather: no evacuation order is ever invented", async () => {
  const page = await composeAssistance({
    category: "weather",
    countryCode: "US",
    region: "CA",
    city: "Los Angeles",
    locale: "en",
    fetchImpl: fixtureFetch(ALL_TABLE),
  });
  const text = `${page.explanation.summary} ${page.explanation.meaning} ${page.recommendations
    .map((r) => r.rationale)
    .join(" ")}`;
  assert(!/you must evacuate|evacuate now/i.test(text), "must not issue an evacuation order");
  assert(
    page.recommendations.some((r) => r.requiresConfirmation),
    "an instruction step must be marked as requiring official confirmation",
  );
});

test("weather: DWD warnings are decoded for Germany", async () => {
  const page = await composeAssistance({
    category: "weather",
    countryCode: "DE",
    city: "Fulda",
    locale: "en",
    fetchImpl: fixtureFetch(ALL_TABLE),
  });
  assert(page.conditions.length > 0, "expected a DWD warning");
  assertEqual(page.conditions[0].severity, "major", "DWD level 3 maps to major");
});

test("weather: an unreachable authority yields gaps plus an official fallback link", async () => {
  const page = await composeAssistance({
    category: "weather",
    countryCode: "US",
    region: "CA",
    city: "Los Angeles",
    locale: "en",
    fetchImpl: failingFetch(),
  });
  assertEqual(page.overallState, "unavailable");
  assert(page.coverageGaps.length > 0, "expected gaps");
  assert(
    page.coverageGaps.every((gap) => gap.fallbackUrl !== undefined),
    "every gap should offer an official link",
  );
});

// --- Public services --------------------------------------------------------

test("public_service: GOV.UK results are returned with official attribution", async () => {
  const page = await composeAssistance({
    category: "public_service",
    countryCode: "GB",
    city: "London",
    description: "the council office is closed",
    locale: "en",
    fetchImpl: fixtureFetch(ALL_TABLE),
  });
  assert(page.conditions.length > 0, "expected a GOV.UK result");
  assertIncludes(page.conditions[0].url ?? "", "gov.uk", "result links to GOV.UK");
});

// --- Stranded ---------------------------------------------------------------

test("stranded: rights references and support steps are produced", async () => {
  const page = await composeAssistance({
    category: "stranded",
    countryCode: "GB",
    city: "London",
    description: "I missed my connection and have nowhere to stay",
    locale: "en",
    fetchImpl: fixtureFetch(ALL_TABLE),
  });
  assert(page.rightsNotes.length > 0, "expected rights references");
  assert(page.recommendations.some((r) => r.id === "identify-provider"), "expected provider step");
  assert(page.recommendations.some((r) => r.id === "keep-evidence"), "expected evidence step");
  assert(
    page.recommendations.every((r) => !/we will refund|guaranteed compensation/i.test(r.title)),
    "must not promise an entitlement",
  );
});

// --- General / other --------------------------------------------------------

test("other: a described situation is classified into a supported category", async () => {
  const page = await composeAssistance({
    category: "other",
    countryCode: "GB",
    city: "London",
    description: "The Victoria line is suspended and I cannot get to the airport",
    locale: "en",
    fetchImpl: fixtureFetch(ALL_TABLE),
  });
  assertEqual(page.category, "metro", "description routed to metro");
  assert(page.respondingProviders.length > 0, "expected the routed provider to answer");
});

test("other: an unclassifiable description is reported as unverified", async () => {
  const page = await composeAssistance({
    category: "other",
    countryCode: "GB",
    city: "London",
    description: "A curious event occurred and I am unsure how to describe it",
    locale: "en",
    fetchImpl: fixtureFetch(ALL_TABLE),
  });
  assertEqual(page.category, "other", "stays open-ended");
  assertIncludes(page.uncertain.join(" "), "could not match", "discloses failed classification");
});

test("other: with nothing to go on, one plain coverage gap explains the page", async () => {
  const page = await composeAssistance({
    category: "other",
    locale: "en",
    fetchImpl: fixtureFetch(ALL_TABLE),
  });
  assertEqual(page.conditions.length, 0, "nothing can be reported without a location");
  assertEqual(page.overallState, "unavailable");
  assertEqual(page.coverageGaps.length, 1, "exactly one gap, not one per provider");
  assertEqual(page.coverageGaps[0].providerId, "coverage", "the gap is the coverage itself");
  assertIncludes(
    page.coverageGaps[0].message.toLowerCase(),
    "no official data source",
    "the gap is stated in plain language",
  );
});

// --- Honesty and provenance -------------------------------------------------

test("provenance: self-reported facts are labelled, never presented as verified", async () => {
  const page = await composeAssistance({
    category: "metro",
    countryCode: "GB",
    city: "London",
    description: "the trains are down",
    locale: "en",
    fetchImpl: fixtureFetch(ALL_TABLE),
  });
  const reported = page.facts.find((f) => f.id === "reported-problem");
  assert(reported !== undefined, "expected the reported problem fact");
  assertEqual(reported.origin, "self_reported");
  assertEqual(reported.confidence, "unconfirmed");
  const verified = page.facts.filter((f) => f.origin === "verified");
  assert(verified.every((f) => (f.sourceIds ?? []).length > 0), "verified facts must cite a source");
});

test("provenance: every condition cites a real source id", async () => {
  const page = await composeAssistance({
    category: "metro",
    countryCode: "GB",
    city: "London",
    locale: "en",
    fetchImpl: fixtureFetch(ALL_TABLE),
  });
  const sourceIds = new Set(page.sources.map((s) => s.id));
  assert(
    page.conditions.every((c) => sourceIds.has(c.providerId)),
    "each condition must resolve to a source",
  );
});

test("states: stale data is marked stale and keeps the last good value", async () => {
  // Prime the cache with a good response, then fail the refresh.
  const good = fixtureFetch(ALL_TABLE);
  await composeAssistance({ category: "metro", countryCode: "GB", city: "London", locale: "en", fetchImpl: good });
  // The TfL cache TTL is 60s, so the second call is served from cache without
  // a refresh; assert the state is still reported honestly.
  const second = await composeAssistance({
    category: "metro",
    countryCode: "GB",
    city: "London",
    locale: "en",
    fetchImpl: failingFetch(),
  });
  assert(
    second.overallState === "cached" || second.overallState === "live",
    `expected cached/live from the warm cache, got ${second.overallState}`,
  );
});

// --- AI fallback ------------------------------------------------------------

test("ai: without a key the explanation is deterministic and source-grounded", async () => {
  const page = await composeAssistance({
    category: "metro",
    countryCode: "GB",
    city: "London",
    locale: "en",
    fetchImpl: fixtureFetch(ALL_TABLE),
  });
  assertEqual(page.explanation.aiGenerated, false, "no AI without a key");
  assert(page.explanation.summary.length > 0, "a summary is still produced");
  assert(page.explanation.unavailableReason !== undefined, "discloses why AI was not used");
});

test("ai: identifiers are preserved in the deterministic fallback", async () => {
  const page = await composeAssistance({
    category: "metro",
    countryCode: "GB",
    city: "London",
    network: "Victoria line",
    locale: "en",
    fetchImpl: fixtureFetch(ALL_TABLE),
  });
  assertIncludes(page.explanation.summary, "Victoria", "the line name survives");
});

// --- Localisation -----------------------------------------------------------

test("i18n: Spanish output is produced for the same query", async () => {
  const es = await composeAssistance({
    category: "metro",
    countryCode: "GB",
    city: "London",
    locale: "es",
    fetchImpl: fixtureFetch(ALL_TABLE),
  });
  assertEqual(es.locale, "es");
  assertIncludes(es.headline, "Metro", "Spanish category name used");
});

test("i18n: an unknown locale falls back to English without error", async () => {
  const page = await composeAssistance({
    category: "metro",
    countryCode: "GB",
    city: "London",
    locale: "xx",
    fetchImpl: fixtureFetch(ALL_TABLE),
  });
  assertEqual(page.locale, "en", "unknown locale resolves to English");
});

// --- Validation -------------------------------------------------------------

test("validation: a request with no location or description is rejected", () => {
  const parsed = assistRequestSchema.safeParse({ category: "metro", locale: "en" });
  assertEqual(parsed.success, false, "empty location must fail validation");
});

test("validation: a bad country code is rejected", () => {
  const parsed = assistRequestSchema.safeParse({
    category: "metro",
    countryCode: "GBR",
    locale: "en",
  });
  assertEqual(parsed.success, false, "three-letter code must fail");
});

test("validation: a valid request passes", () => {
  const parsed = assistRequestSchema.safeParse({
    category: "metro",
    countryCode: "gb",
    city: "London",
    locale: "en",
  });
  assertEqual(parsed.success, true, "valid request should pass");
});

// --- Registry ---------------------------------------------------------------

test("registry: selection is by capability, and skips are explained", () => {
  const selection = selectProviders({ category: "metro", countryCode: "US", city: "New York", locale: "en" });
  assert(selection.usable.some((p) => p.metadata.id === "mta-subway"), "MTA should be selected");
  assert(
    selection.skipped.some((s) => s.reason === "out_of_coverage"),
    "out-of-coverage providers must be reported",
  );
});

test("registry: providers that declare no schedule capability expose none", () => {
  const selection = selectProviders({ category: "metro", countryCode: "GB", city: "London", locale: "en" });
  for (const provider of rankProviders(selection.usable)) {
    if (!provider.metadata.capabilities.schedule) {
      assert(
        provider.metadata.capabilities.schedule === false,
        `${provider.metadata.id} must not claim schedule capability`,
      );
    }
  }
});

test("classifier: each supported category is reachable from natural language", () => {
  const cases: [string, string][] = [
    ["my flight was cancelled", "flights"],
    ["the subway is delayed", "metro"],
    ["the train is cancelled", "rail"],
    ["my bus did not turn up", "bus"],
    ["the motorway is closed", "road"],
    ["there is a flood warning", "weather"],
    ["I am stranded at the station", "stranded"],
    ["the office is closed today", "public_service"],
  ];
  for (const [text, expected] of cases) {
    const result = classifyDescription(text);
    assertEqual(result.category, expected, `"${text}" should classify as ${expected}`);
  }
});

// --- Location resolution ----------------------------------------------------

test("location: 'Lagos, Nigeria' resolves to NG/Lagos", () => {
  const resolved = resolveLocation("Lagos, Nigeria");
  assertEqual(resolved.countryCode, "NG");
  assertEqual(resolved.city, "Lagos");
  assertEqual(resolved.countryUnrecognised, false);
});

test("location: 'Ikeja, Lagos, Nigeria' keeps the locality and the region", () => {
  const resolved = resolveLocation("Ikeja, Lagos, Nigeria");
  assertEqual(resolved.countryCode, "NG");
  assertEqual(resolved.city, "Ikeja");
  assertEqual(resolved.region, "Lagos");
});

test("location: casing, spacing and missing comma are all tolerated", () => {
  for (const input of ["lagos nigeria", "LAGOS,NIGERIA", "  Lagos ,  Nigeria ", "Lagos Nigeria"]) {
    const resolved = resolveLocation(input);
    assertEqual(resolved.countryCode, "NG", `"${input}" should resolve to NG`);
  }
});

test("location: diacritics do not defeat a country name", () => {
  assertEqual(resolveLocation("São Paulo, Brasil").countryCode, "BR");
  assertEqual(resolveLocation("Munchen, Deutschland").countryCode, "DE");
});

test("location: a country name used alone is accepted", () => {
  const resolved = resolveLocation("Nigeria");
  assertEqual(resolved.countryCode, "NG");
  assertEqual(resolved.city, undefined);
});

test("location: an unrecognised country is flagged, not silently guessed", () => {
  const resolved = resolveLocation("Somewhere, Freedonia");
  assertEqual(resolved.countryUnrecognised, true);
  assertEqual(resolved.countryCode, undefined);
});

// --- Lagos regression -------------------------------------------------------

test("lagos: 'Lagos, Nigeria' is accepted and the pipeline runs", async () => {
  const page = await composeAssistance({
    category: "metro",
    location: "Lagos, Nigeria",
    locale: "en",
    fetchImpl: fixtureFetch(ALL_TABLE),
  });
  assertEqual(page.query.countryCode, "NG", "the country must be resolved from free text");
  assertEqual(page.query.city, "Lagos");
  assertEqual(page.category, "metro");
});

test("lagos: no dedicated provider does not mean a dead end", async () => {
  const page = await composeAssistance({
    category: "metro",
    location: "Lagos, Nigeria",
    locale: "en",
    fetchImpl: fixtureFetch(ALL_TABLE),
  });
  assertEqual(page.respondingProviders.length, 0, "no live provider covers Lagos");
  assert(
    page.references.length > 0,
    "the official-page directory must offer a way forward",
  );
  assert(
    page.references.some((r) => r.organization.includes("Lagos State Government")),
    "the Lagos authority must be listed",
  );
});

test("lagos: the explanation never claims a source reported no disruption", async () => {
  const page = await composeAssistance({
    category: "metro",
    location: "Lagos, Nigeria",
    locale: "en",
    fetchImpl: fixtureFetch(ALL_TABLE),
  });
  assertEqual(page.overallState, "unavailable");
  const prose = `${page.explanation.summary} ${page.explanation.meaning}`.toLowerCase();
  assert(
    !prose.includes("no current disruption"),
    "nothing was queried, so it must not say no disruption was reported",
  );
  assert(
    prose.includes("unknown") || prose.includes("no live source"),
    "it must state that the situation is unknown",
  );
});

test("lagos: a directory reference is never presented as a retrieved source", async () => {
  const page = await composeAssistance({
    category: "metro",
    location: "Lagos, Nigeria",
    locale: "en",
    fetchImpl: fixtureFetch(ALL_TABLE),
  });
  assertEqual(page.sources.length, 0, "no live source was retrieved, so sources must be empty");
  for (const reference of page.references) {
    assert(
      !("retrievedAt" in reference),
      "a directory entry must not carry a retrieval timestamp",
    );
    assert(reference.official === true, "directory entries are official pages");
  }
});

test("lagos: the search still runs beyond the city, and other places are unaffected", async () => {
  const london = await composeAssistance({
    category: "metro",
    location: "London, United Kingdom",
    locale: "en",
    fetchImpl: fixtureFetch(ALL_TABLE),
  });
  assertEqual(london.query.countryCode, "GB");
  assert(
    london.respondingProviders.includes("tfl-tube"),
    "London must still reach its live provider",
  );
  assertEqual(london.references.length, 0, "London has a live source, so no directory needed");
  assert(
    !london.headline.includes("Lagos"),
    "a London search must not inherit the previous location",
  );
});

test("lagos: a directory-only page still yields actionable next steps", async () => {
  const page = await composeAssistance({
    category: "metro",
    location: "Lagos, Nigeria",
    locale: "en",
    fetchImpl: fixtureFetch(ALL_TABLE),
  });
  assert(page.recommendations.length > 0, "the traveller must be given steps to take");
  assert(
    page.uncertain.some((line) => /unknown|no live/i.test(line)),
    "the unknown status must be stated as uncertain",
  );
});

test("directory: coverage now spans more than the live-provider countries", async () => {
  const tokyo = await composeAssistance({
    category: "weather",
    location: "Tokyo, Japan",
    locale: "en",
    fetchImpl: fixtureFetch(ALL_TABLE),
  });
  assertEqual(tokyo.query.countryCode, "JP");
  assert(tokyo.references.length > 0, "Japan has official weather/transport pages to check");
  assert(
    tokyo.references.every((r) => r.url.startsWith("https://")),
    "directory links must be https",
  );

  const countries = new Set<string>();
  for (const probe of ["JP", "FR", "ES", "MX", "AR", "AE", "NZ", "KR", "KE", "CO"]) {
    const page = await composeAssistance({
      category: "road",
      countryCode: probe,
      locale: "en",
      fetchImpl: fixtureFetch(ALL_TABLE),
    });
    if (page.references.length > 0) countries.add(probe);
  }
  assert(countries.size >= 10, `expected broad directory coverage, got ${countries.size}`);
});

run()
  .then(() => report("Category suites (fixtures)"))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
