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
