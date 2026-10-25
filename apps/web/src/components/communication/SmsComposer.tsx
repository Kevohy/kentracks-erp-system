"use client";

import { useId, useRef } from "react";
import { AlertTriangle, CalendarClock, Eye } from "lucide-react";
import { Card } from "@/components/dashboard/Card";
import { cn } from "@/lib/cn";
import {
  gsmLength,
  gsmProblems,
  renderSms,
  SMS_FIELDS,
  SMS_MAX_CHARS,
  smsParts,
  STARTER_TEMPLATES,
  unknownFields,
  type SmsAudience,
  type SmsTemplate,
} from "@/lib/sms";

export type SmsDraft = { message: string; templateName: string; schedule: boolean; scheduleAt: string };

/** One hour from now, rounded to 5 minutes, as "YYYY-MM-DDTHH:mm" in Nairobi time. */
export function defaultScheduleAt() {
  const t = new Date(Date.now() + 3_600_000 + 3 * 3_600_000);
  t.setUTCMinutes(Math.ceil(t.getUTCMinutes() / 5) * 5, 0, 0);
  return t.toISOString().slice(0, 16);
}
const minScheduleAt = () => new Date(Date.now() + 6 * 60_000 + 3 * 3_600_000).toISOString().slice(0, 16);

export const emptyDraft = (audience: SmsAudience): SmsDraft => {
  const starter = STARTER_TEMPLATES[audience][0];
  return { message: starter?.body ?? "", templateName: starter?.name ?? "", schedule: false, scheduleAt: defaultScheduleAt() };
};

/**
 * Write the message: pick a saved or starter template, insert {fields}, see the length in SMS parts and a preview for
 * the first recipient, and optionally schedule it.
 */
export function SmsComposer({ audience, templates, draft, onChange, errors, preview }: {
  audience: SmsAudience;
  templates: SmsTemplate[] | null;
  draft: SmsDraft;
  onChange: (d: SmsDraft) => void;
  errors: { message?: string; scheduleAt?: string };
  /** The first selected recipient: shows the filled-in message. */
  preview: { label: string; values: Record<string, string> } | null;
}) {
  const uid = useId();
  const box = useRef<HTMLTextAreaElement>(null);
  const fields = SMS_FIELDS[audience];
  const saved = (templates ?? []).filter((t) => t.audience === audience);
  const starters = STARTER_TEMPLATES[audience];
  const set = (p: Partial<SmsDraft>) => onChange({ ...draft, ...p });

  const filled = preview ? renderSms(draft.message, preview.values) : draft.message;
  const len = gsmLength(filled);
  const parts = smsParts(filled);
  const bad = gsmProblems(draft.message.replace(/[‘’‚‛´`“”„«»–—‐‑−…   \t•·]/g, ""));
  const unknown = unknownFields(draft.message, audience);

  function pickTemplate(v: string) {
    if (!v) return set({ templateName: "" });
    const [kind, name] = [v.slice(0, 2), v.slice(2)];
    const t = kind === "s:" ? saved.find((x) => x.id === name) : starters.find((x) => x.name === name);
    if (t) set({ message: t.body, templateName: t.name });
  }

  function insert(key: string) {
    const el = box.current;
    const token = `{${key}}`;
    if (!el) return set({ message: draft.message + token });
    const [a, b] = [el.selectionStart ?? draft.message.length, el.selectionEnd ?? draft.message.length];
    const next = draft.message.slice(0, a) + token + draft.message.slice(b);
    set({ message: next });
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(a + token.length, a + token.length); });
  }

  const selected = saved.find((t) => t.name === draft.templateName && t.body === draft.message)
    ? `s:${saved.find((t) => t.name === draft.templateName && t.body === draft.message)!.id}`
    : starters.find((t) => t.name === draft.templateName && t.body === draft.message) ? `t:${draft.templateName}` : "";

  return (
    <Card className="flex flex-col gap-3 p-4 sm:p-5">
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${uid}-tpl`} className="text-[13.5px] font-medium">Template</label>
        <select id={`${uid}-tpl`} value={selected} onChange={(e) => pickTemplate(e.target.value)}
          className="min-h-11 w-full rounded-xl border border-line bg-white px-3 text-[15px] sm:max-w-sm">
          <option value="">{draft.message ? "Custom message" : "Choose a template (optional)"}</option>
          {saved.length > 0 && <optgroup label="Saved templates">{saved.map((t) => <option key={t.id} value={`s:${t.id}`}>{t.name}</option>)}</optgroup>}
          {starters.length > 0 && <optgroup label="Starters">{starters.map((t) => <option key={t.name} value={`t:${t.name}`}>{t.name}</option>)}</optgroup>}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${uid}-msg`} className="text-[13.5px] font-medium">Message</label>
        <textarea id={`${uid}-msg`} ref={box} rows={4} value={draft.message}
          onChange={(e) => set({ message: e.target.value, templateName: "" })}
          aria-invalid={errors.message ? true : undefined} aria-describedby={`${uid}-count${errors.message ? ` ${uid}-err` : ""}`}
          placeholder="Write the SMS…"
          className={cn("w-full resize-y rounded-xl border bg-white px-3.5 py-2.5 text-[15px] leading-relaxed", errors.message ? "border-[#C62828]" : "border-line")} />
        {fields.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[12.5px] text-muted">Insert:</span>
            {fields.map((f) => (
              <button key={f.key} type="button" onClick={() => insert(f.key)} title={`${f.label}, e.g. ${f.example}`}
                className="min-h-8 rounded-full border border-line bg-white px-2.5 text-[12.5px] font-semibold text-navy hover:bg-tint">
                {f.label}
              </button>
            ))}
          </div>
        )}
        <p id={`${uid}-count`} className={cn("text-[12.5px]", len > SMS_MAX_CHARS ? "text-[#C62828]" : "text-muted")} aria-live="polite">
          {len} / {SMS_MAX_CHARS} characters · {parts} SMS{parts === 1 ? "" : " parts"} per recipient{preview ? " (for the preview)" : ""}
        </p>
        {bad.length > 0 && (
          <p className="flex items-start gap-1.5 text-[13px] text-[#B71C1C]"><AlertTriangle size={15} className="mt-0.5 shrink-0" aria-hidden="true" />An SMS cannot send: {bad.slice(0, 8).join(" ")}. Remove them.</p>
        )}
        {unknown.length > 0 && (
          <p className="flex items-start gap-1.5 text-[13px] text-[#B71C1C]"><AlertTriangle size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
            {audience === "OneOff" ? `Messages to phone numbers cannot use fields: ${unknown.join(" ")}` : `Unknown field${unknown.length > 1 ? "s" : ""}: ${unknown.join(" ")}`}
          </p>
        )}
        {errors.message && <p id={`${uid}-err`} role="alert" className="text-[13px] text-[#C62828]">{errors.message}</p>}
      </div>

      {preview && draft.message.trim() && fields.length > 0 && (
        <div className="rounded-xl bg-canvas px-3.5 py-3">
          <p className="mb-1 flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-muted"><Eye size={14} aria-hidden="true" />Preview for {preview.label}</p>
          <p className="whitespace-pre-wrap break-words text-[14.5px]">{filled}</p>
        </div>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 text-[14px] font-medium">
          <input type="checkbox" className="size-5 accent-[#FE5102]" checked={draft.schedule} onChange={(e) => set({ schedule: e.target.checked })} />
          <CalendarClock size={16} className="text-muted" aria-hidden="true" />Schedule for later
        </label>
        {draft.schedule && (
          <div className="flex flex-col gap-1">
            <label htmlFor={`${uid}-at`} className="sr-only">Send on (Nairobi time)</label>
            <input id={`${uid}-at`} type="datetime-local" value={draft.scheduleAt} min={minScheduleAt()} onChange={(e) => set({ scheduleAt: e.target.value })}
              aria-invalid={errors.scheduleAt ? true : undefined}
              className={cn("min-h-11 rounded-xl border bg-white px-3 text-[15px]", errors.scheduleAt ? "border-[#C62828]" : "border-line")} />
            {errors.scheduleAt && <p role="alert" className="text-[13px] text-[#C62828]">{errors.scheduleAt}</p>}
          </div>
        )}
      </div>
    </Card>
  );
}
