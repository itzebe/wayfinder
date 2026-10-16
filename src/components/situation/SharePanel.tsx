"use client";

import { useState } from "react";
import {
  Check,
  ChevronDown,
  Copy,
  Download,
  Printer,
  Share2,
} from "lucide-react";

import { cn } from "@/lib/format/cn";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { useLocale } from "@/components/providers/LocaleProvider";
import { useSituation } from "@/components/providers/SituationProvider";
import type { SituationPage } from "@/lib/situation/compose";

/**
 * Share and save.
 *
 * Produces a plain-text summary of the facts and next steps. The booking
 * reference is opt-in and defaults to excluded, because the summary is likely to
 * be pasted into a chat or an email.
 */
export function SharePanel({ situation }: { situation: SituationPage }) {
  const { t, locale } = useLocale();
  const { bookingReference } = useSituation();
  const [includeReference, setIncludeReference] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);

  const summary = buildSummary(
    situation,
    t,
    includeReference ? bookingReference : undefined,
  );

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(summary);
      setCopied(true);
      setCopyFailed(false);
      window.setTimeout(() => setCopied(false), 4_000);
    } catch {
      // Clipboard access can be denied; fall back to a selectable textarea.
      setCopyFailed(true);
      setCopied(false);
    }
  };

  const onDownload = () => {
    const blob = new Blob([summary], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `wayfinder-${situation.intel.flightNumber}-${locale}.txt`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <p className="text-sm leading-relaxed text-ink-600">{t("share.note")}</p>

      {bookingReference ? (
        <label className="flex cursor-pointer items-start gap-3 rounded-md border border-line-soft bg-paper-50 px-3.5 py-3">
          <input
            type="checkbox"
            checked={includeReference}
            onChange={(event) => setIncludeReference(event.target.checked)}
            className="mt-0.5 size-5 shrink-0 accent-[var(--color-accent-600)]"
          />
          <span className="text-sm text-ink-700">
            {t("share.includeBookingRef")}{" "}
            <span className="ident font-medium text-ink-900">{bookingReference}</span>
          </span>
        </label>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={onCopy}>
          <Copy className="size-4" aria-hidden="true" />
          {t("share.copy")}
        </Button>
        <Button size="sm" variant="secondary" onClick={onDownload}>
          <Download className="size-4" aria-hidden="true" />
          {t("share.download")}
        </Button>
        <Button size="sm" variant="secondary" onClick={() => window.print()}>
          <Printer className="size-4" aria-hidden="true" />
          {t("share.print")}
        </Button>
      </div>

      <p role="status" aria-live="polite" className="min-h-5 text-xs">
        {copied ? (
          <span className="inline-flex items-center gap-1.5 text-success-600">
            <Check className="size-3.5" aria-hidden="true" />
            {t("share.copied")}
          </span>
        ) : null}
        {copyFailed ? <span className="text-warn-700">{t("share.copyFailed")}</span> : null}
      </p>

      <details className="group rounded-md border border-line-soft bg-paper-50">
        <summary
          className={cn(
            "flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-3.5 py-2.5",
            "text-sm font-medium text-ink-700 hover:text-ink-900",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-600",
          )}
        >
          <span className="flex items-center gap-2">
            <Share2 className="size-4" aria-hidden="true" />
            {t("share.preview")}
          </span>
          <ChevronDown
            className="size-4 transition-transform duration-200 group-open:rotate-180"
            aria-hidden="true"
          />
        </summary>
        <div className="border-t border-line-soft px-3.5 py-3">
          <textarea
            readOnly
            value={summary}
            rows={12}
            aria-label={t("share.summaryLabel")}
            onFocus={(event) => event.currentTarget.select()}
            className="w-full resize-y rounded-sm border border-line-soft bg-paper-0 px-3 py-2.5 text-xs leading-relaxed text-ink-700"
          />
        </div>
      </details>
    </div>
  );
}

/**
 * Builds the shareable summary.
 *
 * Deliberately excludes the traveller's own description: it can contain personal
 * detail they did not intend to forward.
 */
function buildSummary(
  situation: SituationPage,
  t: (key: string, params?: Record<string, string | number>) => string,
  bookingReference?: string,
): string {
  const { intel, signals, recommendations, sources, rightsNotes } = situation;
  const lines: string[] = [];

  lines.push(t("share.summary.header"));
  lines.push(t("share.summary.generated", { time: new Date().toISOString() }));
  lines.push("");
  lines.push(t("share.summary.situation"));
  lines.push(situation.headline);
  lines.push("");
  lines.push(t("share.summary.flight"));
  lines.push(t("share.summary.flightNumber", { value: intel.flightNumber }));
  if (intel.callsignIcao) {
    lines.push(t("share.summary.callsign", { value: intel.callsignIcao }));
  }
  if (intel.airline) lines.push(t("share.summary.airline", { value: intel.airline.name }));
  if (intel.origin) {
    lines.push(
      t("share.summary.departure", {
        value: `${intel.origin.name ?? ""} (${intel.origin.iata ?? intel.origin.icao})`.trim(),
      }),
    );
  }
  if (intel.destination) {
    lines.push(
      t("share.summary.arrival", {
        value: `${intel.destination.name ?? ""} (${intel.destination.iata ?? intel.destination.icao})`.trim(),
      }),
    );
  }
  lines.push(`  ${t("share.summary.timesNotPublished")}`);
  if (situation.travelDate) {
    lines.push(t("share.summary.travelDate", { value: situation.travelDate }));
  }
  if (bookingReference) {
    lines.push(t("share.summary.bookingReference", { value: bookingReference }));
  }

  lines.push("");
  lines.push(t("share.summary.assessment"));
  lines.push(`  ${t(`severity.${signals.disruptionLabel}`)}`);
  for (const reason of signals.disruptionBasis.slice(0, 6)) {
    lines.push(`  - ${reason}`);
  }

  lines.push("");
  lines.push(t("share.summary.uncertain"));
  for (const item of situation.uncertain) lines.push(`  - ${item}`);

  lines.push("");
  lines.push(t("share.summary.nextSteps"));
  for (const action of recommendations) {
    lines.push(`  ${action.rank}. ${action.title}`);
    lines.push(`     ${t("share.summary.why", { value: action.rationale })}`);
    if (action.actionUrl) {
      lines.push(`     ${t("share.summary.link", { value: action.actionUrl })}`);
    }
  }

  const applicable = rightsNotes.filter((note) => note.possiblyApplies);
  if (applicable.length > 0) {
    lines.push("");
    lines.push(t("share.summary.rights"));
    for (const note of applicable) {
      lines.push(`  - ${note.instrument} (${note.jurisdiction})`);
      lines.push(`    ${note.summary}`);
      lines.push(`    ${t("share.summary.sourceLabel", { value: note.url })}`);
    }
  }

  lines.push("");
  lines.push(t("share.summary.sources"));
  for (const source of sources) {
    lines.push(`  - ${source.title}`);
    lines.push(
      `    ${t("share.summary.sourceLine", {
        organization: source.organization,
        tier: t(`sources.${source.tier}`),
        state: t(`state.${source.state}`),
      })}`,
    );
    lines.push(`    ${t("share.summary.retrieved", { value: source.retrievedAt })}`);
    lines.push(`    ${source.url}`);
  }

  lines.push("");
  lines.push(t("share.summary.disclaimer"));
  lines.push(t("share.summary.confirmAirline"));

  return lines.join("\n");
}
