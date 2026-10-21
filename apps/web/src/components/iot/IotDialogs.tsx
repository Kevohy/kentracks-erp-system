"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Loader2, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { erpApi } from "@/lib/erp-api";
import { todayInNairobi } from "@/lib/billing";
import {
  BILLING_PERIODS,
  currentPeriod,
  defaultRenewalExpiry,
  IOT_SIM_TYPES,
  parseDate,
  parsePeriod,
  type BillingPeriod,
  type IotBill,
  type IotGroup,
  type IotRenewal,
  type IotSim,
} from "@/lib/iot-sims";
import { parseMoney, sanitizeNumberInput } from "@/lib/purchase-validation";
import { MAX_AMOUNT_MINOR } from "@/lib/sale-validation";
import { formatKes } from "@/lib/sales-format";

export const longDate = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
export const monthLabel = (p: string) => new Date(`${p}-01T00:00:00Z`).toLocaleDateString("en-KE", { month: "long", year: "numeric", timeZone: "UTC" });
const money = (minor: number | null) => (minor == null ? "" : String(minor / 100));

// ----------------------------------------------------------------- shell

/** A modal form: title, fields, Cancel / primary button. Opens while `open` is true. */
function FormDialog({ open, title, subtitle, onClose, onSubmit, submitLabel, saving, danger, children, wide }: {
  open: boolean; title: string; subtitle?: string; onClose: () => void; onSubmit?: () => void; submitLabel?: string;
  saving?: boolean; danger?: boolean; children: ReactNode; wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      // Focus the first field (the dialog would otherwise focus the close button).
      requestAnimationFrame(() => d.querySelector<HTMLElement>("input, select, textarea")?.focus());
    } else if (!open && d.open) d.close();
  }, [open]);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!saving) onSubmit?.();
  };
  return (
    <dialog ref={ref} onClose={onClose} aria-labelledby="iot-dialog-title"
      className={cn("m-auto w-[calc(100%-24px)] rounded-2xl border border-line bg-white p-0 text-ink shadow-[0_24px_60px_rgba(10,29,44,0.25)] backdrop:bg-ink/50", wide ? "max-w-xl" : "max-w-md")}>
      {open && (
        <form onSubmit={submit} noValidate className="flex max-h-[calc(100dvh-24px)] flex-col">
          <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
            <div className="min-w-0">
              <h2 id="iot-dialog-title" className="text-lg font-semibold">{title}</h2>
              {subtitle && <p className="text-[13.5px] text-muted">{subtitle}</p>}
            </div>
            <button type="button" onClick={onClose} aria-label="Close" className="grid size-10 shrink-0 place-items-center rounded-xl text-muted hover:bg-canvas">
              <X size={19} aria-hidden="true" />
            </button>
          </div>
          <div className="flex flex-col gap-4 overflow-y-auto px-5 py-5">{children}</div>
          <div className="flex justify-end gap-2 border-t border-line px-5 py-4">
            <button type="button" onClick={onClose} className="min-h-11 rounded-xl border border-line px-4 text-[15px] font-semibold hover:bg-canvas">
              {onSubmit ? "Cancel" : "Close"}
            </button>
            {onSubmit && (
              <button type="submit" disabled={saving}
                className={cn("inline-flex min-h-11 items-center gap-2 rounded-xl px-5 text-[15px] font-semibold text-white hover:brightness-95 disabled:opacity-60", danger ? "bg-[#C62828]" : "bg-brand")}>
                {saving && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
                {submitLabel}
              </button>
            )}
          </div>
        </form>
      )}
    </dialog>
  );
}

function Input({ id, label, value, onChange, error, hint, type = "text", inputMode, placeholder }: {
  id: string; label: string; value: string; onChange: (v: string) => void; error?: string; hint?: string;
  type?: "text" | "date" | "month"; inputMode?: "decimal"; placeholder?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[14px] font-medium">{label}</label>
      <input id={id} type={type} inputMode={inputMode} autoComplete="off" placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-err` : hint ? `${id}-hint` : undefined}
        className={cn("min-h-11 rounded-xl border bg-white px-3.5 text-[15px] tabular-nums", error ? "border-[#C62828]" : "border-line")} />
      {error ? <p id={`${id}-err`} className="text-[13.5px] text-[#C62828]">{error}</p> : hint ? <p id={`${id}-hint`} className="text-[13px] text-muted">{hint}</p> : null}
    </div>
  );
}

function FormError({ message }: { message: string | null }) {
  return message ? <p role="alert" className="rounded-xl bg-[#FDECEA] px-3.5 py-2.5 text-[14px] text-[#B71C1C]">{message}</p> : null;
}

type Errors = Record<string, string>;
const simLine = (s: IotSim) => `${s.simNumber || "No SIM number"} · ${s.vehiclePlate || "No plate"} · ${s.customerName}`;

// --------------------------------------------------------------- dialogs

export type SimAction = { kind: "renew" | "edit" | "history" | "suspend"; sim: IotSim };

/** Record renewal / edit fee & expiry / renewal history / suspend or reactivate, for one SIM line. */
export function SimActionDialog({ action, onClose, onDone }: { action: SimAction | null; onClose: () => void; onDone: (message: string) => void }) {
  const sim = action?.sim;
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState<IotRenewal[] | null>(null);

  useEffect(() => {
    if (!action) return;
    /* eslint-disable react-hooks/set-state-in-effect */
    setErrors({});
    setFormError(null);
    setSaving(false);
    setNote("");
    setHistory(null);
    if (action.kind === "renew") {
      setA(money(action.sim.renewalFeeMinor));
      setB(defaultRenewalExpiry(action.sim.expiryDate));
    } else if (action.kind === "edit") {
      setA(money(action.sim.renewalFeeMinor));
      setB(action.sim.expiryDate);
    } else if (action.kind === "history") {
      void erpApi.iotSims.history(action.sim.saleId).then((r) => (r.ok ? setHistory(r.data) : setFormError(r.message)));
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [action]);

  if (!action || !sim) return <FormDialog open={false} title="" onClose={onClose}>{null}</FormDialog>;

  const finish = async (p: Promise<{ ok: true } | { ok: false; message: string; fieldErrors: Errors }>, message: string) => {
    setSaving(true);
    const r = await p;
    setSaving(false);
    if (!r.ok) {
      setErrors(r.fieldErrors);
      if (!Object.keys(r.fieldErrors).length) setFormError(r.message);
      return;
    }
    onDone(message);
  };

  if (action.kind === "renew") {
    const submit = () => {
      const e: Errors = {};
      const m = parseMoney(a, "Amount received", MAX_AMOUNT_MINOR);
      if (m.error) e.amount = m.error;
      const d = parseDate(b, "New expiry date");
      if (d.error) e.newExpiry = d.error;
      else if (d.value! <= sim.expiryDate) e.newExpiry = `The new expiry date must be after the current one (${longDate(sim.expiryDate)})`;
      setErrors(e);
      if (Object.keys(e).length) return;
      void finish(erpApi.iotSims.renew(sim.saleId, { amount: a, newExpiry: b, note }), "Renewal recorded");
    };
    return (
      <FormDialog open title="Record renewal" subtitle={simLine(sim)} onClose={onClose} onSubmit={submit} submitLabel="Record renewal" saving={saving}>
        <FormError message={formError} />
        <p className="rounded-xl bg-canvas px-3.5 py-2.5 text-[14px]">Current expiry: <span className="font-semibold">{longDate(sim.expiryDate)}</span></p>
        <Input id="renew-amount" label="Amount received (KES)" inputMode="decimal" value={a} onChange={(v) => setA(sanitizeNumberInput(v))} error={errors.amount}
          hint={sim.renewalFeeMinor != null ? `Renewal fee: ${formatKes(sim.renewalFeeMinor)}` : "No renewal fee is set for this SIM yet."} />
        <Input id="renew-expiry" label="New expiry date" type="date" value={b} onChange={setB} error={errors.newExpiry} hint="Usually one year after the current expiry (or after today if it already passed)." />
        <Input id="renew-note" label="Note (optional)" value={note} onChange={setNote} error={errors.note} placeholder="e.g. M-Pesa QX12AB34" />
      </FormDialog>
    );
  }

  if (action.kind === "edit") {
    const submit = () => {
      const e: Errors = {};
      const m = parseMoney(a, "Renewal fee", MAX_AMOUNT_MINOR);
      if (m.error) e.renewalFee = m.error;
      const d = parseDate(b, "Expiry date");
      if (d.error) e.expiryDate = d.error;
      setErrors(e);
      if (Object.keys(e).length) return;
      void finish(erpApi.iotSims.update(sim.saleId, { renewalFee: a, expiryDate: b }), "Renewal fee and expiry saved");
    };
    return (
      <FormDialog open title="Edit renewal fee & expiry" subtitle={simLine(sim)} onClose={onClose} onSubmit={submit} submitLabel="Save" saving={saving}>
        <FormError message={formError} />
        <Input id="edit-fee" label="Renewal fee (KES, per year)" inputMode="decimal" value={a} onChange={(v) => setA(sanitizeNumberInput(v))} error={errors.renewalFee} />
        <Input id="edit-expiry" label="Expiry date" type="date" value={b} onChange={setB} error={errors.expiryDate} hint="Use this to correct the date; record a renewal when a payment comes in." />
      </FormDialog>
    );
  }

  if (action.kind === "suspend") {
    const reactivate = sim.suspended;
    return (
      <FormDialog open title={reactivate ? "Reactivate SIM" : "Suspend SIM"} subtitle={simLine(sim)} onClose={onClose} danger={!reactivate}
        onSubmit={() => void finish(erpApi.iotSims.suspend(sim.saleId, !reactivate), reactivate ? "SIM reactivated" : "SIM suspended")}
        submitLabel={reactivate ? "Reactivate" : "Suspend"} saving={saving}>
        <FormError message={formError} />
        <p className="text-[14.5px]">
          {reactivate
            ? "The SIM will count again in its group's bill share and appear in renewals when it is due."
            : "A suspended SIM is left out of renewals, the group's bill share and expected profit. You can reactivate it at any time."}
        </p>
      </FormDialog>
    );
  }

  return (
    <FormDialog open title="Renewal history" subtitle={simLine(sim)} onClose={onClose} wide>
      <FormError message={formError} />
      {history === null && !formError && <p role="status" className="flex items-center gap-2 text-muted"><Loader2 size={16} className="animate-spin" aria-hidden="true" />Loading…</p>}
      {history?.length === 0 && <p className="text-muted">No renewals recorded for this SIM yet. It expires on {longDate(sim.expiryDate)}.</p>}
      {history && history.length > 0 && (
        <ul className="flex flex-col divide-y divide-line rounded-xl border border-line">
          {history.map((h) => (
            <li key={h.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3">
              <span className="min-w-0">
                <span className="block font-semibold">{formatKes(h.amountMinor)}</span>
                <span className="block text-[13px] text-muted">
                  {h.previousExpiry ? `${longDate(h.previousExpiry)} → ` : ""}{longDate(h.newExpiry)}{h.note ? ` · ${h.note}` : ""}
                </span>
              </span>
              <span className="text-[13px] text-muted">{new Date(h.createdAt).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" })}</span>
            </li>
          ))}
        </ul>
      )}
    </FormDialog>
  );
}

/** Record the provider's bill for a group (and change how it bills); shows the bills already recorded. */
export function BillDialog({ group, onClose, onDone }: { group: IotGroup | null; onClose: () => void; onDone: (message: string) => void }) {
  const [period, setPeriod] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [billing, setBilling] = useState<BillingPeriod>("Monthly");
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [bills, setBills] = useState<IotBill[] | null>(null);

  useEffect(() => {
    if (!group) return;
    /* eslint-disable react-hooks/set-state-in-effect */
    setPeriod(currentPeriod(todayInNairobi()));
    setAmount("");
    setNote("");
    setBilling(group.billingPeriod);
    setErrors({});
    setFormError(null);
    setSaving(false);
    setBills(null);
    /* eslint-enable react-hooks/set-state-in-effect */
    void erpApi.iotSims.bills(group.simCardId).then((r) => setBills(r.ok ? r.data : []));
  }, [group]);

  const submit = async () => {
    if (!group) return;
    const e: Errors = {};
    const p = parsePeriod(period);
    if (p.error) e.period = p.error;
    const m = parseMoney(amount, "Bill amount", MAX_AMOUNT_MINOR);
    if (m.error) e.amount = m.error;
    setErrors(e);
    if (Object.keys(e).length) return;
    setSaving(true);
    if (billing !== group.billingPeriod) {
      const g = await erpApi.iotSims.updateGroup(group.simCardId, billing);
      if (!g.ok) {
        setSaving(false);
        return setFormError(g.message);
      }
    }
    const r = await erpApi.iotSims.recordBill(group.simCardId, { period, amount, note });
    setSaving(false);
    if (!r.ok) {
      setErrors(r.fieldErrors);
      if (!Object.keys(r.fieldErrors).length) setFormError(r.message);
      return;
    }
    onDone(`Bill for ${monthLabel(r.data.period)} recorded`);
  };

  return (
    <FormDialog open={!!group} title="Record provider bill" subtitle={group ? `${group.name} — ${group.type} · ${group.active} active SIMs` : ""}
      onClose={onClose} onSubmit={() => void submit()} submitLabel="Record bill" saving={saving} wide>
      <FormError message={formError} />
      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1.5 text-[14px] font-medium">The provider bills this group</legend>
        <div className="flex gap-2">
          {BILLING_PERIODS.map((b) => (
            <label key={b} className={cn("flex min-h-11 flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border px-3 text-[14.5px] font-medium", billing === b ? "border-brand bg-[#FFF6F1] text-ink" : "border-line")}>
              <input type="radio" name="billing" value={b} checked={billing === b} onChange={() => setBilling(b)} className="accent-[var(--color-brand)]" />
              {b}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <Input id="bill-period" label="Bill month" type="month" value={period} onChange={setPeriod} error={errors.period} placeholder="2026-10" />
        <Input id="bill-amount" label="Bill amount (KES)" inputMode="decimal" value={amount} onChange={(v) => setAmount(sanitizeNumberInput(v))} error={errors.amount}
          hint={group && group.active > 0 && !errors.amount && !parseMoney(amount, "x", MAX_AMOUNT_MINOR).error
            ? `${formatKes(Math.round(parseMoney(amount, "x", MAX_AMOUNT_MINOR).value! / group.active))} per SIM`
            : undefined} />
      </div>
      <Input id="bill-note" label="Note (optional)" value={note} onChange={setNote} error={errors.note} placeholder="e.g. Invoice number" />
      <p className="text-[13px] text-muted">The bill is shared equally across the group&apos;s active SIMs. Recording the same month again replaces it.</p>
      <div>
        <h3 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-muted">Bills recorded</h3>
        {bills === null ? <p className="text-muted">Loading…</p> : bills.length === 0 ? <p className="text-muted">No bills yet.</p> : (
          <ul className="flex max-h-48 flex-col divide-y divide-line overflow-y-auto rounded-xl border border-line">
            {bills.map((b) => (
              <li key={b.id} className="flex items-baseline justify-between gap-3 px-4 py-2.5 text-[14px]">
                <span>{monthLabel(b.period)}{b.note && <span className="text-muted"> · {b.note}</span>}</span>
                <span className="whitespace-nowrap tabular-nums"><span className="font-semibold">{formatKes(b.amountMinor)}</span><span className="text-muted"> · {b.lines} SIMs</span></span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </FormDialog>
  );
}

/** A new group is a new IoT SIM card item in inventory. */
export function AddGroupDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: (message: string) => void }) {
  const [name, setName] = useState("");
  const [type, setType] = useState<string>(IOT_SIM_TYPES[0]);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!open) return;
    /* eslint-disable react-hooks/set-state-in-effect */
    setName("");
    setType(IOT_SIM_TYPES[0]);
    setErrors({});
    setFormError(null);
    setSaving(false);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [open]);
  const submit = async () => {
    if (!name.trim()) return setErrors({ name: "Provider name is required" });
    setSaving(true);
    const r = await erpApi.simCards.create(name.trim(), type);
    setSaving(false);
    if (!r.ok) {
      setErrors(r.fieldErrors);
      if (!Object.keys(r.fieldErrors).length) setFormError(r.message);
      return;
    }
    onDone(`Group ${r.data.name} — ${r.data.type} added`);
  };
  return (
    <FormDialog open={open} title="Add group" subtitle="Adds an IoT SIM card to inventory. SIMs sold from it appear in this group." onClose={onClose}
      onSubmit={() => void submit()} submitLabel="Add group" saving={saving}>
      <FormError message={formError} />
      <Input id="group-name" label="Provider / SIM name" value={name} onChange={setName} error={errors.name} placeholder="e.g. Safaricom" />
      <div className="flex flex-col gap-1.5">
        <label htmlFor="group-type" className="text-[14px] font-medium">Type</label>
        <select id="group-type" value={type} onChange={(e) => setType(e.target.value)} className="min-h-11 rounded-xl border border-line bg-white px-3 text-[15px]">
          {IOT_SIM_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        {errors.type && <p className="text-[13.5px] text-[#C62828]">{errors.type}</p>}
      </div>
    </FormDialog>
  );
}
