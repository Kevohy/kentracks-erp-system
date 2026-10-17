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
    setErrors((p) => ({ ...p, [name]: validateField(name, raw).error }));
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
    setErrors(next);
    const first = fields.find((f) => next[f.name]);
    if (first) {
      dialogRef.current?.querySelector<HTMLInputElement>(`[name="${first.name}"]`)?.focus();
      return null;
    }
    return clean;
  }

  return { values, errors, reset, change, blur, validate };
}
