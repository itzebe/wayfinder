"use client";

import { useLocale } from "@/components/providers/LocaleProvider";

/** Source names and URLs are data, not copy — only the descriptions are localised. */
const DATA_SOURCES = [
  { key: "tfl", url: "https://api.tfl.gov.uk/" },
  { key: "mta", url: "https://api.mta.info/" },
  { key: "bart", url: "https://www.bart.gov/" },
  { key: "dwd", url: "https://www.dwd.de/" },
  { key: "caltrans", url: "https://cwwp2.dot.ca.gov/" },
  { key: "govuk", url: "https://www.gov.uk/" },
  { key: "nws", url: "https://api.weather.gov/" },
  { key: "openmeteo", url: "https://open-meteo.com/" },
  { key: "usgs", url: "https://earthquake.usgs.gov/" },
  { key: "faa", url: "https://www.fly.faa.gov/" },
];

const SOURCE_KEYS = [
  "perEventStatus",
  "scheduled",
  "assessment",
  "rights",
  "coverage",
  "ai",
  "scope",
];
const CACHE_KEYS = ["cache", "poll", "stale", "history"];

export function LimitationsContent() {
  const { t } = useLocale();

  return (
    <main id="main" className="shell py-12 lg:py-16">
      <div className="max-w-2xl">
        <h1 className="text-3xl font-semibold tracking-[-0.02em] text-ink-900">
          {t("limitations.title")}
        </h1>
        <p className="mt-3 text-base leading-relaxed text-ink-600">{t("limitations.intro")}</p>
      </div>

      <section className="mt-10">
        <h2 className="text-xl font-semibold tracking-[-0.01em] text-ink-900">
          {t("limitations.wontDo.title")}
        </h2>
        <ul className="mt-5 space-y-4">
          {SOURCE_KEYS.map((key) => (
            <li
              key={key}
              className="rounded-lg border border-line-soft bg-paper-0 p-5 shadow-sm"
            >
              <h3 className="text-base font-semibold text-ink-900">
                {t(`limitations.${key}.title`)}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-600">
                {t(`limitations.${key}.body`)}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-12">
        <h2 className="text-xl font-semibold tracking-[-0.01em] text-ink-900">
          {t("limitations.sources.title")}
        </h2>
        <p className="measure mt-2 text-sm leading-relaxed text-ink-600">
          {t("limitations.sources.intro")}
        </p>

        <div className="mt-5 overflow-hidden rounded-lg border border-line-soft bg-paper-0">
          <ul className="divide-y divide-[var(--color-line-soft)]">
            {DATA_SOURCES.map((source) => (
              <li key={source.key} className="p-5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="text-base font-semibold text-ink-900">
                    {t(`limitations.src.${source.key}.name`)}
                  </h3>
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-xs font-medium text-accent-700 underline decoration-accent-300 underline-offset-2 hover:decoration-accent-600"
                  >
                    {source.url}
                  </a>
                </div>
                <p className="mt-2 text-sm text-ink-700">
                  {t(`limitations.src.${source.key}.what`)}
                </p>
                <p className="mt-2 text-sm leading-relaxed text-ink-500">
                  <span className="font-medium text-ink-600">{t("limitations.limitationLabel")} </span>
                  {t(`limitations.src.${source.key}.limits`)}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mt-12 rounded-lg border border-line-soft bg-paper-100 p-5">
        <h2 className="text-base font-semibold text-ink-900">{t("limitations.caching.title")}</h2>
        <ul className="mt-3 space-y-2.5 text-sm leading-relaxed text-ink-600">
          {CACHE_KEYS.map((key) => (
            <li key={key}>{t(`limitations.caching.${key}`)}</li>
          ))}
        </ul>
      </section>
    </main>
  );
}
