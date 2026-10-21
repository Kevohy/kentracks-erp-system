"use client";

import { useState, type RefObject } from "react";
import { sanitizeAccountInput, sanitizePhoneInput, validateField } from "@/lib/customer-validation";
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
    if (errors[name]) setErrors((p) => ({ ...p, [name]: undefined }));
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
    const known = Object.fromEntries(Object.entries(fieldErrors).filter(([k]) => k in values || k === "account")) as Values;
    setErrors(known);
    const first = Object.keys(known)[0];
    if (first) dialogRef.current?.querySelector<HTMLInputElement>(`[name="${first}"]`)?.focus();
  }

  return { values, errors, reset, change, blur, validate, applyServerErrors };
}
