"use client";

import {
  Bus,
  Car,
  CircleHelp,
  CloudLightning,
  Landmark,
  PlaneTakeoff,
  TrainFront,
  TramFront,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/format/cn";
import { useLocale } from "@/components/providers/LocaleProvider";
import type { AssistanceCategory } from "@/lib/assist/types";

/**
 * Step 1 — identify the situation.
 *
 * The category cards are the product's promise, so they are shown all at once
 * rather than hidden behind a dropdown. Each card wraps a real radio input, so
 * keyboard and screen-reader behaviour is native and no ARIA rewriting is
 * needed. Order leads with the everyday categories; flights are one option among
 * them rather than the presumed default, and their richer flow is disclosed on
 * the card.
 */

export const CATEGORY_ORDER: AssistanceCategory[] = [
  "metro",
  "rail",
  "bus",
  "road",
  "weather",
  "public_service",
  "stranded",
  "flights",
  "other",
];

const ICONS: Record<AssistanceCategory, LucideIcon> = {
  flights: PlaneTakeoff,
  metro: TramFront,
  rail: TrainFront,
  bus: Bus,
  road: Car,
  weather: CloudLightning,
  stranded: CircleHelp,
  public_service: Landmark,
  other: CircleHelp,
};

export function CategoryPicker({
  value,
  onChange,
  unavailable = [],
  name = "category",
}: {
  value: AssistanceCategory | null;
  onChange: (category: AssistanceCategory) => void;
  /** Categories with no live provider for the current region, shown as such. */
  unavailable?: AssistanceCategory[];
  name?: string;
}) {
  const { t } = useLocale();

  return (
    <fieldset>
      <legend className="sr-only">{t("assist.title")}</legend>
      <ul className="grid gap-3 sm:grid-cols-2">
        {CATEGORY_ORDER.map((category) => {
          const Icon = ICONS[category];
          const selected = value === category;
          const isUnavailable = unavailable.includes(category);
          const id = `${name}-${category}`;

          return (
            <li key={category}>
              <label
                htmlFor={id}
                className={cn(
                  "group flex h-full cursor-pointer items-start gap-3 rounded-lg border p-4",
                  "transition-[border-color,background-color,box-shadow] duration-150",
                  "focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent-600",
                  selected
                    ? "border-accent-400 bg-accent-50 shadow-sm"
                    : "border-line-soft bg-paper-0 hover:border-accent-300 hover:bg-paper-50",
                )}
              >
                <input
                  type="radio"
                  id={id}
                  name={name}
                  value={category}
                  checked={selected}
                  onChange={() => onChange(category)}
                  className="sr-only"
                />

                <span
                  className={cn(
                    "mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-md border",
                    selected
                      ? "border-accent-300 bg-accent-100 text-accent-800"
                      : "border-line-soft bg-paper-50 text-ink-500 group-hover:text-ink-700",
                  )}
                  aria-hidden="true"
                >
                  <Icon className="size-5" />
                </span>

                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-ink-900">
                      {t(`assist.category.${category}.title`)}
                    </span>
                    {isUnavailable ? (
                      <span className="rounded-full border border-warn-200 bg-warn-50 px-2 py-0.5 text-[0.6875rem] font-medium leading-none text-warn-700">
                        {t("assist.picker.noLiveData")}
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-1 block text-sm leading-relaxed text-ink-600">
                    {t(`assist.category.${category}.body`)}
                  </span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}
