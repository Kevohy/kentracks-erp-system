"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";
import { technicianFields, type Technician, type TechnicianFieldName } from "@/lib/technicians";
import { sanitizeTechnicianInput, validateTechnicianField } from "@/lib/technician-validation";

type Values = Partial<Record<TechnicianFieldName, string>>;

export function AddTechnicianDialog({
  open,
  onClose,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (technician: Technician) => void;
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

  function change(name: TechnicianFieldName, raw: string) {
    setValues((p) => ({ ...p, [name]: sanitizeTechnicianInput(name, raw) }));
    if (errors[name]) setErrors((p) => ({ ...p, [name]: undefined }));
  }

  function blur(name: TechnicianFieldName) {
    const raw = values[name] ?? "";
    if (!raw) return;
    setErrors((p) => ({ ...p, [name]: validateTechnicianField(name, raw).error }));
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    const next: Values = {};
    const clean: Values = {};
    for (const f of technicianFields) {
      const r = validateTechnicianField(f.name, values[f.name] ?? "");
      if (r.error) next[f.name] = r.error;
      clean[f.name] = r.value;
    }
    setErrors(next);
    const first = technicianFields.find((f) => next[f.name]);
    if (first) {
      ref.current?.querySelector<HTMLInputElement>(`[name="${first.name}"]`)?.focus();
      return;
    }
    onAdd({
      id: `new-${Date.now()}`,
      name: clean.name ?? "",
      phone: clean.phone ?? "",
      email: clean.email ?? "",
      location: clean.location ?? "",
    });
    onClose();
  }

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby="add-technician-title"
      className="m-auto w-[calc(100%-32px)] max-w-140 rounded-2xl border border-line bg-white p-0 text-ink shadow-[0_24px_60px_rgba(10,29,44,0.25)] backdrop:bg-ink/50"
    >
      <form onSubmit={submit} noValidate className="flex max-h-[calc(100dvh-32px)] flex-col">
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4 sm:px-6">
          <h2 id="add-technician-title" className="text-lg font-semibold">
            Add Technician
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

        <div className="overflow-y-auto px-5 py-5 sm:px-6">
          <div className="grid gap-4 sm:grid-cols-2">
            {technicianFields.map((f) => {
              const id = `tech-${f.name}`;
              return (
                <div key={f.name} className={cn("flex flex-col gap-1.5", f.wide && "sm:col-span-2")}>
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
            })}
          </div>
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
            Save Technician
          </button>
        </div>
      </form>
    </dialog>
  );
}
