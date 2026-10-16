# WAYFINDER

**Understand what is happening. Know what it means. Find your next step.**

WAYFINDER is a multilingual assistance platform for people caught in an unexpected
real-world situation. It covers **six everyday disruption categories** — metro and
subway, rail, buses, roads, weather and emergencies, and flights — plus
public-service notices and an open-ended "describe it in your own words" entry
point. Someone whose flight is cancelled, whose train line is suspended, or whose
region is under a weather warning needs to understand the situation, find reliable
current information, and know what to do next — often in a language they do not
speak fluently.

It is international: queries are answered by official operators and authorities
in the United Kingdom, the United States and Germany, in nine interface
languages.

Built for the UI/UX and Web Design hackathon.

## The core promise

The signature screen is a **personalised situation page**. It separates what is
verified, what is our interpretation, and what remains unknown; shows the official
sources behind every fact with a retrieval time; and gives a short, prioritised
list of next steps.

## Design principles

- Calm, confident, modern. Deep midnight navy on warm off-white, with a teal accent.
- Colour is never the only signal. Every status carries an icon, a text label and
  a colour, so verified facts, recommendations, alerts and uncertain information
  are distinguishable without relying on hue.
- All colours are design tokens (see `src/app/globals.css`).
- No fabricated data, statistics, testimonials, logos or "live" badges.

## Data sources

WAYFINDER deliberately uses **only public, credential-free, official or
authoritative sources**, and it refuses to invent a status.

| Source | Country | Categories | What it provides | Cadence |
| --- | --- | --- | --- | --- |
| [Transport for London — Tube](https://api.tfl.gov.uk/) | GB | metro, rail | London Underground line status | live |
| [Transport for London — Rail](https://api.tfl.gov.uk/) | GB | rail | TfL rail line status | live |
| [Transport for London — Bus](https://api.tfl.gov.uk/) | GB | bus | London bus line status | live |
| [MTA New York City Transit](https://api.mta.info/) | US | metro | GTFS-Realtime subway alerts | live |
| [BART](https://www.bart.gov/) | US | metro, rail | GTFS-Realtime service alerts | live |
| [NOAA / National Weather Service](https://api.weather.gov/) | US | weather, road | Active alerts and warnings | live |
| [Deutscher Wetterdienst (DWD)](https://www.dwd.de/) | DE | weather, road | Nationwide weather warnings | live |
| [U.S. Geological Survey (USGS)](https://earthquake.usgs.gov/) | US | weather, other | Recent seismic events | live |
| [California Department of Transportation (Caltrans)](https://cwwp2.dot.ca.gov/) | US | road | Lane and road closures | live |
| [UK Government (GOV.UK)](https://www.gov.uk/) | GB | public_service, road | Public notices and announcements | periodic |

Each provider declares its own coverage, categories and cadence in
`src/lib/assist/providers/`. A provider is only queried when it supports the
category, covers the geography and has any credentials it needs; providers that
are skipped are reported with a machine-readable reason, so the traveller can be
told *why* a source was not used rather than silently getting less information.

The aviation experience keeps its own dedicated sources — NOAA's Aviation Weather
Center (METAR/TAF, worldwide), the FAA ATC System Command Center (US airspace
only), and adsbdb/adsb.lol as clearly-labelled reference signals. No source we can
reach publishes per-flight status, so WAYFINDER never displays one.

## Data-freshness model

Every fact that reaches the UI carries a `DataState` (`src/lib/core/types.ts`):

`live` · `cached` · `stale` · `unavailable` · `demo`

- Provider responses are cached briefly on the server and revalidated.
- When a provider fails or a response expires, the **last valid value is kept and
  labelled `stale`** — the page never goes blank and never presents old data as
  current (`src/lib/core/cache.ts`).
- The interface distinguishes live, cached, stale, unavailable and demonstration
  data. A "Live" badge is never shown merely because the page is open.
- The update timeline lists only changes detected between two real retrievals.

## AI layer

The AI layer (optional) contributes **plain-language explanation and translation
only**. Flight identifiers, times, sources and recommended steps are composed
deterministically from retrieved data; the model never invents sources, statuses
or entitlements. If no AI provider is configured, the product says so and falls
back to a deterministic, source-grounded explanation.

Credentials are read on the server only (`src/lib/ai/llm.ts`) and are never sent
to the browser. See `.env.example`.

## Multilingual behaviour

The locale registry is in `src/lib/i18n/locales.ts`; nine languages are available
(English, Spanish, French, German, Portuguese, Arabic, Chinese, Japanese, Hindi).
Arabic switches the document to RTL at the root (`src/components/providers/AppProviders.tsx`),
including inline `lang`/`dir` on native language names so screen readers pronounce
them correctly.

Guidance is generated as message keys with parameters, so **operational
identifiers — flight numbers, airport codes, line names, route numbers, dates,
times, gates, airline names, booking references — are parameters and are never
altered by translation.** Changing language rebuilds the explanation on the server
(`src/app/assist/page.tsx`), so both the interface chrome and the composed
explanation follow the selected language. A catalogue may be `full` or `partial`;
the selector says which, so someone who cannot read English knows before relying
on it. Run `npm run check:i18n` after adding copy.

## Architecture

```
src/
  app/            Next.js App Router routes and API routes
  components/     UI (layout, flow, assist, situation, landing, providers)
  lib/
    core/         cache, HTTP helpers, shared types
    providers/    aviation data adapters (weather, FAA, routes, tracking)
    assist/       the general engine: registry, categories, schema, providers/
    situation/    gather → derive → compose the situation page
    i18n/         locale registry, message catalogues, translator
    ai/           server-only LLM client with graceful fallback
```

`src/lib/assist/` is the generalised engine that the six everyday categories run
on. Adding a country, city or operator is an addition to the registry plus one
adapter file — no changes to the request handler or the UI. External data is
validated and normalised before it reaches the UI.

## Running locally

```bash
npm install
npm run dev        # http://localhost:3000
```

Optional AI layer — copy `.env.example` to `.env.local` and set
`WAYFINDER_AI_API_KEY`. Everything else works without it.

### Verification

```bash
npm run verify          # typecheck + check:i18n + unit tests
npm run build           # production build
npm run test:live       # hits every official provider and reports reachability
npm run test:browser    # drives the real flow and the mobile menu in headless Chromium
npm run test:responsive # asserts no horizontal overflow at 320/360/390/768/1024/1440px
```

`test:browser` and `test:responsive` need a running server (`npm run start`) and
`/usr/bin/chromium`. They drive the rendered interface over the DevTools protocol
rather than asserting on markup.

Health and capabilities: `GET /api/health`.

## Accessibility

Built towards WCAG 2.2 AA: semantic HTML, one `h1` per page, keyboard-operable
navigation and menus, visible focus, associated form labels with recovery-oriented
error messages, polite live regions for status changes, reduced-motion support,
and 44×44 CSS pixel primary touch targets. Details at `/accessibility`.

## Deliberate limitations

See `/limitations` in-product. In short: no per-flight status, no scheduled
times/gates/terminals (no feed publishes them), US-only FAA airspace coverage,
coverage limited to the operators and authorities in the table above, passenger-
rights guidance as a pointer rather than advice, and no AI provider configured by
default — the explanation then states plainly that it was assembled from verified
source data without a model.
