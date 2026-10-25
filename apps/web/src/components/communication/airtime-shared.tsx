"use client";

import { useEffect, useRef } from "react";
import { AlertTriangle, CheckCircle2, Loader2, Smartphone } from "lucide-react";
import type { AirtimeBatch, AirtimeStatus } from "@/lib/airtime";
import { cn } from "@/lib/cn";
import { formatKes } from "@/lib/sales-format";

export const statusStyle: Record<AirtimeStatus, string> = {
  Sent: "bg-[#E6F4EA] text-[#1B5E20]",
  Failed: "bg-[#FDECEA] text-[#B71C1C]",
  Pending: "bg-[#FFF4E5] text-[#7a3d00]",
  Unknown: "bg-[#FFF4E5] text-[#7a3d00]",
};
export const when = (iso: string) => new Date(iso).toLocaleString("en-KE", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Nairobi" });
/** "2026-11-30" -> "30 Nov 2026" */
export const day = (ymd: string) => new Date(`${ymd}T12:00:00Z`).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/** Asks before spending money. `eachMinor` null: the lines get different amounts (monthly airtime). */
export function ConfirmDialog({ count, eachMinor, totalMinor, title = "Send airtime?", countLabel = "SIM lines", busy, onCancel, onConfirm }: {
  count: number; eachMinor: number | null; totalMinor: number; title?: string; countLabel?: string; busy: boolean; onCancel: () => void; onConfirm: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog ref={ref} onClose={onCancel} aria-labelledby="air-confirm-title"
      className="m-auto w-[calc(100%-32px)] max-w-md rounded-2xl border border-line bg-white p-0 text-ink shadow-[0_24px_60px_rgba(10,29,44,0.25)] backdrop:bg-ink/50">
      <div className="flex flex-col gap-4 p-5 sm:p-6">
        <div className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-xl bg-[#FFF1EA] text-brand" aria-hidden="true"><Smartphone size={21} /></span>
          <h2 id="air-confirm-title" className="text-lg font-semibold">{title}</h2>
        </div>
        <dl className="grid grid-cols-3 gap-2 rounded-xl bg-canvas px-4 py-3 text-[14px]">
          <div><dt className="text-[12px] text-muted">{countLabel}</dt><dd className="font-semibold">{count}</dd></div>
          <div><dt className="text-[12px] text-muted">Each</dt><dd className="font-semibold">{eachMinor === null ? "As approved" : formatKes(eachMinor)}</dd></div>
          <div><dt className="text-[12px] text-muted">Total</dt><dd className="font-semibold">{formatKes(totalMinor)}</dd></div>
        </dl>
        <p className="text-[14px] text-muted">This spends money from your Africa&apos;s Talking account and cannot be undone.</p>
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button type="button" onClick={onCancel} disabled={busy} className="min-h-11 rounded-xl border border-line px-4 text-[15px] font-semibold hover:bg-canvas">Cancel</button>
          <button type="button" onClick={onConfirm} disabled={busy}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-brand px-5 text-[15px] font-semibold text-white hover:brightness-95 disabled:opacity-60">
            {busy && <Loader2 size={17} className="animate-spin" aria-hidden="true" />}
            {busy ? "Sending…" : `Send ${formatKes(totalMinor)}`}
          </button>
        </div>
      </div>
    </dialog>
  );
}

export function SendResult({ batch, onClose }: { batch: AirtimeBatch; onClose: () => void }) {
  const ok = !batch.error && batch.failed === 0;
  const issues = batch.items.filter((i) => i.status !== "Sent");
  return (
    <div role="status" className={cn("flex flex-col gap-2 rounded-2xl px-4 py-3.5 text-[14px]", ok ? "bg-[#E6F4EA] text-[#1B5E20]" : "bg-[#FFF4E5] text-[#7a3d00]")}>
      <p className="flex items-start gap-2 font-semibold">
        {ok ? <CheckCircle2 size={18} className="mt-0.5 shrink-0" aria-hidden="true" /> : <AlertTriangle size={18} className="mt-0.5 shrink-0" aria-hidden="true" />}
        <span className="flex-1">
          {batch.sent} of {batch.recipients} sent{batch.failed ? `, ${batch.failed} failed` : ""}.
          {batch.totalAmount ? ` Total ${batch.totalAmount}` : ""}{batch.totalDiscount ? `, discount ${batch.totalDiscount}` : ""}.
        </span>
        <button type="button" onClick={onClose} className="text-[13px] underline">Dismiss</button>
      </p>
      {batch.error && <p>{batch.error}</p>}
      {issues.length > 0 && (
        <ul className="list-disc pl-6">
          {issues.slice(0, 8).map((i) => <li key={i.phone}>{i.customerName} {i.vehiclePlate && `(${i.vehiclePlate})`} {i.phone}: {i.status}{i.error ? ` — ${i.error}` : ""}</li>)}
          {issues.length > 8 && <li>and {issues.length - 8} more in History.</li>}
        </ul>
      )}
    </div>
  );
}

