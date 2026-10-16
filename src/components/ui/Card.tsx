import { cn } from "@/lib/format/cn";

/**
 * Surface primitives.
 *
 * Hierarchy comes from border weight, background warmth and spacing rather than
 * from heavy shadows, so a dense situation page stays calm and scannable.
 */

export function Card({
  as: Tag = "div",
  className,
  children,
  ...rest
}: {
  as?: "div" | "section" | "article" | "li" | "aside";
  className?: string;
  children: React.ReactNode;
} & React.HTMLAttributes<HTMLElement>) {
  return (
    <Tag
      className={cn(
        "rounded-lg border border-line-soft bg-paper-0 shadow-sm",
        className,
      )}
      {...rest}
    >
      {children}
    </Tag>
  );
}

/** Card with a titled header, used for every major situation-page section. */
export function SectionCard({
  id,
  title,
  description,
  icon,
  actions,
  children,
  className,
  tone = "default",
}: {
  id?: string;
  title: string;
  description?: string;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  tone?: "default" | "accent" | "warn";
}) {
  const headerTone =
    tone === "accent"
      ? "bg-accent-50/60 border-accent-100"
      : tone === "warn"
        ? "bg-warn-50/60 border-warn-100"
        : "bg-paper-50 border-line-soft";

  return (
    <Card as="section" id={id} className={cn("overflow-hidden", className)}>
      <header
        className={cn(
          "flex flex-wrap items-start justify-between gap-3 border-b px-5 py-4 sm:px-6",
          headerTone,
        )}
      >
        <div className="flex min-w-0 items-start gap-3">
          {icon ? (
            <span className="mt-0.5 text-ink-500" aria-hidden="true">
              {icon}
            </span>
          ) : null}
          <div className="min-w-0">
            <h2 className="text-lg font-semibold tracking-[-0.01em] text-ink-900">
              {title}
            </h2>
            {description ? (
              <p className="mt-1 text-sm text-ink-500">{description}</p>
            ) : null}
          </div>
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </header>
      <div className="px-5 py-5 sm:px-6">{children}</div>
    </Card>
  );
}

/** Definition row for operational data. Keeps label/value alignment strict. */
export function DataRow({
  label,
  children,
  hint,
  mono,
  className,
}: {
  label: string;
  children: React.ReactNode;
  hint?: React.ReactNode;
  mono?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-1 border-b border-line-soft py-3 last:border-b-0",
        "sm:flex-row sm:items-baseline sm:justify-between sm:gap-6",
        className,
      )}
    >
      <dt className="shrink-0 text-sm font-medium text-ink-500 sm:w-52">{label}</dt>
      <dd
        className={cn(
          "min-w-0 text-ink-900 sm:flex-1 sm:text-right",
          mono && "ident text-[0.9375rem]",
        )}
      >
        {children}
        {hint ? <span className="mt-0.5 block text-xs text-ink-400">{hint}</span> : null}
      </dd>
    </div>
  );
}

/** Muted placeholder for a value no reachable source publishes. The caller must
 * supply a localised label so this never emits English into a translated page. */
export function UnknownValue({ label }: { label: string }) {
  return <span className="text-sm italic text-ink-400">{label}</span>;
}
