"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Database, Trash2 } from "lucide-react";

import { WayfinderMark, WayfinderWordmark } from "@/components/ui/WayfinderMark";
import { useLocale } from "@/components/providers/LocaleProvider";
import { useSituation } from "@/components/providers/SituationProvider";

/**
 * The official publishers behind the generic assistance categories. Kept as
 * data so the list cannot drift from the providers that are actually wired up.
 */
const GENERIC_SOURCES = [
  { label: "Transport for London (TfL)", url: "https://tfl.gov.uk/travel-information/" },
  { label: "MTA New York City Transit", url: "https://www.mta.info/" },
  { label: "BART — San Francisco Bay Area", url: "https://www.bart.gov/" },
  { label: "Caltrans road conditions", url: "https://cwwp2.dot.ca.gov/" },
  { label: "NOAA / National Weather Service", url: "https://www.weather.gov/" },
  { label: "Deutscher Wetterdienst (DWD)", url: "https://www.dwd.de/" },
  { label: "Open-Meteo global forecast", url: "https://open-meteo.com/" },
  { label: "GOV.UK service notices", url: "https://www.gov.uk/" },
  { label: "U.S. Geological Survey (USGS)", url: "https://earthquake.usgs.gov/" },
];

/**
 * Site footer.
 *
 * Carries the two things a trust-focused product owes its user: an explicit list
 * of where the data comes from, and an explicit statement of what is stored and
 * how to delete it. The delete action is real, not decorative.
 */
export function SiteFooter() {
  const { t } = useLocale();
  const { clearAllData } = useSituation();
  const [cleared, setCleared] = useState(false);

  const onClear = () => {
    clearAllData();
    // Also drop any provider responses cached on the server for this deployment.
    void fetch("/api/situation", { method: "DELETE" }).catch(() => undefined);
    void fetch("/api/assist", { method: "DELETE" }).catch(() => undefined);
    setCleared(true);
    window.setTimeout(() => setCleared(false), 6_000);
  };

  return (
    <footer className="mt-20 border-t border-line bg-paper-100">
      <div className="shell grid gap-10 py-12 md:grid-cols-2 lg:grid-cols-4 lg:gap-8 lg:py-14">
        <div className="lg:col-span-2">
          <WayfinderWordmark size={26} />
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-ink-600">
            {t("footer.tagline")}
          </p>
          <p className="mt-4 max-w-md text-xs leading-relaxed text-ink-500">
            {t("footer.sourcesBody")}
          </p>
        </div>

        <div>
          <h2 className="text-xs font-semibold uppercase tracking-[0.1em] text-ink-500">
            {t("footer.sourcesTitle")}
          </h2>
          <ul className="mt-3 space-y-2 text-sm">
            {GENERIC_SOURCES.map((source) => (
              <li key={source.url}>
                <a
                  href={source.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-ink-700 underline decoration-line-strong underline-offset-2 hover:decoration-accent-500"
                >
                  {source.label}
                </a>
              </li>
            ))}
          </ul>
          <p className="mt-3 flex items-start gap-1.5 text-xs text-ink-400">
            <Database className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            <span>{t("footer.noPerFlight")}</span>
          </p>
        </div>

        <div>
          <h2 className="text-xs font-semibold uppercase tracking-[0.1em] text-ink-500">
            {t("footer.privacy")}
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-ink-600">{t("footer.privacyBody")}</p>

          <button
            type="button"
            onClick={onClear}
            className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-md border border-line bg-paper-0 px-3 text-sm font-medium text-ink-700 transition-colors duration-150 hover:border-danger-200 hover:bg-danger-50 hover:text-danger-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-600"
          >
            <Trash2 className="size-4" aria-hidden="true" />
            {t("footer.clearData")}
          </button>

          <p role="status" aria-live="polite" className="mt-2 min-h-5 text-xs text-success-600">
            {cleared ? (
              <span className="inline-flex items-center gap-1.5">
                <Check className="size-3.5" aria-hidden="true" />
                {t("footer.dataCleared")}
              </span>
            ) : null}
          </p>

          <ul className="mt-4 space-y-1.5 text-xs text-ink-500">
            <li>
              <Link
                href="/accessibility"
                className="underline decoration-line-strong underline-offset-2 hover:decoration-accent-500"
              >
                {t("footer.accessibility")}
              </Link>
            </li>
            <li>
              <Link
                href="/limitations"
                className="underline decoration-line-strong underline-offset-2 hover:decoration-accent-500"
              >
                {t("footer.limitations")}
              </Link>
            </li>
            <li>
              <Link
                href="/api/health"
                className="underline decoration-line-strong underline-offset-2 hover:decoration-accent-500"
              >
                {t("footer.systemStatus")}
              </Link>
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t border-line">
        <div className="shell flex flex-col gap-3 py-6 text-xs text-ink-500 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-2">
            <WayfinderMark size={16} />
            <span>{t("footer.disclaimer")}</span>
          </p>
          <p>{t("footer.builtFor")}</p>
        </div>
      </div>
    </footer>
  );
}
