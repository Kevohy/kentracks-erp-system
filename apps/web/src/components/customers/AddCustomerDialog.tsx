"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { X } from "lucide-react";
import { defaultBrandId, type Brand } from "@/lib/brands";
import type { SaveResult } from "@/lib/crm-api";
import type { Customer, CustomerType } from "@/lib/customers";
import { CustomerFields, CustomerTypePicker, switchType, type Values } from "./CustomerFields";
import { useCustomerForm } from "./useCustomerForm";

/** Full screen on phones; a centred card from tablet size up. */
export const DIALOG =
  "m-0 h-dvh max-h-dvh w-full max-w-none rounded-none border-0 bg-white p-0 text-ink backdrop:bg-ink/50 sm:m-auto sm:h-auto sm:w-[calc(100%-48px)] sm:max-w-[560px] sm:rounded-2xl sm:border sm:border-line sm:shadow-[0_24px_60px_rgba(10,29,44,0.25)]";

export function AddCustomerDialog({
  open,
  onClose,
  onAdd,
  brands,
  initial,
  existing,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (type: CustomerType, values: Values) => Promise<SaveResult>;
  brands: Brand[];
  /** Pre-filled values (for example the contact of a GPS device); the user can change everything. */
  initial?: { type?: CustomerType; values?: Values };
  /** Customers already saved: a duplicate account, phone or email is caught while typing. */
  existing?: Customer[];
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [type, setType] = useState<CustomerType>("End User");
  const form = useCustomerForm(ref, { existing });
  const saving = useRef(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      setType(initial?.type ?? "End User");
      setFormError(null);
      form.reset({ brandId: defaultBrandId(brands), ...initial?.values });
      d.showModal();
    } else if (!open && d.open) {
      d.close();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // The brand list may arrive after the dialog opened: fill in the default as soon as it does.
  useEffect(() => {
    if (open && !form.values.brandId && brands.length) form.change("brandId", defaultBrandId(brands));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, brands]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (saving.current) return; // a second click or Enter while saving must not create a duplicate
    const clean = form.validate(type);
    if (!clean) return;
    saving.current = true;
    setBusy(true);
    setFormError(null);
    const r = await onAdd(type, clean);
    saving.current = false;
    setBusy(false);
    if (r.ok) return onClose();
    form.applyServerErrors(r.fieldErrors);
    setFormError(Object.keys(r.fieldErrors).length ? null : r.message);
  }

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby="add-customer-title"
      className={DIALOG}
    >
      <form onSubmit={submit} noValidate className="flex h-full max-h-dvh flex-col sm:max-h-[calc(100dvh-48px)]">
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-6 sm:py-4">
          <h2 id="add-customer-title" className="text-lg font-semibold">New customer</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid size-11 place-items-center rounded-xl text-muted hover:bg-canvas"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-4 py-5 sm:px-6">
          <CustomerTypePicker name="customer-type" value={type} onChange={(t) => {
            form.reset(switchType(form.values, type, t));
            setType(t);
          }} />

          <CustomerFields type={type} values={form.values} errors={form.errors} valid={form.valid} onChange={form.change} onBlur={form.blur} brands={brands} idPrefix="cust-add" />
          {formError && (
            <p role="alert" className="text-[13.5px] text-[#C62828]">
              {formError}
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 border-t border-line bg-white px-4 py-3 pb-[calc(12px+env(safe-area-inset-bottom))] sm:flex sm:justify-end sm:px-6 sm:py-4">
          <button
            type="button"
            onClick={onClose}
            className="min-h-12 rounded-xl border border-line px-4 text-[15px] font-semibold hover:bg-canvas sm:min-h-11"
          >
            Cancel
          </button>
          <button type="submit" disabled={busy} className="min-h-12 rounded-xl bg-brand px-5 text-[15px] font-semibold text-white hover:brightness-95 disabled:opacity-60 sm:min-h-11">
            {busy ? "Saving…" : "Save customer"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
