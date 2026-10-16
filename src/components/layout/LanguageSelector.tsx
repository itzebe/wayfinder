"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown, Globe } from "lucide-react";

import { cn } from "@/lib/format/cn";
import { useLocale } from "@/components/providers/LocaleProvider";
import { LOCALES, type LocaleCode } from "@/lib/i18n/locales";

/**
 * Language selector.
 *
 * A listbox pattern implemented with a button plus a roving-focus menu, because
 * a native `<select>` cannot show both the endonym and the English name legibly
 * at this size. Full keyboard support: Enter/Space opens, arrows move, Home/End
 * jump, Escape closes and returns focus to the trigger.
 */
export function LanguageSelector({ className }: { className?: string }) {
  const { locale, meta, setLocale, t } = useLocale();
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const labelId = useId();

  const activeOptionId = `locale-option-${LOCALES[activeIndex]?.code ?? "en"}`;

  // Close on outside interaction so the menu never traps the page.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
    };
  }, [open]);

  // Move focus into the list when it opens, so keyboard users are not stranded.
  useEffect(() => {
    if (open) {
      const index = LOCALES.findIndex((entry) => entry.code === locale);
      setActiveIndex(index >= 0 ? index : 0);
      window.requestAnimationFrame(() => listRef.current?.focus());
    }
  }, [open, locale]);

  const commit = (code: LocaleCode) => {
    setLocale(code);
    setOpen(false);
    triggerRef.current?.focus();
  };

  const onListKeyDown = (event: React.KeyboardEvent<HTMLUListElement>) => {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setActiveIndex((index) => (index + 1) % LOCALES.length);
        break;
      case "ArrowUp":
        event.preventDefault();
        setActiveIndex((index) => (index - 1 + LOCALES.length) % LOCALES.length);
        break;
      case "Home":
        event.preventDefault();
        setActiveIndex(0);
        break;
      case "End":
        event.preventDefault();
        setActiveIndex(LOCALES.length - 1);
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        commit(LOCALES[activeIndex].code);
        break;
      case "Escape":
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
        break;
      case "Tab":
        setOpen(false);
        break;
      default:
        break;
    }
  };

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <span id={labelId} className="sr-only">
        {t("nav.language")}
      </span>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby={labelId}
        className={cn(
          "inline-flex min-h-11 items-center gap-2 rounded-md border border-line bg-paper-0 px-3",
          "text-sm font-medium text-ink-700 transition-colors duration-150",
          "hover:border-line-strong hover:bg-paper-100",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-600",
        )}
      >
        <Globe className="size-4 text-ink-400" aria-hidden="true" />
        <span className="hidden sm:inline">{meta.nativeName}</span>
        <span className="sm:hidden">{meta.code.toUpperCase()}</span>
        <ChevronDown
          className={cn("size-3.5 text-ink-400 transition-transform duration-200", open && "rotate-180")}
          aria-hidden="true"
        />
      </button>

      {open ? (
        <ul
          ref={listRef}
          role="listbox"
          tabIndex={-1}
          aria-labelledby={labelId}
          aria-activedescendant={activeOptionId}
          onKeyDown={onListKeyDown}
          className={cn(
            "absolute z-50 mt-2 max-h-80 w-60 overflow-auto rounded-lg border border-line",
            "bg-paper-0 py-1.5 shadow-lg",
            "end-0",
          )}
        >
          {LOCALES.map((entry, index) => {
            const selected = entry.code === locale;
            const active = index === activeIndex;
            return (
              <li
                key={entry.code}
                id={`locale-option-${entry.code}`}
                role="option"
                aria-selected={selected}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => commit(entry.code)}
                className={cn(
                  "flex min-h-11 cursor-pointer items-center justify-between gap-3 px-3 py-2",
                  "text-sm text-ink-800",
                  active && "bg-accent-50",
                  !active && "hover:bg-paper-100",
                )}
              >
                <span className="flex min-w-0 flex-col">
                  <span className="font-medium" lang={entry.code} dir={entry.dir}>
                    {entry.nativeName}
                  </span>
                  <span className="text-xs text-ink-500">
                    {entry.name}
                    {entry.coverage === "partial" ? ` · ${t("nav.partialCoverage")}` : ""}
                  </span>
                </span>
                {selected ? (
                  <Check className="size-4 shrink-0 text-accent-600" aria-hidden="true" />
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
