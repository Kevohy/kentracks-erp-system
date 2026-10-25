"use client";

import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { CalendarClock, CircleSlash, Hourglass, Loader2, PauseCircle, RefreshCw, Send, ShieldCheck, Smartphone, Wallet, Zap } from "lucide-react";
import { Card } from "@/components/dashboard/Card";
import { parseAirtimeAmount, type AirtimeBatch, type AirtimeOverview as Overview } from "@/lib/airtime";
import { cn } from "@/lib/cn";
import { erpApi, newClientKey } from "@/lib/erp-api";
import { formatKes } from "@/lib/sales-format";
import { validatePhone } from "@/lib/validation";
import { ConfirmDialog, SendResult } from "./airtime-shared";

const monthName = (ym: string) => new Date(`${ym}-15T12:00:00Z`).toLocaleDateString("en-KE", { month: "long", year: "numeric", timeZone: "UTC" });
/** "KES 1500.0000" -> "KES 1,500.00" */
const kes = (s: string) => {
  const m = /^([A-Z]{3})\s*(-?[\d.]+)$/.exec(s.trim());
  return m ? `${m[1]} ${Number(m[2]).toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : s;
};

function Kpi({ icon, label, value, sub, accent, onClick }: { icon: ReactNode; label: string; value: ReactNode; sub?: ReactNode; accent: string; onClick?: () => void }) {
  const body = (
    <>
      <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl", accent)} aria-hidden="true">{icon}</span>
      <span className="min-w-0">
        <span className="block text-[12px] font-semibold uppercase tracking-wide text-muted">{label}</span>
        <span className="block truncate text-[22px] font-semibold leading-tight tabular-nums">{value}</span>
        {sub && <span className="block truncate text-[12.5px] text-muted">{sub}</span>}
      </span>
    </>
  );
  return onClick ? (
    <button type="button" onClick={onClick} className="flex min-w-0 items-center gap-3 rounded-2xl border border-line bg-white px-4 py-4 text-left shadow-[0_1px_2px_rgba(16,32,48,0.04)] hover:border-navy/40">{body}</button>
  ) : (
    <div className="flex min-w-0 items-center gap-3 rounded-2xl border border-line bg-white px-4 py-4 shadow-[0_1px_2px_rgba(16,32,48,0.04)]">{body}</div>
  );
}

/**
 * Communication → Airtime → Overview: the Africa's Talking balance, the monthly airtime counts and a one-off top-up.
 * `go` switches to another tab (Approval, Subscriptions) when a card is clicked.
 */
export function OverviewTab({ data, onReload, onSent, go }: {
  data: Overview | null;
  onReload: () => void;
  onSent: () => void;
  go: (tab: "approval" | "monthly") => void;
}) {
  if (!data) return <p role="status" className="flex items-center gap-2 text-muted"><Loader2 size={16} className="animate-spin" aria-hidden="true" />Loading…</p>;
  return (
    <div className="flex flex-col gap-5">
      <section aria-labelledby="air-ov-h" className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <h2 id="air-ov-h" className="text-[13px] font-semibold uppercase tracking-wide text-muted">Overview · {monthName(data.month)}</h2>
          <button type="button" onClick={onReload} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 text-[13.5px] font-semibold text-navy hover:bg-tint">
            <RefreshCw size={14} aria-hidden="true" />Refresh
          </button>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <Kpi icon={<Wallet size={20} />} accent="bg-[#FFF1EA] text-brand" label="Airtime balance"
            value={data.balance ? kes(data.balance) : <span className="text-[16px] text-muted">{data.configured ? "Unavailable" : "Not set up"}</span>}
            sub={data.balance ? "Africa's Talking account" : data.configured ? (data.balanceError ?? "Could not read the balance") : "Ask the system administrator to set it up"} />
          <Kpi icon={<CalendarClock size={20} />} accent="bg-[#E8F0FB] text-[#1F5FAD]" label="To distribute this month" onClick={() => go("monthly")}
            value={formatKes(data.dueMinor)} sub={`${data.dueCount} line${data.dueCount === 1 ? "" : "s"} due · ${data.sentThisMonth} sent`} />
          <Kpi icon={<Hourglass size={20} />} accent="bg-[#FFF4E5] text-[#9a3300]" label="Pending approval" onClick={() => go("approval")}
            value={data.pending} sub="Ticked in sales, not yet approved" />
          <Kpi icon={<ShieldCheck size={20} />} accent="bg-[#E6F4EA] text-[#1B5E20]" label="Active" onClick={() => go("monthly")}
            value={data.active} sub="Approved and getting airtime" />
          <Kpi icon={<PauseCircle size={20} />} accent="bg-[#EEF1F4] text-[#3d4b57]" label="Suspended" onClick={() => go("monthly")}
            value={data.suspended} sub="Paused until resumed" />
          <Kpi icon={<CircleSlash size={20} />} accent="bg-[#FDECEA] text-[#B71C1C]" label="Expired" onClick={() => go("monthly")}
            value={data.expired} sub="Suspended automatically at expiry" />
        </div>
      </section>
      <TopUp configured={data.configured} onSent={onSent} />
    </div>
  );
}

/** One-off airtime: type a phone number and an amount. */
function TopUp({ configured, onSent }: { configured: boolean; onSent: () => void }) {
  const [phone, setPhone] = useState("");
  const [amount, setAmount] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirm, setConfirm] = useState<{ phone: string; amountMinor: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AirtimeBatch | null>(null);
  const key = useRef(newClientKey());
  const form = useRef<HTMLFormElement>(null);

  function review(e: FormEvent) {
    e.preventDefault();
    setResult(null);
    const errs: Record<string, string> = {};
    const p = phone.trim() ? validatePhone(phone.trim()) : null;
    if (!phone.trim()) errs.phone = "Enter the phone number";
    else if (!p || p.error) errs.phone = "Enter a valid phone number, e.g. 0712 345 678";
    const a = parseAirtimeAmount(amount);
    if (a.error) errs.amount = a.error;
    setErrors(errs);
    if (Object.keys(errs).length) return form.current?.querySelector<HTMLInputElement>(errs.phone ? "#air-top-phone" : "#air-top-amount")?.focus();
    setConfirm({ phone: p!.value!, amountMinor: a.value! });
  }

  async function send() {
    setBusy(true);
    const r = await erpApi.airtime.topUp(confirm!.phone, amount, key.current);
    setBusy(false);
    setConfirm(null);
    if (!r.ok) return setErrors({ ...r.fieldErrors, ...(Object.keys(r.fieldErrors).length ? {} : { form: r.message }) });
    setResult(r.data);
    key.current = newClientKey();
    if (r.data.sent) {
      setPhone("");
      setAmount("");
    }
    onSent();
  }

  const field = "min-h-11 w-full rounded-xl border bg-white px-3.5 text-[15px]";
  return (
    <section aria-labelledby="air-top-h">
      <Card className="flex flex-col gap-4 p-4 sm:p-5">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-[#FFF1EA] text-brand" aria-hidden="true"><Zap size={20} /></span>
          <div>
            <h2 id="air-top-h" className="text-[16px] font-semibold leading-tight">One-off top-up</h2>
            <p className="text-[13px] text-muted">Send airtime once to any number. It does not change any subscription.</p>
          </div>
        </div>
        {result && <SendResult batch={result} onClose={() => setResult(null)} />}
        <form ref={form} onSubmit={review} noValidate className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,220px)_auto] sm:items-start">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="air-top-phone" className="text-[13.5px] font-medium">Phone number</label>
            <div className="relative">
              <Smartphone size={17} className="pointer-events-none absolute left-3.5 top-3.5 text-muted" aria-hidden="true" />
              <input id="air-top-phone" type="tel" inputMode="tel" autoComplete="off" value={phone} placeholder="0712 345 678"
                onChange={(e) => { setPhone(e.target.value); setErrors((p) => ({ ...p, phone: "", form: "" })); }}
                aria-invalid={errors.phone ? true : undefined} aria-describedby={errors.phone ? "air-top-phone-err" : undefined}
                className={cn(field, "pl-10", errors.phone ? "border-[#C62828]" : "border-line")} />
            </div>
            {errors.phone && <p id="air-top-phone-err" className="text-[13px] text-[#C62828]">{errors.phone}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="air-top-amount" className="text-[13.5px] font-medium">Amount (KES)</label>
            <input id="air-top-amount" inputMode="decimal" autoComplete="off" value={amount} placeholder="e.g. 100"
              onChange={(e) => { setAmount(e.target.value.replace(/[^\d.,]/g, "")); setErrors((p) => ({ ...p, amount: "", form: "" })); }}
              aria-invalid={errors.amount ? true : undefined} aria-describedby={errors.amount ? "air-top-amount-err" : "air-top-amount-hint"}
              className={cn(field, errors.amount ? "border-[#C62828]" : "border-line")} />
            {errors.amount ? <p id="air-top-amount-err" className="text-[13px] text-[#C62828]">{errors.amount}</p> : <p id="air-top-amount-hint" className="text-[12.5px] text-muted">KES 5 to 10,000</p>}
          </div>
          <button type="submit" disabled={!configured || busy}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-brand px-5 text-[15px] font-semibold text-white hover:brightness-95 disabled:opacity-60 sm:mt-[27px]">
            <Send size={17} aria-hidden="true" />Top up
          </button>
        </form>
        {errors.form && <p role="alert" className="text-[13.5px] text-[#C62828]">{errors.form}</p>}
        {!configured && <p className="text-[13px] text-muted">Top-ups are available once Africa&apos;s Talking is set up.</p>}
      </Card>
      {confirm && (
        <ConfirmDialog title={`Top up ${confirm.phone}?`} countLabel="Numbers" count={1} eachMinor={confirm.amountMinor} totalMinor={confirm.amountMinor} busy={busy}
          onCancel={() => setConfirm(null)} onConfirm={() => void send()} />
      )}
    </section>
  );
}
