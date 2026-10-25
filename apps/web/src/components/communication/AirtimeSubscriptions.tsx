"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronDown, Loader2, Pause, Pencil, Play, Search, Send, Trash2 } from "lucide-react";
import { ActionsMenu } from "@/components/billing/ActionsMenu";
import { Card } from "@/components/dashboard/Card";
import { AIRTIME_MAX_RECIPIENTS, airtimePeriod, type AirtimeBatch, type AirtimeMonthly, type ApprovedAirtimeLine } from "@/lib/airtime";
import { todayInNairobi } from "@/lib/billing";
import { cn } from "@/lib/cn";
import { erpApi, newClientKey } from "@/lib/erp-api";
import { formatKes } from "@/lib/sales-format";
import { ConfirmDialog, day, SendResult } from "./airtime-shared";

const FILTERS = ["Active", "Suspended", "Expired", "Expiring soon", "All"] as const;
type Filter = (typeof FILTERS)[number];
/** Active: approved and getting airtime (due, sent, or waiting on a SIM number / expiry date). */
const isActive = (l: ApprovedAirtimeLine) => l.state !== "Suspended" && l.state !== "Expired";
const matches = (l: ApprovedAirtimeLine, f: Filter) =>
  f === "All" ? true
    : f === "Active" ? isActive(l)
      : f === "Expiring soon" ? l.expiringSoon && l.state !== "Expired"
        : l.state === f;
const monthName = (ym: string) => new Date(`${ym}-15T12:00:00Z`).toLocaleDateString("en-KE", { month: "long", year: "numeric", timeZone: "UTC" });
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?";
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

const tone = { total: "text-navy", online: "text-[#1B7A34]", offline: "text-[#B25B00]", expired: "text-[#C62828]", soon: "text-[#1F5FAD]" };
const pill = {
  green: "bg-[#E6F4EA] text-[#1B5E20]",
  amber: "bg-[#FFF4E5] text-[#9a3300]",
  red: "bg-[#FDECEA] text-[#B71C1C]",
  grey: "bg-[#EEF1F4] text-[#3d4b57]",
  orange: "bg-[#FFF1EA] text-[#B33A00]",
  blue: "bg-[#E8F0FB] text-[#1F5FAD]",
};

function Pill({ className, children }: { className: string; children: ReactNode }) {
  return <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[12.5px] font-semibold", className)}>{children}</span>;
}

function StatBox({ value, label, className }: { value: number; label: string; className: string }) {
  return (
    <div className="flex min-w-0 flex-col items-center justify-center rounded-xl border border-line bg-white px-0.5 py-2 sm:w-[86px] sm:px-2">
      <span className={cn("text-[18px] font-semibold leading-none tabular-nums", className)}>{value}</span>
      <span className="mt-1.5 max-w-full truncate text-[9px] font-semibold uppercase text-muted sm:text-[10.5px] sm:tracking-wide">{label}</span>
    </div>
  );
}

function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="text-[11px] font-medium uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-0.5 truncate text-[13.5px] font-semibold">{children}</dd>
    </div>
  );
}

type Group = { id: string; name: string; phone: string | null; lines: ApprovedAirtimeLine[] };

/**
 * Communication → Airtime → Subscriptions: the approved lines grouped by customer. Each customer shows its counts;
 * opening it shows every line with its monthly airtime, renewal fee, estimated profit, expiry and connection.
 */
export function Subscriptions({ data, connected, onEdit, onChange, onSent, onNotice }: {
  data: AirtimeMonthly;
  connected: boolean;
  onEdit: (l: ApprovedAirtimeLine) => void;
  onChange: (d: AirtimeMonthly) => void;
  onSent: () => void;
  onNotice: (m: string) => void;
}) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("Active");
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<ApprovedAirtimeLine[] | null>(null);
  const [removing, setRemoving] = useState<ApprovedAirtimeLine | null>(null);
  const [result, setResult] = useState<AirtimeBatch | null>(null);
  const [error, setError] = useState<string | null>(null);
  const key = useRef(newClientKey());

  const due = data.approved.filter((l) => l.state === "Due");
  const dueTotal = due.reduce((t, l) => t + l.plan.monthlyAmountMinor, 0);
  const count = (f: Filter) => data.approved.filter((l) => matches(l, f)).length;

  const groups = useMemo(() => {
    const s = q.trim().toLowerCase();
    const map = new Map<string, Group>();
    for (const l of data.approved) {
      if (!matches(l, filter)) continue;
      if (s && ![l.customerName, l.customerPhone ?? "", l.vehiclePlate, l.imei, l.simNumber, l.phone ?? ""].some((v) => v.toLowerCase().includes(s))) continue;
      const g = map.get(l.customerId) ?? { id: l.customerId, name: l.customerName, phone: l.customerPhone, lines: [] };
      g.lines.push(l);
      map.set(l.customerId, g);
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [data.approved, q, filter]);

  const toggle = (id: string) => setOpen((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  async function send(lines: ApprovedAirtimeLine[]) {
    setBusy(true);
    setError(null);
    const r = await erpApi.airtime.sendMonthly(lines.map((l) => l.saleId), key.current);
    setBusy(false);
    setConfirm(null);
    if (!r.ok) return setError(r.fieldErrors.lines ?? r.fieldErrors.form ?? r.message);
    setResult(r.data);
    key.current = newClientKey();
    onSent();
  }

  async function suspend(l: ApprovedAirtimeLine, suspended: boolean) {
    setBusy(true);
    const r = await erpApi.airtime.suspend(l.saleId, suspended);
    setBusy(false);
    if (!r.ok) return setError(r.fieldErrors.form ?? r.message);
    setError(null);
    onChange(r.data);
    onNotice(`${l.vehiclePlate || l.imei}: ${suspended ? "suspended. No airtime is sent until it is resumed." : "resumed."}`);
  }

  const toSend = confirm ?? [];
  const sendTotal = toSend.reduce((t, l) => t + l.plan.monthlyAmountMinor, 0);
  const sameAmount = new Set(toSend.map((l) => l.plan.monthlyAmountMinor)).size === 1;

  return (
    <section aria-labelledby="air-subs-h" className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 id="air-subs-h" className="text-[13px] font-semibold uppercase tracking-wide text-muted">Active subscriptions · {monthName(data.month)}</h2>
          <p className="mt-1 text-[14px] text-muted">
            <span className="font-semibold text-ink">{plural(due.length, "line")}</span> due this month
            {due.length > 0 && <> · <span className="font-semibold text-ink">{formatKes(dueTotal)}</span></>}
          </p>
        </div>
        <button type="button" disabled={!connected || busy || due.length === 0} onClick={() => { setError(null); setConfirm(due.slice(0, AIRTIME_MAX_RECIPIENTS)); }}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-brand px-5 text-[15px] font-semibold text-white hover:brightness-95 disabled:opacity-60">
          <Send size={17} aria-hidden="true" />Send this month&apos;s airtime
        </button>
      </div>
      {result && <SendResult batch={result} onClose={() => setResult(null)} />}
      {error && <p role="alert" className="rounded-xl bg-[#FDECEA] px-3.5 py-2.5 text-[14px] text-[#B71C1C]">{error}</p>}

      {data.approved.length === 0 ? (
        <Card className="px-5 py-8 text-center text-[14px] text-muted">No approved subscriptions yet. Approve lines in the Approval tab.</Card>
      ) : (
        <>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <label className="relative block lg:w-[420px]">
              <span className="sr-only">Search subscriptions</span>
              <Search size={18} className="pointer-events-none absolute left-3.5 top-3.5 text-muted" aria-hidden="true" />
              <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search client, phone, SIM, plate or IMEI…"
                className="min-h-11 w-full rounded-xl border border-line bg-white pl-10 pr-3.5 text-[15px]" />
            </label>
            <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 lg:pb-0">
              {FILTERS.map((f) => (
                <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}
                  className={cn("min-h-9 shrink-0 rounded-lg border px-3 text-[13.5px] font-semibold", filter === f ? "border-navy bg-navy text-white" : "border-line bg-white text-muted hover:text-ink")}>
                  {f} <span className="opacity-75">{count(f)}</span>
                </button>
              ))}
            </div>
          </div>

          {groups.length === 0 ? (
            <Card className="px-5 py-8 text-center text-[14px] text-muted">No subscriptions match.</Card>
          ) : (
            <ul aria-label="Subscriptions by customer" className="flex flex-col gap-3">
              {groups.map((g) => (
                <li key={g.id}>
                  <CustomerCard g={g} open={open.has(g.id) || !!q.trim()} onToggle={() => toggle(g.id)}>
                    {g.lines.map((l) => (
                      <LineCard key={l.saleId} l={l} busy={busy} connected={connected}
                        onSend={() => { setError(null); setConfirm([l]); }} onEdit={() => onEdit(l)} onSuspend={(s) => void suspend(l, s)}
                        onRemove={() => setRemoving(l)} />
                    ))}
                  </CustomerCard>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {removing && (
        <RemoveDialog line={removing} onClose={() => setRemoving(null)} onRemoved={(d, next) => {
          const label = removing.vehiclePlate || removing.imei;
          setRemoving(null);
          onChange(d);
          onNotice(`${label} removed from automatic airtime. The sale's service is now "${next === "SMS reminder" ? "Monthly airtime alert (SMS)" : "None (no SMS reminder)"}" (saved in the sale's history).`);
        }} />
      )}
      {confirm && confirm.length > 0 && (
        <ConfirmDialog title={confirm.length === 1 ? `Send ${monthName(data.month)} airtime to ${confirm[0].vehiclePlate || confirm[0].imei}?` : `Send ${monthName(data.month)} airtime?`}
          count={confirm.length} eachMinor={sameAmount ? toSend[0].plan.monthlyAmountMinor : null} totalMinor={sendTotal} busy={busy}
          onCancel={() => setConfirm(null)} onConfirm={() => void send(confirm)} />
      )}
    </section>
  );
}

function CustomerCard({ g, open, onToggle, children }: { g: Group; open: boolean; onToggle: () => void; children: ReactNode }) {
  const live = g.lines.filter((l) => l.state !== "Expired" && l.state !== "Suspended");
  const monthly = live.reduce((t, l) => t + l.plan.monthlyAmountMinor, 0);
  const upcoming = g.lines.map((l) => l.expiry).filter((d): d is string => !!d).sort();
  const today = todayInNairobi();
  const next = upcoming.find((d) => d >= today) ?? upcoming.at(-1) ?? null;
  const panelId = `air-cust-${g.id}`;
  return (
    <Card className="overflow-visible">
      <div className="flex flex-col gap-3 px-4 py-4 sm:px-5 lg:flex-row lg:items-center">
        <button type="button" onClick={onToggle} aria-expanded={open} aria-controls={panelId} aria-label={`${g.name}, ${plural(g.lines.length, "subscription")}`}
          className="-m-2 flex min-w-0 flex-1 items-center gap-3.5 rounded-xl p-2 text-left hover:bg-canvas/60">
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-[#FFF1EA] text-[14px] font-semibold text-brand" aria-hidden="true">{initials(g.name)}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[16px] font-semibold">{g.name}</span>
            {g.phone && <span className="block truncate text-[13px] text-muted">{g.phone}</span>}
            <span className="block truncate text-[13px] text-muted">
              Next expiry: <span className="font-medium text-ink">{next ? day(next) : "Never (Lifelong)"}</span> · Monthly <span className="font-medium text-ink">{formatKes(monthly)}</span>
            </span>
          </span>
          <ChevronDown size={20} className={cn("shrink-0 text-muted transition-transform", open && "rotate-180")} aria-hidden="true" />
        </button>
        <div className="grid grid-cols-5 gap-1.5 sm:flex sm:gap-2">
          <StatBox value={g.lines.length} label="Subs" className={tone.total} />
          <StatBox value={g.lines.filter((l) => l.connection === "Online").length} label="Online" className={tone.online} />
          <StatBox value={g.lines.filter((l) => l.connection === "Offline").length} label="Offline" className={tone.offline} />
          <StatBox value={g.lines.filter((l) => l.state === "Expired").length} label="Expired" className={tone.expired} />
          <StatBox value={g.lines.filter((l) => l.expiringSoon && l.state !== "Expired").length} label="Expiring" className={tone.soon} />
        </div>
      </div>
      {open && <div id={panelId} className="grid gap-2.5 border-t border-line bg-canvas/50 px-3 py-3 sm:px-4">{children}</div>}
    </Card>
  );
}

function LineCard({ l, busy, connected, onSend, onEdit, onSuspend, onRemove }: {
  l: ApprovedAirtimeLine; busy: boolean; connected: boolean;
  onSend: () => void; onEdit: () => void; onSuspend: (suspended: boolean) => void; onRemove: () => void;
}) {
  const period = airtimePeriod(l.plan.approvedAt, l.expiry, l.plan.monthlyAmountMinor, l.plan.renewalPriceMinor);
  const conn = l.connection ?? "Not checked";
  const connPill = { Online: pill.green, Offline: pill.amber, Expired: pill.red, "Not checked": pill.grey }[conn];
  const renewedWhileSuspended = l.state === "Suspended" && l.plan.suspendedReason === "Expired";
  const status: [string, string] = l.state === "Expired" ? ["Expired · suspended", pill.red] : l.state === "Suspended" ? ["Suspended", pill.grey] : ["Active", pill.green];
  const month: [string, string] | null = l.state === "Due" ? ["Due this month", pill.orange]
    : l.state === "Sent" ? (l.thisMonth?.status === "Unknown" ? ["Unconfirmed this month", pill.amber] : [`Sent this month · ${formatKes(l.thisMonth!.amountMinor)}`, pill.green])
    : l.state === "Expiry unknown" ? ["Expiry unknown", pill.amber]
    : l.state === "No SIM number" ? ["No valid SIM number", pill.red] : null;
  const label = l.vehiclePlate || l.imei;
  const expiryNote = l.expiry ? `${day(l.expiry)} (${l.plan.expirySource === "IMEI" ? "IMEI" : "custom"})` : l.lifelong && l.plan.expirySource === "IMEI" ? "Never (Lifelong)" : "Unknown";
  return (
    <article aria-label={`Subscription ${label}`} className="min-w-0 rounded-xl border border-line bg-white">
      <div className="flex items-start gap-2 px-3.5 pb-2.5 pt-3">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[15px] font-semibold">{label}</h3>
          <p className="truncate font-mono text-[12.5px] text-muted">{l.phone ?? (l.simNumber || "No SIM number")} · {l.imei}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <Pill className={connPill}>{conn}</Pill>
            <Pill className={status[1]}>{status[0]}</Pill>
            {month && <Pill className={month[1]}>{month[0]}</Pill>}
          </div>
        </div>
        <ActionsMenu small label={`Actions for ${label}`} items={[
          ...(l.state === "Due" ? [{ label: "Send this month's airtime", icon: Send, onSelect: onSend, disabled: busy || !connected }] : []),
          { label: "Edit", icon: Pencil, onSelect: onEdit },
          ...(l.plan.suspended
            ? l.state === "Expired" ? [] : [{ label: "Resume", icon: Play, onSelect: () => onSuspend(false), disabled: busy }]
            : [{ label: "Suspend", icon: Pause, onSelect: () => onSuspend(true), disabled: busy }]),
          { label: "Remove from airtime", icon: Trash2, onSelect: onRemove },
        ]} />
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 border-t border-line px-3.5 py-2.5 sm:grid-cols-3 xl:grid-cols-5">
        <Field label="Monthly airtime">{formatKes(l.plan.monthlyAmountMinor)}</Field>
        <Field label="Airtime renewal fee">{formatKes(l.plan.renewalPriceMinor)}</Field>
        <Field label={period.open ? "Airtime / year" : `Airtime · ${plural(period.months, "month")}`}>{formatKes(period.costMinor)}</Field>
        <Field label="Est. profit"><span className={period.profitMinor < 0 ? "text-[#C62828]" : "text-[#1B7A34]"}>{formatKes(period.profitMinor)}</span></Field>
        <Field label="Expiry" className="col-span-2 sm:col-span-1">{expiryNote}</Field>
      </dl>
      {(l.state === "Expired" || renewedWhileSuspended) && (
        <p className="border-t border-line px-3.5 py-2 text-[13px] text-muted">
          {l.state === "Expired"
            ? "Suspended automatically when the device expired. No airtime is sent. Renew the device (or set a later custom date with Edit), then resume."
            : "The device is no longer expired. Resume to start sending airtime again."}
        </p>
      )}
    </article>
  );
}

/** Remove a line from automatic airtime; choose what the sale's airtime service becomes (None, or the monthly alert SMS). */
function RemoveDialog({ line, onClose, onRemoved }: {
  line: ApprovedAirtimeLine;
  onClose: () => void;
  onRemoved: (d: AirtimeMonthly, next: "None" | "SMS reminder") => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [next, setNext] = useState<"None" | "SMS reminder">("None");
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    ref.current?.showModal();
  }, []);

  async function remove() {
    setBusy(true);
    const r = await erpApi.airtime.remove(line.saleId, next, "none", "");
    setBusy(false);
    if (!r.ok) return setErrors({ ...r.fieldErrors, ...(Object.keys(r.fieldErrors).length ? {} : { form: r.message }) });
    onRemoved(r.data.monthly, next);
  }

  const options = [
    ["None", "None", "No automatic airtime and no monthly SMS reminder for this customer."],
    ["SMS reminder", "Send the customer a monthly airtime alert (SMS)", "No automatic airtime; the customer gets a monthly reminder to top up instead."],
  ] as const;
  return (
    <dialog ref={ref} onClose={onClose} aria-labelledby="air-rm-title"
      className="m-auto max-h-[calc(100dvh-32px)] w-[calc(100%-32px)] max-w-lg overflow-y-auto rounded-2xl border border-line bg-white p-0 text-ink shadow-[0_24px_60px_rgba(10,29,44,0.25)] backdrop:bg-ink/50">
      <div className="flex flex-col gap-4 p-5 sm:p-6">
        <div className="flex items-center gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#FDECEA] text-[#C62828]" aria-hidden="true"><Trash2 size={20} /></span>
          <div className="min-w-0">
            <h2 id="air-rm-title" className="text-lg font-semibold leading-tight">Remove from airtime?</h2>
            <p className="truncate text-[13px] text-muted">{line.customerName} · {line.vehiclePlate || line.imei}</p>
          </div>
        </div>
        <p className="text-[14px]">The line stops getting automatic airtime. The change is saved in the sale&apos;s history and shows in Billing.</p>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-[13.5px] font-medium">Airtime service after removal</legend>
          {options.map(([v, t, d]) => (
            <label key={v} className={cn("flex cursor-pointer items-start gap-3 rounded-xl border px-3.5 py-3", next === v ? "border-navy bg-tint/40" : "border-line")}>
              <input type="radio" name="air-rm-next" className="mt-1 size-4 accent-[#0A1D2C]" checked={next === v} onChange={() => { setNext(v); setErrors({}); }} />
              <span className="text-[14px]">
                <span className="block font-semibold">{t}</span>
                <span className="block text-muted">{d}</span>
              </span>
            </label>
          ))}
          {errors.next && <p className="text-[13px] text-[#C62828]">{errors.next}</p>}
        </fieldset>
        {errors.form && <p role="alert" className="text-[13.5px] text-[#C62828]">{errors.form}</p>}
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} disabled={busy} className="min-h-11 rounded-xl border border-line px-4 text-[15px] font-semibold hover:bg-canvas">Cancel</button>
          <button type="button" onClick={() => void remove()} disabled={busy}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#C62828] px-5 text-[15px] font-semibold text-white hover:brightness-95 disabled:opacity-60">
            {busy && <Loader2 size={17} className="animate-spin" aria-hidden="true" />}Remove from airtime
          </button>
        </div>
      </div>
    </dialog>
  );
}
