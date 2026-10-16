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
npm run check:i18n   # verifies every referenced t() key resolves
npm run verify:sources  # checks the official rights URLs are live and their quotes are still published
```

`npm run lint` prompts interactively on first run; pass `--` flags or pre-seed the
ESLint config if running headless.

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

## Conventions

- Design tokens live in `src/app/globals.css` as CSS variables; use the Tailwind
  token classes (`text-ink-*`, `bg-paper-*`, `accent-*`, `warn-*`, `success-*`,
  `danger-*`, `line-*`). Do not hard-code hex values in components.
- User-facing copy goes through `t("...")`. Catalogues live in
  `src/lib/i18n/messages.ts` (`en` and `es` are full; others are partial and fall
  back to English). When adding copy, add both `en` and `es` keys and run
  `npm run check:i18n`.
- Add components under `src/components/<area>/`. Pages are thin wrappers; the
  body lives in a `"use client"` component when it needs locale context.
- Provider adapters go in `src/lib/providers/` and must normalise + validate
  before returning; shared cache/HTTP helpers are in `src/lib/core/`.

## Verifying UI changes

Playwright (chromium) is available. Drive the real flow rather than asserting on
markup: `/help` need cards are hidden radios with a `<label for="need-...">`
wrapper — click the label, not the input. Localise by setting
`localStorage.setItem('wayfinder.locale','es')` then reloading. Check horizontal
overflow at 320/360/390/768/1024/1440px.
