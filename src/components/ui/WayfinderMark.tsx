import { cn } from "@/lib/format/cn";

/**
 * The WAYFINDER mark.
 *
 * A waypoint lozenge with a direction notch: the visual idea is a plotted course
 * that has changed. It reads at 20px in the navigation bar and at 40px in the
 * footer, and it is decorative — the wordmark always accompanies it, so it is
 * marked `aria-hidden`.
 */
export function WayfinderMark({
  className,
  size = 28,
}: {
  className?: string;
  size?: number;
}) {
  return (
    <svg
      viewBox="0 0 32 32"
      width={size}
      height={size}
      className={cn("shrink-0", className)}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="wf-mark-fill" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--color-accent-400)" />
          <stop offset="100%" stopColor="var(--color-accent-700)" />
        </linearGradient>
      </defs>
      {/* Outer waypoint lozenge */}
      <path
        d="M16 1.5 30.5 16 16 30.5 1.5 16Z"
        fill="url(#wf-mark-fill)"
      />
      {/* Interior course line with a deliberate change of direction */}
      <path
        d="M10 21.5 14.6 14.4 20.9 12.2 22.6 10.3"
        fill="none"
        stroke="var(--color-paper-0)"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Waypoint dot marking the current position */}
      <circle cx="14.6" cy="14.4" r="2.05" fill="var(--color-paper-0)" />
    </svg>
  );
}

/** Wordmark: mark plus typographic lockup. */
export function WayfinderWordmark({
  className,
  size = 26,
}: {
  className?: string;
  size?: number;
}) {
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-2.5", className)}>
      <WayfinderMark size={size} />
      {/* Below 360px the mark carries the brand on its own; the link keeps its
          accessible name, so nothing is lost for screen readers. */}
      <span className="hidden font-display text-[1.0625rem] font-semibold tracking-[0.12em] text-ink-900 min-[360px]:inline">
        WAYFINDER
      </span>
    </span>
  );
}
