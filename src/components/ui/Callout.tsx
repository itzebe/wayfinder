import { cn } from "@/lib/format/cn";
import { AlertTriangle, CheckCircle2, Info, OctagonAlert, ShieldAlert } from "lucide-react";

/**
 * Callout.
 *
 * Used to separate verified facts from recommendations, alerts and uncertain
 * information — one of the product's core distinctions. Each variant carries its
 * own icon and a visually hidden severity word, so meaning never rests on colour.
 */

type CalloutTone = "info" | "success" | "warning" | "danger" | "neutral" | "uncertain";

const TONES: Record<CalloutTone, { wrap: string; icon: string; label: string }> = {
  info: { wrap: "border-accent-200 bg-accent-50", icon: "text-accent-700", label: "Information" },
  success: {
    wrap: "border-success-200 bg-success-50",
    icon: "text-success-600",
    label: "Confirmed",
  },
  warning: { wrap: "border-warn-200 bg-warn-50", icon: "text-warn-600", label: "Attention" },
  danger: { wrap: "border-danger-200 bg-danger-50", icon: "text-danger-600", label: "Urgent" },
  neutral: { wrap: "border-line bg-paper-100", icon: "text-ink-500", label: "Note" },
  uncertain: { wrap: "border-warn-200 bg-warn-50", icon: "text-warn-600", label: "Uncertain" },
};

const ICONS: Record<CalloutTone, React.ComponentType<{ className?: string }>> = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: OctagonAlert,
  neutral: Info,
  uncertain: ShieldAlert,
};

export function Callout({
  tone = "info",
  title,
  children,
  className,
  compact,
}: {
  tone?: CalloutTone;
  title?: string;
  children: React.ReactNode;
  className?: string;
  compact?: boolean;
}) {
  const config = TONES[tone];
  const Icon = ICONS[tone];

  return (
    <div
      className={cn(
        "rounded-md border",
        compact ? "px-3.5 py-3" : "px-4 py-4 sm:px-5",
        config.wrap,
        className,
      )}
    >
      <div className="flex gap-3">
        <Icon className={cn("mt-0.5 size-5 shrink-0", config.icon)} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <span className="sr-only">{config.label}: </span>
          {title ? <p className="text-sm font-semibold text-ink-900">{title}</p> : null}
          <div
            className={cn(
              "text-sm text-ink-700",
              title ? "mt-1" : "",
              "[&_a]:font-medium [&_a]:text-accent-700 [&_a]:underline [&_a]:decoration-accent-300 [&_a]:underline-offset-2 hover:[&_a]:decoration-accent-600",
            )}
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Loading placeholder with a shimmer, sized to the content it replaces. */
export function Skeleton({ className, label = "Loading" }: { className?: string; label?: string }) {
  return (
    <span
      className={cn("skeleton block rounded-sm", className)}
      role="status"
      aria-label={label}
    />
  );
}

/** Announced to screen readers when the page's data changes. */
export function LiveRegion({
  message,
  politeness = "polite",
}: {
  message: string;
  politeness?: "polite" | "assertive";
}) {
  return (
    <div className="sr-only" role="status" aria-live={politeness} aria-atomic="true">
      {message}
    </div>
  );
}
