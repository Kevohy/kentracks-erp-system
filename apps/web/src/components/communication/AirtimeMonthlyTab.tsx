"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { CalendarClock, CheckCircle2, Loader2, Plus, RefreshCw, ShieldCheck } from "lucide-react";
import { Card } from "@/components/dashboard/Card";
import {
  validateAirtimePlan,
  type AirtimeMonthly,
  type ApprovedAirtimeLine,
  type PendingAirtimeLine,
} from "@/lib/airtime";
import { todayInNairobi } from "@/lib/billing";
import { cn } from "@/lib/cn";
import { erpApi } from "@/lib/erp-api";
import { day } from "./airtime-shared";
import { Subscriptions } from "./AirtimeSubscriptions";
import { AddSubscriptionDialog } from "./AirtimeAddSubscription";

const minorToInput = (m: number | null) => (m === null ? "" : (m / 100).toFixed(m % 100 ? 2 : 0));

type Editable = PendingAirtimeLine | ApprovedAirtimeLine;

function useEditor(onChange: (d: AirtimeMonthly) => void) {
  const [editing, setEditing] = useState<Editable | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const dialog = editing && (
    <ApprovalDialog
      line={editing}
      onClose={() => setEditing(null)}
      onSaved={(d, approvedNow) => {
        onChange(d);
        const saved = d.approved.find((l) => l.saleId === editing.saleId);
        const label = `${editing.customerName} (${editing.vehiclePlate || editing.imei})`;
        setNotice(saved?.state === "Expired"
          ? `${label} ${approvedNow ? "approved" : "updated"}, but the device expired${saved.expiry ? ` on ${day(saved.expiry)}` : ""}, so its airtime is suspended. It gets airtime only after the device is renewed and the line is resumed.`
          : approvedNow
            ? `${label} approved. It is now under Subscriptions, where its airtime is sent each month.`
            : `${editing.vehiclePlate || editing.imei}: monthly airtime updated.`);
        setEditing(null);
      }}
    />
  );
  const banner = notice && (
    <p role="status" className="flex items-start gap-2 rounded-xl bg-[#E6F4EA] px-3.5 py-3 text-[14px] text-[#1B5E20]">
      <CheckCircle2 size={17} className="mt-0.5 shrink-0" aria-hidden="true" /><span className="flex-1">{notice}</span>
      <button type="button" onClick={() => setNotice(null)} className="text-[13px] underline">Dismiss</button>
    </p>
  );
  return { setEditing, setNotice, dialog, banner };
}

const loading = <p role="status" className="flex items-center gap-2 text-muted"><Loader2 size={16} className="animate-spin" aria-hidden="true" />Loading…</p>;

/**
 * Communication → Airtime → Approval. Every sale where "automatic airtime recharge" was ticked waits here first.
 * Approving sets the amount to disburse each month, the renewal fee and when the airtime stops (the device's expiry
 * on the GPS platform, or a custom date); the line then moves to Monthly.
 */
export function ApprovalTab({ data, onChange }: { data: AirtimeMonthly | null; onChange: (d: AirtimeMonthly) => void }) {
  const ed = useEditor(onChange);
  const [adding, setAdding] = useState(false);
  if (!data) return loading;
  return (
    <div className="flex flex-col gap-4">
      {ed.banner}
      <Pending lines={data.pending} onApprove={ed.setEditing} onAdd={() => setAdding(true)} />
      {ed.dialog}
      {adding && (
        <AddSubscriptionDialog onClose={() => setAdding(false)} onAdded={(d, label) => {
          onChange(d);
          setAdding(false);
          ed.setNotice(`${label} switched to automatic airtime recharge. Review it below to approve.`);
        }} />
      )}
    </div>
  );
}

/** Communication → Airtime → Monthly: the approved lines, and this month's airtime for the ones that are due. */
export function MonthlyTab({ data, connected, onChange, onSent }: {
  data: AirtimeMonthly | null;
  connected: boolean;
  onChange: (d: AirtimeMonthly) => void;
  onSent: () => void;
}) {
  const ed = useEditor(onChange);
  if (!data) return loading;
  return (
    <div className="flex flex-col gap-4">
      {ed.banner}
      <Subscriptions data={data} connected={connected} onEdit={ed.setEditing} onChange={onChange} onSent={onSent} onNotice={ed.setNotice} />
      {ed.dialog}
    </div>
  );
}

// ------------------------------------------------------------------ waiting for approval

const expiryText = (l: PendingAirtimeLine) => (l.lifelong ? "Lifelong (never)" : l.imeiExpiry ? day(l.imeiExpiry) : "Not known yet");
const GRID = "lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,0.9fr)_auto]";

function Pending({ lines, onApprove, onAdd }: { lines: PendingAirtimeLine[]; onApprove: (l: PendingAirtimeLine) => void; onAdd: () => void }) {
  return (
    <section aria-labelledby="air-pending-h" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="air-pending-h" className="flex items-center gap-2 text-[16px] font-semibold">
            Waiting for approval
            <span className={cn("rounded-full px-2 text-[13px] leading-6", lines.length ? "bg-brand text-white" : "bg-canvas text-muted")}>{lines.length}</span>
          </h2>
          <p className="mt-0.5 text-[13px] text-muted">Sales with &quot;automatic airtime recharge&quot;. No airtime is sent until approved.</p>
        </div>
        <button type="button" onClick={onAdd}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line bg-white px-4 text-[15px] font-semibold text-navy hover:bg-tint">
          <Plus size={17} aria-hidden="true" />Add subscription
        </button>
      </div>
      {lines.length === 0 ? (
        <Card className="flex flex-col items-center gap-1 px-5 py-8 text-center">
          <ShieldCheck size={26} className="text-muted" aria-hidden="true" />
          <p className="text-[15px] font-semibold">Nothing to approve</p>
          <p className="text-[13.5px] text-muted">New sales with automatic airtime recharge appear here. Use &quot;Add subscription&quot; for an existing sale.</p>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div aria-hidden="true" className={cn("hidden gap-x-5 border-b border-line bg-canvas/60 px-5 py-2.5 text-[12px] font-semibold uppercase tracking-wide text-muted lg:grid", GRID)}>
            <span>Customer</span><span>Tracker SIM number</span><span>Device expiry (IMEI)</span><span className="w-[118px]" />
          </div>
          <ul aria-label="Waiting for approval" className="divide-y divide-line">
            {lines.map((l) => (
              <li key={l.saleId} className={cn("grid gap-x-5 gap-y-2 px-4 py-3.5 sm:px-5 lg:items-center", GRID)}>
                <span className="min-w-0">
                  <span className="block truncate text-[15px] font-semibold">{l.customerName}</span>
                  <span className="block truncate text-[13px] text-muted">{[l.vehiclePlate, l.imei].filter(Boolean).join(" · ")}</span>
                </span>
                <dl className="contents text-[14px]">
                  <div className="flex items-baseline justify-between gap-3 lg:block">
                    <dt className="text-[13px] text-muted lg:sr-only">Tracker SIM number</dt>
                    <dd className="min-w-0 truncate font-mono">{l.phone ?? (l.simNumber || "—")}
                      {!l.phone && <span className="block font-sans text-[12.5px] text-[#B71C1C]">Not a valid phone number</span>}
                    </dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-3 lg:block">
                    <dt className="text-[13px] text-muted lg:sr-only">Device expiry (IMEI)</dt>
                    <dd>{expiryText(l)}</dd>
                  </div>
                </dl>
                <button type="button" onClick={() => onApprove(l)} aria-label={`Review airtime for ${l.customerName}, ${l.vehiclePlate || l.imei}`}
                  className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-navy px-4 text-[15px] font-semibold text-white hover:brightness-110 lg:w-[118px]">
                  <ShieldCheck size={17} aria-hidden="true" />Review
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </section>
  );
}

// ------------------------------------------------------------------ approval form

function ApprovalDialog({ line, onClose, onSaved }: {
  line: PendingAirtimeLine | ApprovedAirtimeLine;
  onClose: () => void;
  onSaved: (d: AirtimeMonthly, approvedNow: boolean) => void;
}) {
  const plan = "plan" in line ? line.plan : null;
  const ref = useRef<HTMLDialogElement>(null);
  const [monthlyAmount, setMonthlyAmount] = useState(plan ? minorToInput(plan.monthlyAmountMinor) : "");
  // The airtime renewal fee is separate from the platform renewal fee, so it starts empty until it is set here.
  const [renewalPrice, setRenewalPrice] = useState(plan ? minorToInput(plan.renewalPriceMinor) : "");
  const [expirySource, setExpirySource] = useState<"IMEI" | "Custom">(plan?.expirySource ?? (line.imeiExpiry || line.lifelong ? "IMEI" : "Custom"));
  const [customExpiry, setCustomExpiry] = useState(plan?.customExpiry ?? "");
  const [imeiExpiry, setImeiExpiry] = useState(line.imeiExpiry);
  const [imeiNote, setImeiNote] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const today = todayInNairobi();

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  async function readImei() {
    setChecking(true);
    setImeiNote(null);
    const r = await erpApi.airtime.imeiExpiry(line.saleId);
    setChecking(false);
    if (!r.ok) return setImeiNote(r.message);
    setImeiExpiry(r.data.imeiExpiry);
    setImeiNote(r.data.message ?? `The GPS platform says this device expires on ${r.data.imeiExpiry ? day(r.data.imeiExpiry) : "—"}.`);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const draft = { monthlyAmount, renewalPrice, expirySource, customExpiry };
    const local = validateAirtimePlan(draft, today);
    const errs = { ...local.errors };
    if (!errs.expirySource && expirySource === "IMEI" && !line.lifelong && !imeiExpiry) errs.expirySource = "The GPS platform has no expiry date for this device yet. Read it again, or use a custom date.";
    if (Object.keys(errs).length) {
      setErrors(errs);
      const first = ["monthlyAmount", "renewalPrice", "expirySource", "customExpiry"].find((k) => errs[k]);
      ref.current?.querySelector<HTMLElement>(`#air-plan-${first}`)?.focus();
      return;
    }
    setBusy(true);
    const r = await erpApi.airtime.approve(line.saleId, draft);
    setBusy(false);
    if (!r.ok) return setErrors({ ...r.fieldErrors, ...(Object.keys(r.fieldErrors).length ? {} : { form: r.message }) });
    onSaved(r.data, !plan);
  }

  const field = "min-h-11 w-full rounded-xl border bg-white px-3.5 text-[15px]";
  const err = (k: string) => errors[k] && <p id={`air-plan-${k}-err`} className="text-[13px] text-[#C62828]">{errors[k]}</p>;
  const clear = (k: string) => setErrors((p) => ({ ...p, [k]: "", form: "" }));
  return (
    <dialog ref={ref} onClose={onClose} aria-labelledby="air-plan-title"
      className="m-auto max-h-[calc(100dvh-32px)] w-[calc(100%-32px)] max-w-lg overflow-y-auto rounded-2xl border border-line bg-white p-0 text-ink shadow-[0_24px_60px_rgba(10,29,44,0.25)] backdrop:bg-ink/50">
      <form onSubmit={submit} noValidate className="flex flex-col gap-4 p-5 sm:p-6">
        <div className="flex items-center gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#FFF1EA] text-brand" aria-hidden="true"><CalendarClock size={21} /></span>
          <div className="min-w-0">
            <h2 id="air-plan-title" className="text-lg font-semibold leading-tight">{plan ? "Edit monthly airtime" : "Approve automatic airtime"}</h2>
            <p className="truncate text-[13px] text-muted">{line.customerName} · {[line.vehiclePlate, line.imei].filter(Boolean).join(" · ")}</p>
          </div>
        </div>
        <p className="rounded-xl bg-canvas px-3.5 py-2.5 text-[13.5px]">
          Tracker SIM number <span className="font-mono">{line.phone ?? (line.simNumber || "—")}</span>
          {!line.phone && <span className="text-[#B71C1C]"> · not a valid phone number: airtime cannot be sent until the SIM number is fixed</span>}
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="air-plan-monthlyAmount" className="text-[13.5px] font-medium">Amount to disburse each month (KES)</label>
            <input id="air-plan-monthlyAmount" inputMode="decimal" autoComplete="off" value={monthlyAmount} placeholder="e.g. 100"
              onChange={(e) => { setMonthlyAmount(e.target.value.replace(/[^\d.,]/g, "")); clear("monthlyAmount"); }}
              aria-invalid={errors.monthlyAmount ? true : undefined} aria-describedby={errors.monthlyAmount ? "air-plan-monthlyAmount-err" : "air-plan-amount-hint"}
              className={cn(field, errors.monthlyAmount ? "border-[#C62828]" : "border-line")} />
            {err("monthlyAmount") || <p id="air-plan-amount-hint" className="text-[12.5px] text-muted">KES 5 to 10,000</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="air-plan-renewalPrice" className="text-[13.5px] font-medium">Airtime renewal fee (KES)</label>
            <input id="air-plan-renewalPrice" inputMode="decimal" autoComplete="off" value={renewalPrice} placeholder="e.g. 1500"
              onChange={(e) => { setRenewalPrice(e.target.value.replace(/[^\d.,]/g, "")); clear("renewalPrice"); }}
              aria-invalid={errors.renewalPrice ? true : undefined} aria-describedby={errors.renewalPrice ? "air-plan-renewalPrice-err" : "air-plan-renewal-hint"}
              className={cn(field, errors.renewalPrice ? "border-[#C62828]" : "border-line")} />
            {err("renewalPrice") || <p id="air-plan-renewal-hint" className="text-[12.5px] text-muted">For the airtime service. Separate from the platform renewal fee.</p>}
          </div>
        </div>

        <fieldset className="flex flex-col gap-2" aria-describedby={errors.expirySource ? "air-plan-expirySource-err" : undefined}>
          <legend className="mb-1 text-[13.5px] font-medium">Expiration date</legend>
          <label className={cn("flex cursor-pointer items-start gap-3 rounded-xl border px-3.5 py-3", expirySource === "IMEI" ? "border-navy bg-tint/40" : "border-line")}>
            <input id="air-plan-expirySource" type="radio" name="air-expiry" className="mt-1 size-4 accent-[#0A1D2C]" checked={expirySource === "IMEI"}
              onChange={() => { setExpirySource("IMEI"); clear("expirySource"); clear("customExpiry"); }} />
            <span className="min-w-0 flex-1 text-[14px]">
              <span className="block font-semibold">From the IMEI (GPS platform)</span>
              <span className="block text-muted">
                {line.lifelong ? "Lifelong Card: the device never expires, so airtime continues until stopped." : imeiExpiry ? `GPS platform: ${day(imeiExpiry)}. Follows renewals automatically.` : "Not known yet."}
              </span>
              {!line.lifelong && imeiExpiry && imeiExpiry < today && expirySource === "IMEI" && (
                <span role="note" className="mt-1.5 block rounded-lg bg-[#FFF4E5] px-2.5 py-1.5 text-[13px] text-[#7a3d00]">
                  This device has already expired, so the line will be suspended straight away and get no airtime until the device is renewed.
                </span>
              )}
              {!line.lifelong && (
                <button type="button" onClick={() => void readImei()} disabled={checking}
                  className="mt-2 inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-line bg-white px-3 text-[13.5px] font-semibold hover:bg-canvas disabled:opacity-60">
                  <RefreshCw size={14} className={cn(checking && "animate-spin")} aria-hidden="true" />{checking ? "Reading…" : "Read from the GPS platform"}
                </button>
              )}
              {imeiNote && <span role="status" className="mt-1.5 block text-[13px] text-muted">{imeiNote}</span>}
            </span>
          </label>
          <label className={cn("flex cursor-pointer items-start gap-3 rounded-xl border px-3.5 py-3", expirySource === "Custom" ? "border-navy bg-tint/40" : "border-line")}>
            <input type="radio" name="air-expiry" className="mt-1 size-4 accent-[#0A1D2C]" checked={expirySource === "Custom"}
              onChange={() => { setExpirySource("Custom"); clear("expirySource"); }} />
            <span className="block text-[14px]">
              <span className="block font-semibold">Custom date</span>
              <span className="block text-muted">For example the end of the customer&apos;s contract.</span>
            </span>
          </label>
          {err("expirySource")}
          {expirySource === "Custom" && (
            <div className="flex flex-col gap-1.5 pl-1">
              <label htmlFor="air-plan-customExpiry" className="text-[13.5px] font-medium">Expiry date</label>
              <input id="air-plan-customExpiry" type="date" min={today} value={customExpiry}
                onChange={(e) => { setCustomExpiry(e.target.value); clear("customExpiry"); }}
                aria-invalid={errors.customExpiry ? true : undefined} aria-describedby={errors.customExpiry ? "air-plan-customExpiry-err" : undefined}
                className={cn(field, "sm:max-w-56", errors.customExpiry ? "border-[#C62828]" : "border-line")} />
              {err("customExpiry")}
            </div>
          )}
        </fieldset>

        {errors.form && <p role="alert" className="text-[13.5px] text-[#C62828]">{errors.form}</p>}
        <p className="text-[13px] text-muted">Airtime stops after the expiration date. Approving does not send airtime now: it is sent each month from Subscriptions.</p>
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} disabled={busy} className="min-h-11 rounded-xl border border-line px-4 text-[15px] font-semibold hover:bg-canvas">Cancel</button>
          <button type="submit" disabled={busy}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-navy px-5 text-[15px] font-semibold text-white hover:brightness-110 disabled:opacity-60">
            {busy ? <Loader2 size={17} className="animate-spin" aria-hidden="true" /> : <ShieldCheck size={17} aria-hidden="true" />}
            {plan ? "Save changes" : "Approve"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
