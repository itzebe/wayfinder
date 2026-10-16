import { cn } from "@/lib/format/cn";
import type { Confidence, DataState, SourceTier } from "@/lib/core/types";

/**
 * Status indicators.
 *
 * Colour is never the only signal: every badge pairs a tone with an icon and a
 * text label, so it remains readable in greyscale and to colour-blind users.
 */

type Tone = "neutral" | "accent" | "warn" | "danger" | "success" | "ink";

const TONES: Record<Tone, string> = {
  neutral: "bg-paper-100 text-ink-700 border-line",
  accent: "bg-accent-50 text-accent-800 border-accent-200",
  warn: "bg-warn-50 text-warn-700 border-warn-200",
  danger: "bg-danger-50 text-danger-700 border-danger-200",
  success: "bg-success-50 text-success-700 border-success-200",
  ink: "bg-ink-900 text-paper-50 border-ink-900",
};

export function Badge({
  tone = "neutral",
  icon,
  children,
  className,
}: {
  tone?: Tone;
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1",
        "text-xs font-medium leading-none",
        TONES[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}

/** Compact dot used inside dense status rows, always accompanied by a label. */
export function StatusDot({ tone }: { tone: Tone }) {
  const colours: Record<Tone, string> = {
    neutral: "bg-ink-300",
    accent: "bg-accent-500",
    warn: "bg-warn-400",
    danger: "bg-danger-500",
    success: "bg-success-500",
    ink: "bg-ink-800",
  };
  return <span className={cn("size-2 shrink-0 rounded-full", colours[tone])} aria-hidden="true" />;
}

export function toneForDataState(state: DataState): Tone {
  switch (state) {
    case "live":
      return "success";
    case "cached":
      return "accent";
    case "stale":
      return "warn";
    case "demo":
      return "neutral";
    default:
      return "neutral";
  }
}

export function toneForConfidence(confidence: Confidence): Tone {
  switch (confidence) {
    case "verified":
      return "success";
    case "corroborated":
      return "accent";
    case "unconfirmed":
      return "warn";
    default:
      return "neutral";
  }
}

export function toneForSeverity(severity: string): Tone {
  switch (severity) {
    case "high":
      return "danger";
    case "moderate":
      return "warn";
    case "elevated":
      return "warn";
    case "low":
      return "accent";
    case "none":
      return "success";
    default:
      return "neutral";
  }
}

export function toneForTier(tier: SourceTier): Tone {
  return tier === "primary" ? "accent" : "neutral";
}

export type { Tone };
