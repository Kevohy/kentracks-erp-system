"use client";

import { useRef, useState, type FormEvent } from "react";
import { Globe, ImagePlus, Mail, MapPin, Pencil, Phone, Plus, Trash2, UserRound } from "lucide-react";
import { Card } from "@/components/dashboard/Card";
import { ListStatusRow, useCrmList } from "@/components/crm/useCrmList";
import { TextField } from "@/components/sales/fields";
import { PageHeader } from "@/components/shell/PageHeader";
import { validateBrand, type BrandErrors } from "@/lib/brand-validation";
import { BRAND_IMAGE_TYPES, DEFAULT_BRAND_COLOR, MAX_BRAND_IMAGE_BYTES, type Brand, type BrandImageKind, type BrandProfile } from "@/lib/brands";
import { dominantColor } from "@/lib/dominant-color";
import { crmApi } from "@/lib/crm-api";
import { localPhone } from "@/lib/sms";
import { stripControlChars } from "@/lib/validation";

const EMPTY: BrandProfile = { name: "", tagline: "", phone: "", email: "", website: "", location: "", directorName: "", color: "" };
const FIELDS: { key: keyof BrandProfile; label: string; placeholder: string }[] = [
  { key: "name", label: "Brand name", placeholder: "e.g. Kentracks" },
  { key: "tagline", label: "Tagline", placeholder: "e.g. Track what matters" },
  { key: "phone", label: "Phone", placeholder: "e.g. 0712345678" },
  { key: "email", label: "Email", placeholder: "e.g. info@kentracksgps.com" },
  { key: "website", label: "Website", placeholder: "e.g. kentracksgps.com" },
  { key: "location", label: "Location", placeholder: "e.g. Westlands, Nairobi" },
  { key: "directorName", label: "Director name", placeholder: "e.g. Jane Wanjiku" },
];
const toProfile = (b: Brand): BrandProfile => ({
  name: b.name, tagline: b.tagline, phone: b.phone ? localPhone(b.phone) : "", email: b.email, website: b.website, location: b.location, directorName: b.directorName,
  color: b.color,
});

function readImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("read"));
    r.readAsDataURL(file);
  });
}

function ImageSlot({ brand, kind, label, hint, onChange, onUploaded }: { brand: Brand; kind: BrandImageKind; label: string; hint: string; onChange: (b: Brand) => void; onUploaded?: (file: File) => void }) {
  const url = kind === "logo" ? brand.logoUrl : kind === "icon" ? brand.iconUrl : brand.signatureUrl;
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const id = `brand-${kind}`;

  async function choose(file: File | undefined) {
    if (input.current) input.current.value = "";
    if (!file) return;
    setError("");
    if (!(BRAND_IMAGE_TYPES as readonly string[]).includes(file.type)) return setError(`${label} must be a PNG, JPEG or WebP image`);
    if (file.size > MAX_BRAND_IMAGE_BYTES) return setError(`${label} must be 500 KB or smaller`);
    setBusy(true);
    try {
      const r = await crmApi.brands.setImage(brand.id, kind, await readImage(file));
      if (r.ok) {
        onChange(r.data);
        onUploaded?.(file);
      } else setError(r.fieldErrors.image ?? r.message);
    } catch {
      setError("The file could not be read. Try another image.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError("");
    const r = await crmApi.brands.removeImage(brand.id, kind);
    setBusy(false);
    if (r.ok) onChange(r.data);
    else setError(r.message);
  }

  return (
    <div className="flex flex-col gap-2">
      <span id={`${id}-label`} className="text-[14px] font-semibold">{label}</span>
      <div className="flex items-center gap-3">
        <div className={`flex shrink-0 items-center justify-center overflow-hidden rounded-xl border border-line bg-canvas ${kind === "signature" ? "h-16 w-32" : kind === "logo" ? "h-16 w-28" : "size-16"}`}>
          {/* eslint-disable-next-line @next/next/no-img-element -- same-origin image from the API, versioned URL */}
          {url ? <img src={url} alt={`${brand.name} ${label.toLowerCase()}`} className="max-h-full max-w-full object-contain" /> : <ImagePlus size={20} className="text-muted" aria-hidden="true" />}
        </div>
        <div className="flex flex-wrap gap-2">
          <input ref={input} id={id} type="file" accept={BRAND_IMAGE_TYPES.join(",")} className="sr-only" aria-labelledby={`${id}-label`}
            onChange={(e) => void choose(e.target.files?.[0])} disabled={busy} />
          <button type="button" onClick={() => input.current?.click()} disabled={busy}
            className="min-h-10 rounded-xl border border-line px-3 text-[14px] font-semibold hover:bg-canvas disabled:opacity-60">
            {busy ? "Saving…" : url ? "Replace" : "Upload"}
          </button>
          {url && (
            <button type="button" onClick={() => void remove()} disabled={busy} aria-label={`Remove ${label.toLowerCase()}`}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-xl px-3 text-[14px] font-semibold text-[#C62828] hover:bg-[#FDECEA] disabled:opacity-60">
              <Trash2 size={15} aria-hidden="true" />Remove
            </button>
          )}
        </div>
      </div>
      <p className="text-[12.5px] text-muted">{hint}</p>
      {error && <p role="alert" className="text-[13.5px] text-[#C62828]">{error}</p>}
    </div>
  );
}

function Detail({ icon: Icon, children }: { icon: typeof Phone; children: string }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 text-[13.5px] text-muted">
      <Icon size={14} className="shrink-0" aria-hidden="true" />
      <span className="truncate">{children}</span>
    </span>
  );
}

/**
 * Settings → Brands: the brands a company sells under, with the profile used on documents (logo, tagline, contacts,
 * location, director and signature). Brands are offered when adding a customer; renaming one updates its customers.
 */
export function BrandsView() {
  const { state, retry, replace } = useCrmList(crmApi.brands.list);
  const brands = state.status === "ready" ? state.items : [];
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const [saved, setSaved] = useState("");
  const saving = useRef(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<BrandProfile>(EMPTY);
  const [errors, setErrors] = useState<BrandErrors>({});
  const editing = brands.find((b) => b.id === editingId) ?? null;

  const focus = (key: keyof BrandProfile) => rootRef.current?.querySelector<HTMLElement>(`#brand-${key}`)?.focus();
  const reset = () => {
    setEditingId(null);
    setForm(EMPTY);
    setErrors({});
    setFormError("");
    setSaved("");
  };

  function setColor(v: string) {
    setForm((x) => ({ ...x, color: v }));
    setErrors((x) => ({ ...x, color: undefined }));
    setSaved("");
  }

  /** A new icon: when the brand has no colour yet, take the icon's main colour (saved with the next "Save changes"). */
  async function iconUploaded(file: File) {
    if (form.color) return;
    const picked = await dominantColor(file);
    if (!picked) return;
    setForm((x) => (x.color ? x : { ...x, color: picked }));
    setSaved(`Brand colour ${picked} picked from the icon. Click Save changes to keep it.`);
  }

  function edit(id: string) {
    const b = brands.find((x) => x.id === id);
    if (!b) return;
    setEditingId(id);
    setForm(toProfile(b));
    setErrors({});
    setFormError("");
    setSaved("");
    rootRef.current?.querySelector("#brand-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
    setTimeout(() => focus("name"), 0);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (saving.current) return; // a second click or Enter while saving must not add another brand
    const r = validateBrand(form, brands, editingId ?? undefined);
    setErrors(r.errors);
    const first = FIELDS.find((f) => r.errors[f.key]);
    if (first) return focus(first.key);
    if (r.errors.color) return focus("color");
    saving.current = true;
    setBusy(true);
    setFormError("");
    setSaved("");
    const result = editingId ? await crmApi.brands.update(editingId, r.value) : await crmApi.brands.create(r.value);
    saving.current = false;
    setBusy(false);
    if (result.ok) {
      if (editingId) replace(result.data);
      else retry();
      // Stay on the brand so its logo and signature can be added straight away.
      setEditingId(result.data.id);
      setForm(toProfile(result.data));
      setSaved(editingId ? "Changes saved." : "Brand added. You can now upload its logo, icon and signature.");
      return;
    }
    const fe = result.fieldErrors as BrandErrors;
    if (Object.keys(fe).length) {
      setErrors(fe);
      const f = FIELDS.find((x) => fe[x.key]);
      if (f) focus(f.key);
    } else setFormError(result.message);
  }

  return (
    <>
      <PageHeader title="Brands" subtitle="Each brand's logo, contacts, director and signature, used on documents. Brands are offered when adding a customer; renaming one updates every customer that uses it." />
      <div ref={rootRef} className="grid gap-5 lg:grid-cols-[1fr_420px] lg:items-start">
        <div className="flex flex-col gap-3">
          {state.status !== "ready" || brands.length === 0 ? (
            <Card className="overflow-hidden">
              <table className="w-full"><tbody><ListStatusRow state={state} colSpan={1} empty="No brands yet. Add one to use it on customers." retry={retry} /></tbody></table>
            </Card>
          ) : (
            brands.map((b) => (
              <Card key={b.id} className={`px-5 py-4 ${b.id === editingId ? "ring-2 ring-brand/40" : ""}`}>
                <article aria-label={b.name} className="flex items-start gap-4">
                  <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-line bg-canvas">
                    {/* eslint-disable-next-line @next/next/no-img-element -- same-origin image from the API, versioned URL */}
                    {b.iconUrl ? <img src={b.iconUrl} alt={`${b.name} icon`} className="max-h-full max-w-full object-contain" />
                      // eslint-disable-next-line @next/next/no-img-element -- same-origin image from the API, versioned URL
                      : b.logoUrl ? <img src={b.logoUrl} alt={`${b.name} logo`} className="max-h-full max-w-full object-contain" />
                      : <span className="text-[18px] font-bold text-muted" aria-hidden="true">{b.name.slice(0, 1).toUpperCase()}</span>}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="flex items-center gap-2 break-words text-[16px] font-semibold">
                          {b.name}
                          <span title={`Brand colour ${b.color || `${DEFAULT_BRAND_COLOR} (default)`}`} className="inline-block size-3.5 shrink-0 rounded-full border border-black/10" style={{ backgroundColor: b.color || DEFAULT_BRAND_COLOR }} />
                        </h3>
                        {b.tagline && <p className="text-[13.5px] italic text-muted">{b.tagline}</p>}
                      </div>
                      <button type="button" onClick={() => edit(b.id)} aria-label={`Edit ${b.name}`}
                        className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl px-3 text-[14px] font-semibold text-navy hover:bg-canvas">
                        <Pencil size={15} aria-hidden="true" />Edit
                      </button>
                    </div>
                    <div className="mt-2 grid gap-x-4 gap-y-1 sm:grid-cols-2">
                      {b.phone && <Detail icon={Phone}>{localPhone(b.phone)}</Detail>}
                      {b.email && <Detail icon={Mail}>{b.email}</Detail>}
                      {b.website && <Detail icon={Globe}>{b.website.replace(/^https?:\/\//, "")}</Detail>}
                      {b.location && <Detail icon={MapPin}>{b.location}</Detail>}
                      {b.directorName && <Detail icon={UserRound}>{`Director: ${b.directorName}`}</Detail>}
                    </div>
                    {!b.phone && !b.email && !b.website && !b.location && !b.directorName && (
                      <p className="mt-2 text-[13.5px] text-muted">No details yet. Click Edit to add the logo, contacts and director.</p>
                    )}
                    {b.directorName && (
                      <p className="mt-2 text-[12.5px] text-muted">{b.signatureUrl ? "Signature on file" : "No signature yet"}</p>
                    )}
                  </div>
                </article>
              </Card>
            ))
          )}
        </div>

        <Card className="px-5 py-5 lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto">
          <form id="brand-form" onSubmit={submit} noValidate className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-[16px] font-semibold">{editing ? `Edit ${editing.name}` : "Add brand"}</h2>
              {editing && (
                <button type="button" onClick={reset} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl px-3 text-[14px] font-semibold text-navy hover:bg-canvas">
                  <Plus size={15} aria-hidden="true" />New brand
                </button>
              )}
            </div>
            {FIELDS.map((f) => (
              <TextField key={f.key} id={`brand-${f.key}`} label={f.key === "name" ? f.label : `${f.label} (optional)`} value={form[f.key]} placeholder={f.placeholder} error={errors[f.key]}
                onChange={(v) => { setForm((x) => ({ ...x, [f.key]: stripControlChars(v) })); setErrors((x) => ({ ...x, [f.key]: undefined })); setSaved(""); }} />
            ))}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="brand-color" className="text-[14px] font-semibold">Brand colour (optional)</label>
              <div className="flex flex-wrap items-center gap-2.5">
                <input type="color" aria-label="Pick the brand colour" value={/^#[0-9A-F]{6}$/i.test(form.color) ? form.color : DEFAULT_BRAND_COLOR}
                  onChange={(e) => setColor(e.target.value.toUpperCase())}
                  className="h-11 w-14 cursor-pointer rounded-lg border border-line bg-white p-1" />
                <input id="brand-color" type="text" value={form.color} placeholder={`${DEFAULT_BRAND_COLOR} (default)`} maxLength={7} spellCheck={false} autoComplete="off"
                  onChange={(e) => setColor(stripControlChars(e.target.value))} aria-invalid={errors.color ? true : undefined} aria-describedby="brand-color-hint"
                  className={`min-h-11 w-36 rounded-xl border px-3 font-mono text-[15px] uppercase outline-none focus:border-navy ${errors.color ? "border-[#C62828]" : "border-line"}`} />
                {form.color && (
                  <button type="button" onClick={() => setColor("")} className="min-h-10 rounded-xl px-3 text-[14px] font-semibold text-navy hover:bg-canvas">Use default</button>
                )}
              </div>
              <p id="brand-color-hint" className="text-[12.5px] text-muted">Used on this brand&apos;s certificates and stamp. Uploading an icon picks its main colour when none is set.</p>
              {errors.color && <p role="alert" className="text-[13.5px] text-[#C62828]">{errors.color}</p>}
            </div>
            {editing ? (
              <div className="flex flex-col gap-4 border-t border-line pt-4">
                <ImageSlot brand={editing} kind="logo" label="Logo" hint="The full logo (wordmark). PNG, JPEG or WebP, up to 500 KB." onChange={replace} />
                <ImageSlot brand={editing} kind="icon" label="Icon" hint="A square app-style mark, used on certificates and stamps. Its main colour becomes the brand colour if none is set." onChange={replace} onUploaded={iconUploaded} />
                <ImageSlot brand={editing} kind="signature" label="Director's signature" hint="PNG, JPEG or WebP, up to 500 KB. A signature on a white or transparent background." onChange={replace} />
              </div>
            ) : (
              <p className="text-[13px] text-muted">The logo, icon and the director&apos;s signature can be uploaded once the brand is added.</p>
            )}
            {formError && <p role="alert" className="text-[14px] text-[#C62828]">{formError}</p>}
            {saved && <p role="status" className="text-[14px] text-[#1B5E20]">{saved}</p>}
            <div className="flex flex-wrap justify-end gap-3">
              {editing && (
                <button type="button" onClick={reset} className="min-h-11 rounded-xl border border-line px-4 text-[15px] font-semibold hover:bg-canvas">
                  Close
                </button>
              )}
              <button type="submit" disabled={busy} className="min-h-11 rounded-xl bg-brand px-5 text-[15px] font-semibold text-white hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60">
                {busy ? "Saving…" : editing ? "Save changes" : "Add brand"}
              </button>
            </div>
          </form>
        </Card>
      </div>
    </>
  );
}
