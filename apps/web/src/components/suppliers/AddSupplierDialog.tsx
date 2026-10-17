"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  fromSupplierValues,
  supplierFields,
  supplierTypes,
  type Supplier,
  type SupplierFieldDef,
  type SupplierFieldName,
  type SupplierType,
} from "@/lib/suppliers";
import { sanitizeSupplierInput, validateSupplierField } from "@/lib/supplier-validation";

type Values = Partial<Record<SupplierFieldName, string>>;

export function AddSupplierDialog({
  open,
  onClose,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (supplier: Supplier) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [type, setType] = useState<SupplierType>("Individual");
  const [values, setValues] = useState<Values>({});
  const [errors, setErrors] = useState<Values>({});

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      setType("Individual");
      setValues({});
      setErrors({});
      d.showModal();
    } else if (!open && d.open) {
      d.close();
    }
  }, [open]);

  const fields = supplierFields[type];
  const main = fields.filter((f) => !f.group);
  const contact = fields.filter((f) => f.group === "contact");

  function change(name: SupplierFieldName, raw: string) {
    setValues((p) => ({ ...p, [name]: sanitizeSupplierInput(name, raw) }));
    if (errors[name]) setErrors((p) => ({ ...p, [name]: undefined }));
  }

  function blur(name: SupplierFieldName) {
    const raw = values[name] ?? "";
    if (!raw) return;
    setErrors((p) => ({ ...p, [name]: validateSupplierField(name, raw).error }));
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    const next: Values = {};
    const clean: Values = {};
    for (const f of fields) {
      const r = validateSupplierField(f.name, values[f.name] ?? "");
      if (r.error) next[f.name] = r.error;
      clean[f.name] = r.value;
    }
    setErrors(next);
    const first = fields.find((f) => next[f.name]);
    if (first) {
      ref.current?.querySelector<HTMLInputElement>(`[name="${first.name}"]`)?.focus();
      return;
    }
    onAdd(fromSupplierValues(`new-${Date.now()}`, type, clean));
    onClose();
  }

  function renderField(f: SupplierFieldDef) {
    const id = `sup-${f.name}`;
    return (
      <div key={`${type}-${f.name}`} className={cn("flex flex-col gap-1.5", f.wide && "sm:col-span-2")}>
        <label htmlFor={id} className="text-[13.5px] font-medium">
          {f.label}
        </label>
        <input
          id={id}
          name={f.name}
          type={f.type}
          autoComplete="off"
          placeholder={f.placeholder}
          value={values[f.name] ?? ""}
          onChange={(e) => change(f.name, e.target.value)}
          onBlur={() => blur(f.name)}
          spellCheck={false}
          autoCapitalize="off"
          inputMode={f.type === "tel" ? "tel" : f.type === "email" ? "email" : undefined}
          aria-invalid={errors[f.name] ? true : undefined}
          aria-describedby={errors[f.name] ? `${id}-err` : undefined}
          className={cn(
            "min-h-11 rounded-xl border bg-white px-3.5 text-[15px] placeholder:text-muted/70",
            errors[f.name] ? "border-[#C62828]" : "border-line",
          )}
        />
        {errors[f.name] && (
          <p id={`${id}-err`} className="text-[13px] text-[#C62828]">
            {errors[f.name]}
          </p>
        )}
      </div>
    );
  }

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby="add-supplier-title"
      className="m-auto w-[calc(100%-32px)] max-w-140 rounded-2xl border border-line bg-white p-0 text-ink shadow-[0_24px_60px_rgba(10,29,44,0.25)] backdrop:bg-ink/50"
    >
      <form onSubmit={submit} noValidate className="flex max-h-[calc(100dvh-32px)] flex-col">
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4 sm:px-6">
          <h2 id="add-supplier-title" className="text-lg font-semibold">
            Add Supplier
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

        <div className="flex flex-col gap-5 overflow-y-auto px-5 py-5 sm:px-6">
          <fieldset>
            <legend className="mb-2 text-[13.5px] font-medium text-muted">Supplier Type</legend>
            <div className="grid grid-cols-2 gap-1 rounded-xl bg-canvas p-1">
              {supplierTypes.map((t) => (
                <label
                  key={t}
                  className={cn(
                    "flex min-h-10 cursor-pointer items-center justify-center rounded-lg px-2 text-center text-[14.5px] font-medium has-focus-visible:outline-2 has-focus-visible:outline-navy",
                    type === t ? "bg-white text-navy shadow-sm" : "text-muted",
                  )}
                >
                  <input
                    type="radio"
                    name="supplier-type"
                    value={t}
                    checked={type === t}
                    onChange={() => {
                      setType(t);
                      setErrors({});
                    }}
                    className="sr-only"
                  />
                  {t}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2">{main.map(renderField)}</div>

          {contact.length > 0 && (
            <fieldset className="rounded-xl border border-line p-4">
              <legend className="px-1 text-[13.5px] font-semibold">Contact Person</legend>
              <div className="grid gap-4 sm:grid-cols-2">{contact.map(renderField)}</div>
            </fieldset>
          )}
        </div>

        <div className="flex justify-end gap-3 border-t border-line px-5 py-4 sm:px-6">
          <button
            key="cancel"
            type="button"
            onClick={onClose}
            className="min-h-11 rounded-xl border border-line px-4 text-[15px] font-semibold hover:bg-canvas"
          >
            Cancel
          </button>
          <button key="save" type="submit" className="min-h-11 rounded-xl bg-brand px-5 text-[15px] font-semibold text-white hover:brightness-95">
            Save Supplier
          </button>
        </div>
      </form>
    </dialog>
  );
}
