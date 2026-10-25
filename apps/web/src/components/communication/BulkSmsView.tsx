"use client";

import { useCallback, useEffect, useState } from "react";
import { BellRing, CalendarClock, FileText, History, PenSquare } from "lucide-react";
import { PageHeader } from "@/components/shell/PageHeader";
import { cn } from "@/lib/cn";
import { erpApi } from "@/lib/erp-api";
import type { SmsBatch, SmsCustomer, SmsKind, SmsReminderLine, SmsReminderSettings, SmsTemplate } from "@/lib/sms";
import { SmsHistoryTab } from "./SmsHistoryTab";
import { SmsReminderCustomers } from "./SmsReminderCustomers";
import { SmsExpiringTab } from "./SmsRemindersTab";
import { SmsSendTab } from "./SmsSendTab";
import { SmsTemplatesTab } from "./SmsTemplatesTab";

type Tab = "reminders" | "expiring" | "compose" | "history" | "templates";

/** Communication → Bulk SMS (TextSMS): automatic monthly airtime reminders, expiry reminders, any SMS, history, templates. */
export function BulkSmsView() {
  const [tab, setTab] = useState<Tab>("reminders");
  const [sendMode, setSendMode] = useState<"Customers" | "OneOff">("Customers");
  const [historyKind, setHistoryKind] = useState<SmsKind | "">("");
  const [connected, setConnected] = useState<boolean | null>(null);
  const [balance, setBalance] = useState<string | null>(null);
  const [settings, setSettings] = useState<SmsReminderSettings | null>(null);
  const [customers, setCustomers] = useState<SmsCustomer[] | null>(null);
  const [airtime, setAirtime] = useState<SmsReminderLine[] | null>(null);
  const [expiry, setExpiry] = useState<SmsReminderLine[] | null>(null);
  const [templates, setTemplates] = useState<SmsTemplate[] | null>(null);
  const [history, setHistory] = useState<SmsBatch[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async <T,>(p: Promise<{ ok: true; data: T } | { ok: false; message: string }>, set: (v: T) => void) => {
    const r = await p;
    if (r.ok) set(r.data);
    else setError(r.message);
  }, []);
  const loadBalance = useCallback(() => load(erpApi.sms.overview(), (o) => setBalance(o.balance)), [load]);
  const loadReminders = useCallback(() => { void load(erpApi.sms.reminders("airtime"), setAirtime); void load(erpApi.sms.reminders("expiry"), setExpiry); }, [load]);
  const loadHistory = useCallback((k: SmsKind | "") => load(erpApi.sms.history(k || undefined), setHistory), [load]);

  useEffect(() => {
    void erpApi.textSms.get().then((r) => setConnected(r.ok ? r.data.configured : false));
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadBalance();
    void load(erpApi.sms.reminderSettings(), setSettings);
    loadReminders();
    void load(erpApi.sms.customers(), setCustomers);
    void load(erpApi.sms.templates(), setTemplates);
    void loadHistory("");
  }, [load, loadBalance, loadReminders, loadHistory]);
  const showHistory = (k: SmsKind | "") => { setHistoryKind(k); setHistory(null); void loadHistory(k); };

  /** After a send: refresh the lists ("last SMS", "sent this month"), the credit and history. */
  const sent = () => { void loadBalance(); void load(erpApi.sms.customers(), setCustomers); loadReminders(); void loadHistory(historyKind); };

  return (
    <>
      <PageHeader title="Bulk SMS" subtitle="Automated monthly airtime reminders for prepaid-SIM customers, sent with TextSMS." />
      {error && <p role="alert" className="text-[#C62828]">{error}</p>}

      <div role="tablist" aria-label="Bulk SMS" className="flex max-w-full flex-wrap gap-1 self-start rounded-xl border border-line bg-white p-1 shadow-[0_1px_2px_rgba(16,32,48,0.04)]">
        {([["reminders", "SMS Reminders", BellRing], ["expiring", "Expiring Devices", CalendarClock], ["compose", "Compose SMS", PenSquare], ["history", "SMS History", History], ["templates", "Templates", FileText]] as const).map(([id, label, Icon]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
            className={cn("inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg px-3 text-[14.5px] font-semibold sm:gap-2 sm:px-4", tab === id ? "bg-brand text-white" : "text-muted hover:text-ink")}>
            <Icon size={16} aria-hidden="true" />{label}
          </button>
        ))}
      </div>

      {tab === "reminders" && (
        <SmsReminderCustomers lines={airtime} settings={settings} connected={!!connected} balance={balance}
          onReload={loadReminders} onSettings={setSettings} onSent={sent} />
      )}
      {tab === "expiring" && <SmsExpiringTab lines={expiry} templates={templates} connected={!!connected} onReload={loadReminders} onSent={sent} />}
      {tab === "compose" && <SmsSendTab mode={sendMode} setMode={setSendMode} customers={customers} templates={templates} connected={!!connected} onSent={sent} />}
      {tab === "history" && <SmsHistoryTab history={history} kind={historyKind} setKind={showHistory} connected={!!connected} />}
      {tab === "templates" && <SmsTemplatesTab templates={templates} onChange={setTemplates} />}
    </>
  );
}
