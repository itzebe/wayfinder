"use client";

import {
  Bus,
  Car,
  CircleHelp,
  CloudLightning,
  Landmark,
  Languages,
  PlaneTakeoff,
  TrainFront,
  TramFront,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";

import { useLocale } from "@/components/providers/LocaleProvider";
import { cn } from "@/lib/format/cn";

/**
 * Category shortcuts.
 *
 * The brief's ten situations, each a real entry into the flow. Every one either
 * starts a search with the category already chosen (`/support` opens the flow
 * preselected) or routes to the dedicated flight flow, so none of them are
 * decorative buttons.
 *
 * "Announcement translation" is the odd one out: it is not a retrieval category
 * but the translator, which lives on the flight situation page, so it points
 * there with a note rather than pretending to be a search.
 */
type Shortcut = {
  key: string;
  icon: LucideIcon;
  href: string;
  /** Set when the shortcut starts a retrieval search and preselects a category. */
  category?: string;
};

const SHORTCUTS: Shortcut[] = [
  { key: "flights", icon: PlaneTakeoff, href: "/support?category=flights", category: "flights" },
  { key: "metro", icon: TramFront, href: "/support?category=metro", category: "metro" },
  { key: "rail", icon: TrainFront, href: "/support?category=rail", category: "rail" },
  { key: "bus", icon: Bus, href: "/support?category=bus", category: "bus" },
  { key: "road", icon: Car, href: "/support?category=road", category: "road" },
  { key: "weather", icon: CloudLightning, href: "/support?category=weather", category: "weather" },
  {
    key: "travel",
    icon: TriangleAlert,
    href: "/support?category=stranded",
    category: "stranded",
  },
  {
    key: "publicService",
    icon: Landmark,
    href: "/support?category=public_service",
    category: "public_service",
  },
  { key: "other", icon: CircleHelp, href: "/support?category=other", category: "other" },
  { key: "announcement", icon: Languages, href: "/help" },
];

export function CategoryShortcuts({ className }: { className?: string }) {
  const { t } = useLocale();

  return (
    <div className={cn(className)}>
      <p className="mb-3 text-xs font-semibold uppercase tracking-[0.1em] text-ink-500">
        {t("shortcuts.title")}
      </p>
      <ul className="flex flex-wrap gap-2">
        {SHORTCUTS.map(({ key, icon: Icon, href }) => (
          <li key={key}>
            <a
              href={href}
              className={cn(
                "inline-flex min-h-11 items-center gap-2 rounded-full border border-line bg-paper-0 px-3.5 text-sm font-medium text-ink-700",
                "transition-[border-color,background-color,color] duration-150",
                "hover:border-accent-300 hover:bg-accent-50 hover:text-ink-900",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-600",
              )}
            >
              <Icon className="size-4 shrink-0 text-accent-700" aria-hidden="true" />
              {t(`shortcuts.${key}`)}
            </a>
          </li>
        ))}
      </ul>
      <p className="mt-2.5 text-xs leading-relaxed text-ink-500">{t("shortcuts.note")}</p>
    </div>
  );
}
