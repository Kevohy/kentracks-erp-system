"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Ban, BellRing, ChevronDown, Loader2, MoreHorizontal, Search, Send, Settings2, ShieldCheck } from "lucide-react";
import { Card } from "@/components/dashboard/Card";
import { cn } from "@/lib/cn";
import { erpApi, newClientKey } from "@/lib/erp-api";
import {
  dayThisMonth,
  fieldValues,
  gsmLength,
  localPhone,
  messageProblem,
  ordinal,
  renderSms,
  SMS_FIELDS,
  SMS_MAX_CHARS,
  smsDate,
  smsParts,
  unknownFields,
  type SmsBatch,
  type SmsReminderLine,
  type SmsReminderSettings,
} from "@/lib/sms";
import { SaleDetailsDialog } from "@/components/sales/SaleDetailsDialog";
import type { Sale } from "@/lib/sales";
import { ConfirmSmsDialog, Loading, SmsResult, smsWhen } from "./sms-shared";
import { SmsVehicleCard } from "./SmsVehicleCard";

const STATUS = ["All statuses", "Active", "Blocked", "Due this month", "Sent this month", "No phone", "Device expired"] as const;
const EXPIRY = ["Any expiry", "Expiring in 30 days", "Expired", "Never expires"] as const;
const PAGE = 40;

type Group = {
  customerId: string;
  name: string;
  phone: string | null;
  lines: SmsReminderLine[];
  blocked: boolean;
};

const today = () => new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10);
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";

/** The next date this line's reminder goes out (YYYY-MM-DD), or null when it will not go (blocked, no phone, expired). */
function nextSms(l: SmsReminderLine, t = today()): string | null {
  if (l.blocked || l.state === "No phone" || l.state === "Device expired") return null;
  const ym = t.slice(0, 7);
  const d = dayThisMonth(l.smsDay, ym);
  if (l.state === "Due") {
    const thisMonth = `${ym}-${String(d).padStart(2, "0")}`;
    if (thisMonth >= t) return thisMonth;
    return t; // today's run (or a catch-up) picks it up
  }
  const [y, m] = ym.split("-").map(Number);
  const nm = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  return `${nm}-${String(dayThisMonth(l.smsDay, nm)).padStart(2, "0")}`;
}
const within7 = (ymd: string | null) => {
  if (!ymd) return false;
  const diff = (Date.parse(`${ymd}T00:00:00Z`) - Date.parse(`${today()}T00:00:00Z`)) / 86_400_000;
  return diff >= 0 && diff < 7;
};

/** Communication → Bulk SMS → SMS Reminders: customers on the monthly airtime reminder, the automatic job, blocking. */
export function SmsReminderCustomers({ lines, settings, connected, balance, onReload, onSettings, onSent }: {
  lines: SmsReminderLine[] | null;
  settings: SmsReminderSettings | null;
  connected: boolean;
  balance: string | null;
  onReload: () => void;
  onSettings: (s: SmsReminderSettings) => void;
  onSent: () => void;
}) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<(typeof STATUS)[number]>("All statuses");
  const [expiry, setExpiry] = useState<(typeof EXPIRY)[number]>("Any expiry");
  const [shown, setShown] = useState(PAGE);
  const [open, setOpen] = useState<string | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const [sendFor, setSendFor] = useState<Group | null>(null);
  const [editing, setEditing] = useState(false);
  const [result, setResult] = useState<SmsBatch | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [sale, setSale] = useState<Sale | null>(null);

  const groups = useMemo(() => {
    const m = new Map<string, Group>();
    for (const l of lines ?? []) {
      const g = m.get(l.customerId) ?? { customerId: l.customerId, name: l.customerName, phone: l.phone, lines: [], blocked: l.blocked };
      g.lines.push(l);
      m.set(l.customerId, g);
    }
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [lines]);

  const kpi = useMemo(() => ({
    customers: groups.length,
    vehicles: lines?.length ?? 0,
    active: groups.filter((g) => !g.blocked).length,
    blocked: groups.filter((g) => g.blocked).length,
    upcoming: (lines ?? []).filter((l) => within7(nextSms(l))).length,
  }), [groups, lines]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return groups.filter((g) => {
      if (status === "Active" && g.blocked) return false;
      if (status === "Blocked" && !g.blocked) return false;
      if (status === "Due this month" && !g.lines.some((l) => l.state === "Due")) return false;
      if (status === "Sent this month" && !g.lines.some((l) => l.state === "Sent this month")) return false;
      if (status === "No phone" && g.phone) return false;
      if (status === "Device expired" && !g.lines.some((l) => l.state === "Device expired")) return false;
      if (expiry === "Expiring in 30 days" && !g.lines.some((l) => l.daysLeft !== null && l.daysLeft >= 0 && l.daysLeft <= 30)) return false;
      if (expiry === "Expired" && !g.lines.some((l) => l.state === "Device expired" || (l.daysLeft !== null && l.daysLeft < 0))) return false;
      if (expiry === "Never expires" && !g.lines.some((l) => l.expiry === null)) return false;
      return !s || [g.name, g.phone ?? "", ...g.lines.flatMap((l) => [l.vehiclePlate, l.imei, l.simNumber])].some((v) => v.toLowerCase().includes(s));
    });
  }, [groups, q, status, expiry]);

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest("[data-menu]")) setMenu(null); };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [menu]);

  async function viewSale(id: string) {
    const r = await erpApi.sales.get(id);
    if (r.ok) setSale(r.data);
    else setError(r.message);
  }

  async function block(g: Group, blocked: boolean) {
    setMenu(null);
    setError(null);
    const r = await erpApi.sms.block(g.customerId, blocked);
    if (!r.ok) return setError(r.message);
    setNotice(blocked ? `${g.name} is blocked from reminders.` : `${g.name} gets reminders again.`);
    onReload();
  }

  async function runNow() {
    setRunning(true);
    setError(null);
    const r = await erpApi.sms.runReminders();
    setRunning(false);
    if (!r.ok) return setError(r.fieldErrors.form ?? r.message);
    onSettings(r.data.settings);
    if (r.data.batch) setResult(r.data.batch);
    setNotice(r.data.note);
    onSent();
  }

  const lastRun = settings?.lastRunAt ? `Last run ${smsWhen(settings.lastRunAt)}${settings.lastRunNote ? ` · ${settings.lastRunNote}` : ""}` : "Not run yet";
  const select = "min-h-11 w-full rounded-xl border border-line bg-white px-3 text-[14.5px] sm:w-auto sm:min-w-44";

  return (
    <div className="flex flex-col gap-4">
      {/* Status of the automatic job */}
      {!connected ? (
        <p role="status" className="flex items-start gap-2 rounded-2xl border border-[#F5C27A] bg-[#FFF4E5] px-4 py-3 text-[14px] text-[#7a3d00]">
          <span className="mt-1.5 size-2 shrink-0 rounded-full bg-[#E08A00]" aria-hidden="true" />
          <span><span className="font-semibold">TextSMS is not set up</span> — reminders cannot be sent. Ask the system administrator to set it up.</span>
        </p>
      ) : (
        <div className={cn("flex flex-col gap-3 rounded-2xl border px-4 py-3 sm:flex-row sm:items-center", settings?.enabled ? "border-[#A8D5B5] bg-[#E6F4EA]" : "border-[#F5C27A] bg-[#FFF4E5]")}>
          <p role="status" className={cn("flex min-w-0 flex-1 items-start gap-2 text-[14px]", settings?.enabled ? "text-[#1B5E20]" : "text-[#7a3d00]")}>
            <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", settings?.enabled ? "bg-[#2E7D32]" : "bg-[#E08A00]")} aria-hidden="true" />
            <span className="min-w-0">
              {settings?.enabled
                ? <><span className="font-semibold">Automatic reminders on</span> — each vehicle gets its reminder on its expiry day at {settings.sendHour}:00.</>
                : <><span className="font-semibold">Automatic reminders off</span> — turn them on to send each vehicle&apos;s reminder by itself on its expiry day.</>}
              <span className="block text-[12.5px] opacity-80">{balance ? `SMS credit ${balance} · ` : ""}{lastRun}</span>
            </span>
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void runNow()} disabled={running || !settings}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-line bg-white px-3 text-[14px] font-semibold text-navy hover:bg-tint disabled:opacity-60">
              {running ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <Send size={15} aria-hidden="true" />}Send today&apos;s now
            </button>
            <button type="button" onClick={() => setEditing(true)} disabled={!settings}
              className={cn("inline-flex min-h-10 items-center gap-1.5 rounded-xl px-3 text-[14px] font-semibold disabled:opacity-60", settings?.enabled ? "border border-line bg-white text-navy hover:bg-tint" : "bg-brand text-white hover:brightness-95")}>
              <Settings2 size={15} aria-hidden="true" />{settings?.enabled ? "Settings" : "Turn on"}
            </button>
          </div>
        </div>
      )}
      {notice && <p role="status" className="rounded-xl bg-[#E8F0FB] px-3.5 py-2.5 text-[14px] text-[#1F5FAD]">{notice}</p>}
      {error && <p role="alert" className="rounded-xl bg-[#FDECEA] px-3.5 py-2.5 text-[14px] text-[#B71C1C]">{error}</p>}
      {result && <SmsResult batch={result} onClose={() => setResult(null)} />}

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {([["Customers", kpi.customers, "text-ink"], ["Vehicles", kpi.vehicles, "text-brand"], ["Active", kpi.active, "text-[#1B7F3B]"], ["Blocked", kpi.blocked, "text-[#C62828]"], ["Upcoming (7 days)", kpi.upcoming, "text-[#1F5FAD]"]] as const).map(([label, value, color]) => (
          <Card key={label} className="px-4 py-3.5">
            <p className="text-[12px] font-semibold uppercase tracking-wide text-muted">{label}</p>
            <p className={cn("text-[26px] font-semibold leading-tight tabular-nums", color)}>{lines ? value : "—"}</p>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <Card className="flex flex-col gap-2 p-3 sm:flex-row sm:p-3.5">
        <label className="relative block flex-1">
          <span className="sr-only">Search reminders</span>
          <Search size={18} className="pointer-events-none absolute left-3.5 top-3.5 text-muted" aria-hidden="true" />
          <input type="search" value={q} onChange={(e) => { setQ(e.target.value); setShown(PAGE); }} placeholder="Search customer, phone, plate or SIM"
            className="min-h-11 w-full rounded-xl border border-line bg-white pl-10 pr-3.5 text-[15px]" />
        </label>
        <label className="sr-only" htmlFor="rem-status">Status</label>
        <select id="rem-status" value={status} onChange={(e) => { setStatus(e.target.value as typeof status); setShown(PAGE); }} className={select}>
          {STATUS.map((s) => <option key={s}>{s}</option>)}
        </select>
        <label className="sr-only" htmlFor="rem-expiry">Expiry</label>
        <select id="rem-expiry" value={expiry} onChange={(e) => { setExpiry(e.target.value as typeof expiry); setShown(PAGE); }} className={select}>
          {EXPIRY.map((s) => <option key={s}>{s}</option>)}
        </select>
      </Card>

      {/* Customers */}
      {!lines ? <Loading /> : filtered.length === 0 ? (
        <Card className="px-5 py-10 text-center text-muted">
          {groups.length === 0 ? "No customers are on the monthly airtime reminder yet. Choose \"Send the customer a monthly airtime alert (SMS)\" on a sale to add one." : "No customers match."}
        </Card>
      ) : (
        <ul aria-label="Customers on the monthly airtime reminder" className="flex flex-col gap-3">
          {filtered.slice(0, shown).map((g) => {
            const plates = g.lines.map((l) => l.vehiclePlate || l.imei);
            const expiries = g.lines.map((l) => l.expiry).filter((x): x is string => !!x && x >= today()).sort();
            const days = [...new Set(g.lines.map((l) => l.smsDay))].sort((a, b) => a - b);
            const due = g.lines.filter((l) => l.state === "Due");
            const stat = {
              vehicles: g.lines.length,
              online: g.lines.filter((l) => l.connection === "Online").length,
              offline: g.lines.filter((l) => l.connection === "Offline").length,
              expired: g.lines.filter((l) => l.state === "Device expired" || l.connection === "Expired" || (l.daysLeft !== null && l.daysLeft < 0)).length,
              soon: g.lines.filter((l) => l.daysLeft !== null && l.daysLeft >= 0 && l.daysLeft <= 30).length,
            };
            const isOpen = open === g.customerId;
            return (
              <li key={g.customerId}>
                <Card className={cn("overflow-visible", g.blocked && "opacity-80")}>
                  <div className="flex flex-wrap items-center gap-3 p-4">
                    <button type="button" onClick={() => setOpen(isOpen ? null : g.customerId)} aria-expanded={isOpen} aria-label={`${g.name}, ${g.lines.length} vehicle${g.lines.length === 1 ? "" : "s"}`}
                      className="order-1 flex min-w-0 flex-1 basis-56 items-center gap-3 text-left">
                      <span className="grid size-12 shrink-0 place-items-center rounded-full bg-[#FFF1EA] text-[15px] font-semibold text-brand" aria-hidden="true">{initials(g.name)}</span>
                      <span className="min-w-0">
                        <span className="flex flex-wrap items-center gap-2 text-[16px] font-semibold">
                          {g.name}
                          {g.blocked && <span className="rounded-full bg-[#3d4b57] px-2 py-0.5 text-[11.5px] font-semibold text-white">Blocked</span>}
                        </span>
                        <span className="block truncate text-[13px] text-muted">
                          {g.phone ? localPhone(g.phone) : <span className="text-[#B71C1C]">No valid phone</span>} · {plates.slice(0, 3).join(", ")}{plates.length > 3 ? ` +${plates.length - 3}` : ""}
                        </span>
                        <span className="block text-[13px] text-muted">
                          Next expiry: {expiries[0] ? smsDate(expiries[0]) : g.lines.some((l) => l.expiry === null) && !g.lines.some((l) => l.expiry) ? "Never expires" : "—"} · SMS on the {days.map(ordinal).join(", ")}
                        </span>
                      </span>
                    </button>
                      <dl className="order-3 grid w-full grid-cols-5 gap-1.5 lg:order-2 lg:w-auto">
                        {([["Vehicles", "Vehicles", stat.vehicles, "text-brand"], ["Online", "Online", stat.online, "text-[#1B7F3B]"], ["Offline", "Offline", stat.offline, "text-[#B26A00]"], ["Expired", "Expired", stat.expired, "text-[#C62828]"], ["Expiring soon", "Soon", stat.soon, "text-[#1F5FAD]"]] as const).map(([label, short, value, color]) => (
                          <div key={label} className="flex min-w-0 flex-col items-center rounded-xl border border-line px-0.5 py-2 lg:w-[112px]">
                            <dd className={cn("text-[18px] font-semibold leading-tight tabular-nums", color)}>{value}</dd>
                            <dt className="w-full text-center text-[9.5px] font-semibold uppercase leading-tight text-muted sm:text-[10.5px] sm:tracking-wide">
                              <span className="sm:hidden" aria-hidden="true">{short}</span><span className="max-sm:sr-only">{label}</span>
                            </dt>
                          </div>
                        ))}
                      </dl>
                      <div className="relative order-2 lg:order-3" data-menu>
                        <button type="button" onClick={() => setMenu(menu === g.customerId ? null : g.customerId)} aria-haspopup="menu" aria-expanded={menu === g.customerId} aria-label={`Actions for ${g.name}`}
                          className="grid size-10 place-items-center rounded-xl border border-line text-muted hover:bg-canvas">
                          <MoreHorizontal size={18} aria-hidden="true" />
                        </button>
                        {menu === g.customerId && (
                          <div role="menu" className="absolute right-0 top-11 z-30 w-60 rounded-xl border border-line bg-white p-1 shadow-[0_12px_30px_rgba(10,29,44,0.16)]">
                            <button type="button" role="menuitem" onClick={() => { setMenu(null); setOpen(g.customerId); }} className="flex min-h-10 w-full items-center gap-2 rounded-lg px-3 text-left text-[14px] hover:bg-canvas">
                              <ChevronDown size={15} aria-hidden="true" />View vehicles
                            </button>
                            <button type="button" role="menuitem" disabled={!connected || g.blocked || due.length === 0 || !settings} onClick={() => { setMenu(null); setSendFor(g); }}
                              className="flex min-h-10 w-full items-center gap-2 rounded-lg px-3 text-left text-[14px] hover:bg-canvas disabled:opacity-50">
                              <Send size={15} aria-hidden="true" />Send reminder now{due.length ? ` (${due.length})` : ""}
                            </button>
                            {g.blocked ? (
                              <button type="button" role="menuitem" onClick={() => void block(g, false)} className="flex min-h-10 w-full items-center gap-2 rounded-lg px-3 text-left text-[14px] text-[#1B5E20] hover:bg-canvas">
                                <ShieldCheck size={15} aria-hidden="true" />Unblock reminders
                              </button>
                            ) : (
                              <button type="button" role="menuitem" onClick={() => void block(g, true)} className="flex min-h-10 w-full items-center gap-2 rounded-lg px-3 text-left text-[14px] text-[#B71C1C] hover:bg-canvas">
                                <Ban size={15} aria-hidden="true" />Block reminders
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                  </div>
                  {isOpen && (
                    <div role="region" aria-label={`Vehicles of ${g.name}`} className="grid gap-3 border-t border-line bg-canvas/50 p-3 sm:p-4">
                      {g.lines.map((l) => <SmsVehicleCard key={l.saleId} l={l} next={nextSms(l)} onViewSale={(id) => void viewSale(id)} />)}
                    </div>
                  )}
                </Card>
              </li>
            );
          })}
        </ul>
      )}
      {filtered.length > shown && (
        <button type="button" onClick={() => setShown((n) => n + PAGE)} className="min-h-11 self-center rounded-xl border border-line bg-white px-5 text-[14.5px] font-semibold text-navy hover:bg-tint">
          Show more ({filtered.length - shown} more)
        </button>
      )}

      {sendFor && settings && (
        <SendNow group={sendFor} message={settings.message} onCancel={() => setSendFor(null)}
          onSent={(b) => { setSendFor(null); setResult(b); onSent(); }} onError={(m) => { setSendFor(null); setError(m); }} />
      )}
      <SaleDetailsDialog sale={sale} onClose={() => setSale(null)} />
      {editing && settings && (
        <SettingsDialog settings={settings} sample={(lines ?? []).find((l) => !l.blocked) ?? null} connected={connected}
          onClose={() => setEditing(false)} onSaved={(s) => { setEditing(false); onSettings(s); setNotice(null); }} />
      )}
    </div>
  );
}

function SendNow({ group, message, onCancel, onSent, onError }: { group: Group; message: string; onCancel: () => void; onSent: (b: SmsBatch) => void; onError: (m: string) => void }) {
  const [busy, setBusy] = useState(false);
  const key = useRef(newClientKey());
  const due = group.lines.filter((l) => l.state === "Due");
  const texts = due.map((l) => renderSms(message, fieldValues("AirtimeReminder", l)));
  async function send() {
    setBusy(true);
    const r = await erpApi.sms.send({ kind: "AirtimeReminder", ids: due.map((l) => l.saleId), message, templateName: "Reminder", clientKey: key.current });
    setBusy(false);
    if (!r.ok) return onError(r.fieldErrors.recipients ?? r.fieldErrors.message ?? r.fieldErrors.form ?? r.message);
    onSent(r.data);
  }
  return <ConfirmSmsDialog recipients={due.length} parts={texts.reduce((n, t) => n + smsParts(t), 0)} scheduledFor={null} sample={texts[0] ?? message} busy={busy} onCancel={onCancel} onConfirm={() => void send()} />;
}

function SettingsDialog({ settings, sample, connected, onClose, onSaved }: {
  settings: SmsReminderSettings; sample: SmsReminderLine | null; connected: boolean; onClose: () => void; onSaved: (s: SmsReminderSettings) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const [enabled, setEnabled] = useState(true); // opened from "Turn on" or "Settings": untick to turn off
  const [message, setMessage] = useState(settings.message);
  const [hour, setHour] = useState(String(settings.sendHour));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  const preview = sample ? renderSms(message, fieldValues("AirtimeReminder", sample)) : message;

  function insert(k: string) {
    const el = box.current;
    const token = `{${k}}`;
    const [a, b] = [el?.selectionStart ?? message.length, el?.selectionEnd ?? message.length];
    setMessage(message.slice(0, a) + token + message.slice(b));
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(a + token.length, a + token.length); });
  }
  async function save() {
    const errs: Record<string, string> = {};
    const p = messageProblem(message);
    if (p) errs.message = p;
    else if (unknownFields(message, "AirtimeReminder").length) errs.message = `Unknown field: ${unknownFields(message, "AirtimeReminder").join(" ")}`;
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    const r = await erpApi.sms.saveReminderSettings({ enabled, message, sendHour: hour });
    setBusy(false);
    if (!r.ok) return setErrors(Object.keys(r.fieldErrors).length ? r.fieldErrors : { form: r.message });
    onSaved(r.data);
  }
  return (
    <dialog ref={ref} onClose={onClose} aria-labelledby="rem-set-title"
      className="m-auto max-h-[calc(100dvh-32px)] w-[calc(100%-32px)] max-w-lg overflow-y-auto rounded-2xl border border-line bg-white p-0 text-ink shadow-[0_24px_60px_rgba(10,29,44,0.25)] backdrop:bg-ink/50">
      <form onSubmit={(e) => { e.preventDefault(); void save(); }} noValidate className="flex flex-col gap-4 p-5 sm:p-6">
        <div className="flex items-center gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#FFF1EA] text-brand" aria-hidden="true"><BellRing size={21} /></span>
          <div>
            <h2 id="rem-set-title" className="text-lg font-semibold leading-tight">Automatic reminders</h2>
            <p className="text-[13px] text-muted">Each vehicle gets one reminder a month, on its expiry day (the sale day if it never expires).</p>
          </div>
        </div>
        <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-xl border border-line px-3.5">
          <span className="text-[15px] font-medium">Send reminders automatically</span>
          <input type="checkbox" role="switch" className="size-5 accent-[#FE5102]" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        </label>
        {errors.enabled && <p className="text-[13px] text-[#C62828]">{errors.enabled}</p>}
        {!connected && <p className="text-[13px] text-muted">TextSMS must be set up before reminders can go out.</p>}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="rem-hour" className="text-[13.5px] font-medium">Send at (Nairobi time)</label>
          <select id="rem-hour" value={hour} onChange={(e) => setHour(e.target.value)} className="min-h-11 rounded-xl border border-line bg-white px-3 text-[15px] sm:max-w-40">
            {Array.from({ length: 15 }, (_, i) => i + 6).map((h) => <option key={h} value={h}>{`${String(h).padStart(2, "0")}:00`}</option>)}
          </select>
          {errors.sendHour && <p className="text-[13px] text-[#C62828]">{errors.sendHour}</p>}
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="rem-msg" className="text-[13.5px] font-medium">Message</label>
          <textarea id="rem-msg" ref={box} rows={4} value={message} onChange={(e) => setMessage(e.target.value)} aria-invalid={errors.message ? true : undefined}
            className={cn("w-full resize-y rounded-xl border bg-white px-3.5 py-2.5 text-[15px] leading-relaxed", errors.message ? "border-[#C62828]" : "border-line")} />
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[12.5px] text-muted">Insert:</span>
            {SMS_FIELDS.AirtimeReminder.map((f) => (
              <button key={f.key} type="button" onClick={() => insert(f.key)} className="min-h-8 rounded-full border border-line bg-white px-2.5 text-[12.5px] font-semibold text-navy hover:bg-tint">{f.label}</button>
            ))}
          </div>
          <p className="text-[12.5px] text-muted">{gsmLength(preview)} / {SMS_MAX_CHARS} characters · {smsParts(preview)} SMS</p>
          {errors.message && <p className="text-[13px] text-[#C62828]">{errors.message}</p>}
          {sample && <p className="whitespace-pre-wrap break-words rounded-xl bg-canvas px-3.5 py-2.5 text-[14px]"><span className="block text-[11.5px] font-semibold uppercase tracking-wide text-muted">Preview for {sample.customerName}</span>{preview}</p>}
        </div>
        {errors.form && <p role="alert" className="text-[13.5px] text-[#C62828]">{errors.form}</p>}
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} disabled={busy} className="min-h-11 rounded-xl border border-line px-4 text-[15px] font-semibold hover:bg-canvas">Cancel</button>
          <button type="submit" disabled={busy} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-navy px-5 text-[15px] font-semibold text-white hover:brightness-110 disabled:opacity-60">
            {busy && <Loader2 size={17} className="animate-spin" aria-hidden="true" />}Save
          </button>
        </div>
      </form>
    </dialog>
  );
}
