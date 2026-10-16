"use client";

import { useId } from "react";

import { cn } from "@/lib/format/cn";

/**
 * Form field primitives.
 *
 * Labels are always real `<label>` elements bound to the control, help text is
 * wired through `aria-describedby`, and errors are announced with
 * `aria-invalid` plus `role="alert"` so a screen reader hears the recovery
 * instruction, not just a colour change.
 */

interface FieldShellProps {
  id: string;
  label: string;
  help?: string;
  error?: string;
  optional?: boolean;
  optionalLabel: string;
  children: React.ReactNode;
  hint?: React.ReactNode;
  className?: string;
}

export function FieldShell({
  id,
  label,
  help,
  error,
  optional,
  optionalLabel,
  children,
  hint,
  className,
}: FieldShellProps) {
  const helpId = `${id}-help`;
  const errorId = `${id}-error`;

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-sm font-medium text-ink-800">
          {label}
        </label>
        {optional ? (
          <span className="text-xs text-ink-400">{optionalLabel}</span>
        ) : null}
      </div>

      {children}

      {help && !error ? (
        <p id={helpId} className="text-xs leading-relaxed text-ink-500">
          {help}
        </p>
      ) : null}

      {error ? (
        <p
          id={errorId}
          role="alert"
          className="flex items-start gap-1.5 text-xs font-medium text-danger-600"
        >
          <span
            className="mt-1.5 size-1.5 shrink-0 rounded-full bg-danger-500"
            aria-hidden="true"
          />
          {error}
        </p>
      ) : null}

      {hint}
    </div>
  );
}

export function TextField({
  id,
  label,
  value,
  onChange,
  help,
  error,
  optional,
  optionalLabel,
  placeholder,
  inputMode,
  autoComplete,
  maxLength,
  mono,
  className,
  onBlur,
  describedBy,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  help?: string;
  error?: string;
  optional?: boolean;
  optionalLabel: string;
  placeholder?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  autoComplete?: string;
  maxLength?: number;
  mono?: boolean;
  className?: string;
  onBlur?: () => void;
  describedBy?: string;
}) {
  const errorId = error ? `${id}-error` : undefined;
  const helpId = help && !error ? `${id}-help` : undefined;

  return (
    <FieldShell
      id={id}
      label={label}
      help={help}
      error={error}
      optional={optional}
      optionalLabel={optionalLabel}
      className={className}
    >
      <input
        id={id}
        name={id}
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        placeholder={placeholder}
        inputMode={inputMode}
        autoComplete={autoComplete}
        maxLength={maxLength}
        aria-invalid={error ? true : undefined}
        aria-describedby={[errorId, helpId, describedBy].filter(Boolean).join(" ") || undefined}
        className={cn(
          "min-h-12 w-full rounded-md border bg-paper-0 px-3.5 text-base text-ink-900",
          "placeholder:text-ink-400",
          "transition-[border-color,box-shadow] duration-150",
          "focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-600",
          error
            ? "border-danger-300 focus-visible:outline-danger-500"
            : "border-line hover:border-line-strong",
          mono && "ident tracking-wide",
        )}
      />
    </FieldShell>
  );
}

export function SelectField({
  id,
  label,
  value,
  onChange,
  options,
  help,
  error,
  optional,
  optionalLabel,
  className,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  help?: string;
  error?: string;
  optional?: boolean;
  optionalLabel: string;
  className?: string;
}) {
  const errorId = error ? `${id}-error` : undefined;
  const helpId = help && !error ? `${id}-help` : undefined;

  return (
    <FieldShell
      id={id}
      label={label}
      help={help}
      error={error}
      optional={optional}
      optionalLabel={optionalLabel}
      className={className}
    >
      <select
        id={id}
        name={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={[errorId, helpId].filter(Boolean).join(" ") || undefined}
        className={cn(
          "min-h-12 w-full appearance-none rounded-md border bg-paper-0 px-3.5 pe-9 text-base text-ink-900",
          "bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 20 20%22 fill=%22%236b7c9e%22><path d=%22M5.5 7.5 10 12l4.5-4.5%22 stroke=%22%236b7c9e%22 stroke-width=%221.5%22 fill=%22none%22 stroke-linecap=%22round%22/></svg>')] bg-[length:1.25rem] bg-[position:right_0.75rem_center] bg-no-repeat",
          "transition-[border-color] duration-150",
          "focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-600",
          error ? "border-danger-300" : "border-line hover:border-line-strong",
        )}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}

export function TextAreaField({
  id,
  label,
  value,
  onChange,
  help,
  error,
  placeholder,
  optional,
  optionalLabel,
  rows = 4,
  maxLength,
  className,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  help?: string;
  error?: string;
  placeholder?: string;
  optional?: boolean;
  optionalLabel: string;
  rows?: number;
  maxLength?: number;
  className?: string;
}) {
  const errorId = error ? `${id}-error` : undefined;
  const helpId = help && !error ? `${id}-help` : undefined;
  const counterId = `${id}-counter`;

  return (
    <FieldShell
      id={id}
      label={label}
      help={help}
      error={error}
      optional={optional}
      optionalLabel={optionalLabel}
      className={className}
    >
      <textarea
        id={id}
        name={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={rows}
        maxLength={maxLength}
        placeholder={placeholder}
        aria-invalid={error ? true : undefined}
        aria-describedby={
          [errorId, helpId, maxLength ? counterId : undefined].filter(Boolean).join(" ") ||
          undefined
        }
        className={cn(
          "w-full resize-y rounded-md border bg-paper-0 px-3.5 py-3 text-base leading-relaxed text-ink-900",
          "placeholder:text-ink-400",
          "transition-[border-color] duration-150",
          "focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-600",
          error ? "border-danger-300" : "border-line hover:border-line-strong",
        )}
      />
      {maxLength ? (
        <p id={counterId} className="text-end text-xs text-ink-400">
          {value.length} / {maxLength}
        </p>
      ) : null}
    </FieldShell>
  );
}

/** Toggle rendered as a real checkbox, styled as a switch. */
export function ToggleField({
  id,
  label,
  description,
  checked,
  onChange,
  className,
}: {
  id: string;
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  className?: string;
}) {
  const descriptionId = description ? `${id}-description` : undefined;

  return (
    <div className={cn("flex items-start gap-3", className)}>
      <input
        id={id}
        name={id}
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        aria-describedby={descriptionId}
        className={cn(
          "mt-0.5 size-5 shrink-0 cursor-pointer rounded-xs border-line-strong text-accent-600",
          "accent-[var(--color-accent-600)]",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-600",
        )}
      />
      <div className="min-w-0">
        <label htmlFor={id} className="cursor-pointer text-sm font-medium text-ink-800">
          {label}
        </label>
        {description ? (
          <p id={descriptionId} className="mt-0.5 text-xs leading-relaxed text-ink-500">
            {description}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/** Associates a group of choices with a single accessible legend. */
export function FieldGroup({
  legend,
  description,
  children,
  className,
}: {
  legend: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const descriptionId = useId();
  return (
    <fieldset
      className={cn("border-0 p-0", className)}
      aria-describedby={description ? descriptionId : undefined}
    >
      <legend className="text-sm font-medium text-ink-800">{legend}</legend>
      {description ? (
        <p id={descriptionId} className="mt-1 text-xs leading-relaxed text-ink-500">
          {description}
        </p>
      ) : null}
      <div className="mt-3">{children}</div>
    </fieldset>
  );
}
