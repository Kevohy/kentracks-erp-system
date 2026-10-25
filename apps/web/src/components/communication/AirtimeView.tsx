"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CalendarClock, ChevronDown, History, LayoutDashboard, Loader2, Search, Send, ShieldCheck } from "lucide-react";
import { Card } from "@/components/dashboard/Card";
import { PageHeader } from "@/components/shell/PageHeader";
import { AIRTIME_MAX_RECIPIENTS, parseAirtimeAmount, type AirtimeBatch, type AirtimeLine, type AirtimeMonthly, type AirtimeOverview } from "@/lib/airtime";
import { cn } from "@/lib/cn";
import { erpApi, newClientKey } from "@/lib/erp-api";
import { formatKes } from "@/lib/sales-format";
import { ConfirmDialog, SendResult, statusStyle, when } from "./airtime-shared";
import { ApprovalTab, MonthlyTab } from "./AirtimeMonthlyTab";
import { OverviewTab } from "./AirtimeOverview";

const FILTERS = ["All", "Auto recharge", "Never sent"] as const;
type Filter = (typeof FILTERS)[number];

/** Communication → Airtime: send airtime with Africa's Talking to tracker SIM lines, and see every send. */
export function AirtimeView() {
  const [tab, setTab] = useState<"overview" | "approval" | "monthly" | "send" | "history">("overview");
  const [monthly, setMonthly] = useState<AirtimeMonthly | null>(null);
  const [overview, setOverview] = useState<AirtimeOverview | null>(null);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [lines, setLines] = useState<AirtimeLine[] | null>(null);
  const [history, setHistory] = useState<AirtimeBatch[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadLines = useCallback(async () => {
    const r = await erpApi.airtime.lines();
    if (r.ok) setLines(r.data);
    else setError(r.message);
  }, []);
  const loadHistory = useCallback(async () => {
    const r = await erpApi.airtime.history();
    if (r.ok) setHistory(r.data);
    else setError(r.message);
  }, []);

  const loadMonthly = useCallback(async () => {
    const r = await erpApi.airtime.monthly();
    if (r.ok) setMonthly(r.data);
    else setError(r.message);
  }, []);

  const loadOverview = useCallback(async () => {
    const r = await erpApi.airtime.overview();
    if (r.ok) setOverview(r.data);
    else setError(r.message);
  }, []);

  useEffect(() => {
    void erpApi.africasTalking.get().then((r) => setConnected(r.ok ? r.data.configured : false));
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadLines();
    void loadHistory();
    void loadMonthly();
    void loadOverview();
  }, [loadLines, loadHistory, loadMonthly, loadOverview]);
  const refreshAll = () => { void loadLines(); void loadHistory(); void loadMonthly(); void loadOverview(); };
  /** An approval, edit, suspend or removal: show the new lists and refresh the dashboard counts. */
  const changed = (d: AirtimeMonthly) => { setMonthly(d); void loadOverview(); };

  return (
    <>
      <PageHeader title="Airtime" subtitle="Send airtime to tracker SIM cards with Africa's Talking." />
      {connected === false && (
        <p role="status" className="flex items-start gap-2 rounded-xl bg-[#FFF4E5] px-3.5 py-3 text-[14px] text-[#7a3d00]">
          <AlertTriangle size={17} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>
            Africa&apos;s Talking is not set up yet, so airtime cannot be sent. Ask the system administrator to set it up.
          </span>
        </p>
      )}
      {error && <p role="alert" className="text-[#C62828]">{error}</p>}

      <div role="tablist" aria-label="Airtime" className="flex max-w-full flex-wrap gap-1 self-start rounded-xl bg-white p-1 shadow-[0_1px_2px_rgba(16,32,48,0.04)]">
        {([["overview", "Overview", LayoutDashboard], ["approval", "Approval", ShieldCheck], ["monthly", "Subscriptions", CalendarClock], ["send", "Bulk send", Send], ["history", "History", History]] as const).map(([id, label, Icon]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
            className={cn("inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg px-3 text-[14.5px] font-semibold sm:gap-2 sm:px-4", tab === id ? "bg-navy text-white" : "text-muted hover:text-ink")}>
            <Icon size={16} aria-hidden="true" />{label}
            {id === "approval" && monthly && monthly.pending.length > 0 && (
              <span className="rounded-full bg-brand px-1.5 text-[12px] leading-5 text-white">{monthly.pending.length}<span className="sr-only"> waiting for approval</span></span>
            )}
          </button>
        ))}
      </div>

      {tab === "overview" && <OverviewTab data={overview} onReload={() => void loadOverview()} onSent={refreshAll} go={setTab} />}
      {tab === "approval" && <ApprovalTab data={monthly} onChange={changed} />}
      {tab === "monthly" && <MonthlyTab data={monthly} connected={!!connected} onChange={changed} onSent={refreshAll} />}
      {tab === "send" && <SendTab lines={lines} connected={!!connected} onSent={refreshAll} />}
      {tab === "history" && <HistoryTab history={history} />}
    </>
  );
}

function SendTab({ lines, connected, onSent }: { lines: AirtimeLine[] | null; connected: boolean; onSent: () => void }) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("All");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [amount, setAmount] = useState("");
  const [amountError, setAmountError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AirtimeBatch | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const key = useRef(newClientKey());

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (lines ?? []).filter((l) =>
      (filter === "All" || (filter === "Auto recharge" ? l.autoRecharge : !l.last)) &&
      (!s || [l.customerName, l.vehiclePlate, l.imei, l.simNumber, l.simName].some((v) => v.toLowerCase().includes(s))));
  }, [lines, q, filter]);
  const sendable = shown.filter((l) => l.phone);
  const allShownPicked = sendable.length > 0 && sendable.every((l) => picked.has(l.saleId));
  const parsed = parseAirtimeAmount(amount);
  const total = parsed.value ? parsed.value * picked.size : 0;

  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleAll = () => setPicked((p) => {
    const n = new Set(p);
    if (allShownPicked) sendable.forEach((l) => n.delete(l.saleId));
    else for (const l of sendable) { if (n.size >= AIRTIME_MAX_RECIPIENTS) break; n.add(l.saleId); }
    return n;
  });

  function review() {
    setSendError(null);
    if (!parsed.value) return setAmountError(parsed.error ?? "Enter the amount");
    if (picked.size === 0) return setSendError("Select at least one SIM line");
    setConfirm(true);
  }

  async function send() {
    setBusy(true);
    const r = await erpApi.airtime.send([...picked], amount, key.current);
    setBusy(false);
    setConfirm(false);
    if (!r.ok) {
      setSendError(r.fieldErrors.amount ?? r.fieldErrors.lines ?? r.fieldErrors.form ?? r.message);
      return;
    }
    setResult(r.data);
    setPicked(new Set());
    key.current = newClientKey(); // a new send gets a new key
    onSent();
  }

  return (
    <div className="flex flex-col gap-4">
      {result && <SendResult batch={result} onClose={() => setResult(null)} />}
      <Card className="flex flex-col gap-3 p-4 sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <label className="relative block flex-1">
            <span className="sr-only">Search SIM lines</span>
            <Search size={18} className="pointer-events-none absolute left-3.5 top-3.5 text-muted" aria-hidden="true" />
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search customer, plate, IMEI or SIM number"
              className="min-h-11 w-full rounded-xl border border-line bg-white pl-10 pr-3.5 text-[15px]" />
          </label>
          <div className="flex gap-1 rounded-xl bg-canvas p-1">
            {FILTERS.map((f) => (
              <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}
                className={cn("min-h-9 rounded-lg px-3 text-[13.5px] font-semibold", filter === f ? "bg-white text-navy shadow-sm" : "text-muted")}>{f}</button>
            ))}
          </div>
        </div>
        <p className="text-[13.5px] text-muted">
          Tracker SIM lines that take airtime: prepaid SIMs, and SIMs on hosting sales. {lines ? `${lines.length} line${lines.length === 1 ? "" : "s"}.` : ""}
        </p>
      </Card>

      <Card className="overflow-hidden">
        {!lines ? (
          <p role="status" className="flex items-center justify-center gap-2 px-5 py-10 text-muted"><Loader2 size={16} className="animate-spin" aria-hidden="true" />Loading…</p>
        ) : shown.length === 0 ? (
          <p className="px-5 py-10 text-center text-muted">{lines.length === 0 ? "No tracker SIM lines take airtime yet. They appear here after a Package or Hosting Sale with a prepaid SIM." : "No SIM lines match."}</p>
        ) : (
          <>
            <div className="flex items-center gap-3 border-b border-line bg-canvas/60 px-4 py-2.5 sm:px-5">
              <input id="air-all" type="checkbox" className="size-5 accent-[#FE5102]" checked={allShownPicked} onChange={toggleAll} disabled={sendable.length === 0} />
              <label htmlFor="air-all" className="text-[13.5px] font-semibold text-muted">Select all shown ({sendable.length})</label>
            </div>
            <ul aria-label="SIM lines" className="divide-y divide-line">
              {shown.map((l) => {
                const id = `air-${l.saleId}`;
                return (
                  <li key={l.saleId} className={cn("flex items-start gap-3 px-4 py-3.5 sm:px-5", picked.has(l.saleId) && "bg-[#FFF8F4]")}>
                    <input id={id} type="checkbox" className="mt-1 size-5 shrink-0 accent-[#FE5102]" disabled={!l.phone} checked={picked.has(l.saleId)} onChange={() => toggle(l.saleId)}
                      aria-describedby={`${id}-d`} />
                    <label htmlFor={id} className="grid min-w-0 flex-1 gap-x-6 gap-y-1 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)]">
                      <span className="min-w-0">
                        <span className="block truncate text-[15px] font-semibold">{l.customerName}</span>
                        <span className="block truncate text-[13px] text-muted">{[l.vehiclePlate, l.imei].filter(Boolean).join(" · ")}</span>
                      </span>
                      <span id={`${id}-d`} className="min-w-0 text-[14px]">
                        <span className="block truncate font-mono">{l.phone ?? (l.simNumber || "—")}</span>
                        <span className="block truncate text-[13px] text-muted">
                          {l.phone ? l.simName : <span className="text-[#B71C1C]">No valid SIM number</span>}
                          {l.autoRecharge && <span className="ml-1.5 rounded-full bg-tint px-2 py-0.5 text-[11.5px] font-semibold text-navy">Auto recharge</span>}
                        </span>
                      </span>
                      <span className="text-[13px] text-muted sm:text-right">
                        {l.last ? (
                          <>
                            <span className={cn("inline-block rounded-full px-2 py-0.5 text-[12px] font-semibold", statusStyle[l.last.status])}>{l.last.status}</span>
                            <span className="ml-1.5">{formatKes(l.last.amountMinor)}</span>
                            <span className="block">{when(l.last.at)}</span>
                          </>
                        ) : "Never sent"}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </Card>

      {/* Send bar: sticks above the bottom of the screen (and above the phone menu bar). */}
      <div className="sticky bottom-[calc(76px+env(safe-area-inset-bottom))] z-20 lg:bottom-4">
        <Card className="flex flex-col gap-3 p-4 shadow-[0_10px_30px_rgba(10,29,44,0.14)] sm:flex-row sm:items-end sm:p-5">
          <div className="flex flex-1 flex-col gap-1.5">
            <label htmlFor="air-amount" className="text-[13.5px] font-medium">Amount per line (KES)</label>
            <input id="air-amount" inputMode="decimal" autoComplete="off" value={amount} placeholder="e.g. 100"
              onChange={(e) => { setAmount(e.target.value.replace(/[^\d.,]/g, "")); setAmountError(null); }}
              aria-invalid={amountError ? true : undefined} aria-describedby={amountError ? "air-amount-err" : "air-amount-hint"}
              className={cn("min-h-11 w-full rounded-xl border bg-white px-3.5 text-[15px] sm:max-w-56", amountError ? "border-[#C62828]" : "border-line")} />
            {amountError
              ? <p id="air-amount-err" className="text-[13px] text-[#C62828]">{amountError}</p>
              : <p id="air-amount-hint" className="text-[12.5px] text-muted">KES 5 to 10,000 per line</p>}
          </div>
          <div className="flex items-center justify-between gap-4 sm:justify-end">
            <p className="text-[14px] text-muted" aria-live="polite">
              <span className="font-semibold text-ink">{picked.size}</span> selected{total ? <> · <span className="font-semibold text-ink">{formatKes(total)}</span></> : null}
            </p>
            <button type="button" onClick={review} disabled={!connected || busy}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-brand px-5 text-[15px] font-semibold text-white hover:brightness-95 disabled:opacity-60">
              <Send size={17} aria-hidden="true" />Send airtime
            </button>
          </div>
        </Card>
        {sendError && <p role="alert" className="mt-2 rounded-xl bg-[#FDECEA] px-3.5 py-2.5 text-[14px] text-[#B71C1C]">{sendError}</p>}
      </div>

      {confirm && parsed.value && (
        <ConfirmDialog count={picked.size} eachMinor={parsed.value} totalMinor={parsed.value * picked.size} busy={busy} onCancel={() => setConfirm(false)} onConfirm={() => void send()} />
      )}
    </div>
  );
}

function HistoryTab({ history }: { history: AirtimeBatch[] | null }) {
  const [open, setOpen] = useState<string | null>(null);
  if (!history) return <p role="status" className="flex items-center gap-2 text-muted"><Loader2 size={16} className="animate-spin" aria-hidden="true" />Loading…</p>;
  if (history.length === 0) return <Card className="px-5 py-10 text-center text-muted">No airtime sent yet.</Card>;
  return (
    <ul aria-label="Airtime sends" className="flex flex-col gap-3">
      {history.map((b) => {
        const isOpen = open === b.id;
        return (
          <li key={b.id}>
            <Card className="overflow-hidden">
              <button type="button" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : b.id)}
                className="flex w-full flex-wrap items-center gap-x-5 gap-y-1.5 px-4 py-3.5 text-left hover:bg-canvas/50 sm:px-5">
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold">
                    {b.kind !== "Manual" && <span className="mr-2 rounded-full bg-tint px-2 py-0.5 align-middle text-[11.5px] font-semibold text-navy">{b.kind === "TopUp" ? "Top-up" : "Monthly"}</span>}
                    {b.amountMinor === null
                      ? `${formatKes(b.items.reduce((t, i) => t + i.amountMinor, 0))} to ${b.recipients} line${b.recipients === 1 ? "" : "s"}`
                      : `${formatKes(b.amountMinor)} × ${b.recipients} line${b.recipients === 1 ? "" : "s"}`}
                  </span>
                  <span className="block text-[13px] text-muted">{when(b.createdAt)}{b.createdBy ? ` · ${b.createdBy}` : ""}</span>
                </span>
                <span className="flex items-center gap-2 text-[13px]">
                  <span className={cn("rounded-full px-2.5 py-0.5 font-semibold", b.sent > 0 ? statusStyle.Sent : "bg-canvas text-muted")}>{b.sent} sent</span>
                  {b.failed > 0 && <span className={cn("rounded-full px-2.5 py-0.5 font-semibold", statusStyle.Failed)}>{b.failed} failed</span>}
                  {b.recipients - b.sent - b.failed > 0 && <span className={cn("rounded-full px-2.5 py-0.5 font-semibold", statusStyle.Unknown)}>{b.recipients - b.sent - b.failed} unconfirmed</span>}
                </span>
                <ChevronDown size={18} className={cn("shrink-0 text-muted transition-transform", isOpen && "rotate-180")} aria-hidden="true" />
              </button>
              {isOpen && (
                <div className="border-t border-line px-4 py-3 sm:px-5">
                  {b.error && <p className="mb-2 rounded-lg bg-[#FFF4E5] px-3 py-2 text-[13.5px] text-[#7a3d00]">{b.error}</p>}
                  {(b.totalAmount || b.totalDiscount) && <p className="mb-2 text-[13.5px] text-muted">Total {b.totalAmount ?? "—"} · discount {b.totalDiscount ?? "—"}</p>}
                  <ul className="divide-y divide-line">
                    {b.items.map((i) => (
                      <li key={i.phone} className="flex flex-wrap items-baseline justify-between gap-2 py-2 text-[14px]">
                        <span className="min-w-0">
                          <span className="font-medium">{i.customerName || "—"}</span>
                          <span className="text-muted"> {i.vehiclePlate && `· ${i.vehiclePlate} `}· <span className="font-mono">{i.phone}</span></span>
                          {b.amountMinor === null && <span className="text-muted"> · {formatKes(i.amountMinor)}</span>}
                          {i.error && <span className="block text-[13px] text-[#B71C1C]">{i.error}</span>}
                        </span>
                        <span className={cn("rounded-full px-2 py-0.5 text-[12px] font-semibold", statusStyle[i.status])}>{i.status}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Card>
          </li>
        );
      })}
    </ul>
  );
}
