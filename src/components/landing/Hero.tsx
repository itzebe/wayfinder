"use client";

import { ArrowRight, Languages, ShieldCheck, Timer } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { ProductPreview } from "@/components/landing/ProductPreview";
import { useLocale } from "@/components/providers/LocaleProvider";
import { LOCALES } from "@/lib/i18n/locales";

/**
 * Hero.
 *
 * Editorial headline on the left, a working product screen on the right. On
 * mobile the order is headline, primary action, then preview — so a traveller in
 * an airport never has to scroll past marketing to start.
 */
export function Hero() {
  const { t } = useLocale();

  return (
    <section className="relative overflow-hidden border-b border-line-soft bg-paper-50">
      {/* Structural backdrop: a faint course grid, aligned to the layout. */}
      <div
        className="grid-backdrop pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_75%_60%_at_50%_0%,black,transparent)]"
        aria-hidden="true"
      />

      <div className="shell relative grid grid-cols-[minmax(0,1fr)] gap-12 py-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:items-center lg:gap-14 lg:py-20 xl:py-24">
        <div className="animate-[rise_0.5s_var(--ease-out-soft)_both]">
          <p className="inline-flex items-center gap-2 rounded-full border border-accent-200 bg-accent-50 px-3 py-1.5 text-xs font-medium text-accent-800">
            <span className="relative flex size-1.5" aria-hidden="true">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-accent-500 opacity-60" />
              <span className="relative inline-flex size-1.5 rounded-full bg-accent-600" />
            </span>
            {t("hero.eyebrow")}
          </p>

          <h1 className="mt-5 text-[2.125rem] font-semibold leading-[1.08] tracking-[-0.03em] text-ink-900 sm:text-5xl lg:text-[3.4rem]">
            {t("hero.headline")}
          </h1>

          <p className="measure mt-5 text-base leading-relaxed text-ink-600 sm:text-lg">
            {t("hero.support")}
          </p>

          <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button href="/help" size="lg" className="w-full sm:w-auto">
              {t("hero.primaryCta")}
              <ArrowRight className="size-4" aria-hidden="true" />
            </Button>
            <Button
              href="#how-it-works"
              variant="secondary"
              size="lg"
              className="w-full sm:w-auto"
            >
              {t("hero.secondaryCta")}
            </Button>
          </div>

          <p className="mt-4 flex items-start gap-2 text-xs text-ink-500">
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-success-600" aria-hidden="true" />
            {t("hero.trustNote")}
          </p>

          <ul className="mt-9 grid grid-cols-1 gap-x-6 gap-y-4 border-t border-line-soft pt-7 sm:grid-cols-3">
            <Stat
              icon={Timer}
              term={t("hero.stat1.term")}
              detail={t("hero.stat1.detail")}
            />
            <Stat
              icon={ShieldCheck}
              term={t("hero.stat2.term")}
              detail={t("hero.stat2.detail")}
            />
            <Stat
              icon={Languages}
              term={t("hero.stat3.term", { count: LOCALES.length })}
              detail={t("hero.stat3.detail")}
            />
          </ul>
        </div>

        <div className="animate-[rise_0.6s_0.1s_var(--ease-out-soft)_both]">
          <ProductPreview />
        </div>
      </div>
    </section>
  );
}

function Stat({
  icon: Icon,
  term,
  detail,
}: {
  icon: React.ComponentType<{ className?: string }>;
  term: string;
  detail: string;
}) {
  return (
    <li className="flex gap-2.5">
      <Icon className="mt-0.5 size-4 shrink-0 text-accent-600" aria-hidden="true" />
      <div>
        <p className="text-sm font-medium text-ink-900">{term}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-ink-500">{detail}</p>
      </div>
    </li>
  );
}
