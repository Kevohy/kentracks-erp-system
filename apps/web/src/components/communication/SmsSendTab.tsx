"use client";

import { useMemo, useState } from "react";
import { Phone, Search, Users } from "lucide-react";
import { Card } from "@/components/dashboard/Card";
import { cn } from "@/lib/cn";
import { fieldValues, localPhone, parsePhoneList, SMS_MAX_RECIPIENTS, type SmsBatch, type SmsCustomer, type SmsTemplate } from "@/lib/sms";
import { emptyDraft, SmsComposer, type SmsDraft } from "./SmsComposer";
import { SmsSendBar, type SmsTarget } from "./SmsSendBar";
import { Loading, SmsResult, SmsStatusPill, smsWhen } from "./sms-shared";

const DEVICE_FILTERS = ["All", "Expired device", "Expiring soon", "No devices"] as const;
type DeviceFilter = (typeof DEVICE_FILTERS)[number];

/** Communication → Bulk SMS → Send: to customers (all, a filtered group, or ticked ones), or to phone numbers typed in. */
export function SmsSendTab({ mode, setMode, customers, templates, connected, onSent }: {
  mode: "Customers" | "OneOff";
  setMode: (m: "Customers" | "OneOff") => void;
  customers: SmsCustomer[] | null;
  templates: SmsTemplate[] | null;
  connected: boolean;
  onSent: () => void;
}) {
  const [result, setResult] = useState<SmsBatch | null>(null);
  return (
    <div className="flex flex-col gap-4">
      <div role="radiogroup" aria-label="Send to" className="flex max-w-full gap-1 self-start rounded-xl bg-canvas p-1">
        {([["Customers", "Customers", Users], ["OneOff", "Phone numbers", Phone]] as const).map(([id, label, Icon]) => (
          <button key={id} type="button" role="radio" aria-checked={mode === id} onClick={() => setMode(id)}
            className={cn("inline-flex min-h-10 items-center gap-1.5 rounded-lg px-3.5 text-[14px] font-semibold", mode === id ? "bg-white text-navy shadow-sm" : "text-muted")}>
            <Icon size={16} aria-hidden="true" />{label}
          </button>
        ))}
      </div>
      {result && <SmsResult batch={result} onClose={() => setResult(null)} />}
      {mode === "Customers"
        ? <CustomersSend key="c" customers={customers} templates={templates} connected={connected} onSent={(b) => { setResult(b); onSent(); }} />
        : <PhonesSend key="p" templates={templates} connected={connected} onSent={(b) => { setResult(b); onSent(); }} />}
    </div>
  );
}

function CustomersSend({ customers, templates, connected, onSent }: { customers: SmsCustomer[] | null; templates: SmsTemplate[] | null; connected: boolean; onSent: (b: SmsBatch) => void }) {
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const [brand, setBrand] = useState("");
  const [devices, setDevices] = useState<DeviceFilter>("All");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [draft, setDraft] = useState<SmsDraft>(() => emptyDraft("Customers"));
  const [errors, setErrors] = useState<Record<string, string>>({});

  const brands = useMemo(() => [...new Set((customers ?? []).map((c) => c.brandName).filter((b): b is string => !!b))].sort(), [customers]);
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (customers ?? []).filter((c) =>
      (!type || c.type === type) && (!brand || c.brandName === brand) &&
      (devices === "All" || (devices === "Expired device" ? c.expired > 0 : devices === "Expiring soon" ? c.expiringSoon > 0 : c.devices === 0)) &&
      (!s || [c.name, c.account, c.phone ?? "", c.brandName ?? ""].some((v) => v.toLowerCase().includes(s))));
  }, [customers, q, type, brand, devices]);
  const sendable = shown.filter((c) => c.phone);
  const allShownPicked = sendable.length > 0 && sendable.every((c) => picked.has(c.id));
  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleAll = () => setPicked((p) => {
    const n = new Set(p);
    if (allShownPicked) sendable.forEach((c) => n.delete(c.id));
    else for (const c of sendable) { if (n.size >= SMS_MAX_RECIPIENTS) break; n.add(c.id); }
    return n;
  });

  const targets: SmsTarget[] = (customers ?? []).filter((c) => picked.has(c.id)).map((c) => ({ id: c.id, label: c.name, values: fieldValues("Customers", c) }));
  const select = "min-h-11 rounded-xl border border-line bg-white px-3 text-[14.5px]";

  return (
    <>
      <Card className="flex flex-col gap-3 p-4 sm:p-5">
        <label className="relative block">
          <span className="sr-only">Search customers</span>
          <Search size={18} className="pointer-events-none absolute left-3.5 top-3.5 text-muted" aria-hidden="true" />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, account, phone or brand"
            className="min-h-11 w-full rounded-xl border border-line bg-white pl-10 pr-3.5 text-[15px]" />
        </label>
        <div className="flex flex-wrap gap-2">
          <label className="sr-only" htmlFor="sms-type">Customer type</label>
          <select id="sms-type" value={type} onChange={(e) => setType(e.target.value)} className={select}>
            <option value="">All types</option><option>End User</option><option>Distributor</option><option>Company</option>
          </select>
          {brands.length > 0 && (
            <>
              <label className="sr-only" htmlFor="sms-brand">Brand</label>
              <select id="sms-brand" value={brand} onChange={(e) => setBrand(e.target.value)} className={select}>
                <option value="">All brands</option>{brands.map((b) => <option key={b}>{b}</option>)}
              </select>
            </>
          )}
          <div className="flex flex-wrap gap-1 rounded-xl bg-canvas p-1">
            {DEVICE_FILTERS.map((f) => (
              <button key={f} type="button" aria-pressed={devices === f} onClick={() => setDevices(f)}
                className={cn("min-h-9 rounded-lg px-3 text-[13.5px] font-semibold", devices === f ? "bg-white text-navy shadow-sm" : "text-muted")}>{f}</button>
            ))}
          </div>
        </div>
      </Card>

      <Card className="overflow-hidden">
        {!customers ? <div className="px-5 py-10"><Loading /></div> : shown.length === 0 ? (
          <p className="px-5 py-10 text-center text-muted">{customers.length === 0 ? "No customers yet." : "No customers match."}</p>
        ) : (
          <>
            <div className="flex items-center gap-3 border-b border-line bg-canvas/60 px-4 py-2.5 sm:px-5">
              <input id="sms-all" type="checkbox" className="size-5 accent-[#FE5102]" checked={allShownPicked} onChange={toggleAll} disabled={sendable.length === 0} />
              <label htmlFor="sms-all" className="text-[13.5px] font-semibold text-muted">Select all shown with a phone ({sendable.length})</label>
              {picked.size > 0 && <button type="button" onClick={() => setPicked(new Set())} className="ml-auto text-[13px] font-semibold text-navy underline">Clear ({picked.size})</button>}
            </div>
            <ul aria-label="Customers" className="max-h-[60vh] divide-y divide-line overflow-y-auto">
              {shown.map((c) => {
                const id = `sms-c-${c.id}`;
                return (
                  <li key={c.id} className={cn("flex items-start gap-3 px-4 py-3 sm:px-5", picked.has(c.id) && "bg-[#FFF8F4]")}>
                    <input id={id} type="checkbox" className="mt-1 size-5 shrink-0 accent-[#FE5102]" disabled={!c.phone} checked={picked.has(c.id)} onChange={() => toggle(c.id)} />
                    <label htmlFor={id} className="grid min-w-0 flex-1 gap-x-6 gap-y-1 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)]">
                      <span className="min-w-0">
                        <span className="block truncate text-[15px] font-semibold">{c.name}</span>
                        <span className="block truncate text-[13px] text-muted">{[c.account, c.type, c.brandName].filter(Boolean).join(" · ")}</span>
                      </span>
                      <span className="min-w-0 text-[14px]">
                        <span className={cn("block truncate", c.phone ? "font-mono" : "text-[13px] text-[#B71C1C]")}>{c.phone ? localPhone(c.phone) : "No valid phone number"}</span>
                        <span className="block truncate text-[13px] text-muted">
                          {c.devices} device{c.devices === 1 ? "" : "s"}
                          {c.expired > 0 && <span className="text-[#B71C1C]"> · {c.expired} expired</span>}
                          {c.expiringSoon > 0 && <span className="text-[#9a3300]"> · {c.expiringSoon} expiring</span>}
                        </span>
                      </span>
                      <span className="text-[13px] text-muted sm:text-right">
                        {c.last ? <><SmsStatusPill status={c.last.status} /><span className="block">{smsWhen(c.last.at)}</span></> : "No SMS yet"}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </Card>

      <SmsComposer audience="Customers" templates={templates} draft={draft} onChange={(d) => { setDraft(d); setErrors({}); }} errors={errors}
        preview={targets[0] ? { label: targets[0].label, values: targets[0].values } : null} />
      <SmsSendBar audience="Customers" targets={targets} draft={draft} connected={connected} onErrors={setErrors}
        onSent={(b) => { setPicked(new Set()); onSent(b); }} />
    </>
  );
}

function PhonesSend({ templates, connected, onSent }: { templates: SmsTemplate[] | null; connected: boolean; onSent: (b: SmsBatch) => void }) {
  const [raw, setRaw] = useState("");
  const [draft, setDraft] = useState<SmsDraft>(() => ({ ...emptyDraft("OneOff") }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const parsed = useMemo(() => parsePhoneList(raw), [raw]);
  const targets: SmsTarget[] = parsed.invalid.length ? [] : parsed.phones.map((p) => ({ id: p, label: localPhone(p), values: {} }));

  return (
    <>
      <Card className="flex flex-col gap-2 p-4 sm:p-5">
        <label htmlFor="sms-phones" className="text-[13.5px] font-medium">Phone numbers</label>
        <textarea id="sms-phones" rows={3} value={raw} onChange={(e) => { setRaw(e.target.value); setErrors((x) => ({ ...x, phones: "" })); }}
          placeholder={"0712 345 678\n0733 123 456, +254 701 000 000"}
          aria-invalid={errors.phones || parsed.invalid.length ? true : undefined} aria-describedby="sms-phones-hint"
          className={cn("w-full resize-y rounded-xl border bg-white px-3.5 py-2.5 font-mono text-[15px]", errors.phones || parsed.invalid.length ? "border-[#C62828]" : "border-line")} />
        <p id="sms-phones-hint" className="text-[12.5px] text-muted" aria-live="polite">
          One per line, or separated by commas. {parsed.phones.length} valid number{parsed.phones.length === 1 ? "" : "s"}
          {parsed.phones.length > SMS_MAX_RECIPIENTS && ` (at most ${SMS_MAX_RECIPIENTS} per send)`}.
        </p>
        {parsed.invalid.length > 0 && <p role="alert" className="text-[13px] text-[#C62828]">Not valid: {parsed.invalid.slice(0, 6).join(", ")}{parsed.invalid.length > 6 ? ` and ${parsed.invalid.length - 6} more` : ""}</p>}
        {errors.phones && !parsed.invalid.length && <p role="alert" className="text-[13px] text-[#C62828]">{errors.phones}</p>}
      </Card>
      <SmsComposer audience="OneOff" templates={templates} draft={draft} onChange={(d) => { setDraft(d); setErrors({}); }} errors={errors} preview={null} />
      <SmsSendBar audience="OneOff" targets={targets} phones={raw} draft={draft} connected={connected} onErrors={setErrors}
        onSent={(b) => { setRaw(""); setDraft(emptyDraft("OneOff")); onSent(b); }} />
    </>
  );
}
