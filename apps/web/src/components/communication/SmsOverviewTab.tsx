"use client";

import type { ReactNode } from "react";
import { AlertTriangle, BellRing, CalendarClock, CheckCheck, CircleSlash, MessageSquareText, Phone, RefreshCw, Send, Smartphone, Users, Wallet } from "lucide-react";
import { Card } from "@/components/dashboard/Card";
import { cn } from "@/lib/cn";
import type { SmsOverview } from "@/lib/sms";
import { Loading } from "./sms-shared";

const monthName = (ym: string) => new Date(`${ym}-15T12:00:00Z`).toLocaleDateString("en-KE", { month: "long", year: "numeric", timeZone: "UTC" });

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
  const cls = "flex min-w-0 items-center gap-3 rounded-2xl border border-line bg-white px-4 py-4 text-left shadow-[0_1px_2px_rgba(16,32,48,0.04)]";
  return onClick ? <button type="button" onClick={onClick} className={cn(cls, "hover:border-navy/40")}>{body}</button> : <div className={cls}>{body}</div>;
}

export type SmsGo = "send-customers" | "send-phones" | "reminders-airtime" | "reminders-expiry" | "history";

/** Communication → Bulk SMS → Overview. */
export function SmsOverviewTab({ data, onReload, go }: { data: SmsOverview | null; onReload: () => void; go: (to: SmsGo) => void }) {
  if (!data) return <Loading />;
  return (
    <div className="flex flex-col gap-5">
      <section aria-labelledby="sms-ov-h" className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <h2 id="sms-ov-h" className="text-[13px] font-semibold uppercase tracking-wide text-muted">Overview · {monthName(data.month)}</h2>
          <button type="button" onClick={onReload} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 text-[13.5px] font-semibold text-navy hover:bg-tint">
            <RefreshCw size={14} aria-hidden="true" />Refresh
          </button>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Kpi icon={<Wallet size={20} />} accent="bg-[#FFF1EA] text-brand" label="SMS credit"
            value={data.balance ?? <span className="text-[16px] text-muted">{data.configured ? "Unavailable" : "Not set up"}</span>}
            sub={data.balance ? "TextSMS account" : data.configured ? (data.balanceError ?? "Could not read the balance") : "Ask the system administrator to set it up"} />
          <Kpi icon={<Send size={20} />} accent="bg-[#E8F0FB] text-[#1F5FAD]" label="Sent this month" onClick={() => go("history")}
            value={data.sentThisMonth.toLocaleString("en-KE")} sub={`${data.partsThisMonth.toLocaleString("en-KE")} SMS credits used`} />
          <Kpi icon={<CheckCheck size={20} />} accent="bg-[#E6F4EA] text-[#1B5E20]" label="Delivered" onClick={() => go("history")}
            value={data.deliveredThisMonth.toLocaleString("en-KE")} sub="Confirmed by delivery reports" />
          <Kpi icon={<AlertTriangle size={20} />} accent="bg-[#FDECEA] text-[#B71C1C]" label="Failed" onClick={() => go("history")}
            value={data.failedThisMonth.toLocaleString("en-KE")} sub="This month" />
          <Kpi icon={<Smartphone size={20} />} accent="bg-[#FFF4E5] text-[#9a3300]" label="Airtime reminders due" onClick={() => go("reminders-airtime")}
            value={data.airtimeRemindersDue} sub="Monthly airtime alert SMS" />
          <Kpi icon={<BellRing size={20} />} accent="bg-[#FFF4E5] text-[#9a3300]" label="Expiring soon" onClick={() => go("reminders-expiry")}
            value={data.expiringSoon} sub="Devices in the next 30 days" />
          <Kpi icon={<CircleSlash size={20} />} accent="bg-[#FDECEA] text-[#B71C1C]" label="Expired" onClick={() => go("reminders-expiry")}
            value={data.expired} sub="Devices, last 90 days" />
          <Kpi icon={<CalendarClock size={20} />} accent="bg-[#EEF1F4] text-[#3d4b57]" label="Scheduled" onClick={() => go("history")}
            value={data.scheduled} sub="SMS waiting to go out" />
        </div>
      </section>

      <section aria-labelledby="sms-quick-h">
        <Card className="flex flex-col gap-4 p-4 sm:p-5">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-[#FFF1EA] text-brand" aria-hidden="true"><MessageSquareText size={20} /></span>
            <div>
              <h2 id="sms-quick-h" className="text-[16px] font-semibold leading-tight">Send an SMS</h2>
              <p className="text-[13px] text-muted">{data.customersWithPhone.toLocaleString("en-KE")} customers have a phone number.</p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <button type="button" onClick={() => go("send-customers")}
              className="flex min-h-12 items-center gap-3 rounded-xl border border-line px-4 py-3 text-left hover:border-navy/40 hover:bg-canvas/50">
              <Users size={19} className="shrink-0 text-navy" aria-hidden="true" />
              <span><span className="block text-[15px] font-semibold">To customers</span><span className="block text-[13px] text-muted">All, a filtered group, or the ones you tick</span></span>
            </button>
            <button type="button" onClick={() => go("send-phones")}
              className="flex min-h-12 items-center gap-3 rounded-xl border border-line px-4 py-3 text-left hover:border-navy/40 hover:bg-canvas/50">
              <Phone size={19} className="shrink-0 text-navy" aria-hidden="true" />
              <span><span className="block text-[15px] font-semibold">One-off to phone numbers</span><span className="block text-[13px] text-muted">Type or paste any numbers</span></span>
            </button>
          </div>
        </Card>
      </section>
    </div>
  );
}
