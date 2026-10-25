"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Info, Loader2, Plus, Search } from "lucide-react";
import type { AirtimeLine, AirtimeMonthly } from "@/lib/airtime";
import { cn } from "@/lib/cn";
import { erpApi } from "@/lib/erp-api";

/**
 * Communication → Airtime → Approval → "Add subscription": switch an existing sale (no airtime service, or the SMS
 * reminder) to automatic airtime recharge. The change is logged in the sale's history and the line then waits for approval.
 */
export function AddSubscriptionDialog({ onClose, onAdded }: { onClose: () => void; onAdded: (d: AirtimeMonthly, label: string) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [lines, setLines] = useState<AirtimeLine[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    ref.current?.showModal();
    void erpApi.airtime.candidates().then((r) => (r.ok ? setLines(r.data) : setLoadError(r.message)));
  }, []);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (lines ?? []).filter((l) => !s || [l.customerName, l.vehiclePlate, l.imei, l.simNumber, l.phone ?? ""].some((v) => v.toLowerCase().includes(s)));
  }, [lines, q]);
  const line = lines?.find((l) => l.saleId === picked) ?? null;

  async function save() {
    if (!line) return setError("Choose a tracker line");
    setBusy(true);
    setError(null);
    const r = await erpApi.airtime.subscribe(line.saleId, reason.trim());
    setBusy(false);
    if (!r.ok) return setError(r.fieldErrors.service ?? r.fieldErrors.reason ?? r.message);
    onAdded(r.data, `${line.customerName} (${line.vehiclePlate || line.imei})`);
  }

  return (
    <dialog ref={ref} onClose={onClose} aria-labelledby="air-add-title"
      className="m-auto max-h-[calc(100dvh-32px)] w-[calc(100%-32px)] max-w-xl overflow-y-auto rounded-2xl border border-line bg-white p-0 text-ink shadow-[0_24px_60px_rgba(10,29,44,0.25)] backdrop:bg-ink/50">
      <div className="flex flex-col gap-4 p-5 sm:p-6">
        <div className="flex items-center gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#FFF1EA] text-brand" aria-hidden="true"><Plus size={21} /></span>
          <div>
            <h2 id="air-add-title" className="text-lg font-semibold leading-tight">Add subscription</h2>
            <p className="text-[13px] text-muted">Switch an existing sale to automatic airtime recharge. It then waits for approval.</p>
          </div>
        </div>

        <label className="relative block">
          <span className="sr-only">Search tracker lines</span>
          <Search size={18} className="pointer-events-none absolute left-3.5 top-3.5 text-muted" aria-hidden="true" />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search customer, plate, IMEI or SIM number"
            className="min-h-11 w-full rounded-xl border border-line bg-white pl-10 pr-3.5 text-[15px]" />
        </label>

        {loadError && <p role="alert" className="text-[14px] text-[#C62828]">{loadError}</p>}
        {!lines && !loadError && <p role="status" className="flex items-center gap-2 text-muted"><Loader2 size={16} className="animate-spin" aria-hidden="true" />Loading…</p>}
        {lines && (shown.length === 0 ? (
          <p className="rounded-xl bg-canvas px-4 py-6 text-center text-[14px] text-muted">
            {lines.length === 0 ? "Every tracker line that can take airtime is already on automatic airtime recharge." : "No lines match."}
          </p>
        ) : (
          <fieldset className="max-h-[42vh] overflow-y-auto rounded-xl border border-line">
            <legend className="sr-only">Tracker line</legend>
            <ul className="divide-y divide-line">
              {shown.map((l) => (
                <li key={l.saleId}>
                  <label className={cn("flex cursor-pointer items-start gap-3 px-3.5 py-3", picked === l.saleId ? "bg-[#FFF8F4]" : "hover:bg-canvas/60")}>
                    <input type="radio" name="air-add-line" className="mt-1 size-4 accent-[#FE5102]" checked={picked === l.saleId} onChange={() => { setPicked(l.saleId); setError(null); }} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-semibold">{l.customerName}</span>
                      <span className="block truncate text-[13px] text-muted">{[l.vehiclePlate, l.imei].filter(Boolean).join(" · ")} · <span className="font-mono">{l.phone ?? (l.simNumber || "no SIM number")}</span></span>
                    </span>
                    <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[12px] font-semibold", l.service === "SMS reminder" ? "bg-[#E8F0FB] text-[#1F5FAD]" : "bg-canvas text-muted")}>
                      {l.service === "SMS reminder" ? "SMS reminder" : "No service"}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>
        ))}

        {line && (
          <div className="flex flex-col gap-3 rounded-xl bg-canvas px-4 py-3 text-[14px]">
            <p className="flex items-start gap-2">
              <Info size={17} className="mt-0.5 shrink-0 text-navy" aria-hidden="true" />
              <span>
                <span className="font-semibold">{line.service === "SMS reminder" ? "SMS reminder" : "No service"}</span> → <span className="font-semibold">Automatic airtime recharge</span>.
                {line.service === "SMS reminder" && " The monthly SMS reminder is switched off for this sale."} The change is saved in the sale&apos;s history and shows in Billing.
              </span>
            </p>
            <label className="flex flex-col gap-1.5">
              <span className="text-[13.5px] font-medium">Reason (optional)</span>
              <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder="e.g. Customer asked for automatic airtime"
                className="min-h-11 rounded-xl border border-line bg-white px-3.5 text-[15px]" />
            </label>
          </div>
        )}
        {error && <p role="alert" className="text-[13.5px] text-[#C62828]">{error}</p>}

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} disabled={busy} className="min-h-11 rounded-xl border border-line px-4 text-[15px] font-semibold hover:bg-canvas">Cancel</button>
          <button type="button" onClick={() => void save()} disabled={busy || !line}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-navy px-5 text-[15px] font-semibold text-white hover:brightness-110 disabled:opacity-60">
            {busy && <Loader2 size={17} className="animate-spin" aria-hidden="true" />}Switch to automatic airtime
          </button>
        </div>
      </div>
    </dialog>
  );
}
