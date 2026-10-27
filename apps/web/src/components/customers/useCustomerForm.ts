"use client";

import { useState, type RefObject } from "react";
import { CONTACT_REQUIRED, sanitizeAccountInput, sanitizePhoneInput, validateContact, validateField } from "@/lib/customer-validation";
import { capitalizeName, formFieldsByType, isPerson, splitFullName, type Customer, type CustomerType, type FieldName } from "@/lib/customers";
import type { Values } from "./CustomerFields";

/** Fields that must be unique in the company, with how they compare. */
const UNIQUE: Partial<Record<FieldName, (c: Customer) => string>> = {
  account: (c) => c.account.toLowerCase(),
  phone: (c) => c.phone,
  email: (c) => c.email.toLowerCase(),
};

/**
 * The customer form's state and checks. Each field is checked when the user leaves it, and again on every keystroke
 * once it shows an error (so the message goes as soon as it is fixed); a field that passes shows a tick. Account,
 * phone and email are also checked against the customers already loaded, so a duplicate is caught before saving
 * (the server checks again).
 */
export function useCustomerForm(dialogRef: RefObject<HTMLDialogElement | null>, opts: { existing?: Customer[]; selfId?: string } = {}) {
  const [values, setValues] = useState<Values>({});
  const [errors, setErrors] = useState<Values>({});
  const [valid, setValid] = useState<Partial<Record<FieldName, boolean>>>({});

  function reset(initial: Values = {}) {
    setValues(initial);
    setErrors({});
    setValid({});
  }

  /** The field's error, or undefined: the format first, then whether another customer already has it. */
  function check(name: FieldName, raw: string): { value: string; error?: string } {
    const r = validateField(name, raw);
    if (r.error || !r.value) return r;
    const key = UNIQUE[name];
    if (key) {
      const v = name === "account" || name === "email" ? r.value.toLowerCase() : r.value;
      const other = opts.existing?.find((c) => c.id !== opts.selfId && key(c) === v);
      if (other) return { value: r.value, error: `Already used by ${other.name} (${other.account})` };
    }
    return r;
  }

  function change(name: FieldName, raw: string) {
    // A person's name is capitalised as it is typed: "kelvin kariuki" → "Kelvin Kariuki".
    const value = name === "account" ? sanitizeAccountInput(raw) : name === "phone" ? sanitizePhoneInput(raw) : name === "fullName" ? capitalizeName(raw) : raw;
    setValues((p) => ({ ...p, [name]: value }));
    setValid((p) => ({ ...p, [name]: false }));
    const other = name === "phone" ? "email" : name === "email" ? "phone" : null;
    // A field showing an error is checked again as the user types, so the message goes as soon as it is right.
    if (errors[name] && errors[name] !== CONTACT_REQUIRED) {
      const e = value ? check(name, value).error : undefined;
      setErrors((p) => ({ ...p, [name]: e }));
      if (!e && value) setValid((p) => ({ ...p, [name]: true }));
    } else if (errors[name] === CONTACT_REQUIRED || (other && errors[other] === CONTACT_REQUIRED)) {
      // Typing a phone or an email clears the "phone or email" message on both.
      setErrors((p) => ({ ...p, [name]: undefined, ...(other && p[other] === CONTACT_REQUIRED ? { [other]: undefined } : {}) }));
    }
  }

  function blur(name: FieldName) {
    const raw = values[name] ?? "";
    if (!raw.trim()) return;
    const r = check(name, raw);
    setErrors((p) => ({ ...p, [name]: r.error }));
    setValid((p) => ({ ...p, [name]: !r.error }));
    // Show the tidied value (e.g. extra spaces removed, name capitalised), except for phones, which are kept as typed.
    if (!r.error && name !== "phone" && r.value !== raw) setValues((p) => ({ ...p, [name]: r.value }));
  }

  /**
   * Returns the values to save, or null when something is invalid (and focuses the first bad field). A person's full
   * name is sent as the first name and the last name.
   */
  function validate(type: CustomerType): Values | null {
    const fields = formFieldsByType[type];
    const next: Values = {};
    const clean: Values = {};
    for (const f of fields) {
      const r = check(f.name, values[f.name] ?? "");
      if (r.error) next[f.name] = r.error;
      clean[f.name] = r.value;
    }
    if (!next.phone && !next.email) Object.assign(next, validateContact(clean.phone ?? "", clean.email ?? ""));
    const brand = validateField("brandId", values.brandId ?? "");
    if (brand.error) next.brandId = brand.error;
    clean.brandId = brand.value;
    setErrors(next);
    const first = fields.find((f) => next[f.name]) ?? (next.brandId ? { name: "brandId" as const } : undefined);
    if (first) {
      dialogRef.current?.querySelector<HTMLInputElement>(`[name="${first.name}"]`)?.focus();
      return null;
    }
    if (isPerson(type)) {
      setValues((p) => ({ ...p, fullName: clean.fullName }));
      const { fullName, ...rest } = clean;
      return { ...rest, ...splitFullName(fullName ?? "") };
    }
    return clean;
  }

  /** Shows errors the server reported against form fields (e.g. a duplicate account) and focuses the first. */
  function applyServerErrors(fieldErrors: Record<string, string>) {
    // The server checks the first and last name; the form shows them on the full-name box.
    const mapped = Object.entries(fieldErrors).map(([k, v]) => [k === "firstName" || k === "lastName" ? "fullName" : k, v] as const);
    const known = Object.fromEntries(mapped.filter(([k]) => k in values || k === "account" || k === "phone" || k === "email")) as Values;
    setErrors(known);
    const first = Object.keys(known)[0];
    if (first) dialogRef.current?.querySelector<HTMLInputElement>(`[name="${first}"]`)?.focus();
  }

  return { values, errors, valid, reset, change, blur, validate, applyServerErrors, setValues };
}
