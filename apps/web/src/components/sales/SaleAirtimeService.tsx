"use client";

import { useState } from "react";
import { ArrowRight, History, Loader2, PauseCircle, Pencil, PlayCircle } from "lucide-react";
import { cn } from "@/lib/cn";
import { erpApi } from "@/lib/erp-api";
import { SIM_SERVICES, simServiceOf, type AirtimeLineStatus, type PackageSale, type Sale, type SimService } from "@/lib/sales";

const pillStyle: Record<AirtimeLineStatus, string> = {
  "Waiting for approval": "bg-[#FFF4E5] text-[#9a3300]",
  Active: "bg-[#E6F4EA] text-[#1B5E20]",
  Suspended: "bg-[#EEF1F4] text-[#3d4b57]",
  "Suspended (device expired)": "bg-[#FDECEA] text-[#B71C1C]",
};

/** Where an automatic-airtime line stands (Sales history, Sale details, Billing). */
export function AirtimeStatusPill({ status, prefix = false }: { status: AirtimeLineStatus; prefix?: boolean }) {
  return <span className={cn("inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[12px] font-semibold", pillStyle[status])}>{prefix ? `Airtime: ${status}` : status}</span>;
}

/** SMS reminder lines: whether this month's airtime reminder went (Sales history, Sale details, Billing). */
export function SmsReminderPill({ status, prefix = false }: { status: "Due" | "Sent this month"; prefix?: boolean }) {
  return (
    <span className={cn("inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[12px] font-semibold", status === "Due" ? "bg-[#FFF1EA] text-brand" : "bg-[#E6F4EA] text-[#1B5E20]")}>
      {prefix ? `SMS reminder: ${status === "Due" ? "due" : "sent this month"}` : status === "Due" ? "Reminder due this month" : "Reminder sent this month"}
    </span>
  );
}

const label: Record<SimService, string> = { None: "None", "SMS reminder": "Monthly airtime SMS reminder", "Automatic airtime recharge": "Automatic airtime recharge" };
const when = (iso: string) => new Date(iso).toLocaleString("en-KE", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Nairobi" });

/**
 * Sale details → Airtime service: the current choice for the sold SIM, a way to change it, and every earlier choice.
 * The same record drives Billing, Bulk SMS and Communication → Airtime.
 */
export function SaleAirtimeService({ sale, onUpdated }: { sale: PackageSale; onUpdated?: (s: Sale) => void }) {
  const [sim, setSim] = useState(sale.sim);
  const [editing, setEditing] = useState(false);
  const current = simServiceOf(sim.smsReminder, sim.autoRecharge);
  const [to, setTo] = useState<SimService>(current);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  if (sim.iotBilling) return null; // IoT SIMs are billed under Billing → IoT SIM; airtime services never apply.

  async function save() {
    if (to === current) return setError("Choose a different service");
    setBusy(true);
    setError(null);
    const r = await erpApi.sales.changeService(sale.id, to, reason.trim());
    setBusy(false);
    if (!r.ok) return setError(r.fieldErrors.service ?? r.fieldErrors.reason ?? r.message);
    if (r.data.type !== "Retailer Sale") setSim(r.data.sim);
    setEditing(false);
    setReason("");
    setNotice(to === "Automatic airtime recharge" ? "Changed. The line now waits for approval in Communication → Airtime → Approval."
      : to === "SMS reminder" ? "Changed. The line now gets the monthly airtime reminder in Communication → Bulk SMS → Reminders." : "Changed.");
    onUpdated?.(r.data);
  }

  return (
    <section className="flex flex-col gap-3" aria-labelledby={`svc-${sale.id}`}>
      <div className="flex items-center justify-between gap-2">
        <h3 id={`svc-${sale.id}`} className="text-[13px] font-semibold uppercase tracking-wide text-muted">Airtime service</h3>
        {!editing && (
          <button type="button" onClick={() => { setEditing(true); setTo(current); setError(null); setNotice(null); }}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 text-[13.5px] font-semibold text-navy hover:bg-tint">
            <Pencil size={14} aria-hidden="true" />Change
          </button>
        )}
      </div>
      <p className="flex flex-wrap items-center gap-2 text-[15px] font-medium">
        {label[current]}
        {sim.airtimeStatus && <AirtimeStatusPill status={sim.airtimeStatus} />}
      </p>
      {sim.airtimeStatus?.startsWith("Suspended") && (
        <p className="text-[13px] text-muted">
          {sim.airtimeStatus === "Suspended (device expired)"
            ? "Automatic airtime is suspended because the device expired. It restarts only after the device is renewed and the line is resumed in Communication → Airtime."
            : "Automatic airtime is suspended. Resume it in Communication → Airtime → Subscriptions."}
        </p>
      )}
      {current === "SMS reminder" && sim.reminder && (
        <div className="flex flex-col gap-1.5 rounded-xl bg-canvas px-3.5 py-3 text-[13.5px]">
          <p className="flex flex-wrap items-center gap-2">
            <SmsReminderPill status={sim.reminder.status} />
            <span className="text-muted">
              {sim.reminder.total === 0 ? "No reminder sent yet." : `${sim.reminder.total} reminder${sim.reminder.total === 1 ? "" : "s"} sent.`} Sent from Communication → Bulk SMS → Reminders.
            </span>
          </p>
          {sim.reminder.recent.length > 0 && (
            <ul aria-label="Monthly airtime reminders sent" className="flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-muted">
              {sim.reminder.recent.map((m) => <li key={m.at}>{when(m.at)} · <span className={m.status === "Failed" ? "text-[#B71C1C]" : m.status === "Delivered" ? "text-[#1B5E20]" : ""}>{m.status}</span></li>)}
            </ul>
          )}
        </div>
      )}
      {notice && <p role="status" className="rounded-xl bg-[#E6F4EA] px-3.5 py-2.5 text-[13.5px] text-[#1B5E20]">{notice}</p>}

      {editing && (
        <div className="flex flex-col gap-3 rounded-xl border border-line p-3.5">
          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1 text-[13.5px] font-medium">New airtime service</legend>
            {SIM_SERVICES.map((sv) => (
              <label key={sv} className={cn("flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg px-2 text-[14.5px]", to === sv && "bg-tint/50")}>
                <input type="radio" name={`svc-to-${sale.id}`} className="size-4 accent-[#FE5102]" checked={to === sv} onChange={() => { setTo(sv); setError(null); }} />
                {label[sv]}{sv === current && <span className="text-[12.5px] text-muted">(current)</span>}
              </label>
            ))}
          </fieldset>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13.5px] font-medium">Reason (optional)</span>
            <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder="e.g. Customer asked for automatic airtime"
              className="min-h-11 rounded-xl border border-line bg-white px-3.5 text-[15px]" />
          </label>
          {to !== current && (
            <p className="text-[13px] text-muted">
              {current === "Automatic airtime recharge" ? "Automatic airtime stops and its approval is removed. " : ""}
              {to === "Automatic airtime recharge" ? "The line will wait for approval in Communication → Airtime. " : ""}
              The previous choice stays in the history below.
            </p>
          )}
          {error && <p role="alert" className="text-[13.5px] text-[#C62828]">{error}</p>}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" onClick={() => setEditing(false)} disabled={busy} className="min-h-11 rounded-xl border border-line px-4 text-[15px] font-semibold hover:bg-canvas">Cancel</button>
            <button type="button" onClick={() => void save()} disabled={busy || to === current}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-navy px-5 text-[15px] font-semibold text-white hover:brightness-110 disabled:opacity-60">
              {busy && <Loader2 size={17} className="animate-spin" aria-hidden="true" />}Save change
            </button>
          </div>
        </div>
      )}

      {sim.serviceChanges.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="flex items-center gap-1.5 text-[12.5px] font-semibold text-muted"><History size={14} aria-hidden="true" />Changes</p>
          <ol aria-label="Airtime service changes" className="flex flex-col divide-y divide-line rounded-xl border border-line">
            {sim.serviceChanges.map((c, i) => (
              <li key={i} className="flex flex-col gap-0.5 px-3.5 py-2.5 text-[13.5px]">
                {c.kind === "Service" ? (
                  <span className="flex flex-wrap items-center gap-1.5 font-medium">
                    <span className="text-muted line-through decoration-1">{label[c.from]}</span>
                    <ArrowRight size={14} className="text-muted" aria-label="changed to" />
                    <span>{label[c.to]}</span>
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 font-medium">
                    {c.kind === "Suspended" ? <PauseCircle size={15} className="text-[#7a3d00]" aria-hidden="true" /> : <PlayCircle size={15} className="text-[#1B5E20]" aria-hidden="true" />}
                    Automatic airtime {c.kind === "Suspended" ? "suspended" : "resumed"}
                  </span>
                )}
                <span className="text-[12.5px] text-muted">
                  {when(c.at)} · {c.by ?? "Automatic"}{c.reason ? ` · ${c.reason}` : ""}
                  {c.sms && <span className={c.sms.status === "Sent" ? "text-[#1B5E20]" : "text-[#B71C1C]"}> · SMS to customer {c.sms.status === "Sent" ? "sent" : `failed${c.sms.error ? ` (${c.sms.error})` : ""}`}</span>}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}
