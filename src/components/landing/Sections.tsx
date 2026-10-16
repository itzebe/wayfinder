"use client";

import {
  ArrowRight,
  ClipboardList,
  Compass,
  Database,
  Plane,
  RefreshCw,
  TrainFront,
  TriangleAlert,
  TrafficCone,
  Megaphone,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/format/cn";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useLocale } from "@/components/providers/LocaleProvider";

/* -------------------------------------------------------------------------- */
/* How it works                                                               */
/* -------------------------------------------------------------------------- */

export function HowItWorks() {
  const { t } = useLocale();

  const steps: { icon: LucideIcon; title: string; body: string }[] = [
    { icon: ClipboardList, title: t("how.step1.title"), body: t("how.step1.body") },
    { icon: Database, title: t("how.step2.title"), body: t("how.step2.body") },
    { icon: Compass, title: t("how.step3.title"), body: t("how.step3.body") },
    { icon: RefreshCw, title: t("how.step4.title"), body: t("how.step4.body") },
  ];

  return (
    <section id="how-it-works" className="scroll-mt-24 border-b border-line-soft bg-paper-0">
      <div className="shell py-16 lg:py-20">
        <div className="max-w-2xl">
          <h2 className="text-2xl font-semibold tracking-[-0.02em] text-ink-900 sm:text-3xl">
            {t("how.title")}
          </h2>
          <p className="measure mt-3 text-base leading-relaxed text-ink-600">
            {t("how.subtitle")}
          </p>
        </div>

        <ol className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4 lg:gap-4">
          {steps.map((step, index) => {
            const Icon = step.icon;
            return (
              <li
                key={step.title}
                className={cn(
                  "relative rounded-lg border border-line-soft bg-paper-50 p-5",
                  "transition-[border-color,box-shadow] duration-200 hover:border-line hover:shadow-md",
                )}
              >
                <div className="flex items-center gap-3">
                  <span className="flex size-9 items-center justify-center rounded-md border border-accent-200 bg-accent-50">
                    <Icon className="size-4.5 text-accent-700" aria-hidden="true" />
                  </span>
                  <span className="ident text-xs font-semibold text-ink-400">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                </div>
                <h3 className="mt-4 text-base font-semibold text-ink-900">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-600">{step.body}</p>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Live assistance                                                            */
/* -------------------------------------------------------------------------- */

export function LiveAssistance() {
  const { t } = useLocale();

  const pillars = [
    {
      icon: Plane,
      title: t("live.route.title"),
      body: t("live.route.body"),
      source: "adsbdb",
    },
    {
      icon: Database,
      title: t("live.weather.title"),
      body: t("live.weather.body"),
      source: "NOAA Aviation Weather Center",
    },
    {
      icon: TriangleAlert,
      title: t("live.airspace.title"),
      body: t("live.airspace.body"),
      source: "FAA ATC System Command Center",
    },
  ];

  return (
    <section
      id="live-assistance"
      className="scroll-mt-24 border-b border-line-soft bg-paper-50"
    >
      <div className="shell py-16 lg:py-20">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-14">
          <div>
            <Badge tone="accent">{t("live.badge")}</Badge>
            <h2 className="mt-4 text-2xl font-semibold tracking-[-0.02em] text-ink-900 sm:text-3xl">
              {t("live.title")}
            </h2>
            <p className="measure mt-3 text-base leading-relaxed text-ink-600">
              {t("live.body")}
            </p>

            <div className="mt-6 rounded-lg border border-line bg-paper-0 p-5">
              <h3 className="text-sm font-semibold text-ink-900">
                {t("live.notShown.title")}
              </h3>
              <ul className="mt-3 space-y-2.5 text-sm text-ink-600">
                <li className="flex gap-2.5">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-warn-400" aria-hidden="true" />
                  <span>
                    <strong className="font-medium text-ink-800">
                      {t("live.notShown.status.lead")}
                    </strong>{" "}
                    {t("live.notShown.status.body")}
                  </span>
                </li>
                <li className="flex gap-2.5">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-warn-400" aria-hidden="true" />
                  <span>
                    <strong className="font-medium text-ink-800">
                      {t("live.notShown.rights.lead")}
                    </strong>{" "}
                    {t("live.notShown.rights.body")}
                  </span>
                </li>
                <li className="flex gap-2.5">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-warn-400" aria-hidden="true" />
                  <span>
                    <strong className="font-medium text-ink-800">
                      {t("live.notShown.score.lead")}
                    </strong>{" "}
                    {t("live.notShown.score.body")}
                  </span>
                </li>
              </ul>
            </div>
          </div>

          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            {pillars.map((pillar) => {
              const Icon = pillar.icon;
              return (
                <li
                  key={pillar.title}
                  className="flex flex-col rounded-lg border border-line-soft bg-paper-0 p-5 shadow-sm"
                >
                  <span className="flex size-9 items-center justify-center rounded-md border border-line bg-paper-100">
                    <Icon className="size-4.5 text-ink-700" aria-hidden="true" />
                  </span>
                  <h3 className="mt-4 text-base font-semibold text-ink-900">{pillar.title}</h3>
                  <p className="mt-2 flex-1 text-sm leading-relaxed text-ink-600">
                    {pillar.body}
                  </p>
                  <p className="mt-4 border-t border-line-soft pt-3 text-xs text-ink-500">
                    {t("live.source")}{" "}
                    <span className="font-medium text-ink-700">{pillar.source}</span>
                  </p>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Supported situations                                                       */
/* -------------------------------------------------------------------------- */

export function SupportedSituations() {
  const { t } = useLocale();

  const available = [
    {
      icon: Plane,
      title: t("situations.flight.title"),
      body: t("situations.flight.body"),
      available: true,
    },
  ];

  const planned = [
    { icon: TrainFront, title: t("situations.transport.title"), body: t("situations.transport.body") },
    { icon: TriangleAlert, title: t("situations.weather.title"), body: t("situations.weather.body") },
    { icon: TrafficCone, title: t("situations.road.title"), body: t("situations.road.body") },
    { icon: Megaphone, title: t("situations.public.title"), body: t("situations.public.body") },
  ];

  return (
    <section id="situations" className="scroll-mt-24 border-b border-line-soft bg-paper-0">
      <div className="shell py-16 lg:py-20">
        <div className="max-w-2xl">
          <h2 className="text-2xl font-semibold tracking-[-0.02em] text-ink-900 sm:text-3xl">
            {t("situations.title")}
          </h2>
          <p className="measure mt-3 text-base leading-relaxed text-ink-600">
            {t("situations.subtitle")}
          </p>
        </div>

        <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] lg:gap-10">
          <ul className="space-y-4">
            {available.map((item) => {
              const Icon = item.icon;
              return (
                <li
                  key={item.title}
                  className="rounded-lg border border-accent-200 bg-accent-50/50 p-5 shadow-sm"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex size-9 items-center justify-center rounded-md border border-accent-200 bg-paper-0">
                      <Icon className="size-4.5 text-accent-700" aria-hidden="true" />
                    </span>
                    <Badge tone="success">{t("situations.available")}</Badge>
                  </div>
                  <h3 className="mt-4 text-base font-semibold text-ink-900">{item.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-ink-600">{item.body}</p>
                  <Button href="/help" size="sm" className="mt-4">
                    {t("hero.primaryCta")}
                    <ArrowRight className="size-3.5" aria-hidden="true" />
                  </Button>
                </li>
              );
            })}
          </ul>

          <div>
            <p className="mb-4 text-xs font-semibold uppercase tracking-[0.1em] text-ink-500">
              {t("situations.planned")}
            </p>
            <ul className="grid gap-4 sm:grid-cols-2">
              {planned.map((item) => {
                const Icon = item.icon;
                return (
                  <li
                    key={item.title}
                    className="rounded-lg border border-line-soft border-dashed bg-paper-50 p-5"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="flex size-9 items-center justify-center rounded-md border border-line bg-paper-0">
                        <Icon className="size-4.5 text-ink-400" aria-hidden="true" />
                      </span>
                      <Badge tone="neutral">{t("situations.planned")}</Badge>
                    </div>
                    <h3 className="mt-4 text-base font-semibold text-ink-700">{item.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-ink-500">{item.body}</p>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Closing call to action                                                     */
/* -------------------------------------------------------------------------- */

export function ClosingCta() {
  const { t } = useLocale();

  return (
    <section className="bg-paper-50">
      <div className="shell py-16 lg:py-20">
        <div className="relative overflow-hidden rounded-xl border border-ink-800 bg-ink-900 px-6 py-12 sm:px-10 lg:px-14 lg:py-14">
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.07]"
            style={{
              backgroundImage:
                "linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)",
              backgroundSize: "3rem 3rem",
            }}
            aria-hidden="true"
          />
          <div className="relative max-w-2xl">
            <h2 className="text-2xl font-semibold tracking-[-0.02em] text-paper-0 sm:text-3xl">
              {t("closing.title")}
            </h2>
            <p className="mt-3 text-base leading-relaxed text-ink-200">
              {t("closing.body")}
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Button href="/help" size="lg" className="w-full sm:w-auto">
                {t("hero.primaryCta")}
                <ArrowRight className="size-4" aria-hidden="true" />
              </Button>
              <Button
                href="#how-it-works"
                variant="secondary"
                size="lg"
                className="w-full border-ink-600 bg-transparent text-paper-100 hover:border-ink-500 hover:bg-ink-800 sm:w-auto"
              >
                {t("hero.secondaryCta")}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
