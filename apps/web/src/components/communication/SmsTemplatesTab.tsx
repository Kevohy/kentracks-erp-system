"use client";

import { useEffect, useRef, useState } from "react";
import { FileText, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { Card } from "@/components/dashboard/Card";
import { cn } from "@/lib/cn";
import { erpApi } from "@/lib/erp-api";
import {
  audienceLabel,
  gsmLength,
  SMS_AUDIENCES,
  SMS_FIELDS,
  SMS_MAX_CHARS,
  smsParts,
  STARTER_TEMPLATES,
  validateTemplate,
  type SmsAudience,
  type SmsTemplate,
  type SmsTemplateDraft,
} from "@/lib/sms";
import { Loading } from "./sms-shared";

/** Communication → Bulk SMS → Templates: saved messages with {fields}, grouped by who they are for. */
export function SmsTemplatesTab({ templates, onChange }: { templates: SmsTemplate[] | null; onChange: (t: SmsTemplate[]) => void }) {
  const [editing, setEditing] = useState<SmsTemplate | "new" | null>(null);
  const [deleting, setDeleting] = useState<SmsTemplate | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  if (!templates) return <Loading />;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13.5px] text-muted">Saved messages. Fields like {"{first_name}"} are filled in for each recipient when you send.</p>
        <button type="button" onClick={() => { setEditing("new"); setNotice(null); }}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-navy px-4 text-[15px] font-semibold text-white hover:brightness-110">
          <Plus size={17} aria-hidden="true" />New template
        </button>
      </div>
      {notice && <p role="status" className="rounded-xl bg-[#E6F4EA] px-3.5 py-2.5 text-[14px] text-[#1B5E20]">{notice}</p>}
      {SMS_AUDIENCES.map((a) => {
        const list = templates.filter((t) => t.audience === a);
        return (
          <section key={a} aria-labelledby={`tpl-${a}`} className="flex flex-col gap-2">
            <h2 id={`tpl-${a}`} className="text-[13px] font-semibold uppercase tracking-wide text-muted">{audienceLabel[a]}</h2>
            {list.length === 0 ? (
              <Card className="px-4 py-4 text-[14px] text-muted">
                No saved templates.{STARTER_TEMPLATES[a].length > 0 && ` The starter${STARTER_TEMPLATES[a].length > 1 ? "s" : ""} (${STARTER_TEMPLATES[a].map((s) => s.name).join(", ")}) are always available when you send.`}
              </Card>
            ) : (
              <ul className="grid gap-3 md:grid-cols-2">
                {list.map((t) => (
                  <li key={t.id}>
                    <Card className="flex h-full flex-col gap-2 p-4">
                      <div className="flex items-start gap-2">
                        <FileText size={17} className="mt-0.5 shrink-0 text-muted" aria-hidden="true" />
                        <h3 className="min-w-0 flex-1 break-words text-[15px] font-semibold">{t.name}</h3>
                        <button type="button" onClick={() => { setEditing(t); setNotice(null); }} aria-label={`Edit ${t.name}`} className="grid size-9 place-items-center rounded-lg text-navy hover:bg-tint"><Pencil size={16} aria-hidden="true" /></button>
                        <button type="button" onClick={() => { setDeleting(t); setNotice(null); }} aria-label={`Delete ${t.name}`} className="grid size-9 place-items-center rounded-lg text-[#B71C1C] hover:bg-[#FDECEA]"><Trash2 size={16} aria-hidden="true" /></button>
                      </div>
                      <p className="whitespace-pre-wrap break-words text-[14px]">{t.body}</p>
                      <p className="mt-auto text-[12.5px] text-muted">{gsmLength(t.body)} characters · about {smsParts(t.body)} SMS</p>
                    </Card>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
      {editing && (
        <TemplateDialog template={editing === "new" ? null : editing} onClose={() => setEditing(null)}
          onSaved={(t) => {
            onChange(editing === "new" ? [...templates, t].sort((a, b) => a.name.localeCompare(b.name)) : templates.map((x) => (x.id === t.id ? t : x)));
            setNotice(`Template "${t.name}" saved.`);
            setEditing(null);
          }} />
      )}
      {deleting && (
        <DeleteDialog template={deleting} onClose={() => setDeleting(null)}
          onDeleted={() => { onChange(templates.filter((x) => x.id !== deleting.id)); setNotice(`Template "${deleting.name}" deleted.`); setDeleting(null); }} />
      )}
    </div>
  );
}

function TemplateDialog({ template, onClose, onSaved }: { template: SmsTemplate | null; onClose: () => void; onSaved: (t: SmsTemplate) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const [d, setD] = useState<SmsTemplateDraft>({ name: template?.name ?? "", body: template?.body ?? "", audience: template?.audience ?? "Customers" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  const fields = SMS_FIELDS[d.audience as SmsAudience] ?? [];

  function insert(key: string) {
    const el = box.current;
    const token = `{${key}}`;
    const [a, b] = [el?.selectionStart ?? d.body.length, el?.selectionEnd ?? d.body.length];
    setD({ ...d, body: d.body.slice(0, a) + token + d.body.slice(b) });
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(a + token.length, a + token.length); });
  }

  async function save() {
    const v = validateTemplate(d);
    setErrors(v.errors);
    if (!v.value) return;
    setBusy(true);
    const r = template ? await erpApi.sms.updateTemplate(template.id, d) : await erpApi.sms.createTemplate(d);
    setBusy(false);
    if (!r.ok) return setErrors(Object.keys(r.fieldErrors).length ? r.fieldErrors : { form: r.message });
    onSaved(r.data);
  }

  const input = (bad?: string) => cn("min-h-11 w-full rounded-xl border bg-white px-3.5 text-[15px]", bad ? "border-[#C62828]" : "border-line");
  return (
    <dialog ref={ref} onClose={onClose} aria-labelledby="tpl-title"
      className="m-auto max-h-[calc(100dvh-32px)] w-[calc(100%-32px)] max-w-lg overflow-y-auto rounded-2xl border border-line bg-white p-0 text-ink shadow-[0_24px_60px_rgba(10,29,44,0.25)] backdrop:bg-ink/50">
      <form onSubmit={(e) => { e.preventDefault(); void save(); }} noValidate className="flex flex-col gap-4 p-5 sm:p-6">
        <h2 id="tpl-title" className="text-lg font-semibold">{template ? "Edit template" : "New template"}</h2>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="tpl-name" className="text-[13.5px] font-medium">Name</label>
          <input id="tpl-name" value={d.name} maxLength={80} onChange={(e) => setD({ ...d, name: e.target.value })} aria-invalid={errors.name ? true : undefined} className={input(errors.name)} />
          {errors.name && <p className="text-[13px] text-[#C62828]">{errors.name}</p>}
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="tpl-aud" className="text-[13.5px] font-medium">For</label>
          <select id="tpl-aud" value={d.audience} onChange={(e) => setD({ ...d, audience: e.target.value })} className={input(errors.audience)}>
            {SMS_AUDIENCES.map((a) => <option key={a} value={a}>{audienceLabel[a]}</option>)}
          </select>
          {errors.audience && <p className="text-[13px] text-[#C62828]">{errors.audience}</p>}
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="tpl-body" className="text-[13.5px] font-medium">Message</label>
          <textarea id="tpl-body" ref={box} rows={5} value={d.body} onChange={(e) => setD({ ...d, body: e.target.value })} aria-invalid={errors.body ? true : undefined}
            className={cn("w-full resize-y rounded-xl border bg-white px-3.5 py-2.5 text-[15px] leading-relaxed", errors.body ? "border-[#C62828]" : "border-line")} />
          {fields.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[12.5px] text-muted">Insert:</span>
              {fields.map((f) => (
                <button key={f.key} type="button" onClick={() => insert(f.key)} title={`e.g. ${f.example}`}
                  className="min-h-8 rounded-full border border-line bg-white px-2.5 text-[12.5px] font-semibold text-navy hover:bg-tint">{f.label}</button>
              ))}
            </div>
          )}
          <p className="text-[12.5px] text-muted">{gsmLength(d.body)} / {SMS_MAX_CHARS} characters · about {smsParts(d.body)} SMS (fields change the length)</p>
          {errors.body && <p className="text-[13px] text-[#C62828]">{errors.body}</p>}
        </div>
        {errors.form && <p role="alert" className="text-[13.5px] text-[#C62828]">{errors.form}</p>}
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} disabled={busy} className="min-h-11 rounded-xl border border-line px-4 text-[15px] font-semibold hover:bg-canvas">Cancel</button>
          <button type="submit" disabled={busy} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-navy px-5 text-[15px] font-semibold text-white hover:brightness-110 disabled:opacity-60">
            {busy && <Loader2 size={17} className="animate-spin" aria-hidden="true" />}Save template
          </button>
        </div>
      </form>
    </dialog>
  );
}

function DeleteDialog({ template, onClose, onDeleted }: { template: SmsTemplate; onClose: () => void; onDeleted: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  async function del() {
    setBusy(true);
    const r = await erpApi.sms.deleteTemplate(template.id);
    setBusy(false);
    if (!r.ok) return setError(r.message);
    onDeleted();
  }
  return (
    <dialog ref={ref} onClose={onClose} aria-labelledby="tpl-del-title"
      className="m-auto w-[calc(100%-32px)] max-w-md rounded-2xl border border-line bg-white p-0 text-ink shadow-[0_24px_60px_rgba(10,29,44,0.25)] backdrop:bg-ink/50">
      <div className="flex flex-col gap-4 p-5 sm:p-6">
        <h2 id="tpl-del-title" className="text-lg font-semibold">Delete &ldquo;{template.name}&rdquo;?</h2>
        <p className="text-[14px] text-muted">SMS already sent with it are not affected.</p>
        {error && <p role="alert" className="text-[13.5px] text-[#C62828]">{error}</p>}
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} disabled={busy} className="min-h-11 rounded-xl border border-line px-4 text-[15px] font-semibold hover:bg-canvas">Cancel</button>
          <button type="button" onClick={() => void del()} disabled={busy} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#C62828] px-5 text-[15px] font-semibold text-white hover:brightness-95 disabled:opacity-60">
            {busy && <Loader2 size={17} className="animate-spin" aria-hidden="true" />}Delete template
          </button>
        </div>
      </div>
    </dialog>
  );
}
