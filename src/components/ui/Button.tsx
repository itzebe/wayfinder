import { cn } from "@/lib/format/cn";

type Variant = "primary" | "secondary" | "ghost" | "quiet" | "danger";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-accent-600 text-paper-0 border border-accent-700 hover:bg-accent-700 active:bg-accent-800 shadow-sm",
  secondary:
    "bg-paper-0 text-ink-800 border border-line hover:border-line-strong hover:bg-paper-100 active:bg-paper-200 shadow-xs",
  ghost:
    "bg-transparent text-ink-700 border border-transparent hover:bg-paper-100 hover:border-line active:bg-paper-200",
  quiet: "bg-ink-50 text-ink-800 border border-ink-100 hover:bg-ink-100 active:bg-ink-200",
  danger:
    "bg-danger-500 text-paper-0 border border-danger-600 hover:bg-danger-600 active:bg-danger-700 shadow-sm",
};

const SIZES: Record<Size, string> = {
  // 44px minimum height keeps every variant a comfortable touch target.
  sm: "h-11 px-3.5 text-sm gap-1.5",
  md: "h-11 px-4 text-sm gap-2",
  lg: "h-13 px-6 text-base gap-2.5",
};

function buttonClasses(variant: Variant, size: Size, className?: string) {
  return cn(
    "inline-flex items-center justify-center rounded-md font-medium",
    "transition-[background-color,border-color,color,transform,box-shadow] duration-150",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-600",
    "disabled:cursor-not-allowed disabled:opacity-50",
    "active:translate-y-px",
    VARIANTS[variant],
    SIZES[size],
    className,
  );
}

interface CommonProps {
  variant?: Variant;
  size?: Size;
  className?: string;
  children: React.ReactNode;
}

/**
 * Button.
 *
 * Renders an `<a>` when `href` is supplied so links keep link semantics, and a
 * `<button>` otherwise. Every variant has a defined hover and pressed state;
 * none are decorative.
 */
export function Button({
  variant = "primary",
  size = "md",
  className,
  children,
  href,
  ...rest
}: CommonProps &
  Omit<
    React.ButtonHTMLAttributes<HTMLButtonElement> &
      React.AnchorHTMLAttributes<HTMLAnchorElement>,
    "className" | "children"
  >) {
  const classes = buttonClasses(variant, size, className);

  if (typeof href === "string" && href.length > 0) {
    const { type: _type, disabled: _disabled, ...anchorRest } = rest;
    return (
      <a href={href} className={classes} {...anchorRest}>
        {children}
      </a>
    );
  }

  return (
    <button className={classes} {...rest}>
      {children}
    </button>
  );
}
