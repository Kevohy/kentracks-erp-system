"use client";

import { useMemo, useState } from "react";
import { RefreshCw, Search } from "lucide-react";
import { Card } from "@/components/dashboard/Card";
import { cn } from "@/lib/cn";
import { daysLeftText, fieldValues, localPhone, SMS_MAX_RECIPIENTS, smsDate, type ReminderState, type SmsBatch, type SmsReminderLine, type SmsTemplate } from "@/lib/sms";
import { formatKes } from "@/lib/sales-format";
import { emptyDraft, SmsComposer, type SmsDraft } from "./SmsComposer";
import { SmsSendBar, type SmsTarget } from "./SmsSendBar";
import { Loading, SmsResult, SmsStatusPill, smsWhen } from "./sms-shared";

export type ReminderType = "airtime" | "expiry";

export const stateStyle: Record<ReminderState, string> = {
  Due: "bg-[#FFF1EA] text-brand",
  "Sent this month": "bg-[#E6F4EA] text-[#1B5E20]",
  "No phone": "bg-[#FDECEA] text-[#B71C1C]",
  "Device expired": "bg-[#EEF1F4] text-[#3d4b57]",
  Blocked: "bg-[#3d4b57] text-white",
  "Expiring soon": "bg-[#FFF4E5] text-[#9a3300]",
  Expired: "bg-[#FDECEA] text-[#B71C1C]",
};

const FILTERS: Record<ReminderType, readonly string[]> = {
  airtime: ["Due", "Sent this month", "All"],
  expiry: ["All", "Expiring soon", "Expired"],
};

const shortDate = (iso: string) => new Date(iso).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Nairobi" });
const serviceName = { None: "no airtime service", "Automatic airtime recharge": "automatic airtime" } as const;

/** From the sale's history: since when, and how, the line is on the SMS reminder. */
export const subscribedText = (s: NonNullable<SmsReminderLine["subscribed"]>) =>
  s.how === "At sale"
    ? `On SMS reminder since the sale (${shortDate(s.at)})`
    : `On SMS reminder since ${shortDate(s.at)}, changed from ${s.from ? serviceName[s.from] : "another service"}${s.by ? ` by ${s.by}` : ""}${s.reason ? ` · ${s.reason}` : ""}`;

/** Expiry lines without a phone still count as expiring or expired. */
const matches = (l: SmsReminderLine, f: string) =>
  f === "All" || l.state === f ||
  (l.state === "No phone" && ((f === "Expired" && (l.daysLeft === null || l.daysLeft < 0)) || (f === "Expiring soon" && l.daysLeft !== null && l.daysLeft >= 0)));

/** Communication → Bulk SMS → Expiring Devices: expiry & renewal reminders to customers. */
export function SmsExpiringTab({ lines, templates, connected, onReload, onSent }: {
  lines: SmsReminderLine[] | null;
  templates: SmsTemplate[] | null;
  connected: boolean;
  onReload: () => void;
  onSent: () => void;
}) {
  const [result, setResult] = useState<SmsBatch | null>(null);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="max-w-3xl text-[13.5px] text-muted">
          Devices expiring in the next 30 days, and devices that expired in the last 90 days. Pick them and send an expiry &amp; renewal reminder to the customer&apos;s phone.
        </p>
        <button type="button" onClick={onReload} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 text-[13.5px] font-semibold text-navy hover:bg-tint">
          <RefreshCw size={14} aria-hidden="true" />Refresh
        </button>
      </div>
      {result && <SmsResult batch={result} onClose={() => setResult(null)} />}
      <ReminderList type="expiry" lines={lines} templates={templates} connected={connected} onSent={(b) => { setResult(b); onSent(); }} />
    </div>
  );
}

export function ReminderList({ type, lines, templates, connected, onSent }: { type: ReminderType; lines: SmsReminderLine[] | null; templates: SmsTemplate[] | null; connected: boolean; onSent: (b: SmsBatch) => void }) {
  const audience = type === "airtime" ? "AirtimeReminder" : "ExpiryReminder";
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState(FILTERS[type][0]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [draft, setDraft] = useState<SmsDraft>(() => emptyDraft(audience));
  const [errors, setErrors] = useState<Record<string, string>>({});

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (lines ?? []).filter((l) => matches(l, filter) &&
      (!s || [l.customerName, l.vehiclePlate, l.imei, l.simNumber, l.phone ?? ""].some((v) => v.toLowerCase().includes(s))));
  }, [lines, q, filter]);
  const sendable = shown.filter((l) => l.selectable);
  const allShownPicked = sendable.length > 0 && sendable.every((l) => picked.has(l.saleId));
  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleAll = () => setPicked((p) => {
    const n = new Set(p);
    if (allShownPicked) sendable.forEach((l) => n.delete(l.saleId));
    else for (const l of sendable) { if (n.size >= SMS_MAX_RECIPIENTS) break; n.add(l.saleId); }
    return n;
  });
  const targets: SmsTarget[] = (lines ?? []).filter((l) => picked.has(l.saleId) && l.selectable)
    .map((l) => ({ id: l.saleId, label: `${l.customerName} (${l.vehiclePlate || l.imei})`, values: fieldValues(audience, l) }));

  return (
    <>
      <Card className="flex flex-col gap-3 p-4 sm:p-5 lg:flex-row lg:items-center">
        <label className="relative block flex-1">
          <span className="sr-only">Search tracker lines</span>
          <Search size={18} className="pointer-events-none absolute left-3.5 top-3.5 text-muted" aria-hidden="true" />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search customer, plate, IMEI or phone"
            className="min-h-11 w-full rounded-xl border border-line bg-white pl-10 pr-3.5 text-[15px]" />
        </label>
        <div className="flex flex-wrap gap-1 rounded-xl bg-canvas p-1">
          {FILTERS[type].map((f) => {
            const n = (lines ?? []).filter((l) => matches(l, f)).length;
            return (
              <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}
                className={cn("min-h-9 rounded-lg px-3 text-[13.5px] font-semibold", filter === f ? "bg-white text-navy shadow-sm" : "text-muted")}>
                {f} <span className="tabular-nums opacity-70">{n}</span>
              </button>
            );
          })}
        </div>
      </Card>

      <Card className="overflow-hidden">
        {!lines ? <div className="px-5 py-10"><Loading /></div> : shown.length === 0 ? (
          <p className="px-5 py-10 text-center text-muted">
            {lines.length === 0
              ? type === "airtime" ? "No sales are on the monthly airtime alert SMS. Choose \"SMS reminder\" on a sale (or in Airtime → Remove from airtime) to add one." : "No devices are expiring soon or recently expired."
              : filter === "Due" ? "Every line got this month's reminder." : "No lines match."}
          </p>
        ) : (
          <>
            <div className="flex items-center gap-3 border-b border-line bg-canvas/60 px-4 py-2.5 sm:px-5">
              <input id={`rem-all-${type}`} type="checkbox" className="size-5 accent-[#FE5102]" checked={allShownPicked} onChange={toggleAll} disabled={sendable.length === 0} />
              <label htmlFor={`rem-all-${type}`} className="text-[13.5px] font-semibold text-muted">Select all {type === "airtime" ? "due" : "with a phone"} ({sendable.length})</label>
              {picked.size > 0 && <button type="button" onClick={() => setPicked(new Set())} className="ml-auto text-[13px] font-semibold text-navy underline">Clear ({picked.size})</button>}
            </div>
            <ul aria-label="Tracker lines" className="max-h-[60vh] divide-y divide-line overflow-y-auto">
              {shown.map((l) => {
                const id = `rem-${l.saleId}`;
                return (
                  <li key={l.saleId} className={cn("flex items-start gap-3 px-4 py-3 sm:px-5", picked.has(l.saleId) && "bg-[#FFF8F4]")}>
                    <input id={id} type="checkbox" className="mt-1 size-5 shrink-0 accent-[#FE5102]" disabled={!l.selectable} checked={picked.has(l.saleId)} onChange={() => toggle(l.saleId)} />
                    <label htmlFor={id} className="grid min-w-0 flex-1 gap-x-6 gap-y-1 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)]">
                      <span className="min-w-0">
                        <span className="block truncate text-[15px] font-semibold">{l.customerName}</span>
                        <span className="block truncate text-[13px] text-muted">{[l.vehiclePlate, l.imei, l.saleType].filter(Boolean).join(" · ")}</span>
                        {l.subscribed && <span className="block text-[12.5px] text-muted">{subscribedText(l.subscribed)}</span>}
                      </span>
                      <span className="min-w-0 text-[14px]">
                        <span className={cn("block truncate", l.phone ? "font-mono" : "text-[13px] text-[#B71C1C]")}>{l.phone ? localPhone(l.phone) : "Customer has no valid phone"}</span>
                        <span className="block truncate text-[13px] text-muted">
                          {type === "airtime"
                            ? <>Tracker SIM <span className="font-mono">{l.simNumber || "—"}</span></>
                            : <>{l.expiry ? `Expires ${smsDate(l.expiry)} (${daysLeftText(l.daysLeft)})` : "Expired"}{l.renewalFeeMinor !== null && ` · ${formatKes(l.renewalFeeMinor)}`}</>}
                        </span>
                      </span>
                      <span className="flex flex-col gap-1 text-[13px] text-muted sm:items-end">
                        <span className={cn("w-fit rounded-full px-2 py-0.5 text-[12px] font-semibold", stateStyle[l.state])}>{l.state}</span>
                        {l.last ? <span className="flex flex-wrap items-center gap-1.5 sm:justify-end">Last: <SmsStatusPill status={l.last.status} /> {smsWhen(l.last.at)}</span> : <span>Never reminded</span>}
                        {l.reminders > 0 && <span>{l.reminders} reminder{l.reminders === 1 ? "" : "s"} sent in total</span>}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </Card>

      <SmsComposer audience={audience} templates={templates} draft={draft} onChange={(d) => { setDraft(d); setErrors({}); }} errors={errors}
        preview={targets[0] ? { label: targets[0].label, values: targets[0].values } : null} />
      <SmsSendBar audience={audience} targets={targets} draft={draft} connected={connected} onErrors={setErrors}
        onSent={(b) => { setPicked(new Set()); onSent(b); }} />
    </>
  );
}
