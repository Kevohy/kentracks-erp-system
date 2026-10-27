"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/cn";
import type { Brand } from "@/lib/brands";
import { CONTACT_REQUIRED } from "@/lib/customer-validation";
import { customerTypes, formFieldsByType, isPerson, type CustomerType, type FieldName } from "@/lib/customers";

export type Values = Partial<Record<FieldName, string>>;

/** End User / Distributor / Company as one simple switch. */
export function CustomerTypePicker({ value, onChange, name }: { value: CustomerType; onChange: (t: CustomerType) => void; name: string }) {
  return (
    <fieldset>
      <legend className="sr-only">Type of customer</legend>
      <div className="grid grid-cols-3 gap-1 rounded-xl bg-canvas p-1">
        {customerTypes.map((t) => (
          <label key={t}
            className={cn("flex min-h-10 cursor-pointer items-center justify-center rounded-lg px-1 text-center text-[14px] font-semibold transition-colors has-focus-visible:outline-2 has-focus-visible:outline-navy",
              value === t ? "bg-white text-navy shadow-[0_1px_3px_rgba(16,32,48,0.12)]" : "text-muted hover:text-ink")}>
            <input type="radio" name={name} value={t} checked={value === t} onChange={() => onChange(t)} className="sr-only" />
            {t}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

const box = (bad?: string, ok?: boolean) =>
  cn("min-h-12 w-full rounded-xl border bg-white px-3.5 text-[16px] outline-none transition-colors placeholder:text-muted/60 focus:border-navy focus:ring-2 focus:ring-navy/15 sm:min-h-11 sm:text-[15px]",
    bad ? "border-[#C62828] bg-[#FFFAFA]" : ok ? "border-[#9CCFAA] pr-10" : "border-line");

/** How the keyboard and autofill treat each field. */
const INPUT: Partial<Record<FieldName, { autoComplete: string; autoCapitalize: string }>> = {
  fullName: { autoComplete: "name", autoCapitalize: "words" },
  companyName: { autoComplete: "organization", autoCapitalize: "words" },
  phone: { autoComplete: "tel", autoCapitalize: "off" },
  email: { autoComplete: "email", autoCapitalize: "off" },
  location: { autoComplete: "off", autoCapitalize: "words" },
  pin: { autoComplete: "off", autoCapitalize: "characters" },
};

/** The customer form: name, phone and email, account and brand, location. No sections or notes: each field says what it needs only when it needs it. */
export function CustomerFields({
  type,
  values,
  errors,
  valid = {},
  onChange,
  onBlur,
  brands,
  idPrefix,
}: {
  type: CustomerType;
  values: Values;
  errors: Values;
  valid?: Partial<Record<FieldName, boolean>>;
  onChange: (name: FieldName, raw: string) => void;
  onBlur: (name: FieldName) => void;
  brands: Brand[];
  /** Keeps field ids unique when the add and edit dialogs are both on the page. */
  idPrefix: string;
}) {
  const fields = formFieldsByType[type];
  // "Enter a phone number or an email" is said once, under both boxes.
  const contactMissing = errors.phone === CONTACT_REQUIRED && errors.email === CONTACT_REQUIRED;

  const input = (name: FieldName, wide?: boolean) => {
    const f = fields.find((x) => x.name === name);
    if (!f) return null;
    const id = `${idPrefix}-${f.name}`;
    const err = contactMissing && (name === "phone" || name === "email") ? undefined : errors[f.name];
    const ok = !err && valid[f.name];
    return (
      <div key={`${type}-${f.name}`} className={cn("flex flex-col gap-1.5", (wide ?? f.wide) && "sm:col-span-2")}>
        <label htmlFor={id} className="text-[13.5px] font-medium">{f.label}</label>
        <div className="relative">
          <input
            id={id}
            name={f.name}
            type={f.type}
            placeholder={f.placeholder}
            value={values[f.name] ?? ""}
            onChange={(e) => onChange(f.name, e.target.value)}
            onBlur={() => onBlur(f.name)}
            spellCheck={false}
            autoComplete={INPUT[f.name]?.autoComplete ?? "off"}
            autoCapitalize={INPUT[f.name]?.autoCapitalize ?? "off"}
            inputMode={f.type === "tel" ? "tel" : f.type === "email" ? "email" : undefined}
            aria-invalid={err || (contactMissing && (name === "phone" || name === "email")) ? true : undefined}
            aria-describedby={err ? `${id}-err` : contactMissing && (name === "phone" || name === "email") ? `${idPrefix}-contact-err` : undefined}
            className={box(err || (contactMissing && (name === "phone" || name === "email") ? "x" : undefined), ok)}
          />
          {ok && <Check size={18} strokeWidth={2.6} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#2E7D32]" aria-hidden="true" />}
        </div>
        {err && <p id={`${id}-err`} className="text-[13px] text-[#C62828]">{err}</p>}
      </div>
    );
  };

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {isPerson(type) ? input("fullName") : input("companyName")}
      {input("phone")}
      {input("email")}
      {contactMissing && <p id={`${idPrefix}-contact-err`} className="-mt-2 text-[13px] text-[#C62828] sm:col-span-2">Enter a phone number or an email (or both).</p>}
      {input("account")}
      {!isPerson(type) && input("pin")}
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${idPrefix}-brandId`} className="text-[13.5px] font-medium">Brand</label>
        <select
          id={`${idPrefix}-brandId`}
          name="brandId"
          value={values.brandId ?? ""}
          onChange={(e) => onChange("brandId", e.target.value)}
          aria-invalid={errors.brandId ? true : undefined}
          aria-describedby={errors.brandId ? `${idPrefix}-brandId-err` : undefined}
          className={box(errors.brandId)}
        >
          <option value="">Select…</option>
          {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        {errors.brandId && <p id={`${idPrefix}-brandId-err`} className="text-[13px] text-[#C62828]">{errors.brandId}</p>}
      </div>
      {input("location", isPerson(type))}
    </div>
  );
}

/** The form values after switching type: the name moves between "Full name" and "Company name"; the rest is kept. */
export function switchType(v: Values, from: CustomerType, to: CustomerType): Values {
  if (isPerson(from) === isPerson(to)) return v;
  return isPerson(to) ? { ...v, fullName: v.fullName || v.companyName || "" } : { ...v, companyName: v.companyName || v.fullName || "" };
}
