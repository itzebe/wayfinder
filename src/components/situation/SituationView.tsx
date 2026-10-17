"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  Clock,
  ExternalLink,
  Gauge,
  Info,
  Landmark,
  ListOrdered,
  MapPin,
  Pause,
  Plane,
  Play,
  RefreshCw,
  ScrollText,
  ShieldAlert,
  Sparkles,
  TriangleAlert,
  XCircle,
} from "lucide-react";

import { cn } from "@/lib/format/cn";
import { Badge, toneForSeverity } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Callout, LiveRegion, Skeleton } from "@/components/ui/Callout";
import { Card, DataRow, SectionCard, UnknownValue } from "@/components/ui/Card";
import { DataStateBadge, FreshnessNote } from "@/components/ui/DataStateBadge";
import { SourcePanel } from "@/components/situation/SourcePanel";
import { SharePanel } from "@/components/situation/SharePanel";
import { AnnouncementTranslator } from "@/components/situation/AnnouncementTranslator";
import { useLocale } from "@/components/providers/LocaleProvider";
import { useSituation } from "@/components/providers/SituationProvider";
import { formatAbsolute, formatClock, formatRelative } from "@/lib/format/datetime";
import { getLocaleMeta, LOCALES } from "@/lib/i18n/locales";
import type { DataState, Recommendation } from "@/lib/core/types";
import type { SituationPage } from "@/lib/situation/compose";
import { splitStatusFields } from "@/lib/situation/statusFields";

/**
 * The situation page — the signature screen.
 *
 * Layout intent: on desktop, a primary column carries the summary, status, meaning
 * and steps, while a secondary column carries sources, the update timeline and
 * share controls. On mobile everything collapses to one column in priority order.
 */
export function SituationView({ situation }: { situation: SituationPage }) {
  const { t, locale, setLocale } = useLocale();
  const { refreshing, refreshNow, autoRefresh, setAutoRefresh, secondsUntilRefresh, error, startOver } =
    useSituation();
  const router = useRouter();
  const [announcement, setAnnouncement] = useState("");

  // Pick up announcement text carried over from the flow, if the traveller
  // arrived through the "I cannot understand an announcement" path.
  useEffect(() => {
    try {
      const stored = window.sessionStorage.getItem("wayfinder.announcement");
      if (stored) {
        setAnnouncement(stored);
        window.sessionStorage.removeItem("wayfinder.announcement");
      }
    } catch {
      // Session storage can be unavailable; the translator still works.
    }
  }, []);

  const intel = situation.intel;
  const signals = situation.signals;

  const refreshedLabel = formatRelative(intel.retrievedAt);

  const onLanguageChange = (next: string) => {
    setLocale(next as typeof locale);
    router.push(`/situation?locale=${next}`);
  };

  return (
    <div className="space-y-6">
      {error ? (
        <Callout tone="warning" title={t("situation.checkFailed")}>
          {error}
        </Callout>
      ) : null}

      <SituationHeader
        situation={situation}
        refreshing={refreshing}
        onRefresh={refreshNow}
        refreshedLabel={refreshedLabel}
        autoRefresh={autoRefresh}
        onToggleAutoRefresh={() => setAutoRefresh(!autoRefresh)}
        secondsUntilRefresh={secondsUntilRefresh}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] lg:items-start lg:gap-8">
        {/* Primary column ------------------------------------------------- */}
        <div className="space-y-6">
          <SituationSummary situation={situation} />
          <CurrentStatus situation={situation} />

          {announcement ? (
            <AnnouncementTranslator initialText={announcement} />
          ) : null}

          <WhatThisMeansForYou situation={situation} />
          <RecommendedSteps situation={situation} />
          <RightsSection situation={situation} />
        </div>

        {/* Secondary column ----------------------------------------------- */}
        <div className="space-y-6">
          <SourcesSection situation={situation} />
          <TimelineSection situation={situation} />
          <ShareSection situation={situation} />

          <Card className="p-5">
            <h2 className="text-sm font-semibold text-ink-900">{t("situation.changeLanguage")}</h2>
            <p className="mt-1.5 text-xs leading-relaxed text-ink-500">
              {t("situation.changeLanguageNote")}
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {LOCALES.map((entry) => {
                const selected = entry.code === locale;
                return (
                  <button
                    key={entry.code}
                    type="button"
                    onClick={() => onLanguageChange(entry.code)}
                    aria-pressed={selected}
                    className={cn(
                      "flex min-h-11 items-center justify-between gap-2 rounded-md border px-2.5 text-start",
                      "text-xs transition-colors duration-150",
                      "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-600",
                      selected
                        ? "border-accent-400 bg-accent-50 font-medium text-accent-800"
                        : "border-line-soft bg-paper-0 text-ink-600 hover:bg-paper-100",
                    )}
                  >
                    <span lang={entry.code} dir={entry.dir}>
                      {entry.nativeName}
                    </span>
                    {selected ? (
                      <CheckCircle2 className="size-3.5 text-accent-600" aria-hidden="true" />
                    ) : null}
                  </button>
                );
              })}
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="text-sm font-semibold text-ink-900">{t("situation.startOver")}</h2>
            <p className="mt-1.5 text-xs leading-relaxed text-ink-500">
              {t("situation.startOverNote")}
            </p>
            <Button
              variant="secondary"
              size="sm"
              className="mt-3 w-full"
              onClick={() => {
                startOver();
                router.push("/help");
              }}
            >
              {t("situation.startAgain")}
            </Button>
          </Card>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Header                                                                     */
/* -------------------------------------------------------------------------- */

function SituationHeader({
  situation,
  refreshing,
  onRefresh,
  refreshedLabel,
  autoRefresh,
  onToggleAutoRefresh,
  secondsUntilRefresh,
}: {
  situation: SituationPage;
  refreshing: boolean;
  onRefresh: () => void;
  refreshedLabel: string;
  autoRefresh: boolean;
  onToggleAutoRefresh: () => void;
  secondsUntilRefresh: number | null;
}) {
  const { t } = useLocale();
  const intel = situation.intel;
  const signals = situation.signals;

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-line-soft bg-paper-50 px-5 py-4 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-lg border border-accent-200 bg-accent-50">
              <Plane className="size-5 text-accent-700" aria-hidden="true" />
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="ident text-2xl font-semibold tracking-[-0.01em] text-ink-900">
                  {intel.flightNumber}
                </h1>
                <Badge tone={toneForSeverity(signals.disruptionLabel)}>
                  {t(`severity.${signals.disruptionLabel}`)}
                </Badge>
              </div>
              <p className="mt-1 text-sm text-ink-600">
                {intel.airline?.name ?? t("value.airlineNotPublished")}
                {intel.callsignIcao ? (
                  <span className="ident text-ink-400"> · {intel.callsignIcao}</span>
                ) : null}
              </p>
            </div>
          </div>

          <div className="flex flex-col items-start gap-2 sm:items-end">
            <div className="flex flex-wrap items-center gap-2">
              <DataStateBadge state={situation.overallState} relativeLabel={refreshedLabel} />
              <Button
                variant="secondary"
                size="sm"
                onClick={onRefresh}
                disabled={refreshing}
                aria-live="polite"
              >
                <RefreshCw
                  className={cn("size-4", refreshing && "animate-spin")}
                  aria-hidden="true"
                />
                {refreshing ? t("situation.refreshing") : t("situation.refresh")}
              </Button>
            </div>
            <p className="text-xs text-ink-500">
              {t("situation.lastChecked", { time: formatAbsolute(intel.retrievedAt) })}
            </p>
            <button
              type="button"
              onClick={onToggleAutoRefresh}
              aria-pressed={autoRefresh}
              className={cn(
                // 44px minimum: this control pauses and resumes live checking,
                // so it is a real action and must be a comfortable touch target
                // rather than an 18px-tall line of underlined text.
                "inline-flex min-h-11 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium",
                "text-ink-500 transition-colors duration-150 hover:bg-paper-100 hover:text-ink-800",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-600",
              )}
            >
              {autoRefresh ? (
                <Pause className="size-3.5 shrink-0" aria-hidden="true" />
              ) : (
                <Play className="size-3.5 shrink-0" aria-hidden="true" />
              )}
              {autoRefresh
                ? secondsUntilRefresh !== null
                  ? t("situation.autoRefresh", { seconds: secondsUntilRefresh })
                  : t("situation.autoRefreshPaused")
                : t("situation.resumeRefresh")}
            </button>
          </div>
        </div>
      </div>

      {/* Route strip: the information a traveller scans first. */}
      <div className="px-5 py-4 sm:px-6">
        {intel.origin && intel.destination ? (
          <div className="flex items-center gap-3 rounded-lg border border-line-soft bg-paper-50 px-4 py-3.5">
            <AirportBlock airport={intel.origin} />
            <div className="flex min-w-0 flex-1 flex-col items-center px-2">
              <span className="text-xs text-ink-400">{t("situation.referenceRoute")}</span>
              <span className="my-1.5 flex w-full items-center gap-1" aria-hidden="true">
                <span className="size-1.5 rounded-full bg-accent-400" />
                <span className="h-px flex-1 bg-line-strong" />
                <Plane className="size-3.5 text-ink-400" />
                <span className="h-px flex-1 bg-line-strong" />
                <span className="size-1.5 rounded-full bg-accent-400" />
              </span>
              <span className="text-xs text-ink-400">{t("situation.notLivePosition")}</span>
            </div>
            <AirportBlock airport={intel.destination} align="end" />
          </div>
        ) : (
          <Callout tone="warning" title={t("situation.routeUnresolved")}>
            {t("situation.routeUnresolvedBody")}
          </Callout>
        )}

        <p className="mt-3 flex items-start gap-2 text-xs text-ink-500">
          <ShieldAlert className="mt-0.5 size-3.5 shrink-0 text-warn-500" aria-hidden="true" />
          <span>
            {t("situation.routeNote")}
          </span>
        </p>
      </div>
    </Card>
  );
}

function AirportBlock({
  airport,
  align = "start",
}: {
  airport: NonNullable<SituationPage["intel"]["origin"]>;
  align?: "start" | "end";
}) {
  return (
    <div className={cn("min-w-0", align === "end" && "text-end")}>
      <p className="ident text-2xl font-semibold tracking-[-0.01em] text-ink-900">
        {airport.iata ?? airport.icao}
      </p>
      <p className="mt-0.5 truncate text-xs text-ink-500">
        {airport.name ?? "Airport name not published"}
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* A. Situation summary                                                       */
/* -------------------------------------------------------------------------- */

function SituationSummary({ situation }: { situation: SituationPage }) {
  const { t } = useLocale();

  return (
    <SectionCard
      id="summary"
      title={t("situation.summary")}
      icon={<ScrollText className="size-5" />}
      tone="accent"
    >
      <p className="text-base leading-relaxed text-ink-800">{situation.headline}</p>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div className="rounded-md border border-success-200 bg-success-50 p-4">
          <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-success-700">
            <CheckCircle2 className="size-3.5" aria-hidden="true" />
            {t("situation.known")}
          </h3>
          <ul className="mt-2.5 space-y-2">
            {situation.known.map((item) => (
              <li key={item} className="flex gap-2 text-sm leading-relaxed text-ink-700">
                <span
                  className="mt-1.5 size-1.5 shrink-0 rounded-full bg-success-500"
                  aria-hidden="true"
                />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-md border border-warn-200 bg-warn-50 p-4">
          <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-warn-700">
            <TriangleAlert className="size-3.5" aria-hidden="true" />
            {t("situation.uncertain")}
          </h3>
          <ul className="mt-2.5 space-y-2">
            {situation.uncertain.map((item) => (
              <li key={item} className="flex gap-2 text-sm leading-relaxed text-ink-700">
                <span
                  className="mt-1.5 size-1.5 shrink-0 rounded-full bg-warn-400"
                  aria-hidden="true"
                />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-5 border-t border-line-soft pt-5">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-ink-900">
          <Sparkles className="size-4 text-accent-600" aria-hidden="true" />
          {situation.explanation.aiGenerated ? t("situation.explanationPlain") : t("situation.explanation")}
        </h3>
        <p className="prose-guidance mt-2.5">{situation.explanation.summary}</p>
        {situation.explanation.unavailableReason ? (
          <p className="mt-2.5 flex items-start gap-2 rounded-sm bg-paper-100 px-3 py-2 text-xs text-ink-500">
            <Gauge className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            {situation.explanation.unavailableReason}
          </p>
        ) : null}
      </div>
    </SectionCard>
  );
}

/* -------------------------------------------------------------------------- */
/* B. Current status                                                          */
/* -------------------------------------------------------------------------- */

function CurrentStatus({ situation }: { situation: SituationPage }) {
  const { t } = useLocale();
  const intel = situation.intel;
  const [showUnpublished, setShowUnpublished] = useState(false);
  const unpublishedId = useId();

  const weatherState: DataState = intel.weatherState;
  const statusState: DataState = intel.airportStatusState;

  type StatusRow = {
    label: string;
    mono?: boolean;
    hint?: string;
    value: React.ReactNode;
  };

  // A row is "known" when a reachable source actually published something for
  // it. Everything else is collected so absence can be summarised once instead
  // of repeated as eight separate rows. The partition rule lives in
  // `splitStatusFields` so it can be unit-tested rather than inferred from JSX.
  const split = splitStatusFields(intel);
  const known: StatusRow[] = [];
  const unpublished: StatusRow[] = [];

  for (const field of split.known) {
    if (field === "flightNumber") {
      known.push({ label: t("field.flightNumber"), mono: true, value: intel.flightNumber });
    } else if (field === "callsign") {
      known.push({ label: t("field.callsign"), mono: true, value: intel.callsignIcao });
    } else if (field === "airline") {
      known.push({ label: t("field.airline"), value: intel.airline?.name });
    } else {
      const airport = field === "origin" ? intel.origin : intel.destination;
      known.push({
        label: field === "origin" ? t("field.origin") : t("field.destination"),
        value: (
          <span>
            {airport?.name ?? t("value.nameNotPublished")}
            <span className="ident ms-1.5 text-ink-500">{airport?.iata ?? airport?.icao}</span>
          </span>
        ),
      });
    }
  }

  for (const field of split.unpublished) {
    const labelKey: Record<string, string> = {
      callsign: "field.callsign",
      airline: "field.airline",
      origin: "field.origin",
      destination: "field.destination",
      scheduledDeparture: "field.scheduledDeparture",
      scheduledArrival: "field.scheduledArrival",
      gate: "field.gate",
      terminal: "field.terminal",
    };
    const hintKey: Record<string, string> = {
      scheduledDeparture: "hint.scheduledByAirlineOnly",
      scheduledArrival: "hint.publishedByAirlineOnly",
    };

    unpublished.push({
      label: t(labelKey[field] ?? "field.gate"),
      mono: field === "callsign",
      hint: hintKey[field] ? t(hintKey[field]) : undefined,
      value:
        field === "callsign" ? (
          <UnknownValue label={t("value.notResolved")} />
        ) : field === "airline" ? (
          <UnknownValue label={t("value.notPublishedForFlight")} />
        ) : (
          <UnknownValue label={t("value.notPublished")} />
        ),
    });
  }

  const statusRow: StatusRow = {
    label: t("field.status"),
    hint: t("hint.noPerFlightStatus"),
    value: (
      <span className="inline-flex items-center gap-2 text-warn-700">
        <XCircle className="size-4 shrink-0" aria-hidden="true" />
        <span className="text-sm font-medium">{t("value.cannotConfirm")}</span>
      </span>
    ),
  };

  return (
    <SectionCard
      id="status"
      title={t("situation.status")}
      description={t("situation.statusNote")}
      icon={<CalendarClock className="size-5" />}
    >
      {/*
        Known fields come first and the fields no reachable source publishes are
        folded into one disclosure. Previously eight "Not published" rows pushed
        the operational picture more than a screen down on a phone, so a
        traveller had to scroll past absence to reach substance.
      */}
      <dl>
        {known.map((row) => (
          <DataRow key={row.label} label={row.label} mono={row.mono} hint={row.hint}>
            {row.value}
          </DataRow>
        ))}
        {/* The single most important answer stays visible even when it is a
            "cannot confirm" — folding it away would hide the product's verdict. */}
        <DataRow label={statusRow.label} hint={statusRow.hint}>
          {statusRow.value}
        </DataRow>
      </dl>

      {unpublished.length > 0 ? (
        <div className="mt-4 rounded-md border border-line-soft bg-paper-50">
          <button
            type="button"
            onClick={() => setShowUnpublished((value) => !value)}
            aria-expanded={showUnpublished}
            aria-controls={unpublishedId}
            className={cn(
              "flex min-h-11 w-full items-center justify-between gap-3 px-3.5 py-2.5 text-start",
              "text-sm text-ink-600 hover:text-ink-900",
              "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent-600",
            )}
          >
            <span className="flex min-w-0 items-center gap-2">
              <Info className="size-4 shrink-0 text-ink-400" aria-hidden="true" />
              <span className="min-w-0">
                {t("situation.notPublishedCount", { count: unpublished.length })}
              </span>
            </span>
            <ChevronDown
              className={cn(
                "size-4 shrink-0 transition-transform duration-200",
                showUnpublished && "rotate-180",
              )}
              aria-hidden="true"
            />
          </button>
          {showUnpublished ? (
            <dl id={unpublishedId} className="border-t border-line-soft px-3.5 pb-1">
              {unpublished.map((row) => (
                <DataRow key={row.label} label={row.label} mono={row.mono} hint={row.hint}>
                  {row.value}
                </DataRow>
              ))}
            </dl>
          ) : null}
        </div>
      ) : null}

      {/* Operational picture: weather and airspace, each with its own freshness. */}
      <div className="mt-5 space-y-3.5 border-t border-line-soft pt-5">
        <h3 className="text-sm font-semibold text-ink-900">{t("situation.operationalPicture")}</h3>

        <div className="rounded-md border border-line-soft bg-paper-50 p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h4 className="text-sm font-medium text-ink-800">{t("situation.weatherAtAirports")}</h4>
            <DataStateBadge state={weatherState} relativeLabel={formatRelative(intel.retrievedAt)} />
          </div>

          {intel.originWeather || intel.destinationWeather ? (
            <ul className="mt-3 space-y-3">
              {intel.originWeather ? (
                <WeatherRow
                  code={intel.origin?.iata ?? intel.origin?.icao ?? t("field.departure")}
                  label={t("field.departure")}
                  observation={intel.originWeather}
                />
              ) : null}
              {intel.destinationWeather ? (
                <WeatherRow
                  code={intel.destination?.iata ?? intel.destination?.icao ?? t("field.arrival")}
                  label={t("field.arrival")}
                  observation={intel.destinationWeather}
                />
              ) : null}
            </ul>
          ) : (
            <p className="mt-2.5 text-sm italic text-ink-500">{t("situation.weatherNone")}</p>
          )}
        </div>

        <div className="rounded-md border border-line-soft bg-paper-50 p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h4 className="text-sm font-medium text-ink-800">{t("situation.airspaceRestrictions")}</h4>
            <DataStateBadge state={statusState} relativeLabel={formatRelative(intel.retrievedAt)} />
          </div>

          {intel.originConstraints.length > 0 || intel.destinationConstraints.length > 0 ? (
            <ul className="mt-3 space-y-2">
              {[...intel.originConstraints, ...intel.destinationConstraints].map((constraint) => {
                // Closure reasons are published as raw NOTAM text, which can run to
                // several lines. Show the substance up front and keep the full text
                // available rather than truncating it away.
                const reason = constraint.reason ?? "";
                const isLong = reason.length > 140;
                return (
                  <li
                    key={`${constraint.airport}-${constraint.programType}`}
                    className="rounded-sm border border-warn-200 bg-warn-50 px-3 py-2.5"
                  >
                    <p className="text-sm font-medium text-ink-900">
                      {constraint.programType.replace(/_/g, " ")}
                      <span className="ident ms-1.5 text-ink-600">{constraint.airport}</span>
                    </p>
                    {reason ? (
                      isLong ? (
                        <details className="mt-1">
                          <summary className="cursor-pointer text-xs text-ink-600 hover:text-ink-900">
                            Reason: {reason.slice(0, 90).trim()}… (show full notice)
                          </summary>
                          <p className="ident mt-1.5 text-[0.6875rem] leading-relaxed text-ink-600">
                            {reason}
                          </p>
                        </details>
                      ) : (
                        <p className="mt-0.5 text-xs text-ink-600">
                          Reason: {reason.replace(/^[A-Z]{3}:/, (match) => `${match} `)}
                        </p>
                      )
                    ) : null}
                    {constraint.averageDelay ? (
                      <p className="mt-0.5 text-xs text-ink-600">
                        {t("situation.averageDelay")}{" "}
                        <span className="ident">{constraint.averageDelay}</span>
                      </p>
                    ) : null}
                    {constraint.maximumDelay ? (
                      <p className="mt-0.5 text-xs text-ink-600">
                        {t("situation.longestDelay")}{" "}
                        <span className="ident">{constraint.maximumDelay}</span>
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mt-2.5 text-sm text-ink-600">
              {statusState === "unavailable"
                ? t("situation.airspaceUnavailable")
                : intel.origin?.countryCode && intel.origin.countryCode !== "US"
                  ? t("situation.airspaceNonUs")
                  : t("situation.airspaceNone")}
            </p>
          )}
        </div>

        {intel.liveTrack ? (
          <div className="rounded-md border border-line-soft bg-paper-50 p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h4 className="text-sm font-medium text-ink-800">{t("situation.aircraftObservation")}</h4>
              <DataStateBadge state={intel.liveTrackState} relativeLabel={formatRelative(intel.retrievedAt)} />
            </div>
            <dl className="mt-3 space-y-1.5 text-sm text-ink-700">
              <div className="flex justify-between gap-4">
                <dt className="text-ink-500">{t("field.callsign")}</dt>
                <dd className="ident">{intel.liveTrack.callsign}</dd>
              </div>
              {intel.liveTrack.altitudeFt !== undefined ? (
                <div className="flex justify-between gap-4">
                  <dt className="text-ink-500">{t("field.altitude")}</dt>
                  <dd className="ident">{intel.liveTrack.altitudeFt.toLocaleString()} ft</dd>
                </div>
              ) : null}
              {intel.liveTrack.groundSpeedKt !== undefined ? (
                <div className="flex justify-between gap-4">
                  <dt className="text-ink-500">{t("field.groundSpeed")}</dt>
                  <dd className="ident">{intel.liveTrack.groundSpeedKt} kt</dd>
                </div>
              ) : null}
              {intel.liveTrack.observedAt ? (
                <div className="flex justify-between gap-4">
                  <dt className="text-ink-500">{t("field.observed")}</dt>
                  <dd className="ident">{formatClock(intel.liveTrack.observedAt)}</dd>
                </div>
              ) : null}
            </dl>
            <p className="mt-2.5 text-xs text-ink-500">
              A community ADS-B observation of an aircraft using this callsign. It is not
              confirmation that your booking is operating, and coverage varies by region.
            </p>
          </div>
        ) : null}
      </div>
    </SectionCard>
  );
}

function WeatherRow({
  code,
  label,
  observation,
}: {
  code: string;
  label: string;
  observation: NonNullable<SituationPage["intel"]["originWeather"]>;
}) {
  const { t } = useLocale();
  const categories: Record<string, { tone: "success" | "accent" | "warn" | "danger"; text: string }> = {
    VFR: { tone: "success", text: t("facts.visualConditions") },
    MVFR: { tone: "accent", text: t("facts.marginalVisualConditions") },
    IFR: { tone: "warn", text: t("facts.instrumentConditions") },
    LIFR: { tone: "danger", text: t("facts.lowInstrumentConditions") },
  };
  const category = observation.flightCategory
    ? categories[observation.flightCategory.toUpperCase()]
    : undefined;

  return (
    <li className="border-b border-line-soft pb-3 last:border-b-0 last:pb-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-ink-700">
          <span className="text-ink-500">{label}</span>{" "}
          <span className="ident font-medium text-ink-900">{code}</span>
        </p>
        {category ? (
          <Badge tone={category.tone}>
            {observation.flightCategory} — {category.text}
          </Badge>
        ) : null}
      </div>

      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-600">
        {observation.windSpeedKt !== undefined ? (
          <span>
            Wind <span className="ident">{observation.windDirectionDeg ?? "VRB"}° {observation.windSpeedKt} kt</span>
            {observation.windGustKt ? (
              <span className="ident"> gusting {observation.windGustKt} kt</span>
            ) : null}
          </span>
        ) : null}
        {observation.visibility ? (
          <span>
            Visibility <span className="ident">{observation.visibility}</span>
          </span>
        ) : null}
        {observation.temperatureC !== undefined ? (
          <span>
            Temperature <span className="ident">{observation.temperatureC}°C</span>
          </span>
        ) : null}
        {observation.observedAt ? (
          <span>
            Observed <span className="ident">{formatClock(observation.observedAt)}</span>
          </span>
        ) : null}
      </div>

      {observation.raw ? (
        <details className="mt-2 group">
          <summary className="cursor-pointer text-xs font-medium text-accent-700 hover:underline">
            {t("situation.rawMetar")}
          </summary>
          <pre className="mt-1.5 overflow-auto rounded-sm border border-line-soft bg-paper-0 px-2.5 py-2 text-[0.6875rem] text-ink-600">
            <code className="ident break-all whitespace-pre-wrap">{observation.raw}</code>
          </pre>
        </details>
      ) : null}
    </li>
  );
}

/* -------------------------------------------------------------------------- */
/* C. What this means for you                                                 */
/* -------------------------------------------------------------------------- */

function WhatThisMeansForYou({ situation }: { situation: SituationPage }) {
  const { t, locale } = useLocale();

  return (
    <SectionCard
      id="meaning"
      title={t("situation.meaning")}
      icon={<Gauge className="size-5" />}
    >
      <p className="prose-guidance">{situation.explanation.meaning}</p>

      {locale !== "en" ? (
        <p className="mt-3 flex items-start gap-2 rounded-sm bg-paper-100 px-3 py-2 text-xs text-ink-500">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          {t("situation.proseNotTranslated")}
        </p>
      ) : null}

      {situation.signals.disruptionBasis.length > 0 ? (
        <div className="mt-5 border-t border-line-soft pt-5">
          <h3 className="text-sm font-semibold text-ink-900">{t("situation.assessmentBasis")}</h3>
          <p className="mt-1.5 text-xs text-ink-500">{t("situation.assessmentBasisNote")}</p>
          <ul className="mt-3 space-y-2">
            {situation.signals.disruptionBasis.slice(0, 8).map((reason) => (
              <li key={reason} className="flex gap-2 text-sm leading-relaxed text-ink-600">
                <span
                  className="mt-1.5 size-1.5 shrink-0 rounded-full bg-ink-300"
                  aria-hidden="true"
                />
                <span>{reason}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {situation.connection ? (
        <div className="mt-5 border-t border-line-soft pt-5">
          <h3 className="text-sm font-semibold text-ink-900">{t("situation.connection")}</h3>
          <dl className="mt-2.5 space-y-1.5 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-ink-500">{t("field.connectionFlight")}</dt>
              <dd className="ident font-medium text-ink-900">
                {situation.connection.flightNumber}
              </dd>
            </div>
            {situation.connection.airport ? (
              <div className="flex justify-between gap-4">
                <dt className="text-ink-500">{t("field.connectionAirport")}</dt>
                <dd className="ident font-medium text-ink-900">{situation.connection.airport}</dd>
              </div>
            ) : null}
            {situation.connection.minutesAvailable !== undefined ? (
              <div className="flex justify-between gap-4">
                <dt className="text-ink-500">{t("field.connectionTime")}</dt>
                <dd className="ident font-medium text-ink-900">
                  {situation.connection.minutesAvailable} min
                </dd>
              </div>
            ) : null}
          </dl>
          <Callout
            tone={situation.connection.tight ? "warning" : "neutral"}
            compact
            className="mt-3"
          >
            {situation.connection.tight
              ? "That is a short connection window. Even a modest delay on the first flight could make it. Ask the airline to confirm the connection and to rebook the whole journey together if it is at risk."
              : "Whether your connection is protected depends on whether both flights are on one booking and on the rules for your route. Ask the airline to confirm in writing rather than assuming it is protected."}
          </Callout>
        </div>
      ) : null}
    </SectionCard>
  );
}

/* -------------------------------------------------------------------------- */
/* D. Recommended next steps                                                  */
/* -------------------------------------------------------------------------- */

const PRIORITY_META: Record<
  Recommendation["priority"],
  { labelKey: string; tone: "danger" | "warn" | "neutral" }
> = {
  now: { labelKey: "priority.now", tone: "danger" },
  soon: { labelKey: "priority.soon", tone: "warn" },
  when_possible: { labelKey: "priority.whenPossible", tone: "neutral" },
};

function RecommendedSteps({ situation }: { situation: SituationPage }) {
  const { t } = useLocale();

  return (
    <SectionCard
      id="steps"
      title={t("situation.steps")}
      description={t("situation.steps.description")}
      icon={<ListOrdered className="size-5" />}
    >
      <ol className="space-y-3">
        {situation.recommendations.map((action) => {
          const meta = PRIORITY_META[action.priority];
          return (
            <li
              key={action.id}
              className={cn(
                "rounded-lg border bg-paper-0 p-4",
                action.priority === "now" ? "border-danger-200" : "border-line-soft",
              )}
            >
              <div className="flex gap-3.5">
                <span
                  className={cn(
                    "ident flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                    action.priority === "now"
                      ? "bg-danger-500 text-paper-0"
                      : "bg-ink-800 text-paper-0",
                  )}
                  aria-hidden="true"
                >
                  {action.rank}
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold text-ink-900">{action.title}</h3>
                    <Badge tone={meta.tone}>{t(meta.labelKey)}</Badge>
                  </div>

                  <p className="mt-1.5 text-sm leading-relaxed text-ink-600">
                    <span className="font-medium text-ink-700">{t("situation.why")} </span>
                    {action.rationale}
                  </p>

                  {action.actionUrl ? (
                    <a
                      href={action.actionUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="mt-2.5 inline-flex min-h-11 items-center gap-1.5 text-xs font-medium text-accent-700 underline decoration-accent-300 underline-offset-2 hover:decoration-accent-600"
                    >
                      {action.actionLabel ?? t("action.openSource")}
                      <ExternalLink className="size-3.5" aria-hidden="true" />
                      <span className="sr-only">{t("a11y.opensNewTab")}</span>
                    </a>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </SectionCard>
  );
}

/* -------------------------------------------------------------------------- */
/* E. Official sources                                                        */
/* -------------------------------------------------------------------------- */

function SourcesSection({ situation }: { situation: SituationPage }) {
  const { t } = useLocale();

  return (
    <SectionCard
      id="sources"
      title={t("situation.sources")}
      description={
        situation.sources.length === 1
          ? t("situation.sources.returnedOne")
          : t("situation.sources.returned", { count: situation.sources.length })
      }
      icon={<Landmark className="size-5" />}
    >
      <SourcePanel sources={situation.sources} compact />
    </SectionCard>
  );
}

/* -------------------------------------------------------------------------- */
/* F. Situation updates                                                       */
/* -------------------------------------------------------------------------- */

function TimelineSection({ situation }: { situation: SituationPage }) {
  const { t } = useLocale();
  const changes = situation.timeline.filter((event) => event.change);

  return (
    <SectionCard
      id="updates"
      title={t("situation.timeline")}
      description={t("situation.timeline.description")}
      icon={<Clock className="size-5" />}
    >
      <ol className="relative space-y-4 ps-5">
        <span
          className="absolute inset-y-1 start-[0.3125rem] w-px bg-line"
          aria-hidden="true"
        />
        {situation.timeline.map((event) => (
          <li key={event.id} className="relative">
            <span
              className={cn(
                "absolute -start-5 top-1 size-2.5 rounded-full border-2 border-paper-0",
                event.change ? "bg-warn-400" : "bg-accent-500",
              )}
              aria-hidden="true"
            />
            <p className="flex items-baseline gap-2">
              <span className="ident text-xs font-medium text-ink-500">
                {formatClock(event.at)}
              </span>
              <span className="text-sm font-medium text-ink-800">{event.label}</span>
            </p>
            {event.detail ? (
              <p className="mt-0.5 text-xs leading-relaxed text-ink-500">{event.detail}</p>
            ) : null}
          </li>
        ))}
      </ol>

      {changes.length === 0 ? (
        <p className="mt-4 rounded-sm bg-paper-100 px-3 py-2.5 text-xs text-ink-500">
          {t("timeline.empty")}
        </p>
      ) : null}
    </SectionCard>
  );
}

/* -------------------------------------------------------------------------- */
/* Passenger rights                                                           */
/* -------------------------------------------------------------------------- */

function RightsSection({ situation }: { situation: SituationPage }) {
  const { t } = useLocale();
  const [showAll, setShowAll] = useState(false);

  if (situation.rightsNotes.length === 0) return null;

  const applicable = situation.rightsNotes.filter((note) => note.possiblyApplies);
  const rest = situation.rightsNotes.filter((note) => !note.possiblyApplies);
  const visible = showAll ? [...applicable, ...rest] : applicable.length > 0 ? applicable : rest.slice(0, 2);

  return (
    <SectionCard
      id="rights"
      title={t("situation.rights")}
      description={t("situation.rights.description")}
      icon={<ShieldAlert className="size-5" />}
    >
      <ul className="space-y-3">
        {visible.map((note) => (
          <li key={note.id} className="rounded-md border border-line-soft bg-paper-0 p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-ink-900">{note.instrument}</h3>
                <p className="mt-0.5 text-xs text-ink-500">
                  {note.organization} · {note.jurisdiction}
                </p>
              </div>
              <Badge tone={note.possiblyApplies ? "accent" : "neutral"}>
                {note.possiblyApplies ? "May apply to your route" : "General guidance"}
              </Badge>
            </div>

            {note.appliesBecause ? (
              <p className="mt-2.5 text-xs leading-relaxed text-ink-500">
                {t("rights.whyShown")} {note.appliesBecause}
              </p>
            ) : null}

            <p className="mt-2.5 text-sm leading-relaxed text-ink-700">{note.summary}</p>

            <blockquote className="mt-3 border-s-2 border-accent-300 bg-paper-50 py-2 ps-3 pe-2">
              <p className="text-xs italic leading-relaxed text-ink-600">“{note.quote}”</p>
            </blockquote>

            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
              <a
                href={note.url}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex min-h-11 items-center gap-1.5 text-xs font-medium text-accent-700 underline decoration-accent-300 underline-offset-2 hover:decoration-accent-600"
              >
                {note.organization}
                <ExternalLink className="size-3.5" aria-hidden="true" />
                <span className="sr-only">{t("a11y.opensNewTab")}</span>
              </a>
              <p className="text-xs text-ink-500">
                {t("rights.pageChecked", { date: note.checkedAt })}
              </p>
            </div>
          </li>
        ))}
      </ul>

      {rest.length > 0 || applicable.length > 0 ? (
        <Button
          variant="ghost"
          size="sm"
          className="mt-4"
          onClick={() => setShowAll((value) => !value)}
          aria-expanded={showAll}
        >
          {showAll
            ? t("rights.showOnly")
            : t("rights.showAll", { count: situation.rightsNotes.length })}
        </Button>
      ) : null}
    </SectionCard>
  );
}

/* -------------------------------------------------------------------------- */
/* H. Share                                                                   */
/* -------------------------------------------------------------------------- */

function ShareSection({ situation }: { situation: SituationPage }) {
  const { t } = useLocale();

  return (
    <SectionCard
      id="share"
      title={t("share.title")}
      icon={<ExternalLink className="size-5" />}
    >
      <SharePanel situation={situation} />
    </SectionCard>
  );
}

/* -------------------------------------------------------------------------- */
/* Loading state                                                              */
/* -------------------------------------------------------------------------- */

export function SituationSkeleton() {
  const { t } = useLocale();
  return (
    <div className="space-y-6" aria-busy="true">
      <LiveRegion message={t("situation.loading")} />
      <Card className="p-5">
        <div className="flex items-center gap-3.5">
          <Skeleton className="size-11 rounded-lg" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-4 w-48" />
          </div>
        </div>
        <Skeleton className="mt-5 h-20 w-full rounded-lg" />
      </Card>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <Card className="space-y-3 p-5">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-11/12" />
            <Skeleton className="h-24 w-full rounded-md" />
          </Card>
          <Card className="space-y-3 p-5">
            <Skeleton className="h-5 w-36" />
            {Array.from({ length: 6 }, (_, index) => (
              <Skeleton key={index} className="h-8 w-full" />
            ))}
          </Card>
        </div>
        <div className="space-y-6">
          <Card className="space-y-3 p-5">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-16 w-full rounded-md" />
            <Skeleton className="h-16 w-full rounded-md" />
          </Card>
        </div>
      </div>
    </div>
  );
}

