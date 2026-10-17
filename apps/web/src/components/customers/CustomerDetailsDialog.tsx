"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Pencil, X } from "lucide-react";
import { fieldsByType, fromFormValues, toFormValues, type Customer } from "@/lib/customers";
import { CustomerFields } from "./CustomerFields";
import { useCustomerForm } from "./useCustomerForm";

/** View a customer; the Edit button switches this same dialog into an editable form. */
export function CustomerDetailsDialog({
  customer,
  onClose,
  onSave,
}: {
  customer: Customer | null;
  onClose: () => void;
  onSave: (customer: Customer) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [editing, setEditing] = useState(false);
  const form = useCustomerForm(ref);
  const id = customer?.id;

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (customer && !d.open) {
      setEditing(false);
      d.showModal();
    } else if (!customer && d.open) {
      d.close();
    }
    // Re-run only when a different customer is opened or the dialog is dismissed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  function startEdit() {
    if (!customer) return;
    form.reset(toFormValues(customer));
    setEditing(true);
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!customer) return;
    const clean = form.validate(customer.type);
    if (!clean) return;
    const updated = fromFormValues(customer.id, customer.type, clean);
    onSave(updated);
    setEditing(false);
  }

  const view = customer ? toFormValues(customer) : {};

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby="customer-details-title"
      className="m-auto w-[calc(100%-32px)] max-w-140 rounded-2xl border border-line bg-white p-0 text-ink shadow-[0_24px_60px_rgba(10,29,44,0.25)] backdrop:bg-ink/50"
    >
      {customer && (
        <form onSubmit={submit} noValidate className="flex max-h-[calc(100dvh-32px)] flex-col">
          <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4 sm:px-6">
            <div className="min-w-0">
              <h2 id="customer-details-title" className="truncate text-lg font-semibold">
                {editing ? "Edit Customer" : customer.name}
              </h2>
              <p className="text-[13.5px] text-muted">{customer.type}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="grid size-11 shrink-0 place-items-center rounded-xl text-muted hover:bg-canvas"
            >
              <X size={20} aria-hidden="true" />
            </button>
          </div>

          <div className="overflow-y-auto px-5 py-5 sm:px-6">
            {editing ? (
              <CustomerFields
                type={customer.type}
                values={form.values}
                errors={form.errors}
                onChange={form.change}
                onBlur={form.blur}
              />
            ) : (
              <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
                {fieldsByType[customer.type].map((f) => (
                  <div key={f.name} className={f.wide ? "sm:col-span-2" : undefined}>
                    <dt className="text-[13.5px] text-muted">{f.label}</dt>
                    <dd className="mt-0.5 break-words text-[15px] font-medium">{view[f.name] || "—"}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>

          <div className="flex justify-end gap-3 border-t border-line px-5 py-4 sm:px-6">
            {editing ? (
              <>
                <button
                  key="cancel"
                  type="button"
                  onClick={() => setEditing(false)}
                  className="min-h-11 rounded-xl border border-line px-4 text-[15px] font-semibold hover:bg-canvas"
                >
                  Cancel
                </button>
                <button key="save" type="submit" className="min-h-11 rounded-xl bg-brand px-5 text-[15px] font-semibold text-white hover:brightness-95">
                  Save Changes
                </button>
              </>
            ) : (
              <>
                <button
                  key="close"
                  type="button"
                  onClick={onClose}
                  className="min-h-11 rounded-xl border border-line px-4 text-[15px] font-semibold hover:bg-canvas"
                >
                  Close
                </button>
                <button
                  key="edit"
                  type="button"
                  onClick={startEdit}
                  className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-brand px-5 text-[15px] font-semibold text-white hover:brightness-95"
                >
                  <Pencil size={16} aria-hidden="true" />
                  Edit
                </button>
              </>
            )}
          </div>
        </form>
      )}
    </dialog>
  );
}
