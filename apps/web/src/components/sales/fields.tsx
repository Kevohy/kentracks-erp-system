import type { ReactNode } from "react";
import { Card } from "@/components/dashboard/Card";
import { cn } from "@/lib/cn";

export const controlClass = "min-h-11 w-full min-w-0 rounded-xl border bg-white px-3.5 text-[15px] placeholder:text-muted/70 disabled:bg-canvas disabled:text-muted";

export function Field({ id, label, error, hint, className, children }: { id: string; label: string; error?: string; hint?: string; className?: string; children: ReactNode }) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-[13.5px] font-medium">
        {label}
      </label>
      {children}
      {hint && !error && <p className="text-[12.5px] text-muted">{hint}</p>}
      {error && (
        <p id={`${id}-err`} className="text-[13px] text-[#C62828]">
          {error}
        </p>
      )}
    </div>
  );
}

/** A numbered card section of a sale form. */
export function FormSection({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <Card className="flex flex-col gap-4 px-4 py-5 sm:px-6">
      <h2 className="text-lg font-semibold">
        <span className="mr-2 text-muted">{n}.</span>
        {title}
      </h2>
      {children}
    </Card>
  );
}

/** A read-only value that looks like a disabled input, so it lines up with the fields beside it. */
export function ReadOnlyField({ id, label, value, empty, hint, error, className }: { id: string; label: string; value?: string; empty: string; hint?: string; error?: string; className?: string }) {
  return (
    <Field id={id} label={label} hint={hint} error={error} className={className}>
      <output id={id} className={cn(controlClass, "flex items-center border-line bg-canvas tabular-nums", value ? "font-semibold text-ink" : "text-muted/80")}>
        {value || empty}
      </output>
    </Field>
  );
}

type Option = { value: string; label: string };

export function SelectField({
  id, name, label, value, onChange, options, error, disabled, className, placeholder = "Select…",
}: {
  id: string; name?: string; label: string; value: string; onChange: (v: string) => void; options: Option[];
  error?: string; disabled?: boolean; className?: string; placeholder?: string;
}) {
  return (
    <Field id={id} label={label} error={error} className={className}>
      <select
        id={id}
        data-field={name ?? id}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-err` : undefined}
        className={cn(controlClass, error ? "border-[#C62828]" : "border-line")}
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

export function TextField({
  id, name, label, value, onChange, onBlur, error, hint, placeholder, inputMode, className,
}: {
  id: string; name?: string; label: string; value: string; onChange: (v: string) => void; onBlur?: () => void; error?: string;
  hint?: string; placeholder?: string; inputMode?: "numeric" | "decimal"; className?: string;
}) {
  return (
    <Field id={id} label={label} error={error} hint={hint} className={className}>
      <input
        id={id}
        data-field={name ?? id}
        type="text"
        autoComplete="off"
        spellCheck={false}
        inputMode={inputMode}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-err` : undefined}
        className={cn(controlClass, error ? "border-[#C62828]" : "border-line")}
      />
    </Field>
  );
}

export function Detail({ label, value }: { label: string; value?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[12.5px] text-muted">{label}</dt>
      <dd className="break-words text-[14.5px] font-medium">{value || <span className="font-normal text-muted">Not provided</span>}</dd>
    </div>
  );
}
