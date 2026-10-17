"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";
import { sanitizeInventoryInput } from "@/lib/inventory-validation";
import type { FieldResult } from "@/lib/validation";

export type InventoryField = {
  name: string;
  label: string;
  kind: "text" | "select";
  placeholder?: string;
  /** Select options, value is what gets validated and saved. */
  options?: { value: string; label: string }[];
  validate: (raw: string) => FieldResult;
};

type Values = Record<string, string>;

/** Small modal form shared by the four Inventory "add" actions. Fields render in the order given. */
export function InventoryFormDialog({
  open,
  title,
  submitLabel,
  idPrefix,
  fields,
  onClose,
  onSave,
}: {
  open: boolean;
  title: string;
  submitLabel: string;
  idPrefix: string;
  fields: InventoryField[];
  onClose: () => void;
  /** Receives the validated, cleaned values keyed by field name. */
  onSave: (values: Values) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [values, setValues] = useState<Values>({});
  const [errors, setErrors] = useState<Values>({});

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      setValues({});
      setErrors({});
      d.showModal();
    } else if (!open && d.open) {
      d.close();
    }
  }, [open]);

  function change(f: InventoryField, raw: string) {
    const value = f.kind === "text" ? sanitizeInventoryInput(raw) : raw;
    setValues((p) => ({ ...p, [f.name]: value }));
    if (errors[f.name]) setErrors((p) => ({ ...p, [f.name]: "" }));
  }

  function blur(f: InventoryField) {
    const raw = values[f.name] ?? "";
    if (!raw) return;
    setErrors((p) => ({ ...p, [f.name]: f.validate(raw).error ?? "" }));
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    const next: Values = {};
    const clean: Values = {};
    for (const f of fields) {
      const r = f.validate(values[f.name] ?? "");
      if (r.error) next[f.name] = r.error;
      clean[f.name] = r.value;
    }
    setErrors(next);
    const first = fields.find((f) => next[f.name]);
    if (first) {
      ref.current?.querySelector<HTMLElement>(`[name="${first.name}"]`)?.focus();
      return;
    }
    onSave(clean);
    onClose();
  }

  const titleId = `${idPrefix}-title`;
  const control = "min-h-11 rounded-xl border bg-white px-3.5 text-[15px] placeholder:text-muted/70";

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby={titleId}
      className="m-auto w-[calc(100%-32px)] max-w-120 rounded-2xl border border-line bg-white p-0 text-ink shadow-[0_24px_60px_rgba(10,29,44,0.25)] backdrop:bg-ink/50"
    >
      <form onSubmit={submit} noValidate className="flex max-h-[calc(100dvh-32px)] flex-col">
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4 sm:px-6">
          <h2 id={titleId} className="text-lg font-semibold">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid size-11 place-items-center rounded-xl text-muted hover:bg-canvas"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        <div className="flex flex-col gap-4 overflow-y-auto px-5 py-5 sm:px-6">
          {fields.map((f) => {
            const id = `${idPrefix}-${f.name}`;
            const err = errors[f.name];
            const common = {
              id,
              name: f.name,
              value: values[f.name] ?? "",
              onBlur: () => blur(f),
              "aria-invalid": err ? true : undefined,
              "aria-describedby": err ? `${id}-err` : undefined,
              className: cn(control, err ? "border-[#C62828]" : "border-line"),
            } as const;
            return (
              <div key={f.name} className="flex flex-col gap-1.5">
                <label htmlFor={id} className="text-[13.5px] font-medium">
                  {f.label}
                </label>
                {f.kind === "select" ? (
                  <select {...common} onChange={(e) => change(f, e.target.value)}>
                    <option value="">Select…</option>
                    {f.options?.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    {...common}
                    type="text"
                    autoComplete="off"
                    spellCheck={false}
                    placeholder={f.placeholder}
                    onChange={(e) => change(f, e.target.value)}
                  />
                )}
                {err && (
                  <p id={`${id}-err`} className="text-[13px] text-[#C62828]">
                    {err}
                  </p>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex justify-end gap-3 border-t border-line px-5 py-4 sm:px-6">
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 rounded-xl border border-line px-4 text-[15px] font-semibold hover:bg-canvas"
          >
            Cancel
          </button>
          <button type="submit" className="min-h-11 rounded-xl bg-brand px-5 text-[15px] font-semibold text-white hover:brightness-95">
            {submitLabel}
          </button>
        </div>
      </form>
    </dialog>
  );
}
