"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";
import { customerTypes, fromFormValues, type Customer, type CustomerType } from "@/lib/customers";
import { CustomerFields } from "./CustomerFields";
import { useCustomerForm } from "./useCustomerForm";

export function AddCustomerDialog({
  open,
  onClose,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (customer: Customer) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [type, setType] = useState<CustomerType>("End User");
  const form = useCustomerForm(ref);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      setType("End User");
      form.reset();
      d.showModal();
    } else if (!open && d.open) {
      d.close();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function submit(e: FormEvent) {
    e.preventDefault();
    const clean = form.validate(type);
    if (!clean) return;
    onAdd(fromFormValues(`new-${Date.now()}`, type, clean));
    onClose();
  }

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby="add-customer-title"
      className="m-auto w-[calc(100%-32px)] max-w-140 rounded-2xl border border-line bg-white p-0 text-ink shadow-[0_24px_60px_rgba(10,29,44,0.25)] backdrop:bg-ink/50"
    >
      <form onSubmit={submit} noValidate className="flex max-h-[calc(100dvh-32px)] flex-col">
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4 sm:px-6">
          <h2 id="add-customer-title" className="text-lg font-semibold">
            Add Customer
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
            <legend className="mb-2 text-[13.5px] font-medium text-muted">Type of Customer</legend>
            <div className="grid grid-cols-3 gap-1 rounded-xl bg-canvas p-1">
              {customerTypes.map((t) => (
                <label
                  key={t}
                  className={cn(
                    "flex min-h-10 cursor-pointer items-center justify-center rounded-lg px-2 text-center text-[14.5px] font-medium has-focus-visible:outline-2 has-focus-visible:outline-navy",
                    type === t ? "bg-white text-navy shadow-sm" : "text-muted",
                  )}
                >
                  <input
                    type="radio"
                    name="customer-type"
                    value={t}
                    checked={type === t}
                    onChange={() => {
                      setType(t);
                      form.reset(form.values);
                    }}
                    className="sr-only"
                  />
                  {t}
                </label>
              ))}
            </div>
          </fieldset>

          <CustomerFields type={type} values={form.values} errors={form.errors} onChange={form.change} onBlur={form.blur} />
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
            Save Customer
          </button>
        </div>
      </form>
    </dialog>
  );
}
