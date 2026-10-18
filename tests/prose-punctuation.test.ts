/**
 * Forecast sentence punctuation.
 *
 * `chance()` in `src/lib/situation/derive.ts` folds a stated probability into the
 * hazard sentence, so `prose.chance` has to punctuate as a sentence fragment that
 * the seven `prose.*` templates can append before their own final period.
 *
 * This exists because the whole suite passed while the rendered page read
 * "… forecast at LHR There is a 30% chance of this in the forecast period.."
 * — the templates were asserted nowhere, so nothing caught the doubled period.
 * The assertions here are on the composed sentence, not on the template string,
 * so they hold regardless of how the catalogue is edited.
 */

import { deriveSignals, visibilityInStatuteMiles } from "@/lib/situation/derive";
import { createTranslator } from "@/lib/i18n/translator";
import type { FlightIntel, WeatherForecast } from "@/lib/core/types";
import { assert, assertEqual, report, run, test } from "./harness";

/** A minimal intel object: the forecast is the only thing under test. */
function intelWithForecast(period: WeatherForecast["periods"][number]): FlightIntel {
  const forecast: WeatherForecast = { icao: "EGLL", periods: [period] };
  return {
    flightNumber: "BA123",
    routeState: "unavailable",
    routeConfidence: "unknown",
    liveTrackState: "unavailable",
    originConstraints: [],
    destinationConstraints: [],
    weatherState: "live",
    airportStatusState: "unavailable",
    sources: [],
    warnings: [],
    retrievedAt: new Date().toISOString(),
    originForecast: forecast,
  };
}

const reasonTexts = (period: WeatherForecast["periods"][number], locale: string) => {
  const { t } = createTranslator(locale);
  return deriveSignals(intelWithForecast(period), "flights", t).weatherBasis;
};

/** Every hazard kind the engine can emit, each with a stated probability. */
const HAZARDS: { name: string; period: WeatherForecast["periods"][number] }[] = [
  { name: "thunderstorms", period: { from: "t1", to: "t2", probability: 40, weather: ["TSRA"] } },
  { name: "freezing precipitation", period: { from: "t1", to: "t2", probability: 30, weather: ["FZRA"] } },
  { name: "snow", period: { from: "t1", to: "t2", probability: 60, weather: ["SN"] } },
  { name: "strong gusts", period: { from: "t1", to: "t2", probability: 25, windGustKt: 30 } },
  { name: "moderate gusts", period: { from: "t1", to: "t2", probability: 25, windGustKt: 20 } },
  { name: "fog", period: { from: "t1", to: "t2", probability: 20, weather: ["FG"] } },
  { name: "rain with low cloud", period: { from: "t1", to: "t2", probability: 35, weather: ["RA"], cloudLayers: ["OVC007"] } },
];

for (const { name, period } of HAZARDS) {
  test(`punctuation: the ${name} sentence is well formed in en and es`, () => {
    for (const locale of ["en", "es"]) {
      const reasons = reasonTexts(period, locale);
      assert(reasons.length > 0, `${locale}/${name}: expected a forecast reason, got none`);
      for (const reason of reasons) {
        assert(!reason.includes(".."), `${locale}/${name}: doubled period in ${JSON.stringify(reason)}`);
        assert(!/\s\./.test(reason), `${locale}/${name}: space before a period in ${JSON.stringify(reason)}`);
        assert(!/\.[A-Za-z]/.test(reason), `${locale}/${name}: sentence boundary missing in ${JSON.stringify(reason)}`);
        assert(reason.endsWith("."), `${locale}/${name}: sentence does not end with a period: ${JSON.stringify(reason)}`);
        assert(!reason.startsWith(" "), `${locale}/${name}: leading space in ${JSON.stringify(reason)}`);
        // The probability must actually be present, not silently dropped.
        assert(/\d+%/.test(reason), `${locale}/${name}: probability missing from ${JSON.stringify(reason)}`);
      }
    }
  });
}

test("probability: 100% is not presented as a chance", () => {
  // A stated 100% is a certainty, so the "there is an N% chance" clause is dropped.
  const reasons = reasonTexts({ from: "t1", to: "t2", probability: 100, weather: ["SN"] }, "en");
  assert(reasons.length > 0, "expected a snow reason");
  for (const reason of reasons) {
    assert(!reason.includes("%"), `a 100% probability must not read as a chance: ${JSON.stringify(reason)}`);
    assert(reason.endsWith("."), `sentence must still end cleanly: ${JSON.stringify(reason)}`);
    assert(!reason.includes(".."), `doubled period: ${JSON.stringify(reason)}`);
  }
});

test("probability: an absent probability leaves a clean sentence", () => {
  // A plain forecast period carries no probability and must not produce "undefined%".
  const reasons = reasonTexts({ from: "t1", to: "t2", weather: ["SN"] }, "en");
  assert(reasons.length > 0, "expected a snow reason");
  for (const reason of reasons) {
    assert(!reason.includes("%"), `no probability was stated, so none may appear: ${JSON.stringify(reason)}`);
    assert(!/undefined|NaN|null/.test(reason), `placeholder leaked: ${JSON.stringify(reason)}`);
    assert(reason.endsWith("."), `sentence must end with a period: ${JSON.stringify(reason)}`);
    assert(!reason.includes(".."), `doubled period: ${JSON.stringify(reason)}`);
  }
});

test("probability: an absent probability also reads cleanly in Spanish", () => {
  const reasons = reasonTexts({ from: "t1", to: "t2", weather: ["FG"] }, "es");
  assert(reasons.length > 0, "expected a fog reason");
  for (const reason of reasons) {
    assert(!reason.includes("%"), `no probability was stated: ${JSON.stringify(reason)}`);
    assert(reason.endsWith("."), `sentence must end with a period: ${JSON.stringify(reason)}`);
    assert(!reason.includes(".."), `doubled period: ${JSON.stringify(reason)}`);
    assert(!/\s\./.test(reason), `space before a period: ${JSON.stringify(reason)}`);
  }
});

test("probability: the Spanish chance clause is Spanish, not English", () => {
  const reasons = reasonTexts({ from: "t1", to: "t2", probability: 40, weather: ["TSRA"] }, "es");
  assert(reasons.length > 0, "expected a thunderstorm reason");
  for (const reason of reasons) {
    assert(
      /probabilidad/.test(reason),
      `Spanish output must use the Spanish chance clause: ${JSON.stringify(reason)}`,
    );
    assert(
      !/chance of this/.test(reason),
      `English leaked into Spanish output: ${JSON.stringify(reason)}`,
    );
  }
});

test("probability: the sentence is unchanged by where it is embedded", () => {
  // The template appends `{chance}` directly after `{where}`, so a leading space
  // in prose.chance would show up as a gap before the period. `{where}` is the
  // airport code when the route resolved, and a phrase when it did not.
  const reasons = reasonTexts({ from: "t1", to: "t2", probability: 30, weather: ["SN"] }, "en");
  for (const reason of reasons) {
    assert(!/\s{2,}/.test(reason), `double space in ${JSON.stringify(reason)}`);
    assert(
      /forecast at .+\. There is a 30%/.test(reason),
      `the chance clause must follow a completed "forecast at …" clause: ${JSON.stringify(reason)}`,
    );
  }
});

test("probability: the forecast text names the airport it applies to", () => {
  // The airport label is an operational identifier and must survive composition.
  const reasons = reasonTexts({ from: "t1", to: "t2", probability: 30, weather: ["SN"] }, "en");
  for (const reason of reasons) {
    assert(
      reason.includes("EGLL") || /departure airport/i.test(reason),
      `the forecast sentence must name where it applies: ${JSON.stringify(reason)}`,
    );
  }
});

test("probability: severity is unchanged by the punctuation fix", () => {
  // T5 was a text fix; it must not have moved any severity threshold.
  const cases: [WeatherForecast["periods"][number], string, string][] = [
    [{ from: "a", to: "b", weather: ["TSRA"] }, "high", "thunderstorms"],
    [{ from: "a", to: "b", weather: ["FZRA"] }, "high", "freezing precipitation"],
    [{ from: "a", to: "b", weather: ["SN"] }, "high", "snow"],
    [{ from: "a", to: "b", windGustKt: 30 }, "moderate", "strong gusts"],
    [{ from: "a", to: "b", windGustKt: 20 }, "low", "moderate gusts"],
    [{ from: "a", to: "b", weather: ["FG"] }, "moderate", "fog"],
    [{ from: "a", to: "b", weather: ["RA"], cloudLayers: ["OVC007"] }, "low", "rain with low cloud"],
  ];
  const { t } = createTranslator("en");
  for (const [period, expected, label] of cases) {
    const signals = deriveSignals(intelWithForecast(period), "flights", t);
    assertEqual(signals.weatherSeverity, expected, `severity for ${label}`);
  }
});

/**
 * Forecast visibility.
 *
 * The decoded TAF `visib` field is not typed consistently: below 6 SM the source
 * returns a number (a raw `4000` metres group decodes to 2.49), while "6 SM or
 * more" returns the string `"6+"`. The severity check previously compared the
 * field numerically, so it could never fire against the string form and a
 * forecast of 0.75 SM raised no hazard — a false negative on the one input the
 * "what this means" prose keys off. These assertions pin the parse and the
 * threshold in both directions.
 */
test("visibility: a low forecast visibility raises a hazard", () => {
  const { t } = createTranslator("en");
  // These are the display forms `normaliseVisibility` produces, including the
  // "2.49 SM" it renders for a raw `4000` metre group.
  for (const visibility of ["0.75 SM", "1.86 SM", "2.49 SM", "1", "1/2 SM", "2.49"]) {
    const signals = deriveSignals(
      intelWithForecast({ from: "a", to: "b", visibility }),
      "flights",
      t,
    );
    assertEqual(
      signals.weatherSeverity,
      "moderate",
      `visibility ${JSON.stringify(visibility)} is below 3 SM and must raise a hazard`,
    );
    assert(
      signals.weatherBasis.some((reason) => /visibility below 3/i.test(reason)),
      `the reason must explain the low visibility: ${JSON.stringify(signals.weatherBasis)}`,
    );
  }
});

test("visibility: a high forecast visibility raises no hazard", () => {
  const { t } = createTranslator("en");
  // 3 SM is the threshold and is not itself low; "6+" means six or more.
  for (const visibility of ["3 SM", "5 SM", "6+", "P6SM", "6", "10 SM"]) {
    const signals = deriveSignals(
      intelWithForecast({ from: "a", to: "b", visibility }),
      "flights",
      t,
    );
    assertEqual(
      signals.weatherSeverity,
      "none",
      `visibility ${JSON.stringify(visibility)} must not raise a visibility hazard`,
    );
  }
});

test("visibility: an absent or unparseable value raises no hazard", () => {
  const { t } = createTranslator("en");
  // A missing value is unknown, not clear — it must not fabricate a hazard, and
  // it must not be read as zero.
  for (const visibility of [undefined, "", "   ", "unknown"]) {
    const signals = deriveSignals(
      intelWithForecast({ from: "a", to: "b", visibility }),
      "flights",
      t,
    );
    assertEqual(
      signals.weatherSeverity,
      "none",
      `visibility ${JSON.stringify(visibility)} is unknown and must not raise a hazard`,
    );
  }
});

test("visibility: the parser reads the source's mixed number and string forms", () => {
  // The decoded `visib` field is a number below 6 SM and the string "6+" at or
  // above it, so the parser is the one place that reconciles the two. It is
  // asserted directly because the internal type is the normalised string, which
  // means the number branch is only reachable from the source shape.
  assertEqual(visibilityInStatuteMiles(0.75), 0.75, "a raw number passes through");
  assertEqual(visibilityInStatuteMiles(2.49), 2.49, "a decoded 4000 m group");
  assertEqual(visibilityInStatuteMiles("0.75 SM"), 0.75, "the normalised display form");
  assertEqual(visibilityInStatuteMiles("6+"), 6, "six or more is read at its floor");
  assertEqual(visibilityInStatuteMiles("P6SM"), 6, "the older prefix form");
  assertEqual(visibilityInStatuteMiles("1/2 SM"), 0.5, "a fraction");
  assertEqual(visibilityInStatuteMiles("2 1/2 SM"), 2, "a mixed number is read at its whole part");
  assertEqual(visibilityInStatuteMiles(undefined), undefined, "absent is unknown, not zero");
  assertEqual(visibilityInStatuteMiles(""), undefined, "empty is unknown");
  assertEqual(visibilityInStatuteMiles("   "), undefined, "blank is unknown");
  assertEqual(visibilityInStatuteMiles("unknown"), undefined, "prose is not a value");
  assertEqual(visibilityInStatuteMiles(Number.NaN), undefined, "NaN is unknown");
});

test("visibility: fog takes precedence over the low-visibility branch", () => {
  // Both conditions are present; the fog sentence names the cause and is the one
  // a traveller can act on, so it must win rather than the generic threshold.
  const { t } = createTranslator("en");
  const signals = deriveSignals(
    intelWithForecast({ from: "a", to: "b", visibility: "0.5 SM", weather: ["FG"] }),
    "flights",
    t,
  );
  assertEqual(signals.weatherSeverity, "moderate", "fog with low visibility is a moderate hazard");
  assert(
    signals.weatherBasis.some((reason) => /fog/i.test(reason)),
    `fog must be named: ${JSON.stringify(signals.weatherBasis)}`,
  );
  assert(
    !signals.weatherBasis.some((reason) => /visibility below 3/i.test(reason)),
    `the generic visibility sentence must not duplicate fog: ${JSON.stringify(signals.weatherBasis)}`,
  );
});

test("visibility: the low-visibility sentence reads cleanly in en and es", () => {
  for (const locale of ["en", "es"]) {
    const { t } = createTranslator(locale);
    const signals = deriveSignals(
      intelWithForecast({ from: "a", to: "b", probability: 30, visibility: "1 SM" }),
      "flights",
      t,
    );
    const reason = signals.weatherBasis.find((r) => /3|visib|visibil/i.test(r));
    assert(reason !== undefined, `${locale}: expected a low-visibility reason`);
    if (reason) {
      assert(!reason.includes(".."), `${locale}: doubled period in ${JSON.stringify(reason)}`);
      assert(reason.endsWith("."), `${locale}: sentence must end with a period: ${JSON.stringify(reason)}`);
      assert(/\d+%/.test(reason), `${locale}: stated probability missing: ${JSON.stringify(reason)}`);
    }
  }
});

run()
  .then(() => report("Forecast sentence punctuation"))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
