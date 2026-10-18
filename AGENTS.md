# AGENTS.md

Repository-specific knowledge for WAYFINDER. See `README.md` for the product and
architecture overview.

## Commands

```bash
npm run dev          # dev server on :3000
npm run build        # production build
npm run start        # serve the production build on :3000
npm run typecheck    # tsc --noEmit  (must pass before any commit)
npm run lint         # next lint
npm run check:i18n   # verifies every referenced t() key resolves in all 9 locales
npm run verify       # typecheck + check:i18n + unit tests (45 assertions)
npm run test:live    # hits every official provider and reports reachability
npm run test:browser # drives the real flow + mobile menu + conditions disclosure in headless Chromium
npm run test:responsive # asserts no horizontal overflow at the brief's 6 widths
npm run verify:sources  # checks the official rights URLs are live and their quotes are still published
```

`npm run lint` prompts interactively on first run; pass `--` flags or pre-seed the
ESLint config if running headless.

`test:browser` and `test:responsive` need `npm run start` running and
`/usr/bin/chromium`. They drive the rendered page over the DevTools protocol —
prefer extending them over asserting on markup.

## Non-negotiable product rules

These are enforced by the product's purpose, not style preference. Do not break them.

1. **Never invent data.** No fabricated flight status, source timestamp,
   verification result, entitlement, statistic, testimonial or "live" badge.
   No source we can reach publishes per-flight status, so WAYFINDER never shows one.
2. **Every fact carries provenance.** Nothing reaches the UI without a `DataState`
   (`live | cached | stale | unavailable | demo`) and a source reference.
3. **Fail open with a warning, never blank.** On provider failure keep the last
   valid value, mark it `stale`, and keep the page populated (`src/lib/core/cache.ts`).
4. **Operational identifiers are parameters, never translated.** Flight numbers,
   airport codes, dates, times, gates, airline names and booking references must
   pass through as `t()` parameters.
5. **Colour is never the only signal.** Pair status colours with an icon and text.
6. **Secrets stay server-side.** AI credentials are read only in `src/lib/ai/llm.ts`.
7. **Button-free lying.** Every interactive element must have a real outcome.
8. **"Nothing checked" is not "nothing wrong".** When no source answered, the
   page must say the situation is unknown — never that no disruption was
   reported. The directory of official pages (`src/lib/assist/directory.ts`)
   offers a way forward for places with no live provider; those entries are
   official pages to check, not retrieved sources, and carry no retrieval
   timestamp. The directory spans roughly thirty countries; every URL in it was
   fetched and confirmed to resolve before being added, so do not add an entry
   from memory — check it first. If a host refuses every request from this
   network, leave that country out rather than guessing a URL.
9. **A forecast is not a warning.** A model's expectation and an authority's
   declared hazard are different claims. A provider may only describe a hazard
   as declared when it declares `weatherWarnings: true` and is the responsible
   authority. A provider that returns a forecast sets `forecast: true`,
   `weatherWarnings: false`, and caps its severity at `minor`
   (`src/lib/assist/providers/openMeteo.ts`). Never let a forecast reach
   `major`/`severe`, and never label a model value a "station observation".
   A source that answered with only informational readings must not produce a
   "change worth checking" headline — see `buildHeadline` in
   `src/lib/assist/engine.ts`.

## Conventions

- Design tokens live in `src/app/globals.css` as CSS variables; use the Tailwind
  token classes (`text-ink-*`, `bg-paper-*`, `accent-*`, `warn-*`, `success-*`,
  `danger-*`, `line-*`). Do not hard-code hex values in components.
- `toneForSeverity` in `src/components/ui/Badge.tsx` maps **two** vocabularies
  and both must keep working: the flight assessment ladder
  (`high | elevated | moderate | low | none`) and the generic condition
  severities produced by the everyday providers
  (`severe | major | minor | info | good_service`). Only the flight ladder once
  mapped, so every generic condition rendered as neutral grey. When adding a
  severity value anywhere, extend this switch or the badge will silently
  understate a disruption.
- A forecast is not a warning, and the UI says which it is. `AssistSource`
  carries a `forecast` flag taken from
  `ProviderCapabilities.forecast && !weatherWarnings`; the source panel shows a
  "Forecast" badge and note for it. Never derive that label from the provider's
  name, and never let a forecast source read as a declared hazard.
- User-facing copy goes through `t("...")`. Catalogues live in
  `src/lib/i18n/messages.ts`. All nine locales currently resolve every referenced
  key; `fr/de/pt/ar/zh/ja/hi` are marked `partial` in `locales.ts` and fall back to
  English for keys they do not carry. When adding copy, run `npm run check:i18n`.
- Operational identifiers (flight numbers, airport codes, line names, route
  numbers, dates, times, gates, airline names, booking references) must pass
  through as `t()` parameters — never interpolated into a translatable sentence.
- Add components under `src/components/<area>/`. Pages are thin wrappers; the
  body lives in a `"use client"` component when it needs locale context.
- Everyday-category provider adapters go in `src/lib/assist/providers/` and are
  registered in `src/lib/assist/registry.ts`. Aviation adapters stay in
  `src/lib/providers/`. Both must normalise + validate before returning; shared
  cache/HTTP helpers are in `src/lib/core/`.
- One control, one job. A page must not render two controls with the same
  accessible name doing the same thing. Refresh lives once, next to the
  freshness badge (`SituationHeader` / the assist view header); the page shell in
  `src/app/situation/page.tsx` and `src/app/assist/page.tsx` carries only the
  Back link. Duplicate `Refresh now` buttons were confirmed by walking the
  accessibility tree (`tests/` CDP helpers), which is how to re-check this.
- Disabled is never just faded. `Button`'s disabled state sets its own
  `paper-200`/`ink-500` pair (≈5.8:1) rather than `opacity-50`, which washed the
  white-on-teal label down to 3.5:1 and failed WCAG 2.2 AA. Keep any bespoke
  control's disabled state on the same pair. `IntentEntry`'s submit is the
  hand-rolled case to copy from.
- Two different things must not share a heading. `shortcuts.title` ("Or start
  from a situation") is the hero chip group; `situations.title` ("Supported
  situations") is the `#situations` section. They collided, producing two
  identically titled headings on one page.
- Decorative "live" affordances are banned. A pulsing dot implies an active feed;
  the hero eyebrow dot is now static. Only `DataStateBadge` may say "live", and
  only from a real `DataState`.

## Verifying UI changes

Chromium is at `/usr/bin/chromium`; drive it through the DevTools protocol as
`tests/assist-flow.mjs` does (spawn with `--remote-debugging-port`, connect a
`WebSocket` to the target, `Emulation.setDeviceMetricsOverride`, then dispatch
real `Input.dispatchMouseEvent` presses). Drive the real flow rather than
asserting on markup:

- `/support` need cards are hidden radios wrapped in a `<label>` — click the
  label, not the input. Category values are `flights`, `metro`, `rail`, `bus`,
  `road`, `weather`, `stranded`, `public_service`, `other`.
- Step 2 field ids are `location`, `from`, `to`, `network`, `description`.
  Step 2 asks for a single free-text **location** ("Lagos, Nigeria"); the
  structured `countryCode`/`city`/`region` fields still exist in the schema for
  existing callers but are no longer asked for in the flow. `resolveLocation`
  (`src/lib/assist/location.ts`) turns the free text into country/city/region
  before provider selection — never demand a country code again.
- A name the curated table cannot place goes to the keyless Open-Meteo geocoder
  (`src/lib/assist/placeGeocode.ts`, `resolveLocationWithGeocoder`). Three rules
  are load-bearing and must not be relaxed: only an **exact** name match counts
  (another city's country must never be attached), a multi-country match resolves
  only when the leading population dominates by `DOMINANCE_RATIO` (10×), and any
  failure — no match, network error, unexpected payload — returns "unknown",
  never a guess. The curated table always wins; the geocoder runs only for a name
  that resolved to no country at all.
- Never report a coverage verdict for a place whose country we did not
  establish. `composeAssistance` derives a single `PlaceState` from the resolved
  place: `ambiguous` (a real city name in several countries — ask which, do not
  name a country), `country_only` (a country with no place inside it — ask for a
  city), or `resolved`. Both unresolved states emit a coverage gap
  (`ambiguous_place` / `add_place`) and their own headline/summary instead of the
  "no source covers this" wording, which would be false: the global forecast
  covers every country in the table. `country_only` is gated on **no provider
  having responded**, so a nationwide source that can answer a country-level
  query (DWD for Germany) still shows its real page rather than being hidden
  behind an unnecessary prompt. In the UI, `AskForPlace` (`src/app/assist/page.tsx`)
  renders that prompt; its `countryOnly` flag is gated on `reconciled`, so a stale
  answer cannot suppress the rebuild that the traveller's new city requires.
- The place prompt is also reached **without a round trip**. `countryLevelCoverage`
  (`src/lib/assist/registry.ts`) derives, per category, which countries a provider
  can answer from the country name alone by calling each provider's own
  `supports()` with the same bare-country query the engine would — so the interface
  and the engine cannot disagree, and a hand-written "countries that work" table
  cannot drift from the providers. It is published on `GET /api/assist` and consumed
  by `src/lib/assist/countryHint.ts` (`needsPlacePrompt`), which preempts only a
  request carrying nothing but a country name: any `description`/`network`/`from`/`to`
  disables the shortcut, because USGS and DWD's road branch make `supports()` depend
  on the traveller's own words, which a catalogue cannot evaluate. Absent coverage
  (slow or failed fetch) only costs the shortcut, never produces a wrong prompt.
  Two gates differ deliberately: the client `urlNeedsPlace` is computed from the
  URL, so it needs **no** `reconciled` gate and must not have one; the server
  `countryOnly` describes a past answer and must keep it. Only a bare country waits
  for the catalogue to settle (`coverageSettled`); a city query never waits.
- The in-page language select is `#assist-view-locale`; the header menu is a
  disclosure button with `aria-controls="mobile-menu"` (44px, Escape returns focus).
- After `scrollIntoView`, wait a frame before reading `getBoundingClientRect` —
  coordinates read in the same tick are stale and clicks land on the wrong element.
- Localise by setting `localStorage.setItem('wayfinder.locale','ar')` then
  reloading, or by driving the in-page select.
- Changing language must rebuild the server-composed explanation, not just the
  chrome: `src/app/assist/page.tsx` re-posts to `/api/assist` when the active
  locale and `assistance.locale` differ. Do not reintroduce a provider-level
  rebuild method; one owner keeps this predictable.
- Check horizontal overflow at 320/360/390/768/1024/1440px with
  `npm run test:responsive`. The audit seeds `wayfinder.assistRequest.v1` from
  the path's query string so `/assist?category=...` renders the real situation
  page rather than the empty state; keep that seeding if you change the audit.
- The landing preview (`ProductPreview`) defaults to the public-transport example
  and offers flights as a second scenario. Keep non-aviation first so the product
  reads as a general assistance platform, not a flight tracker.

## Running the dev server and browser tests safely

- Do **not** run `npm run build` while `npm run dev` is serving the same `.next`
  directory. The production build overwrites `.next/server/*` and the dev server
  then throws `Cannot find module './NNN.js'` on every route: pages still return
  200, but hydration never completes, so the UI stays on the loading skeleton and
  every browser test fails with confusing errors. Stop the dev server first, or
  build in a separate checkout.
- To recover an unusable dev server: `pkill -f "next dev"; pkill -f next-server;
  rm -rf .next`, then restart. Deleting `.next` is safe; it is regenerated.
- A dev server left over from an earlier session can hold port 3000 and serve
  stale bundles (you see `EADDRINUSE` on restart). Confirm which PID owns port
  3000 before concluding a change had no effect. A surprising browser-test
  failure is more often a stale server than a code regression: reproduce against
  a freshly started server before debugging the code.
- Browser suites (`tests/mobile-nav.mjs`, `tests/locales.mjs`,
  `tests/assist-flow.mjs`, `tests/conditions.mjs`) drive real Chromium over the
  DevTools protocol. They need `/usr/bin/chromium` and a running server.

## Directory and discovery coverage

- `src/lib/assist/directory.ts` is the curated official-source index. Add an
  entry only after `curl -sI -L` confirms the URL resolves; every `covers` line
  must state what the page can and cannot tell the traveller. Entries carry no
  status and no timestamp by design.
- `src/lib/assist/providers/openMeteo.ts` is the global, keyless weather source.
  It aggregates national models (NOAA GFS, DWD ICON, Météo-France, ECMWF) into
  one worldwide forecast so places outside US/DE are no longer dead ends. It is a
  **forecast**, not a warning: it declares `weatherWarnings: false` and
  `forecast: true`, and its severities are capped at `minor`. Only a national
  meteorological authority may be presented as having declared a hazard. It is
  free for non-commercial use under CC BY 4.0 with call limits (<10,000/day,
  5,000/hour, 600/minute); attribution is mandatory and is carried on every
  source it returns. Verify the terms at https://open-meteo.com/en/terms before
  any commercial use.
- The `ProviderCapabilities.forecast` flag exists to keep "forecast" and
  "warning" distinct in the engine. Do not fold a forecast into
  `weatherWarnings`; that would let a model reading be shown as an authority's
  hazard declaration.
- Web-search discovery (`src/lib/assist/providers/discovery.ts`) is OPTIONAL
  (`WAYFINDER_GOOGLE_API_KEY`) and uses Gemini grounding with Google Search. It
  is an advanced extra, never required: the free providers plus the directory
  answer every supported category worldwide. It contributes **leads only** —
  never conditions, statuses or timestamps — ranks below any live authority, and
  is deduplicated against the directory. Keep that separation when extending it.
- The older Google Custom Search JSON API is closed to new customers and is
  scheduled for discontinuation on 1 January 2027; the Site Restricted JSON API
  stopped serving traffic on 8 January 2025. Do not reintroduce either.
- Discovery failures must stay classified and separate. A discovery provider that
  is configured but refused (no billing, free tier, quota) fails fast with a 4xx
  and produces zero leads. `AssistancePage.discovery` records
  `leads | no_results | not_configured | unreachable` so the page can say what
  actually happened. Never let "discovery produced nothing" become "no source
  covers this place" — that is the same misleading collapse that the
  `hasDirectory` distinction in `buildGaps`/`buildHeadline`/`fallbackExplanation`
  exists to prevent.

## Launch film (`/.agent_tmp/video/`, not committed)

Two deliverables, both 3840x2160 H.264 + AAC, `+faststart`:
`wayfinder-launch-22s-4k-scored.mp4` (22s cut) and
`wayfinder-launch-4k-scored.mp4` (full film). Silent versions sit beside them.
`README.md` in that folder documents the pipeline; `src/` holds one script per
concern (score, mux, cuts, audioverify, audiocheck, serve, verify).

Things that were expensive to learn, so they do not need learning twice:

- **Verify the delivered file, not the intent.** Every real bug in the score was
  found by decoding audio back out of the muxed MP4. Three of them:
  `airTick` computed `input - lowpass` *after* updating the lowpass state, so the
  high band was always zero and the tick was silent; the mix had 97% of its
  energy below 2kHz (a sine-partial pad has no presence content — fix with an
  octave-up voicing plus a quiet swept-noise air bed, not with EQ); and
  single-pass `loudnorm` overshot to **+2.16 dBTP**, which is inter-sample
  clipping. `mux.mjs` now measures an intermediate and normalises in linear
  mode, which scales by one factor and cannot overshoot.
- **A constant noise floor compresses measured dB rises.** Adding a quiet air
  bed to the mix made the beat-alignment check report strong ticks as weak,
  because a floor F added to both sides shrinks the ratio toward 1. The tick was
  unchanged; only the metric moved. Check timing, and treat the magnitude as
  indicative.
- **RMS windows must exceed one cycle of the lowest note.** 10ms windows are
  shorter than one cycle of a 73Hz sub, so RMS swings with phase and invents
  onsets. 30ms on a 5ms hop is the working setting.
- **Adjacent chords must share few notes.** F#m and D share three of four, so a
  cut landing on that pair barely moves however loud the transient.
- **One-pole filters cannot isolate a band.** 2-3.9kHz needs a real FFT; the
  one-pole version reported ticks as missing when they were present.
- **`serve.mjs` must not cache HTML.** It advertised `max-age=3600` on
  `index.html`, so a page update stayed invisible for an hour. HTML is now
  `no-cache` with an ETag that is actually honoured (304), while media is
  `immutable`. Any Range request must take precedence over `If-None-Match`.
- **H.264 level is a compatibility decision, not a quality one.** The 4K masters
  are High@5.2, and a phone or older laptop that cannot decode 4K declines the
  file outright rather than degrading — so a 4K-only delivery is unplayable for
  a large share of devices. `compat.mjs` derives 1080p Level 4.0 and 720p
  Level 3.1 versions, capping bitrate with `-maxrate`/`-bufsize` so a stream
  stays inside the envelope its level promises, and **stream-copies the audio**
  so the mastered −14 LUFS mix survives bit-exact. The watch page offers
  compatible sources first and keeps the 4K master available but not first.
- **A missing analysis dependency must not read as a content defect.** With
  Pillow absent, the blank-frame check's Python one-liner failed for all ten
  samples and the gate printed "10 blank" — indistinguishable from a corrupt
  render, and it sent me hunting a video bug that did not exist. `verify.mjs`
  now counts unmeasurable frames separately (`frame check ran`) and takes
  `--res` so one gate serves both tiers.

## Suspect a stale dev server before suspecting the markup

A long-lived `next dev` process had been started before recent edits. `/`
returned 200, but `/_next/static/css/app/layout.css` was a 9-byte "Not Found",
so the page rendered with **no Tailwind at all** and every `hidden`,
`lg:hidden` and grid class silently did nothing. That produced a phantom
duplicate: `HeroExtras` appeared twice at 1440px because `lg:hidden` was not
applying, which looked exactly like a real responsive bug in `Hero.tsx`.
Production was correct all along.

- When a measurement contradicts the source, check the server first. The tell
  is one request: fetch the stylesheet and look at its byte length. A layout
  that ignores every utility class is a CSS-delivery failure.
- If dev and `next start` disagree about layout, production is telling the
  truth — it is the artefact that ships.
- `npm run start` hardcodes `-p 3000` and collides with dev. Use
  `npx next start -p <port>` to run a build alongside it.
- Restart dev after a long edit session rather than trusting the process.

## Status fields: absence must be shown, never invented

`src/lib/situation/statusFields.ts` splits current-status fields into what a
reachable source published and what it did not; `CurrentStatus` folds the
unpublished ones into one disclosure. The rule is a pure function so
`tests/categories.test.ts` can guard it. Preserve both properties:

- **The status verdict stays outside the disclosure.** "Latest confirmed
  status" is the product's key answer and is often a "cannot confirm". Folding
  that away to save height would hide the verdict.
- Scheduled departure/arrival, gate and terminal are always unpublished. No
  source we reach publishes them; only the airline can confirm. They appear as
  gaps so the traveller knows what to ask for, not as data.

## `favicon.ico` is still requested when an SVG icon exists

`src/app/icon.svg` alone leaves `/favicon.ico` 404ing, because browsers request
that path by default. `scripts/make-favicon.mjs` renders a real 32x32 ICO
(4x supersampled, PNG payload) from the same geometry; the output is committed
so the build does not depend on the script running.

## Generated prose: one fact, one place

The situation page is long enough that repeated sentences are a real usability
cost, so the same fact should not be stated twice in different sections. Two
traps that have already bitten:

- **`fallback.summaryLead` must not restate the headline.** `headline.cancelled`
  and friends already end with "we cannot confirm the status … the airline is
  the only place that can", and `uncertain.flightStatus` says it again in the
  summary. The lead exists to say what we *did* check, so keep the
  per-flight-status disclaimer out of it.
- **The narrative weather line summarises, it does not transcribe.**
  `buildGroundedFacts` composes `facts.weatherCompact` for the "what this means"
  prose. The Current status section already lists wind, visibility and
  temperature per airport, so re-listing those numbers in the narrative turns it
  into a copy of the table above. Keep the category, leave the numbers in the
  status section.

`facts.wind` / `facts.visibility` / `facts.temperature` / `facts.summaryLine` /
`facts.noSummaryFields` were removed for this reason. If a future section needs
the raw values, render them from the observation object, not from prose.

### `prose.chance` owns its own punctuation

The forecast sentences (`prose.rainLowCloud`, `prose.gusts`, …) append a final
`.`, so `prose.chance` supplies the sentence break itself: it opens with `. `
and carries no trailing period. If the key also ends with a period the two
collide and the sentence reads `… forecast at LHR There is a 30% chance of this
in the forecast period..`. Drop the leading `.` and the two sentences run
together as `… forecast at LHR There is a 30% chance …`.

`tests/prose-punctuation.test.ts` checks every template that embeds `{chance}`
for a well-formed result in both `en` and `es`, so a future edit to either side
of the join fails loudly rather than shipping the doubled period.

## Forecast visibility is not one type

The aviation-weather TAF decoder returns `visib` as a **number below 6 SM** and
the **string `"6+"` at or above it** — a raw `4000` metre group comes back as
`2.49`, a raw `1200` as `0.75`. `normaliseVisibility` renders both as a display
string (`"2.49 SM"`, `"6+"`), so anything that needs the number must parse that
string rather than compare the field directly. Comparing it numerically meant a
forecast of 0.75 SM raised no hazard at all, which left `prose.lowVisibility`
unreachable and could keep the "what this means" prose silent when visibility
was the reason to worry.

`visibilityInStatuteMiles` in `src/lib/situation/derive.ts` is the single place
that reconciles the two shapes. Treat an absent or unparseable value as
*unknown*, never as clear: returning `0` would invent a hazard, and returning a
large number would hide one.

## Folding long action lists

`RecommendedSteps` keeps every `priority === "now"` step on screen and folds
only the lower-priority tail behind a disclosure. This preserves the brief's
requirement that prioritised actions lead while cutting roughly 800px of
mobile scroll.

The rule is "never hide an immediate action", and the fold must be computed
from the **last** `now` step, not the first non-`now` one. The plan is ordered
by importance, not grouped by priority: a delay or an options request with a
connection emits `now, now, soon, now, now`, so slicing at the first `soon`
dropped `check-connection` and `dont-assume-protection` behind the disclosure.
`tests/priority-fold.test.ts` checks the ordering over every need, and
`tests/steps-disclosure.mjs` asserts on the rendered page that the set of
immediate actions is identical collapsed and expanded.

## Situation-page audits

`tests/audit-situation.mjs` drives the real flow to a real situation page and
reports each section's height and document position. Run it before and after a
layout change: it is the quickest way to see whether a section grew because it
gained content or because it started repeating itself.
