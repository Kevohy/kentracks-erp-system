"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Pencil, X } from "lucide-react";
import { defaultBrandId, type Brand } from "@/lib/brands";
import type { SaveResult } from "@/lib/crm-api";
import { formFieldsByType, toFormValues, type Customer, type CustomerType } from "@/lib/customers";
import { DIALOG } from "./AddCustomerDialog";
import { CustomerFields, CustomerTypePicker, switchType, type Values } from "./CustomerFields";
import { useCustomerForm } from "./useCustomerForm";

/** View a customer; the Edit button switches this same dialog into an editable form. */
export function CustomerDetailsDialog({
  customer,
  onClose,
  onSave,
  brands,
  existing,
}: {
  customer: Customer | null;
  onClose: () => void;
  /** `type` may differ from the customer's: End User, Distributor and Company can be changed when editing. */
  onSave: (customer: Customer, type: CustomerType, values: Values) => Promise<SaveResult>;
  brands: Brand[];
  /** Customers already saved: a duplicate account, phone or email is caught while typing. */
  existing?: Customer[];
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [editing, setEditing] = useState(false);
  const [type, setType] = useState<CustomerType>("End User");
  const form = useCustomerForm(ref, { existing, selfId: customer?.id });
  const saving = useRef(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const id = customer?.id;

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (customer && !d.open) {
      setEditing(false);
      setFormError(null);
      d.showModal();
    } else if (!customer && d.open) {
      d.close();
    }
    // Re-run only when a different customer is opened or the dialog is dismissed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  function startEdit() {
    if (!customer) return;
    const values = toFormValues(customer);
    // A customer saved before brands were required gets the default brand pre-selected.
    form.reset({ ...values, brandId: values.brandId || defaultBrandId(brands) });
    setType(customer.type);
    setFormError(null);
    setEditing(true);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!customer || saving.current) return;
    const clean = form.validate(type);
    if (!clean) return;
    saving.current = true;
    setBusy(true);
    setFormError(null);
    const r = await onSave(customer, type, clean);
    saving.current = false;
    setBusy(false);
    if (r.ok) return setEditing(false);
    form.applyServerErrors(r.fieldErrors);
    setFormError(Object.keys(r.fieldErrors).length ? null : r.message);
  }

  const view = customer ? toFormValues(customer) : {};

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby="customer-details-title"
      className={DIALOG}
    >
      {customer && (
        <form onSubmit={submit} noValidate className="flex h-full max-h-dvh flex-col sm:max-h-[calc(100dvh-48px)]">
          <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-6 sm:py-4">
            <div className="min-w-0">
              <h2 id="customer-details-title" className="truncate text-lg font-semibold">
                {editing ? "Edit Customer" : customer.name}
              </h2>
              <p className="text-[13.5px] text-muted">{editing ? customer.name : customer.type}</p>
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

          <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
            {editing ? (
              <div className="flex flex-col gap-5">
              <CustomerTypePicker name="customer-edit-type" value={type} onChange={(t) => {
                form.setValues((v) => switchType(v, type, t));
                setType(t);
              }} />
              <CustomerFields
                type={type}
                values={form.values}
                errors={form.errors}
                valid={form.valid}
                onChange={form.change}
                onBlur={form.blur}
                brands={brands}
                idPrefix="cust-edit"
              />
              </div>
            ) : (
              <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <dt className="text-[13.5px] text-muted">Brand</dt>
                  <dd className="mt-0.5 text-[15px] font-medium">{customer.brandName || "—"}</dd>
                </div>
                {formFieldsByType[customer.type].map((f) => (
                  <div key={f.name} className={f.wide ? "sm:col-span-2" : undefined}>
                    <dt className="text-[13.5px] text-muted">{f.label}</dt>
                    <dd className="mt-0.5 break-words text-[15px] font-medium">{view[f.name] || "—"}</dd>
                  </div>
                ))}
              </dl>
            )}
            {editing && formError && (
              <p role="alert" className="mt-4 text-[13.5px] text-[#C62828]">
                {formError}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 border-t border-line bg-white px-4 py-3 pb-[calc(12px+env(safe-area-inset-bottom))] sm:flex sm:justify-end sm:px-6 sm:py-4">
            {editing ? (
              <>
                <button
                  key="cancel"
                  type="button"
                  onClick={() => setEditing(false)}
                  className="min-h-12 rounded-xl border border-line px-4 text-[15px] font-semibold hover:bg-canvas sm:min-h-11"
                >
                  Cancel
                </button>
                <button key="save" type="submit" disabled={busy} className="min-h-12 rounded-xl bg-brand px-5 text-[15px] font-semibold text-white hover:brightness-95 disabled:opacity-60 sm:min-h-11">
                  {busy ? "Saving…" : "Save Changes"}
                </button>
              </>
            ) : (
              <>
                <button
                  key="close"
                  type="button"
                  onClick={onClose}
                  className="min-h-12 rounded-xl border border-line px-4 text-[15px] font-semibold hover:bg-canvas sm:min-h-11"
                >
                  Close
                </button>
                <button
                  key="edit"
                  type="button"
                  onClick={startEdit}
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-brand px-5 text-[15px] font-semibold text-white hover:brightness-95 sm:min-h-11"
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
