"use client";

import { useState } from "react";
import {
  ArrowRight,
  Building2,
  CalendarClock,
  CheckCircle2,
  CloudRain,
  ExternalLink,
  Landmark,
  ListOrdered,
  Plane,
  Radio,
  ShieldAlert,
} from "lucide-react";

import { cn } from "@/lib/format/cn";
import { Badge } from "@/components/ui/Badge";
import { DataStateBadge } from "@/components/ui/DataStateBadge";
import { useLocale } from "@/components/providers/LocaleProvider";
import type { Translate } from "@/lib/i18n/translator";

/**
 * Interactive product preview.
 *
 * This is a faithful rendering of the real situation page, driven by a static
 * example itinerary. It is labelled as demonstration data in the interface, in
 * the accessible name of the region, and in every status badge — the preview
 * must never be mistaken for a real flight.
 *
 * It is interactive rather than a screenshot so the interaction design is
 * demonstrable: the tabs, the source expansion and the step list all work.
 */

/**
 * Demonstration data for the preview.
 *
 * Labelled as demonstration everywhere it appears. It is never presented as live
 * information, and no real provider is contacted to render this screen.
 */
function buildDemo(t: Translate) {
  return {
    flightNumber: "BA123",
    airline: "British Airways",
    origin: { iata: "LHR", name: "London Heathrow", time: "10:25", zone: "BST" },
    destination: { iata: "DOH", name: "Doha Hamad", time: "19:05", zone: "+03" },
    disruption: "elevated" as const,
    weather: t("preview.weatherValue"),
    constraints: t("preview.constraintsValue"),
    steps: [
      { title: t("preview.step1.title"), why: t("preview.step1.why") },
      { title: t("preview.step2.title"), why: t("preview.step2.why") },
      { title: t("preview.step3.title"), why: t("preview.step3.why") },
      { title: t("preview.step4.title"), why: t("preview.step4.why") },
    ],
    sources: [
      {
        organization: "NOAA / NWS Aviation Weather Center",
        title: "METAR — London Heathrow (EGLL)",
        tier: "Primary",
        state: "live" as const,
        detail: "METAR EGLL 152250Z AUTO 21005KT 9999 NCD 16/14 Q1018",
      },
      {
        organization: "FAA ATC System Command Center",
        title: "National Airspace System Status",
        tier: "Primary",
        state: "cached" as const,
        detail: t("preview.src2.detail"),
      },
      {
        organization: "adsbdb route reference",
        title: t("preview.src3.title"),
        tier: "Secondary",
        state: "cached" as const,
        detail: t("preview.src3.detail"),
      },
    ],
  };
}

type TabId = "status" | "steps" | "sources";

export function ProductPreview() {
  const { t } = useLocale();
  const demo = buildDemo(t);
  const [tab, setTab] = useState<TabId>("status");

  const tabs: { id: TabId; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: "status", label: t("preview.tabStatus"), icon: Radio },
    { id: "steps", label: t("preview.tabSteps"), icon: ListOrdered },
    { id: "sources", label: t("preview.tabSources"), icon: Landmark },
  ];

  return (
    <div className="relative">
      {/* Demonstration-data banner: impossible to miss, sits above the frame. */}
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <Badge tone="warn">{t("preview.demoBadge")}</Badge>
        <p className="text-xs text-ink-500">{t("preview.demoNote")}</p>
      </div>

      <div
        role="region"
        aria-label={`${t("preview.label")} — ${t("preview.demoBadge")}`}
        className="overflow-hidden rounded-xl border border-line bg-paper-0 shadow-lg"
      >
        {/* Window chrome: establishes this as a product screen, not a marketing card. */}
        <div className="flex items-center gap-2 border-b border-line-soft bg-paper-100 px-4 py-3">
          <span className="flex gap-1.5" aria-hidden="true">
            <span className="size-2.5 rounded-full bg-line-strong" />
            <span className="size-2.5 rounded-full bg-line-strong" />
            <span className="size-2.5 rounded-full bg-line-strong" />
          </span>
          <p className="ms-2 truncate text-xs text-ink-500">
            wayfinder.app/situation/BA123
          </p>
        </div>

        {/* Situation header */}
        <div className="border-b border-line-soft px-4 py-4 sm:px-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-md border border-accent-200 bg-accent-50">
                <Plane className="size-5 text-accent-700" aria-hidden="true" />
              </span>
              <div>
                <p className="ident text-lg font-semibold text-ink-900">BA123</p>
                <p className="text-xs text-ink-500">{demo.airline}</p>
              </div>
            </div>
            <Badge tone="warn" icon={<ShieldAlert className="size-3.5" aria-hidden="true" />}>
              {t("preview.elevated")}
            </Badge>
          </div>

          {/* Route strip — the highest-value information, made instantly scannable. */}
          <div className="mt-4 flex items-center gap-3 rounded-md border border-line-soft bg-paper-50 px-3.5 py-3">
            <div className="min-w-0">
              <p className="ident text-xl font-semibold text-ink-900">{demo.origin.iata}</p>
              <p className="truncate text-xs text-ink-500">{demo.origin.name}</p>
            </div>
            <div className="flex flex-1 flex-col items-center px-1">
              <span className="ident text-xs text-ink-400">
                {demo.origin.time} {demo.origin.zone}
              </span>
              <span className="my-1 flex w-full items-center gap-1" aria-hidden="true">
                <span className="size-1.5 rounded-full bg-accent-400" />
                <span className="h-px flex-1 bg-line-strong" />
                <ArrowRight className="size-3.5 text-ink-400" />
              </span>
              <span className="ident text-xs text-ink-400">
                {demo.destination.time} {demo.destination.zone}
              </span>
            </div>
            <div className="min-w-0 text-end">
              <p className="ident text-xl font-semibold text-ink-900">
                {demo.destination.iata}
              </p>
              <p className="truncate text-xs text-ink-500">{demo.destination.name}</p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div
          role="tablist"
          aria-label={t("preview.label")}
          className="flex border-b border-line-soft bg-paper-50"
        >
          {tabs.map((entry) => {
            const Icon = entry.icon;
            const selected = tab === entry.id;
            return (
              <button
                key={entry.id}
                role="tab"
                type="button"
                id={`preview-tab-${entry.id}`}
                aria-selected={selected}
                aria-controls={`preview-panel-${entry.id}`}
                tabIndex={selected ? 0 : -1}
                onClick={() => setTab(entry.id)}
                onKeyDown={(event) => {
                  if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
                    event.preventDefault();
                    const index = tabs.findIndex((candidate) => candidate.id === tab);
                    const next =
                      event.key === "ArrowRight"
                        ? (index + 1) % tabs.length
                        : (index - 1 + tabs.length) % tabs.length;
                    setTab(tabs[next].id);
                    document.getElementById(`preview-tab-${tabs[next].id}`)?.focus();
                  }
                }}
                className={cn(
                  "inline-flex min-h-12 flex-1 items-center justify-center gap-1.5 px-3 text-xs font-medium",
                  "border-b-2 transition-colors duration-150",
                  selected
                    ? "border-accent-600 bg-paper-0 text-accent-800"
                    : "border-transparent text-ink-500 hover:bg-paper-100 hover:text-ink-700",
                  "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent-600",
                )}
              >
                <Icon className="size-3.5" aria-hidden="true" />
                {entry.label}
              </button>
            );
          })}
        </div>

        {/* Panels */}
        <div className="min-h-[19rem] px-4 py-4 sm:px-5">
          {tab === "status" ? (
            <div
              role="tabpanel"
              id="preview-panel-status"
              aria-labelledby="preview-tab-status"
              className="space-y-3.5"
            >
              <div className="rounded-md border border-warn-200 bg-warn-50 px-3.5 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-warn-700">
                  {t("preview.couldNotConfirm")}
                </p>
                <p className="mt-1.5 text-sm text-ink-700">
                  {t("preview.couldNotConfirmBody")}
                </p>
              </div>

              <ul className="space-y-2.5">
                <FactRow
                  icon={CloudRain}
                  label={t("preview.departureWeather")}
                  value={demo.weather}
                  state="live"
                  age="3 min ago"
                />
                <FactRow
                  icon={Building2}
                  label={t("preview.airspaceRestriction")}
                  value={demo.constraints}
                  state="cached"
                  age="2 min ago"
                />
                <FactRow
                  icon={CalendarClock}
                  label={t("preview.scheduledTimes")}
                  value={t("preview.notPublished")}
                  unavailable
                />
              </ul>
            </div>
          ) : null}

          {tab === "steps" ? (
            <ol
              role="tabpanel"
              id="preview-panel-steps"
              aria-labelledby="preview-tab-steps"
              className="space-y-2.5"
            >
              {demo.steps.map((step, index) => (
                <li
                  key={step.title}
                  className="flex gap-3 rounded-md border border-line-soft bg-paper-0 px-3.5 py-3"
                >
                  <span className="ident flex size-6 shrink-0 items-center justify-center rounded-full bg-accent-600 text-xs font-semibold text-paper-0">
                    {index + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink-900">{step.title}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-ink-500">{step.why}</p>
                  </div>
                </li>
              ))}
            </ol>
          ) : null}

          {tab === "sources" ? (
            <ul
              role="tabpanel"
              id="preview-panel-sources"
              aria-labelledby="preview-tab-sources"
              className="space-y-2.5"
            >
              {demo.sources.map((source) => (
                <li
                  key={source.title}
                  className="rounded-md border border-line-soft bg-paper-0 px-3.5 py-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ink-900">{source.title}</p>
                      <p className="text-xs text-ink-500">{source.organization}</p>
                    </div>
                    <Badge tone={source.tier === "Primary" ? "accent" : "neutral"}>
                      {source.tier}
                    </Badge>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <DataStateBadge state={source.state} />
                    <span className="inline-flex items-center gap-1 text-xs text-accent-700">
                      <ExternalLink className="size-3" aria-hidden="true" />
                      {t("preview.originalSource")}
                    </span>
                  </div>
                  <p className="ident mt-2 truncate rounded-sm bg-paper-50 px-2 py-1.5 text-[0.6875rem] text-ink-600">
                    {source.detail}
                  </p>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <div className="flex items-center gap-2 border-t border-line-soft bg-paper-50 px-4 py-3">
          <CheckCircle2 className="size-3.5 text-success-600" aria-hidden="true" />
          <p className="text-xs text-ink-500">{t("preview.sourcesChecked")}</p>
        </div>
      </div>
    </div>
  );
}

function FactRow({
  icon: Icon,
  label,
  value,
  state,
  age,
  unavailable,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  state?: "live" | "cached" | "stale";
  age?: string;
  unavailable?: boolean;
}) {
  return (
    <li className="rounded-md border border-line-soft bg-paper-0 px-3.5 py-3">
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 size-4 shrink-0 text-ink-400" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-[0.06em] text-ink-500">
            {label}
          </p>
          <p
            className={cn(
              "mt-1 text-sm",
              unavailable ? "italic text-ink-400" : "text-ink-800",
            )}
          >
            {value}
          </p>
          {state ? (
            <div className="mt-2">
              <DataStateBadge state={state} relativeLabel={age} />
            </div>
          ) : null}
        </div>
      </div>
    </li>
  );
}
