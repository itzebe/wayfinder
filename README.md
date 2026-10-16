# WAYFINDER

**Understand what is happening. Know what it means. Find your next step.**

WAYFINDER is a multilingual assistance platform for people caught in an unexpected
real-world situation. The first complete experience covers **flight disruptions**:
a traveller whose flight is cancelled, delayed or at risk of a missed connection
needs to understand the situation, find reliable current information, and know
what to do next — often in a language they do not speak fluently.

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
authoritative sources**, and it refuses to invent a per-flight status.

| Source | What it provides | Access |
| --- | --- | --- |
| [NOAA / NWS Aviation Weather Center](https://aviationweather.gov/) | METAR observations and TAF forecasts worldwide | Public AWC data API |
| [FAA ATC System Command Center](https://www.fly.faa.gov/) | National Airspace System status (ground delay / ground stop) | Public FAA XML feed |
| [adsbdb](https://www.adsbdb.com/) | Published route, airline and ICAO callsign for a flight number (reference, not live status) | Public API |
| [adsb.lol](https://api.adsb.lol/) | Live aircraft observations by callsign, used only as a supporting signal | Community ADS-B API |

Requirements inherited from these sources:

- **No per-flight status is published** by any source we can reach, so WAYFINDER
  never displays one. It describes operational conditions and tells the user to
  confirm with the airline.
- FAA airspace coverage is **United States only**. Non-US routes correctly show
  that no restriction data is expected, rather than implying none exists.
- adsbdb is a **reference index, not a schedule**, and is labelled as a secondary
  source on the situation page.

Each source has a documented limitation, surfaced in-product at `/limitations`.

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

The locale registry is in `src/lib/i18n/locales.ts`. Guidance is generated as
message keys with parameters, so **operational identifiers — flight numbers,
airport codes, dates, times, gates, airline names, booking references — are
parameters and are never altered by translation.** A catalogue may be `full` or
`partial`; the selector says which, so a traveller who cannot read English knows
before relying on it.

## Architecture

```
src/
  app/            Next.js App Router routes and API routes
  components/     UI (layout, flow, situation, landing, providers)
  lib/
    core/         cache, HTTP helpers, shared types
    providers/    external data adapters (weather, FAA, routes, tracking)
    situation/    gather → derive → compose the situation page
    i18n/         locale registry, message catalogues, translator
    ai/           server-only LLM client with graceful fallback
```

External data is validated and normalised before it reaches the UI.

## Running locally

```bash
npm install
npm run dev        # http://localhost:3000
```

Optional AI layer — copy `.env.example` to `.env.local` and set
`WAYFINDER_AI_API_KEY`. Everything else works without it.

### Verification

```bash
npm run typecheck   # tsc --noEmit
npm run lint        # next lint
npm run check:i18n  # every referenced key resolves
npm run build
```

Health and capabilities: `GET /api/health`.

## Accessibility

Built towards WCAG 2.2 AA: semantic HTML, one `h1` per page, keyboard-operable
navigation and menus, visible focus, associated form labels with recovery-oriented
error messages, polite live regions for status changes, reduced-motion support,
and 44×44 CSS pixel primary touch targets. Details at `/accessibility`.

## Deliberate limitations

See `/limitations` in-product. In short: no per-flight status, no scheduled
times/gates/terminals (no feed), partial airspace coverage, passenger-rights
guidance as a pointer rather than advice, and only flight disruption implemented
— the other categories are shown as planned and the interface says so.
