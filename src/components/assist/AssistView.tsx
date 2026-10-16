"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  ExternalLink,
  Info,
  Landmark,
  ListOrdered,
  MapPin,
  RefreshCw,
  ScrollText,
  ShieldAlert,
  Sparkles,
  TriangleAlert,
} from "lucide-react";

import { cn } from "@/lib/format/cn";
import { Badge, toneForSeverity, type Tone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Callout, LiveRegion, Skeleton } from "@/components/ui/Callout";
import { Card, DataRow, SectionCard, UnknownValue } from "@/components/ui/Card";
import { DataStateBadge, FreshnessNote } from "@/components/ui/DataStateBadge";
import { SourcePanel } from "@/components/situation/SourcePanel";
import { AssistSharePanel } from "@/components/assist/AssistSharePanel";
import { useLocale } from "@/components/providers/LocaleProvider";
import { useAssistance } from "@/components/providers/AssistanceProvider";
import { formatAbsolute, formatClock, formatRelative } from "@/lib/format/datetime";
import { getLocaleMeta } from "@/lib/i18n/locales";
import type { DataState } from "@/lib/core/types";
import type { AssistancePage, ServiceCondition, SituationFact } from "@/lib/assist/types";

/**
 * The generic situation page — the signature screen for every non-flight case.
 *
 * Layout intent: on desktop a primary column carries the summary, what the
 * sources report, the meaning and the next steps; a secondary column carries
 * the official sources, the update timeline and share controls. On mobile
 * everything collapses to one column in the same priority order.
 *
 * The screen never upgrades a symptom into a status: a value only appears with
 * the data state its provider reported, and anything a source could not supply
 * is shown as unknown rather than filled in.
 */
export function AssistView({ assistance }: { assistance: AssistancePage }) {
  const { t, locale, setLocale } = useLocale();
  const { refreshing, refreshNow, error, startOver, unseenChangeCount, acknowledgeChanges } =
    useAssistance();
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, [assistance.id]);

  const categoryTitle = t(`assist.category.${assistance.category}.title`);
  const updatedLabel = formatRelative(assistance.updatedAt);
  const disruption = assistance.conditions.some((condition) =>
    ["severe", "major"].includes(condition.severity),
  );

  const onLanguageChange = (next: string) => {
    setLocale(next as typeof locale);
  };

  return (
    <div className="space-y-6">
      <MovingChangesBanner count={unseenChangeCount} onAcknowledge={acknowledgeChanges} />

      <LiveRegion
        message={t("assist.a11y.updated", { time: updatedLabel, category: categoryTitle })}
      />

      {/* Header ---------------------------------------------------------- */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="accent">{categoryTitle}</Badge>
          <DataStateBadge state={assistance.overallState} relativeLabel={updatedLabel} />
          {!assistance.explanation.aiGenerated ? (
            <Badge tone="neutral" icon={<ScrollText className="size-3.5" aria-hidden="true" />}>
              {t("assist.badge.sourceGrounded")}
            </Badge>
          ) : null}
        </div>

        <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
          <h1
            ref={headingRef}
            tabIndex={-1}
            className="min-w-0 max-w-3xl text-2xl font-semibold leading-tight tracking-[-0.02em] text-ink-900 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent-600 sm:text-3xl"
          >
            {assistance.headline}
          </h1>

          <div className="flex min-w-0 flex-wrap items-center gap-2 sm:shrink-0">
            <Button variant="ghost" size="sm" onClick={refreshNow} disabled={refreshing}>
              <RefreshCw
                className={cn("size-4", refreshing && "animate-spin")}
                aria-hidden="true"
              />
              {t("situation.refresh")}
            </Button>
            <Button variant="ghost" size="sm" onClick={startOver}>
              {t("situation.startOver")}
            </Button>
          </div>
        </div>

        {error ? (
          <Callout tone="warning" title={t("error.refreshTitle")} compact>
            {error}
          </Callout>
        ) : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        {/* Primary column ------------------------------------------------ */}
        <div className="space-y-6">
          <SectionCard
            id="summary"
            title={t("assist.section.summary")}
            icon={<Info className="size-5" />}
            tone="accent"
          >
            <div className="space-y-4">
              <Callout tone={disruption ? "warning" : "info"}>
                {assistance.explanation.summary}
              </Callout>
              <dl className="min-w-0">
                <DataRow label={t("assist.summary.category")}>{categoryTitle}</DataRow>
                <DataRow label={t("assist.summary.place")}>
                  {formatPlace(assistance) ?? (
                    <UnknownValue label={t("assist.value.notGiven")} />
                  )}
                </DataRow>
                <DataRow label={t("assist.summary.lastChecked")} mono>
                  {formatAbsolute(assistance.updatedAt)}
                </DataRow>
              </dl>

              {assistance.description ? (
                <Callout tone="neutral" compact title={t("assist.fact.reportedProblem.label")}>
                  {assistance.description}
                </Callout>
              ) : null}
            </div>
          </SectionCard>

          <SectionCard
            id="conditions"
            title={t("assist.section.conditions")}
            description={t("assist.conditions.note")}
            icon={<TriangleAlert className="size-5" />}
            tone={disruption ? "warn" : "default"}
          >
            {assistance.conditions.length > 0 ? (
              <ConditionsList
                conditions={assistance.conditions}
                sources={assistance.sources}
              />
            ) : assistance.respondingProviders.length > 0 ? (
              <Callout tone="success" compact>
                {t("assist.fact.noCurrentConditions")}
              </Callout>
            ) : (
              // Nothing was retrieved, so "no disruption reported" would be a
              // false reassurance. Say what is actually true: unknown.
              <Callout tone="warning" compact>
                {t("assist.conditions.unknown")}
              </Callout>
            )}
          </SectionCard>

          {assistance.references.length > 0 ? (
            <SectionCard
              id="references"
              title={t("assist.section.references")}
              description={t("assist.references.intro")}
              icon={<Landmark className="size-5" />}
              tone="accent"
            >
              <ul className="space-y-2.5">
                {assistance.references.map((reference) => (
                  <li
                    key={reference.id}
                    className="rounded-md border border-line-soft bg-paper-0 p-3.5"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-ink-900">
                          {reference.organization}
                        </p>
                        <p className="text-sm text-ink-700">{reference.title}</p>
                      </div>
                      {reference.official ? (
                        <Badge tone="success">{t("assist.references.official")}</Badge>
                      ) : null}
                    </div>
                    <p className="mt-1.5 text-xs leading-relaxed text-ink-600">
                      {reference.covers}
                    </p>
                    <a
                      href={reference.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="mt-2 inline-flex min-h-9 items-center gap-1.5 text-xs font-medium text-accent-700 underline decoration-accent-300 underline-offset-2 hover:decoration-accent-600"
                    >
                      {t("assist.references.open")}
                      <ExternalLink className="size-3.5" aria-hidden="true" />
                      <span className="sr-only">{t("a11y.opensNewTab")}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </SectionCard>
          ) : null}

          <SectionCard
            id="meaning"
            title={t("assist.section.meaning")}
            icon={<Info className="size-5" />}
          >
            <p className="measure whitespace-pre-line text-sm leading-relaxed text-ink-700">
              {assistance.explanation.meaning}
            </p>
            {!assistance.explanation.aiGenerated ? (
              <p className="mt-3 flex items-start gap-2 text-xs text-ink-500">
                <ScrollText className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                {t("assist.explanation.deterministic")}
              </p>
            ) : null}
          </SectionCard>

          <SectionCard
            id="facts"
            title={t("assist.section.facts")}
            description={t("assist.facts.note")}
            icon={<CheckCircle2 className="size-5" />}
          >
            <ul className="space-y-3">
              {assistance.facts.map((fact) => (
                <FactItem key={fact.id} fact={fact} />
              ))}
            </ul>
          </SectionCard>

          {assistance.timetable.length > 0 ? (
            <SectionCard
              id="timetable"
              title={t("assist.section.timetable")}
              description={t("assist.timetable.note")}
              icon={<Clock className="size-5" />}
            >
              <ul className="space-y-2">
                {assistance.timetable.slice(0, 20).map((entry, index) => (
                  <li
                    key={`${entry.providerId}-${index}`}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-line-soft bg-paper-50 px-3.5 py-2.5"
                  >
                    <span className="min-w-0">
                      <span className="ident text-sm font-medium text-ink-900">
                        {entry.line ?? t("assist.timetable.service")}
                      </span>
                      {entry.destination ? (
                        <span className="ms-2 text-sm text-ink-600">{entry.destination}</span>
                      ) : null}
                    </span>
                    <span className="ident text-sm text-ink-700">
                      {entry.scheduledDeparture
                        ? formatClock(entry.scheduledDeparture, getLocaleMeta(locale).tag)
                        : t("assist.value.unknown")}
                    </span>
                  </li>
                ))}
              </ul>
            </SectionCard>
          ) : null}

          <SectionCard
            id="steps"
            title={t("assist.section.steps")}
            description={t("assist.steps.note")}
            icon={<ListOrdered className="size-5" />}
            tone="accent"
          >
            <ol className="space-y-3">
              {assistance.recommendations.map((step) => (
                <li
                  key={step.id}
                  className="rounded-md border border-line-soft bg-paper-0 p-4"
                >
                  <div className="flex gap-3">
                    <span
                      className="ident mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-accent-100 text-sm font-semibold text-accent-800"
                      aria-hidden="true"
                    >
                      {step.rank}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-semibold text-ink-900">{step.title}</h3>
                        <Badge tone={step.priority === "now" ? "warn" : "neutral"}>
                          {t(`assist.priority.${step.priority}`)}
                        </Badge>
                        {step.requiresConfirmation ? (
                          <Badge tone="neutral">{t("assist.steps.confirmNeeded")}</Badge>
                        ) : null}
                      </div>
                      <p className="mt-1 text-sm leading-relaxed text-ink-600">
                        {step.rationale}
                      </p>
                      {step.actionUrl ? (
                        <a
                          href={step.actionUrl}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="mt-2 inline-flex min-h-9 items-center gap-1.5 text-xs font-medium text-accent-700 underline decoration-accent-300 underline-offset-2 hover:decoration-accent-600"
                        >
                          {step.actionLabel ?? t("assist.rec.openSource")}
                          <ExternalLink className="size-3.5" aria-hidden="true" />
                          <span className="sr-only">{t("a11y.opensNewTab")}</span>
                        </a>
                      ) : null}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </SectionCard>

          {assistance.rightsNotes.length > 0 ? (
            <SectionCard
              id="rights"
              title={t("assist.section.rights")}
              description={t("assist.rights.note")}
              icon={<Landmark className="size-5" />}
            >
              <ul className="space-y-3">
                {assistance.rightsNotes.map((note) => (
                  <li key={note.id} className="rounded-md border border-line-soft bg-paper-0 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold text-ink-900">{note.instrument}</h3>
                      <Badge tone={note.possiblyApplies ? "warn" : "neutral"}>
                        {note.possiblyApplies
                          ? t("assist.rights.possiblyApplies")
                          : t("assist.rights.reference")}
                      </Badge>
                    </div>
                    <p className="mt-1.5 text-sm leading-relaxed text-ink-700">{note.summary}</p>
                    <blockquote className="mt-2 border-s-2 border-line ps-3 text-xs italic text-ink-500">
                      “{note.quote}”
                    </blockquote>
                    <p className="mt-1.5 text-xs text-ink-400">
                      {note.organization} · {t("assist.rights.checked", { date: note.checkedAt })}
                    </p>
                    <a
                      href={note.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="mt-2 inline-flex min-h-9 items-center gap-1.5 text-xs font-medium text-accent-700 underline decoration-accent-300 underline-offset-2 hover:decoration-accent-600"
                    >
                      {t("assist.rights.readSource")}
                      <ExternalLink className="size-3.5" aria-hidden="true" />
                      <span className="sr-only">{t("a11y.opensNewTab")}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </SectionCard>
          ) : null}
        </div>

        {/* Secondary column --------------------------------------------- */}
        <div className="space-y-6">
          <SectionCard
            id="sources"
            title={t("assist.section.sources")}
            icon={<Landmark className="size-5" />}
          >
            <SourcePanel sources={assistance.sources} />
          </SectionCard>

          <SectionCard
            id="updates"
            title={t("assist.section.updates")}
            icon={<Clock className="size-5" />}
          >
            {assistance.timeline.length > 0 ? (
              <ol className="space-y-3">
                {assistance.timeline.map((event) => (
                  <li key={event.id} className="flex gap-3">
                    <span
                      className={cn(
                        "mt-1.5 size-2 shrink-0 rounded-full",
                        event.change ? "bg-warn-500" : "bg-ink-300",
                      )}
                      aria-hidden="true"
                    />
                    <div className="min-w-0">
                      <p className="ident text-xs text-ink-500">{formatClock(event.at)}</p>
                      <p className="text-sm font-medium text-ink-800">{event.label}</p>
                      {event.detail ? (
                        <p className="text-xs text-ink-500">{event.detail}</p>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-ink-500">{t("assist.timeline.none")}</p>
            )}
          </SectionCard>

          <SectionCard
            id="uncertain"
            title={t("assist.section.uncertain")}
            icon={<ShieldAlert className="size-5" />}
            tone="warn"
          >
            {assistance.uncertain.length > 0 ? (
              <ul className="space-y-2 text-sm text-ink-700">
                {assistance.uncertain.map((line, index) => (
                  <li key={index} className="flex gap-2">
                    <span className="mt-2 size-1.5 shrink-0 rounded-full bg-warn-400" aria-hidden="true" />
                    <span className="leading-relaxed">{line}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-500">{t("assist.uncertain.none")}</p>
            )}
          </SectionCard>

          {assistance.coverageGaps.length > 0 || assistance.sources.length > 0 ? (
            <SectionCard
              id="coverage"
              title={t("assist.section.coverage")}
              icon={<Info className="size-5" />}
            >
              <div className="space-y-4">
                {assistance.coverageGaps.length > 0 ? (
                  <ul className="space-y-2.5">
                    {assistance.coverageGaps.map((gap) => (
                      <li key={gap.providerId} className="rounded-md border border-warn-200 bg-warn-50 p-3.5">
                        <p className="text-sm text-ink-700">{gap.message}</p>
                        {gap.fallbackUrl ? (
                          <a
                            href={gap.fallbackUrl}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="mt-1.5 inline-flex min-h-9 items-center gap-1.5 text-xs font-medium text-accent-700 underline decoration-accent-300 underline-offset-2 hover:decoration-accent-600"
                          >
                            {t("assist.gap.openFallback")}
                            <ExternalLink className="size-3.5" aria-hidden="true" />
                            <span className="sr-only">{t("a11y.opensNewTab")}</span>
                          </a>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : null}

                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-500">
                    {t("assist.coverage.limitations")}
                  </p>
                  <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-ink-600">
                    {limitedProviders(assistance).map((line, index) => (
                      <li key={index} className="flex gap-2">
                        <span className="mt-1.5 size-1 shrink-0 rounded-full bg-ink-300" aria-hidden="true" />
                        <span>{line}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </SectionCard>
          ) : null}

          <SectionCard
            id="share"
            title={t("assist.section.share")}
            description={t("assist.share.note")}
            icon={<ArrowRight className="size-5" />}
          >
            <AssistSharePanel assistance={assistance} />
          </SectionCard>

          <SectionCard
            id="language"
            title={t("assist.section.language")}
            description={t("assist.language.note")}
            icon={<Sparkles className="size-5" />}
          >
            <label htmlFor="assist-view-locale" className="text-sm font-medium text-ink-800">
              {t("details.language")}
            </label>
            <select
              id="assist-view-locale"
              value={locale}
              onChange={(event) => onLanguageChange(event.target.value)}
              className="mt-2 h-11 w-full rounded-md border border-line bg-paper-0 px-3 text-sm text-ink-900 focus-visible:border-accent-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-600"
            >
              {LOCALE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <p className="mt-2 text-xs text-ink-500">
              {t("assist.language.identifiersPreserved")}
            </p>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}

const LOCALE_OPTIONS = [
  { value: "en", label: "English" },
  { value: "es", label: "Español — Spanish" },
  { value: "fr", label: "Français — French" },
  { value: "de", label: "Deutsch — German" },
  { value: "pt", label: "Português — Portuguese" },
  { value: "ar", label: "العربية — Arabic" },
  { value: "zh", label: "简体中文 — Chinese (Simplified)" },
  { value: "ja", label: "日本語 — Japanese" },
  { value: "hi", label: "हिन्दी — Hindi" },
];

function formatPlace(assistance: AssistancePage): string | undefined {
  const parts = [
    assistance.query.city,
    assistance.query.region,
    assistance.query.countryCode,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : undefined;
}

const ORIGIN_TONE: Record<SituationFact["origin"], Tone> = {
  verified: "success",
  self_reported: "accent",
  inferred: "neutral",
  unknown: "neutral",
};

function FactItem({ fact }: { fact: SituationFact }) {
  const { t } = useLocale();
  return (
    <li className="rounded-md border border-line-soft bg-paper-0 p-3.5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-sm font-medium text-ink-900">{fact.label}</p>
        <Badge tone={ORIGIN_TONE[fact.origin]}>{t(`assist.origin.${fact.origin}`)}</Badge>
      </div>
      <p className="mt-1 text-sm leading-relaxed text-ink-700">{fact.value}</p>
      {fact.caveat ? (
        <p className="mt-1.5 flex items-start gap-1.5 text-xs text-warn-700">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          {fact.caveat}
        </p>
      ) : null}
    </li>
  );
}

/**
 * Conditions arrive per source, and a weather or roads provider can legitimately
 * return dozens at once. The first few are shown inline; the rest sit behind a
 * disclosure so a busy feed does not bury the meaning and next steps below a
 * wall of text. The full count is always stated, so nothing is hidden.
 */
function ConditionsList({
  conditions,
  sources,
}: {
  conditions: ServiceCondition[];
  sources: AssistancePage["sources"];
}) {
  const { t } = useLocale();
  const [expanded, setExpanded] = useState(false);
  const PREVIEW = 4;
  const hidden = conditions.length - PREVIEW;

  const sourceUrlFor = (condition: ServiceCondition) =>
    sources.find((s) => s.id === condition.providerId)?.url ?? condition.url;

  const render = (condition: ServiceCondition) => (
    <ConditionItem
      key={condition.id}
      condition={condition}
      sourceUrl={sourceUrlFor(condition)}
    />
  );

  return (
    <div>
      <ul className="space-y-3">
        {(expanded ? conditions : conditions.slice(0, PREVIEW)).map(render)}
      </ul>
      {hidden > 0 ? (
        <div className="mt-4 border-t border-line-soft pt-4">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setExpanded((value) => !value)}
            aria-expanded={expanded}
          >
            {expanded
              ? t("assist.conditions.showFewer")
              : t("assist.conditions.showAll", { count: conditions.length })}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function ConditionItem({
  condition,
  sourceUrl,
}: {
  condition: ServiceCondition;
  sourceUrl?: string;
}) {
  const { t } = useLocale();
  return (
    <li className="rounded-md border border-line-soft bg-paper-0 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <Badge tone={toneForSeverity(condition.severity)}>
          {t(`assist.severity.${condition.severity}`)}
        </Badge>
        {condition.to || condition.from ? (
          <span className="ident text-xs text-ink-500">
            {condition.from ? formatClock(condition.from) : ""}
            {condition.to ? ` – ${formatClock(condition.to)}` : ""}
          </span>
        ) : null}
      </div>
      <p className="mt-2 text-sm font-medium leading-relaxed text-ink-900">{condition.title}</p>
      {condition.detail ? (
        <p className="mt-1 text-sm leading-relaxed text-ink-600">{condition.detail}</p>
      ) : null}
      {condition.affectedPlaces && condition.affectedPlaces.length > 0 ? (
        <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-500">
          <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
          {condition.affectedPlaces.join(" · ")}
        </p>
      ) : null}
      {sourceUrl ? (
        <a
          href={condition.url ?? sourceUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="mt-2 inline-flex min-h-9 items-center gap-1.5 text-xs font-medium text-accent-700 underline decoration-accent-300 underline-offset-2 hover:decoration-accent-600"
        >
          {t("assist.conditions.openSource")}
          <ExternalLink className="size-3.5" aria-hidden="true" />
          <span className="sr-only">{t("a11y.opensNewTab")}</span>
        </a>
      ) : null}
    </li>
  );
}

/** De-duplicated list of the limits the responding sources declare. */
function limitedProviders(assistance: AssistancePage): string[] {
  const lines = new Set<string>();
  for (const source of assistance.sources) {
    if (source.relevance) lines.add(`${source.organization}: ${source.relevance}`);
  }
  return [...lines];
}

function MovingChangesBanner({
  count,
  onAcknowledge,
}: {
  count: number;
  onAcknowledge: () => void;
}) {
  const { t } = useLocale();
  if (count === 0) return null;
  return (
    <Callout
      tone="warning"
      title={t("assist.changes.title", { count })}
      className="animate-[rise_0.32s_var(--ease-out-soft)_both]"
    >
      <p>{t("assist.changes.body")}</p>
      <button
        type="button"
        onClick={onAcknowledge}
        className="mt-2 inline-flex min-h-9 items-center text-xs font-medium text-accent-700 underline decoration-accent-300 underline-offset-2 hover:decoration-accent-600"
      >
        {t("assist.changes.acknowledge")}
      </button>
    </Callout>
  );
}

/** Loading placeholder sized to the situation layout, to avoid a layout jump. */
export function AssistSkeleton() {
  const { t } = useLocale();
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">{t("assist.loading")}</span>
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-10 w-full max-w-2xl" />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          <Skeleton className="h-56 w-full" />
          <Skeleton className="h-72 w-full" />
        </div>
        <div className="space-y-6">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      </div>
    </div>
  );
}
