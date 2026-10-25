"use client";

import { useState, type ReactNode } from "react";
import { CalendarClock, ChevronDown, ExternalLink } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatKes } from "@/lib/sales-format";
import { localPhone, ordinal, smsDate, type SmsReminderLine } from "@/lib/sms";
import { validatePhone } from "@/lib/validation";
import { SmsStatusPill, smsWhen } from "./sms-shared";
import { stateStyle, subscribedText } from "./SmsRemindersTab";

const connectionStyle = {
  Online: "bg-[#E6F4EA] text-[#1B5E20]",
  Offline: "bg-[#FFF4E5] text-[#9a3300]",
  Expired: "bg-[#FDECEA] text-[#B71C1C]",
} as const;

const shortDate = (iso: string) => new Date(iso).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Nairobi" });
const simText = (raw: string) => {
  if (!raw) return "—";
  const p = validatePhone(raw);
  return p.error ? raw : localPhone(p.value);
};

function Field({ label, children, mono }: { label: string; children: ReactNode; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</dt>
      <dd className={cn("mt-0.5 break-words text-[14px] font-semibold text-ink", mono && "break-all font-mono text-[13px] font-medium sm:text-[13.5px]")}>{children}</dd>
    </div>
  );
}

/**
 * Bulk SMS → SMS Reminders → a customer → one vehicle: the device, its package and renewal, the SIM and its monthly
 * reminder, and every sale of the device.
 */
export function SmsVehicleCard({ l, next, onViewSale }: { l: SmsReminderLine; next: string | null; onViewSale: (saleId: string) => void }) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const label = l.vehiclePlate || l.imei;
  const histId = `veh-hist-${l.saleId}`;
  return (
    <article aria-label={`Vehicle ${label}`} className="rounded-2xl border border-line bg-white shadow-[0_1px_2px_rgba(16,32,48,0.04)]">
      <header className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 px-4 pt-3.5">
        <h3 className="text-[16px] font-semibold tracking-tight">{label}</h3>
        {l.model && <span className="text-[13px] text-muted">· {l.model}</span>}
        <span className={cn("rounded-full px-2 py-0.5 text-[12px] font-semibold", l.connection ? connectionStyle[l.connection] : "bg-[#EEF1F4] text-[#3d4b57]")}>
          {l.connection ?? (l.checkedAt ? "Status unknown" : "Not checked")}
        </span>
        <span className={cn("rounded-full px-2 py-0.5 text-[12px] font-semibold", stateStyle[l.state])}>{l.state}</span>
        <button type="button" onClick={() => onViewSale(l.saleId)} aria-label={`View sale of ${label}`}
          className="ml-auto inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-[13.5px] font-semibold text-brand hover:bg-[#FFF1EA]">
          View sale<ExternalLink size={14} aria-hidden="true" />
        </button>
      </header>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 px-4 py-3.5 sm:gap-x-6 lg:grid-cols-4">
        <Field label="IMEI" mono>{l.imei}</Field>
        <Field label="Model">{l.model ?? <span className="font-normal text-muted">Unknown</span>}</Field>
        <Field label="Package">{l.packageName} <span className="font-normal text-muted">· {l.saleType}</span></Field>
        <Field label="Package price">{formatKes(l.packagePriceMinor)}</Field>
        <Field label="Renewal fee">{l.renewalFeeMinor !== null ? formatKes(l.renewalFeeMinor) : <span className="font-normal text-muted">Not set</span>}</Field>
        <Field label="Platform expiry">{l.expiry ? smsDate(l.expiry) : <span className="font-normal text-muted">Never expires</span>}</Field>
        <Field label="Activated">{smsDate(l.activationDate)}</Field>
        <Field label="SIM number" mono>{simText(l.simNumber)}</Field>
        <Field label="SMS reminder">Every {ordinal(l.smsDay)} of the month</Field>
        <Field label="Next reminder">
          {next ? <span className="inline-flex items-center gap-1.5"><CalendarClock size={14} className="text-muted" aria-hidden="true" />{smsDate(next)}</span> : <span className="font-normal text-muted">None ({l.state.toLowerCase()})</span>}
        </Field>
        <Field label="Last reminder">
          {l.last ? <span className="inline-flex flex-wrap items-center gap-1.5"><SmsStatusPill status={l.last.status} /><span className="font-normal">{smsWhen(l.last.at)}</span></span> : <span className="font-normal text-muted">Never sent</span>}
        </Field>
        <Field label="Last checked">{l.checkedAt ? smsWhen(l.checkedAt) : <span className="font-normal text-muted">Not checked yet</span>}</Field>
      </dl>
      {l.subscribed && <p className="px-4 pb-3 text-[12.5px] text-muted">{subscribedText(l.subscribed)}{l.reminders > 0 ? ` · ${l.reminders} reminder${l.reminders === 1 ? "" : "s"} sent` : ""}</p>}

      <div className="border-t border-line">
        <button type="button" onClick={() => setHistoryOpen((o) => !o)} aria-expanded={historyOpen} aria-controls={histId}
          className="flex min-h-11 w-full items-center justify-between gap-2 px-4 text-left text-[12px] font-semibold uppercase tracking-wide text-muted hover:bg-canvas/60">
          Sales history ({l.history.length})
          <ChevronDown size={17} className={cn("shrink-0 transition-transform", historyOpen && "rotate-180")} aria-hidden="true" />
        </button>
        {historyOpen && (
          <ol id={histId} aria-label={`Sales of ${label}`} className="divide-y divide-line border-t border-line">
            {l.history.map((h) => (
              <li key={h.saleId} className="flex items-center gap-x-3 px-4 py-2.5 text-[13.5px]">
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="font-semibold">{shortDate(h.at)}</span>
                    {h.saleId === l.saleId && <span className="rounded-full bg-tint px-2 py-0.5 text-[11.5px] font-semibold text-navy">Current</span>}
                  </span>
                  <span className="block text-[12.5px] text-muted">{h.type} · {h.packageName} · {h.cardType}</span>
                </span>
                <span className="font-semibold tabular-nums">{formatKes(h.totalMinor)}</span>
                <button type="button" onClick={() => onViewSale(h.saleId)} aria-label={`View sale of ${shortDate(h.at)}`} className="min-h-8 rounded-md px-1.5 text-[13px] font-semibold text-navy hover:bg-tint">View</button>
              </li>
            ))}
          </ol>
        )}
      </div>
    </article>
  );
}
