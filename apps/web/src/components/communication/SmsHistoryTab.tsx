"use client";

import { useState } from "react";
import { CalendarClock, ChevronDown, Loader2, RefreshCw } from "lucide-react";
import { Card } from "@/components/dashboard/Card";
import { cn } from "@/lib/cn";
import { erpApi } from "@/lib/erp-api";
import { audienceLabel, localPhone, type SmsBatch, type SmsKind } from "@/lib/sms";
import { Loading, SmsStatusPill, smsStatusStyle, smsWhen } from "./sms-shared";

const KINDS: (SmsKind | "")[] = ["", "Customers", "AirtimeReminder", "ExpiryReminder", "OneOff", "System"];

/** Communication → Bulk SMS → History: every send; open one to see each message and check its delivery. */
export function SmsHistoryTab({ history, kind, setKind, connected }: {
  history: SmsBatch[] | null;
  kind: SmsKind | "";
  setKind: (k: SmsKind | "") => void;
  connected: boolean;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, SmsBatch>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggle(id: string) {
    if (open === id) return setOpen(null);
    setOpen(id);
    setError(null);
    if (!details[id]) {
      const r = await erpApi.sms.batch(id);
      if (r.ok) setDetails((d) => ({ ...d, [id]: r.data }));
      else setError(r.message);
    }
  }
  async function delivery(id: string) {
    setBusy(id);
    setError(null);
    const r = await erpApi.sms.delivery(id);
    setBusy(null);
    if (r.ok) setDetails((d) => ({ ...d, [id]: r.data }));
    else setError(r.fieldErrors.form ?? r.message);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <label htmlFor="sms-hist-kind" className="text-[13.5px] font-medium">Show</label>
        <select id="sms-hist-kind" value={kind} onChange={(e) => { setKind(e.target.value as SmsKind | ""); setOpen(null); }}
          className="min-h-11 rounded-xl border border-line bg-white px-3 text-[14.5px]">
          {KINDS.map((k) => <option key={k} value={k}>{k ? audienceLabel[k] : "All sends"}</option>)}
        </select>
      </div>
      {error && <p role="alert" className="text-[14px] text-[#C62828]">{error}</p>}
      {!history ? <Loading /> : history.length === 0 ? <Card className="px-5 py-10 text-center text-muted">No SMS sent yet.</Card> : (
        <ul aria-label="SMS sends" className="flex flex-col gap-3">
          {history.map((summary) => {
            const b = details[summary.id] ?? summary;
            const isOpen = open === b.id;
            const waiting = b.recipients - b.sent - b.failed;
            return (
              <li key={b.id}>
                <Card className="overflow-hidden">
                  <button type="button" aria-expanded={isOpen} onClick={() => void toggle(b.id)}
                    className="flex w-full flex-wrap items-center gap-x-5 gap-y-1.5 px-4 py-3.5 text-left hover:bg-canvas/50 sm:px-5">
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-semibold">
                        <span className="mr-2 rounded-full bg-tint px-2 py-0.5 align-middle text-[11.5px] font-semibold text-navy">{audienceLabel[b.kind]}</span>
                        {b.recipients} recipient{b.recipients === 1 ? "" : "s"}{b.templateName ? ` · ${b.templateName}` : ""}
                      </span>
                      <span className="block truncate text-[13px] text-muted">{b.message}</span>
                      <span className="block text-[12.5px] text-muted">
                        {smsWhen(b.createdAt)}{b.createdBy ? ` · ${b.createdBy}` : ""}
                        {b.scheduledFor && <span className="ml-1 inline-flex items-center gap-1"><CalendarClock size={13} aria-hidden="true" />for {smsWhen(b.scheduledFor)}</span>}
                      </span>
                    </span>
                    <span className="flex flex-wrap items-center gap-2 text-[13px]">
                      <span className={cn("rounded-full px-2.5 py-0.5 font-semibold", b.sent > 0 ? smsStatusStyle.Sent : "bg-canvas text-muted")}>{b.sent} {b.scheduledFor ? "accepted" : "sent"}</span>
                      {b.delivered > 0 && <span className={cn("rounded-full px-2.5 py-0.5 font-semibold", smsStatusStyle.Delivered)}>{b.delivered} delivered</span>}
                      {b.failed > 0 && <span className={cn("rounded-full px-2.5 py-0.5 font-semibold", smsStatusStyle.Failed)}>{b.failed} failed</span>}
                      {waiting > 0 && <span className={cn("rounded-full px-2.5 py-0.5 font-semibold", smsStatusStyle.Unknown)}>{waiting} unconfirmed</span>}
                    </span>
                    <ChevronDown size={18} className={cn("shrink-0 text-muted transition-transform", isOpen && "rotate-180")} aria-hidden="true" />
                  </button>
                  {isOpen && (
                    <div className="border-t border-line px-4 py-3 sm:px-5">
                      {b.error && <p className="mb-2 rounded-lg bg-[#FFF4E5] px-3 py-2 text-[13.5px] text-[#7a3d00]">{b.error}</p>}
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <p className="text-[13.5px] text-muted">{b.parts} SMS credit{b.parts === 1 ? "" : "s"} used</p>
                        <button type="button" onClick={() => void delivery(b.id)} disabled={!connected || busy === b.id || b.sent === 0}
                          className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-[13.5px] font-semibold text-navy hover:bg-tint disabled:opacity-60">
                          {busy === b.id ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <RefreshCw size={14} aria-hidden="true" />}Check delivery
                        </button>
                      </div>
                      {!b.messages ? <Loading /> : (
                        <ul className="divide-y divide-line">
                          {b.messages.map((m) => (
                            <li key={m.id} className="flex flex-wrap items-start justify-between gap-2 py-2.5 text-[14px]">
                              <span className="min-w-0 flex-1">
                                <span className="font-medium">{m.customerName || localPhone(m.phone)}</span>
                                <span className="text-muted">{m.vehiclePlate && ` · ${m.vehiclePlate}`}{m.customerName && <> · <span className="font-mono">{localPhone(m.phone)}</span></>}</span>
                                <span className="block whitespace-pre-wrap break-words text-[13px] text-muted">{m.message}</span>
                                {m.error && <span className="block text-[13px] text-[#B71C1C]">{m.error}</span>}
                                {!m.error && m.dlr && <span className="block text-[12.5px] text-muted">Delivery report: {m.dlr}</span>}
                              </span>
                              <SmsStatusPill status={m.status} />
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
