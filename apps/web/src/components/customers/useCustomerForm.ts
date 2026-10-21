"use client";

import { useState, type RefObject } from "react";
import { CONTACT_REQUIRED, sanitizeAccountInput, sanitizePhoneInput, validateContact, validateField } from "@/lib/customer-validation";
import { fieldsByType, type CustomerType, type FieldName } from "@/lib/customers";
import type { Values } from "./CustomerFields";

export function useCustomerForm(dialogRef: RefObject<HTMLDialogElement | null>) {
  const [values, setValues] = useState<Values>({});
  const [errors, setErrors] = useState<Values>({});

  function reset(initial: Values = {}) {
    setValues(initial);
    setErrors({});
  }

  function change(name: FieldName, raw: string) {
    const value = name === "account" ? sanitizeAccountInput(raw) : name === "phone" ? sanitizePhoneInput(raw) : raw;
    setValues((p) => ({ ...p, [name]: value }));
    // Typing a phone or an email also clears the "phone or email" message on the other field.
    const other = name === "phone" ? "email" : name === "email" ? "phone" : null;
    if (errors[name] || (other && errors[other] === CONTACT_REQUIRED))
      setErrors((p) => ({ ...p, [name]: undefined, ...(other && p[other] === CONTACT_REQUIRED ? { [other]: undefined } : {}) }));
  }

  function blur(name: FieldName) {
    const raw = values[name] ?? "";
    if (!raw) return;
    // Keep an error the server reported (e.g. a duplicate account) until the user edits the field.
    const error = validateField(name, raw).error;
    setErrors((p) => ({ ...p, [name]: error ?? p[name] }));
  }

  /** Returns the cleaned values, or null when something is invalid (and focuses the first bad field). */
  function validate(type: CustomerType): Values | null {
    const fields = fieldsByType[type];
    const next: Values = {};
    const clean: Values = {};
    for (const f of fields) {
      const r = validateField(f.name, values[f.name] ?? "");
      if (r.error) next[f.name] = r.error;
      clean[f.name] = r.value;
    }
    if (!next.phone && !next.email) Object.assign(next, validateContact(clean.phone ?? "", clean.email ?? ""));
    const brand = validateField("brandId", values.brandId ?? "");
    if (brand.error) next.brandId = brand.error;
    clean.brandId = brand.value;
    setErrors(next);
    const first = next.brandId ? { name: "brandId" as const } : fields.find((f) => next[f.name]);
    if (first) {
      dialogRef.current?.querySelector<HTMLInputElement>(`[name="${first.name}"]`)?.focus();
      return null;
    }
    return clean;
  }

  /** Shows errors the server reported against form fields (e.g. a duplicate account) and focuses the first. */
  function applyServerErrors(fieldErrors: Record<string, string>) {
    const known = Object.fromEntries(Object.entries(fieldErrors).filter(([k]) => k in values || k === "account" || k === "phone" || k === "email")) as Values;
    setErrors(known);
    const first = Object.keys(known)[0];
    if (first) dialogRef.current?.querySelector<HTMLInputElement>(`[name="${first}"]`)?.focus();
  }

  return { values, errors, reset, change, blur, validate, applyServerErrors };
}
