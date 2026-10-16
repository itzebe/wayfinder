"use client";

import { CircleHelp, CloudOff, Database, FlaskConical, Radio, RefreshCw } from "lucide-react";

import { cn } from "@/lib/format/cn";
import { useLocale } from "@/components/providers/LocaleProvider";
import type { DataState } from "@/lib/core/types";

/**
 * Data-state badge.
 *
 * The most important honesty control in the product. It answers "how do you know
 * this, and how fresh is it?" for every block of retrieved data, and it never
 * says "live" merely because a page happens to be open.
 */

const CONFIG: Record<
  DataState,
  { icon: React.ComponentType<{ className?: string }>; tone: string; iconTone: string }
> = {
  live: {
    icon: Radio,
    tone: "border-success-200 bg-success-50 text-success-700",
    iconTone: "text-success-600",
  },
  cached: {
    icon: Database,
    tone: "border-accent-200 bg-accent-50 text-accent-800",
    iconTone: "text-accent-600",
  },
  stale: {
    icon: RefreshCw,
    tone: "border-warn-200 bg-warn-50 text-warn-700",
    iconTone: "text-warn-600",
  },
  unavailable: {
    icon: CloudOff,
    tone: "border-line bg-paper-100 text-ink-600",
    iconTone: "text-ink-400",
  },
  demo: {
    icon: FlaskConical,
    tone: "border-line bg-paper-100 text-ink-600",
    iconTone: "text-ink-400",
  },
};

export function DataStateBadge({
  state,
  relativeLabel,
  className,
}: {
  state: DataState;
  relativeLabel?: string;
  className?: string;
}) {
  const { t } = useLocale();
  const config = CONFIG[state];
  const Icon = config.icon;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium leading-none",
        config.tone,
        className,
      )}
      title={t(`state.${state}.desc`)}
    >
      <Icon className={cn("size-3.5", config.iconTone)} aria-hidden="true" />
      <span>{t(`state.${state}`)}</span>
      {relativeLabel ? (
        <span className="font-normal opacity-75">· {relativeLabel}</span>
      ) : null}
      <span className="sr-only">. {t(`state.${state}.desc`)}</span>
    </span>
  );
}

/** Inline "how fresh is this" line used beneath individual facts. */
export function FreshnessNote({
  state,
  relativeLabel,
  sourceName,
  className,
}: {
  state: DataState;
  relativeLabel?: string;
  sourceName?: string;
  className?: string;
}) {
  const { t } = useLocale();
  const config = CONFIG[state];
  const Icon = config.icon;

  return (
    <p className={cn("flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-ink-500", className)}>
      <Icon className={cn("size-3.5 shrink-0", config.iconTone)} aria-hidden="true" />
      <span className="font-medium text-ink-600">{t(`state.${state}`)}</span>
      {relativeLabel ? (
        <>
          <span aria-hidden="true">·</span>
          <span>{relativeLabel}</span>
        </>
      ) : null}
      {sourceName ? (
        <>
          <span aria-hidden="true">·</span>
          <span>{sourceName}</span>
        </>
      ) : null}
    </p>
  );
}

/** Shown when a value genuinely could not be retrieved. */
export function UnavailableNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-2 text-sm text-ink-500">
      <CircleHelp className="mt-0.5 size-4 shrink-0 text-ink-400" aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}
