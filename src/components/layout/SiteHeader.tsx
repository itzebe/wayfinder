"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";

import { cn } from "@/lib/format/cn";
import { Button } from "@/components/ui/Button";
import { WayfinderWordmark } from "@/components/ui/WayfinderMark";
import { LanguageSelector } from "@/components/layout/LanguageSelector";
import { useLocale } from "@/components/providers/LocaleProvider";

/**
 * Site navigation.
 *
 * The mobile menu is a disclosure that owns focus while open, closes on Escape,
 * restores focus to its trigger, and locks background scroll. It never overlays
 * the primary "Get help now" action, which stays reachable at every width.
 */
export function SiteHeader() {
  const { t } = useLocale();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Close the menu whenever the route changes.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Escape closes; background scroll is locked while the sheet is open.
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Move focus to the first link so keyboard users land inside the menu.
    const firstLink = panelRef.current?.querySelector<HTMLElement>("a, button");
    firstLink?.focus();

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  const links = [
    { href: "/#how-it-works", label: t("nav.howItWorks") },
    { href: "/#live-assistance", label: t("nav.liveAssistance") },
    { href: "/#situations", label: t("nav.situations") },
  ];

  return (
    <>
      <a href="#main" className="sr-only-focusable">
        {t("nav.skipToContent")}
      </a>

      <header
        className={cn(
          "sticky top-0 z-40 w-full border-b transition-colors duration-200",
          scrolled
            ? "border-line-soft bg-paper-50/95 backdrop-blur-sm"
            : "border-transparent bg-paper-50",
        )}
      >
        <div className="shell flex h-16 items-center justify-between gap-2 lg:h-18 lg:gap-4">
          <Link
            href="/"
            aria-label={t("nav.home")}
            className="flex min-w-0 items-center rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent-600"
          >
            <WayfinderWordmark size={24} />
          </Link>

          <nav aria-label={t("nav.primary")} className="hidden items-center gap-1 lg:flex">
            {links.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className={cn(
                  "rounded-md px-3 py-2 text-sm font-medium text-ink-600",
                  "transition-colors duration-150 hover:bg-paper-100 hover:text-ink-900",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-600",
                )}
              >
                {link.label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <div className="hidden md:block">
              <LanguageSelector />
            </div>

            <Button href="/support" size="md" className="hidden sm:inline-flex">
              {t("nav.getHelp")}
            </Button>

            {/* Mobile: the help action stays visible, the menu is secondary. */}
            <Button href="/support" size="sm" className="sm:hidden">
              {t("nav.getHelp")}
            </Button>

            <button
              ref={triggerRef}
              type="button"
              onClick={() => setOpen((value) => !value)}
              aria-expanded={open}
              aria-controls="mobile-menu"
              aria-label={open ? t("nav.closeMenu") : t("nav.openMenu")}
              className={cn(
                "inline-flex size-11 items-center justify-center rounded-md border border-line",
                "bg-paper-0 text-ink-700 transition-colors duration-150 hover:bg-paper-100",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-600",
                "lg:hidden",
              )}
            >
              {open ? (
                <X className="size-5" aria-hidden="true" />
              ) : (
                <Menu className="size-5" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>

        {open ? (
          <div
            id="mobile-menu"
            ref={panelRef}
            className="border-t border-line-soft bg-paper-0 lg:hidden"
          >
            <nav aria-label={t("nav.mobile")} className="shell flex flex-col py-3">
              {links.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "flex min-h-12 items-center rounded-md px-3 text-base font-medium text-ink-700",
                    "hover:bg-paper-100 focus-visible:outline-2 focus-visible:outline-offset-2",
                    "focus-visible:outline-accent-600",
                  )}
                >
                  {link.label}
                </a>
              ))}

              <div className="mt-3 border-t border-line-soft pt-3">
                <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-[0.08em] text-ink-500">
                  {t("nav.language")}
                </p>
                <div className="px-3 pb-1">
                  <LanguageSelector className="w-full [&>button]:w-full [&>button]:justify-between" />
                </div>
              </div>
            </nav>
          </div>
        ) : null}
      </header>
    </>
  );
}
