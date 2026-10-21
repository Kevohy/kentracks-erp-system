"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { erpApi, newClientKey } from "@/lib/erp-api";
import { PAYMENT_METHODS, MAX_PAYMENT_NOTE, MAX_REFERENCE, validatePayment, type PaymentDraft, type PaymentErrors, type SalePayments } from "@/lib/sale-payments";
import { formatKes, minorToInputValue } from "@/lib/sales-format";
import type { Sale } from "@/lib/sales";

const control = "min-h-11 w-full rounded-xl border bg-white px-3.5 text-[15px]";
const ORDER: (keyof PaymentDraft)[] = ["amount", "paidOn", "method", "reference", "note"];

/** "2026-10-21T06:00:00Z" -> the Nairobi date "2026-10-21". */
export const nairobiDay = (iso: string) => new Date(Date.parse(iso) + 3 * 3600_000).toISOString().slice(0, 10);

/** Record money received for a sale not paid in full. The amount starts at the whole balance. */
export function RecordPaymentForm({
  sale,
  balanceMinor,
  today,
  onSaved,
  onCancel,
}: {
  sale: Sale;
  balanceMinor: number;
  today: string;
  onSaved: (r: { sale: Sale; payments: SalePayments }) => void;
  onCancel: () => void;
}) {
  const saleDate = nairobiDay(sale.createdAt);
  const [d, setD] = useState<PaymentDraft>({ amount: minorToInputValue(balanceMinor), method: "", reference: "", note: "", paidOn: today });
  const [errors, setErrors] = useState<PaymentErrors>({});
  const [busy, setBusy] = useState(false);
  const key = useRef(newClientKey());
  const saving = useRef(false);
  const root = useRef<HTMLFormElement>(null);

  useEffect(() => {
    root.current?.querySelector<HTMLInputElement>("#pay-amount")?.focus();
  }, []);

  const set = (k: keyof PaymentDraft, v: string) => {
    setD((p) => ({ ...p, [k]: v }));
    if (errors[k] || errors.form) setErrors((p) => ({ ...p, [k]: undefined, form: undefined }));
  };
  const focusFirst = (e: PaymentErrors) => {
    const first = ORDER.find((k) => e[k]);
    if (first) root.current?.querySelector<HTMLElement>(`#pay-${first}`)?.focus();
  };

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    if (saving.current) return;
    const v = validatePayment(d, { balanceMinor, saleDate, today });
    if (!v.value) {
      setErrors(v.errors);
      focusFirst(v.errors);
      return;
    }
    saving.current = true;
    setBusy(true);
    const r = await erpApi.sales.recordPayment(sale.id, d, key.current);
    saving.current = false;
    setBusy(false);
    if (r.ok) return onSaved(r.data);
    const e: PaymentErrors = { ...(r.fieldErrors as PaymentErrors) };
    if (!ORDER.some((k) => e[k])) e.form = e.form ?? r.message;
    setErrors(e);
    focusFirst(e);
  }

  const err = (k: keyof PaymentErrors) =>
    errors[k] ? <p id={`pay-${k}-err`} className="text-[13px] text-[#C62828]">{errors[k]}</p> : null;
  const aria = (k: keyof PaymentDraft) => ({ "aria-invalid": errors[k] ? true : undefined, "aria-describedby": errors[k] ? `pay-${k}-err` : undefined });

  return (
    <form ref={root} onSubmit={submit} noValidate aria-label="Record payment" className="flex flex-col gap-4 rounded-xl border border-line p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="text-[15px] font-semibold">Record payment</h4>
        <span className="text-[13.5px] text-muted">Balance {formatKes(balanceMinor)}</span>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="pay-amount" className="text-[13.5px] font-medium">Amount (KES)</label>
          <input id="pay-amount" inputMode="decimal" autoComplete="off" value={d.amount} onChange={(e) => set("amount", e.target.value.replace(/[^\d.,]/g, ""))}
            className={cn(control, errors.amount ? "border-[#C62828]" : "border-line")} {...aria("amount")} />
          {err("amount")}
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="pay-paidOn" className="text-[13.5px] font-medium">Date paid</label>
          <input id="pay-paidOn" type="date" min={saleDate} max={today} value={d.paidOn} onChange={(e) => set("paidOn", e.target.value)}
            className={cn(control, errors.paidOn ? "border-[#C62828]" : "border-line")} {...aria("paidOn")} />
          {err("paidOn")}
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="pay-method" className="text-[13.5px] font-medium">Paid by</label>
          <select id="pay-method" value={d.method} onChange={(e) => set("method", e.target.value)}
            className={cn(control, errors.method ? "border-[#C62828]" : "border-line")} {...aria("method")}>
            <option value="">Select…</option>
            {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          {err("method")}
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="pay-reference" className="text-[13.5px] font-medium">Reference <span className="font-normal text-muted">(optional)</span></label>
          <input id="pay-reference" autoComplete="off" maxLength={MAX_REFERENCE} placeholder="e.g. M-Pesa code" value={d.reference} onChange={(e) => set("reference", e.target.value)}
            className={cn(control, errors.reference ? "border-[#C62828]" : "border-line")} {...aria("reference")} />
          {err("reference")}
        </div>
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <label htmlFor="pay-note" className="text-[13.5px] font-medium">Note <span className="font-normal text-muted">(optional)</span></label>
          <input id="pay-note" autoComplete="off" maxLength={MAX_PAYMENT_NOTE} value={d.note} onChange={(e) => set("note", e.target.value)}
            className={cn(control, errors.note ? "border-[#C62828]" : "border-line")} {...aria("note")} />
          {err("note")}
        </div>
      </div>
      {errors.form && <p role="alert" className="text-[13.5px] text-[#C62828]">{errors.form}</p>}
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <button type="button" onClick={onCancel} className="min-h-11 rounded-xl border border-line px-4 text-[15px] font-semibold hover:bg-canvas">Cancel</button>
        <button type="submit" disabled={busy} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-brand px-5 text-[15px] font-semibold text-white hover:brightness-95 disabled:opacity-60">
          {busy && <Loader2 size={17} className="animate-spin" aria-hidden="true" />}
          {busy ? "Saving…" : "Save payment"}
        </button>
      </div>
    </form>
  );
}
