"use client";

import { useEffect, useRef } from "react";
import { UserPlus, UserSearch, X } from "lucide-react";
import type { GpsDevice } from "@/lib/gps-platform";
import { Detail } from "./fields";

/**
 * Shown when a verified device's contact is not in the CRM: the user either adds that contact as a new
 * customer or picks an existing customer to attach the sale to.
 */
export function DeviceCustomerPrompt({
  open,
  contact,
  onAddNew,
  onChooseExisting,
  onClose,
}: {
  open: boolean;
  contact: GpsDevice["contact"];
  onAddNew: () => void;
  onChooseExisting: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    else if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby="device-customer-title"
      className="m-auto w-[calc(100%-32px)] max-w-md rounded-2xl border border-line bg-white p-0 text-ink shadow-[0_24px_60px_rgba(10,29,44,0.25)] backdrop:bg-ink/50"
    >
      <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
        <div>
          <h2 id="device-customer-title" className="text-lg font-semibold">
            Customer not found
          </h2>
          <p className="mt-1 text-[14px] text-muted">
            {contact ? "The contact on this device does not match any customer in your CRM." : "This device has no contact details, so it cannot be matched to a customer."} Add them as a new customer or choose an existing one.
          </p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="grid size-11 shrink-0 place-items-center rounded-xl text-muted hover:bg-canvas">
          <X size={20} aria-hidden="true" />
        </button>
      </div>

      {contact && (
        <dl className="mx-5 mt-4 grid gap-3 rounded-xl bg-canvas p-4">
          {contact.name && <Detail label="Contact name" value={contact.name} />}
          {contact.phone && <Detail label="Contact phone" value={contact.phone} />}
          {contact.email && <Detail label="Contact email" value={contact.email} />}
        </dl>
      )}

      <div className="flex flex-col gap-3 px-5 py-5 sm:flex-row-reverse">
        <button
          type="button"
          onClick={onAddNew}
          className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-brand px-4 text-[15px] font-semibold text-white hover:brightness-95"
        >
          <UserPlus size={18} aria-hidden="true" />
          Add new customer
        </button>
        <button
          type="button"
          onClick={onChooseExisting}
          className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-line px-4 text-[15px] font-semibold hover:bg-canvas"
        >
          <UserSearch size={18} aria-hidden="true" />
          Choose existing customer
        </button>
      </div>
    </dialog>
  );
}
