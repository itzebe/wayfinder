"use client";

import { useId, useState } from "react";
import { ChevronDown, ExternalLink, Landmark, ScrollText } from "lucide-react";

import { cn } from "@/lib/format/cn";
import { Badge, toneForTier } from "@/components/ui/Badge";
import { DataStateBadge } from "@/components/ui/DataStateBadge";
import { useLocale } from "@/components/providers/LocaleProvider";
import { formatAbsolute, formatRelative } from "@/lib/format/datetime";
import type { SourceRef } from "@/lib/core/types";

/**
 * Official sources panel.
 *
 * Makes the provenance of every claim inspectable: who published it, when they
 * published it, when we retrieved it, and whether it is a primary source. Raw
 * upstream text is available on demand so a sceptical traveller can read the
 * original rather than trusting a summary.
 */
export function SourcePanel({
  sources,
  className,
  compact,
}: {
  sources: SourceRef[];
  className?: string;
  compact?: boolean;
}) {
  const { t } = useLocale();

  if (sources.length === 0) {
    return <p className="text-sm text-ink-500">{t("sources.none")}</p>;
  }

  const primary = sources.filter((source) => source.tier === "primary");
  const secondary = sources.filter((source) => source.tier === "secondary");

  return (
    <div className={cn("space-y-4", className)}>
      {primary.length > 0 ? (
        <div>
          <p className="mb-2 flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-ink-500">
            <Landmark className="size-3.5" aria-hidden="true" />
            <span>{t("sources.primary")}</span>
          </p>
          <p className="mb-2.5 text-xs text-ink-400">{t("sources.primaryNote")}</p>
          <ul className="space-y-2.5">
            {primary.map((source) => (
              <SourceItem key={source.id} source={source} compact={compact} />
            ))}
          </ul>
        </div>
      ) : null}

      {secondary.length > 0 ? (
        <div>
          <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-ink-500">
            <ScrollText className="size-3.5" aria-hidden="true" />
            <span>{t("sources.secondary")}</span>
          </p>
          <ul className="space-y-2.5">
            {secondary.map((source) => (
              <SourceItem key={source.id} source={source} compact={compact} />
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function SourceItem({ source, compact }: { source: SourceRef; compact?: boolean }) {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  const panelId = useId();

  const retrievedLabel = formatRelative(source.retrievedAt);
  const publishedLabel = source.publishedAt ? formatRelative(source.publishedAt) : undefined;
  const hasRaw = Boolean(source.note);

  return (
    <li className="rounded-md border border-line-soft bg-paper-0">
      <div className="px-3.5 py-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium leading-snug text-ink-900">{source.title}</p>
            <p className="mt-0.5 text-xs text-ink-500">{source.organization}</p>
          </div>
          <Badge tone={toneForTier(source.tier)}>
            {source.tier === "primary" ? t("sources.primary") : t("sources.secondary")}
          </Badge>
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <DataStateBadge state={source.state} />
          <span className="text-xs text-ink-500">
            {t("sources.retrievedAt", { time: retrievedLabel })}
          </span>
          {publishedLabel ? (
            <span className="text-xs text-ink-400">
              {t("sources.publishedAt", { time: publishedLabel })}
            </span>
          ) : null}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
          <a
            href={source.url}
            target="_blank"
            rel="noreferrer noopener"
            className={cn(
              "inline-flex min-h-9 items-center gap-1.5 text-xs font-medium text-accent-700",
              "underline decoration-accent-300 underline-offset-2 hover:decoration-accent-600",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-600",
            )}
          >
            {t("sources.open")}
            <ExternalLink className="size-3.5" aria-hidden="true" />
            <span className="sr-only">{t("a11y.opensNewTab")}</span>
          </a>

          {hasRaw && !compact ? (
            <button
              type="button"
              onClick={() => setOpen((value) => !value)}
              aria-expanded={open}
              aria-controls={panelId}
              className={cn(
                "inline-flex min-h-9 items-center gap-1.5 px-2 text-xs font-medium text-ink-600",
                "rounded-sm hover:bg-paper-100 hover:text-ink-800",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-600",
              )}
            >
              <ChevronDown
                className={cn("size-3.5 transition-transform duration-200", open && "rotate-180")}
                aria-hidden="true"
              />
              {open ? t("sources.hideRaw") : t("sources.showRaw")}
            </button>
          ) : null}
        </div>

        {hasRaw && open ? (
          <div id={panelId} className="mt-2.5">
            <pre className="max-h-56 overflow-auto rounded-sm border border-line-soft bg-paper-50 px-3 py-2.5 text-xs leading-relaxed text-ink-700">
              <code className="ident whitespace-pre-wrap break-all">{source.note}</code>
            </pre>
            {source.publishedAt ? (
              <p className="mt-1.5 text-xs text-ink-400">
                {t("sources.publishedAt", { time: formatAbsolute(source.publishedAt) })}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </li>
  );
}
