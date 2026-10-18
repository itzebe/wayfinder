/**
 * Recommendation prioritisation.
 *
 * `RecommendedSteps` folds the lower-priority tail of the action list behind a
 * disclosure. The rule the brief states is absolute: an action marked "now" is
 * never behind that control. The first implementation sliced at the first
 * non-"now" step, which held only because the plan happened to be grouped by
 * priority. `buildRecommendations` does not group: for a delay or an options
 * request with a connection it emits now, now, soon, now, now — so the slice hid
 * `check-connection` and `dont-assume-protection`, two immediate actions.
 *
 * These tests exercise the ordering the engine actually produces, over every
 * need the flight path supports, so the guarantee is checked against real data
 * rather than a hand-built list.
 */

import { buildRecommendations } from "@/lib/situation/derive";
import { createTranslator } from "@/lib/i18n/translator";
import type { FlightIntel } from "@/lib/core/types";
import { assert, assertEqual, report, run, test } from "./harness";

const NEEDS = ["cancelled", "delayed", "options", "gate_change", "announcement"];

function intel(options: { connection: boolean; degraded?: boolean }): FlightIntel {
  return {
    flightNumber: "BA123",
    routeState: "unavailable",
    routeConfidence: "unknown",
    liveTrackState: "unavailable",
    origin: { iata: "LHR" },
    destination: { iata: "JFK" },
    originConstraints: [],
    destinationConstraints: [],
    weatherState: options.degraded ? "unavailable" : "live",
    airportStatusState: options.degraded ? "stale" : "live",
    sources: [],
    warnings: [],
    retrievedAt: new Date().toISOString(),
  };
}

const plan = (need: string, connection: boolean, degraded = false) => {
  const { t } = createTranslator("en");
  return buildRecommendations({
    intel: intel({ connection, degraded }),
    need,
    hasConnection: connection,
    airlineName: "British Airways",
    t,
  });
};

/** Mirrors the component's fold: everything up to and including the last "now". */
function fold(steps: { priority: string; id?: string; rank?: number }[]) {
  const lastNowIndex = steps.map((s) => s.priority).lastIndexOf("now");
  const visibleCount = steps.length === 0 ? 0 : Math.max(lastNowIndex + 1, 1);
  return {
    visible: steps.slice(0, visibleCount),
    hidden: steps.slice(visibleCount),
    collapsible: visibleCount < steps.length,
  };
}

test("priority: no immediate action is ever hidden by the fold", () => {
  for (const need of NEEDS) {
    for (const connection of [true, false]) {
      for (const degraded of [true, false]) {
        const steps = plan(need, connection, degraded);
        const { visible, hidden } = fold(steps);
        const hiddenNow = hidden.filter((s) => s.priority === "now");
        assertEqual(
          hiddenNow.length,
          0,
          `${need}/connection=${connection}/degraded=${degraded} hid immediate actions: ${hiddenNow
            .map((s) => s.id)
            .join(", ")}`,
        );
        assert(
          visible.some((s) => s.priority === "now") || !steps.some((s) => s.priority === "now"),
          `${need}: expected every immediate action to be visible`,
        );
      }
    }
  }
});

test("priority: the fold does not reorder or renumber the plan", () => {
  for (const need of NEEDS) {
    const steps = plan(need, true);
    const { visible, hidden } = fold(steps);
    // Concatenating the two halves must reproduce the engine's order exactly.
    assertEqual(
      [...visible, ...hidden].map((s) => s.id).join(","),
      steps.map((s) => s.id).join(","),
      `${need}: the fold changed the order`,
    );
    // Ranks are the engine's, and remain a contiguous 1..n run.
    const ranks = steps.map((s) => s.rank);
    assertEqual(ranks.join(","), steps.map((_, i) => i + 1).join(","), `${need}: ranks are not 1..n`);
  }
});

test("priority: a delay with a connection still shows both connection actions", () => {
  // The exact case that regressed: a "soon" step is emitted between "now" steps.
  const steps = plan("delayed", true);
  const { visible } = fold(steps);
  const visibleIds = visible.map((s) => s.id);
  assert(
    visibleIds.includes("check-connection"),
    `check-connection must be visible, got ${visibleIds.join(", ")}`,
  );
  assert(
    visibleIds.includes("dont-assume-protection"),
    `dont-assume-protection must be visible, got ${visibleIds.join(", ")}`,
  );
  // And the interleaving that caused it is still present in the plan.
  const priorities = steps.map((s) => s.priority);
  assert(
    priorities.indexOf("soon") < priorities.lastIndexOf("now"),
    "expected a lower-priority step to be interleaved before the last immediate one",
  );
});

test("priority: the fold is offered only when something is actually folded", () => {
  for (const need of NEEDS) {
    const steps = plan(need, false);
    const { collapsible, hidden } = fold(steps);
    assertEqual(
      collapsible,
      hidden.length > 0,
      `${need}: disclosure offered=${collapsible} but hidden=${hidden.length}`,
    );
  }
});

test("priority: an empty plan folds to nothing and renders no disclosure", () => {
  // Defensive: the component must not offer a control that expands to nothing.
  const { visible, hidden, collapsible } = fold([]);
  assertEqual(visible.length, 0, "nothing should be visible");
  assertEqual(hidden.length, 0, "nothing should be hidden");
  assertEqual(collapsible, false, "an empty plan must not offer a disclosure");
});

test("priority: a single immediate action is never folded", () => {
  const { visible, hidden, collapsible } = fold([{ priority: "now" }]);
  assertEqual(visible.length, 1, "the only action must stay visible");
  assertEqual(hidden.length, 0, "nothing may be hidden");
  assertEqual(collapsible, false, "no disclosure is needed");
});

test("priority: an all-lower-priority plan keeps at least one action visible", () => {
  // With no "now" step the fold still must not collapse to an empty list.
  const steps = [{ priority: "soon" }, { priority: "when_possible" }, { priority: "when_possible" }];
  const { visible, hidden } = fold(steps);
  assert(visible.length >= 1, "at least one action must remain visible");
  assertEqual(visible.length + hidden.length, steps.length, "no action may be dropped");
});

test("priority: every step carries a priority the component can render", () => {
  // PRIORITY_META has a key per priority; an unlisted value would render no badge.
  const known = new Set(["now", "soon", "when_possible"]);
  for (const need of NEEDS) {
    for (const connection of [true, false]) {
      for (const step of plan(need, connection)) {
        assert(known.has(step.priority), `${need}/${step.id}: unknown priority ${step.priority}`);
        assert(step.title.length > 0, `${need}/${step.id}: empty title`);
        assert(step.rationale.length > 0, `${need}/${step.id}: empty rationale`);
      }
    }
  }
});

test("priority: the plan is populated for every supported need", () => {
  for (const need of NEEDS) {
    const steps = plan(need, true);
    assert(steps.length > 0, `${need}: expected at least one action`);
    assert(
      steps.some((s) => s.priority === "now"),
      `${need}: every flight disruption should lead with an immediate action`,
    );
  }
});

run()
  .then(() => report("Recommendation prioritisation"))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
