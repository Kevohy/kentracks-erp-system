"use client";

import { useRef, useState } from "react";
import { CalendarClock, Send } from "lucide-react";
import { Card } from "@/components/dashboard/Card";
import { erpApi, newClientKey } from "@/lib/erp-api";
import { checkSchedule, messageProblem, renderSms, smsParts, unknownFields, type SmsAudience, type SmsBatch } from "@/lib/sms";
import type { SmsDraft } from "./SmsComposer";
import { ConfirmSmsDialog, smsWhen } from "./sms-shared";

export type SmsTarget = { id: string; label: string; values: Record<string, string> };

/**
 * The sticky bar under a list: how many recipients and SMS parts, then Review → confirm → send. `targets` are the
 * picked customers or tracker lines (or, for phone numbers, one target per number with no fields).
 */
export function SmsSendBar({ audience, targets, phones, draft, connected, onErrors, onSent }: {
  audience: SmsAudience;
  targets: SmsTarget[];
  /** Phone numbers mode: the typed list as sent to the server. */
  phones?: string;
  draft: SmsDraft;
  connected: boolean;
  onErrors: (e: Record<string, string>) => void;
  onSent: (b: SmsBatch) => void;
}) {
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const key = useRef(newClientKey());

  const rendered = targets.map((t) => renderSms(draft.message, t.values));
  const parts = rendered.reduce((n, m) => n + smsParts(m), 0);

  function review() {
    setError(null);
    const errs: Record<string, string> = {};
    const p = messageProblem(draft.message);
    if (p) errs.message = p;
    else {
      const bad = unknownFields(draft.message, audience);
      if (bad.length) errs.message = audience === "OneOff" ? `Messages to phone numbers cannot use fields: ${bad.join(" ")}` : `Unknown field${bad.length > 1 ? "s" : ""}: ${bad.join(" ")}`;
      else {
        const i = rendered.findIndex((m) => messageProblem(m));
        if (i >= 0) errs.message = `For ${targets[i].label}: ${messageProblem(rendered[i])}`;
      }
    }
    if (draft.schedule) {
      const s = checkSchedule(draft.scheduleAt);
      if (s.error) errs.scheduleAt = s.error;
    }
    onErrors(errs);
    if (Object.keys(errs).length) return;
    if (targets.length === 0) return setError(audience === "OneOff" ? "Enter at least one phone number" : "Select at least one recipient");
    setConfirm(true);
  }

  async function send() {
    setBusy(true);
    const r = await erpApi.sms.send({
      kind: audience,
      ...(audience === "OneOff" ? { phones } : { ids: targets.map((t) => t.id) }),
      message: draft.message,
      templateName: draft.templateName || undefined,
      scheduleAt: draft.schedule ? draft.scheduleAt : undefined,
      clientKey: key.current,
    });
    setBusy(false);
    setConfirm(false);
    if (!r.ok) {
      const fe = r.fieldErrors;
      onErrors({ ...(fe.message ? { message: fe.message } : {}), ...(fe.scheduleAt ? { scheduleAt: fe.scheduleAt } : {}), ...(fe.phones ? { phones: fe.phones } : {}) });
      setError(fe.recipients ?? fe.phones ?? fe.form ?? (fe.message || fe.scheduleAt ? null : r.message));
      return;
    }
    key.current = newClientKey(); // a new send gets a new key
    onSent(r.data);
  }

  const when = draft.schedule ? checkSchedule(draft.scheduleAt).at : undefined;
  return (
    <div className="sticky bottom-[calc(76px+env(safe-area-inset-bottom))] z-20 lg:bottom-4">
      <Card className="flex flex-col gap-3 p-4 shadow-[0_10px_30px_rgba(10,29,44,0.14)] sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <p className="text-[14px] text-muted" aria-live="polite">
          <span className="font-semibold text-ink">{targets.length.toLocaleString("en-KE")}</span> recipient{targets.length === 1 ? "" : "s"}
          {targets.length > 0 && <> · <span className="font-semibold text-ink">{parts.toLocaleString("en-KE")}</span> SMS credit{parts === 1 ? "" : "s"}</>}
          {when && <span className="block text-[13px]">Scheduled for {smsWhen(when.toISOString())}</span>}
        </p>
        <button type="button" onClick={review} disabled={!connected || busy}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-brand px-5 text-[15px] font-semibold text-white hover:brightness-95 disabled:opacity-60">
          {draft.schedule ? <CalendarClock size={17} aria-hidden="true" /> : <Send size={17} aria-hidden="true" />}
          {draft.schedule ? "Schedule SMS" : "Send SMS"}
        </button>
      </Card>
      {error && <p role="alert" className="mt-2 rounded-xl bg-[#FDECEA] px-3.5 py-2.5 text-[14px] text-[#B71C1C]">{error}</p>}
      {confirm && (
        <ConfirmSmsDialog recipients={targets.length} parts={parts} scheduledFor={when ? smsWhen(when.toISOString()) : null} sample={rendered[0] ?? draft.message}
          busy={busy} onCancel={() => setConfirm(false)} onConfirm={() => void send()} />
      )}
    </div>
  );
}
