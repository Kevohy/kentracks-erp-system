"use client";

import { useEffect, useRef } from "react";
import { AlertTriangle, CalendarClock, CheckCircle2, Loader2, MessageSquareText } from "lucide-react";
import type { SmsBatch, SmsStatus } from "@/lib/sms";
import { cn } from "@/lib/cn";

export const smsStatusStyle: Record<SmsStatus, string> = {
  Delivered: "bg-[#E6F4EA] text-[#1B5E20]",
  Sent: "bg-[#E8F0FB] text-[#1F5FAD]",
  Scheduled: "bg-[#EEF1F4] text-[#3d4b57]",
  Failed: "bg-[#FDECEA] text-[#B71C1C]",
  Pending: "bg-[#FFF4E5] text-[#7a3d00]",
  Unknown: "bg-[#FFF4E5] text-[#7a3d00]",
};

export const smsWhen = (iso: string) =>
  new Date(iso).toLocaleString("en-KE", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Nairobi" });

export function SmsStatusPill({ status, className }: { status: SmsStatus; className?: string }) {
  return <span className={cn("inline-block shrink-0 rounded-full px-2 py-0.5 text-[12px] font-semibold", smsStatusStyle[status], className)}>{status}</span>;
}

export const Loading = () => (
  <p role="status" className="flex items-center gap-2 text-muted"><Loader2 size={16} className="animate-spin" aria-hidden="true" />Loading…</p>
);

/** Asks before using SMS credit. */
export function ConfirmSmsDialog({ recipients, parts, scheduledFor, sample, busy, onCancel, onConfirm }: {
  recipients: number; parts: number; scheduledFor: string | null; sample: string; busy: boolean; onCancel: () => void; onConfirm: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog ref={ref} onClose={onCancel} aria-labelledby="sms-confirm-title"
      className="m-auto max-h-[calc(100dvh-32px)] w-[calc(100%-32px)] max-w-md overflow-y-auto rounded-2xl border border-line bg-white p-0 text-ink shadow-[0_24px_60px_rgba(10,29,44,0.25)] backdrop:bg-ink/50">
      <div className="flex flex-col gap-4 p-5 sm:p-6">
        <div className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-xl bg-[#FFF1EA] text-brand" aria-hidden="true">
            {scheduledFor ? <CalendarClock size={21} /> : <MessageSquareText size={21} />}
          </span>
          <h2 id="sms-confirm-title" className="text-lg font-semibold">{scheduledFor ? "Schedule SMS?" : "Send SMS?"}</h2>
        </div>
        <dl className="grid grid-cols-2 gap-2 rounded-xl bg-canvas px-4 py-3 text-[14px]">
          <div><dt className="text-[12px] text-muted">Recipients</dt><dd className="font-semibold">{recipients.toLocaleString("en-KE")}</dd></div>
          <div><dt className="text-[12px] text-muted">SMS credits (parts)</dt><dd className="font-semibold">{parts.toLocaleString("en-KE")}</dd></div>
          {scheduledFor && <div className="col-span-2"><dt className="text-[12px] text-muted">Sends on</dt><dd className="font-semibold">{scheduledFor}</dd></div>}
        </dl>
        <div>
          <p className="mb-1 text-[12px] font-semibold uppercase tracking-wide text-muted">First message</p>
          <p className="whitespace-pre-wrap break-words rounded-xl border border-line px-3.5 py-2.5 text-[14px]">{sample}</p>
        </div>
        <p className="text-[14px] text-muted">This uses SMS credit from your TextSMS account and cannot be undone.</p>
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button type="button" onClick={onCancel} disabled={busy} className="min-h-11 rounded-xl border border-line px-4 text-[15px] font-semibold hover:bg-canvas">Cancel</button>
          <button type="button" onClick={onConfirm} disabled={busy}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-brand px-5 text-[15px] font-semibold text-white hover:brightness-95 disabled:opacity-60">
            {busy && <Loader2 size={17} className="animate-spin" aria-hidden="true" />}
            {busy ? "Sending…" : scheduledFor ? `Schedule ${recipients} SMS` : `Send ${recipients} SMS`}
          </button>
        </div>
      </div>
    </dialog>
  );
}

export function SmsResult({ batch, onClose }: { batch: SmsBatch; onClose: () => void }) {
  const ok = !batch.error && batch.failed === 0 && batch.sent === batch.recipients;
  const issues = (batch.messages ?? []).filter((m) => m.status !== "Sent" && m.status !== "Scheduled" && m.status !== "Delivered");
  const verb = batch.scheduledFor ? "scheduled" : "sent";
  return (
    <div role="status" className={cn("flex flex-col gap-2 rounded-2xl px-4 py-3.5 text-[14px]", ok ? "bg-[#E6F4EA] text-[#1B5E20]" : "bg-[#FFF4E5] text-[#7a3d00]")}>
      <p className="flex items-start gap-2 font-semibold">
        {ok ? <CheckCircle2 size={18} className="mt-0.5 shrink-0" aria-hidden="true" /> : <AlertTriangle size={18} className="mt-0.5 shrink-0" aria-hidden="true" />}
        <span className="flex-1">
          {batch.sent} of {batch.recipients} SMS {verb}{batch.failed ? `, ${batch.failed} failed` : ""}.
          {batch.scheduledFor ? ` They go out on ${smsWhen(batch.scheduledFor)}.` : ""}
        </span>
        <button type="button" onClick={onClose} className="text-[13px] underline">Dismiss</button>
      </p>
      {batch.error && <p>{batch.error}</p>}
      {issues.length > 0 && (
        <ul className="list-disc pl-6">
          {issues.slice(0, 8).map((m) => <li key={m.id}>{m.customerName || m.phone} {m.vehiclePlate && `(${m.vehiclePlate})`}: {m.status}{m.error ? ` — ${m.error}` : ""}</li>)}
          {issues.length > 8 && <li>and {issues.length - 8} more in History.</li>}
        </ul>
      )}
    </div>
  );
}
