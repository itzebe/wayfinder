"use client";

import {
  CalendarClock,
  CircleHelp,
  PlaneLanding,
  PlaneTakeoff,
  Radio,
  RefreshCw,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/format/cn";
import { useLocale } from "@/components/providers/LocaleProvider";
import type { AssistanceNeed } from "@/lib/core/types";

/**
 * Step 1 — identify the situation.
 *
 * Selection cards rather than a dropdown: the choices are the product's promise,
 * and a traveller under stress should see all of them at once. Each card wraps a
 * real radio input, so keyboard and screen-reader behaviour is native.
 */

export const NEED_ORDER: AssistanceNeed[] = [
  "cancelled",
  "delayed",
  "connection",
  "gate_change",
  "announcement",
  "options",
  "other",
];

const NEED_ICONS: Record<AssistanceNeed, LucideIcon> = {
  cancelled: PlaneLanding,
  delayed: CalendarClock,
  connection: RefreshCw,
  gate_change: Radio,
  announcement: TriangleAlert,
  options: CircleHelp,
  other: PlaneTakeoff,
};

export function SituationPicker({
  value,
  onChange,
  name = "need",
}: {
  value: AssistanceNeed | null;
  onChange: (need: AssistanceNeed) => void;
  name?: string;
}) {
  const { t } = useLocale();

  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {NEED_ORDER.map((need) => {
        const Icon = NEED_ICONS[need];
        const selected = value === need;
        const inputId = `${name}-${need}`;

        return (
          <li key={need}>
            <label
              htmlFor={inputId}
              className={cn(
                "group flex h-full cursor-pointer items-start gap-3.5 rounded-lg border p-4",
                "transition-[border-color,background-color,box-shadow] duration-150",
                "focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent-600",
                selected
                  ? "border-accent-400 bg-accent-50 shadow-sm"
                  : "border-line-soft bg-paper-0 hover:border-line hover:bg-paper-50 hover:shadow-sm",
              )}
            >
              <input
                id={inputId}
                type="radio"
                name={name}
                value={need}
                checked={selected}
                onChange={() => onChange(need)}
                className="sr-only"
              />

              <span
                className={cn(
                  "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-md border",
                  selected
                    ? "border-accent-300 bg-paper-0"
                    : "border-line bg-paper-100 group-hover:bg-paper-0",
                )}
              >
                <Icon
                  className={cn("size-4.5", selected ? "text-accent-700" : "text-ink-500")}
                  aria-hidden="true"
                />
              </span>

              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-ink-900">
                    {t(`need.${need}.title`)}
                  </span>
                  {/* Selection indicator that does not rely on colour alone. */}
                  <span
                    className={cn(
                      "ms-auto flex size-4 shrink-0 items-center justify-center rounded-full border-2",
                      selected ? "border-accent-600" : "border-line-strong",
                    )}
                    aria-hidden="true"
                  >
                    {selected ? <span className="size-2 rounded-full bg-accent-600" /> : null}
                  </span>
                </span>
                <span className="mt-1 block text-xs leading-relaxed text-ink-500">
                  {t(`need.${need}.body`)}
                </span>
              </span>
            </label>
          </li>
        );
      })}
    </ul>
  );
}

/** Compact progress indicator used across the flow. */
export function FlowProgress({
  current,
  total,
  label,
}: {
  current: number;
  total: number;
  label: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-500">{label}</p>
        <p className="text-xs font-medium text-ink-500" aria-hidden="true">
          {current} / {total}
        </p>
      </div>
      <div
        className="mt-2 flex gap-1.5"
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={total}
        aria-valuenow={current}
        aria-label={label}
      >
        {Array.from({ length: total }, (_, index) => (
          <span
            key={index}
            className={cn(
              "h-1.5 flex-1 rounded-full transition-colors duration-300",
              index < current ? "bg-accent-600" : "bg-line",
            )}
          />
        ))}
      </div>
    </div>
  );
}
