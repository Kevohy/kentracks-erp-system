import { parsePhoneNumberFromString } from "libphonenumber-js/max";
import { cleanText, DEFAULT_COUNTRY, sanitizePhoneInput, validateField } from "./customer-validation";
import type { SupplierFieldName } from "./suppliers";

/**
 * Frontend validation and sanitization for the supplier form.
 * A usability layer only: the backend must repeat every rule.
 * Values are always rendered by React as text, never as HTML.
 */

const NAME_PATTERN = /^\p{L}[\p{L}\p{M}'’. -]*$/u;
const COMPANY_PATTERN = /^[\p{L}\p{N}][\p{L}\p{M}\p{N} &'’.,()\-/+@#!:*"“”]*$/u;
// KRA PIN: a letter (A for individuals, P for companies), nine digits, a letter.
const KRA_PIN_PATTERN = /^[AP]\d{9}[A-Z]$/;

const MAX = { name: 60, company: 120, location: 120, department: 60 } as const;

export type SupplierFieldResult = { value: string; error?: string };

function name(raw: string, label: string): SupplierFieldResult {
  const value = cleanText(raw);
  if (!value) return { value, error: `${label} is required` };
  if (value.length > MAX.name) return { value, error: `${label} must be ${MAX.name} characters or fewer` };
  if (!NAME_PATTERN.test(value))
    return { value, error: `${label} can only contain letters, spaces, hyphens and apostrophes` };
  return { value };
}

function phone(raw: string): SupplierFieldResult {
  const input = sanitizePhoneInput(raw).trim();
  if (!input) return { value: "", error: "Phone Number is required" };
  const parsed = parsePhoneNumberFromString(input, DEFAULT_COUNTRY);
  if (!parsed || !parsed.isValid())
    return { value: input, error: "Enter a valid phone number, e.g. 0712345678 or +254712345678" };
  return { value: parsed.number }; // E.164
}

function text(raw: string, label: string, max: number): SupplierFieldResult {
  const value = cleanText(raw);
  if (!value) return { value, error: `${label} is required` };
  if (value.length > max) return { value, error: `${label} must be ${max} characters or fewer` };
  return { value };
}

/** Validates and normalises one supplier field. The returned value is what gets saved. */
export function validateSupplierField(field: SupplierFieldName, raw: string): SupplierFieldResult {
  switch (field) {
    case "fullName":
      return name(raw, "Full Name");
    case "contactName":
      return name(raw, "Name");
    case "companyName": {
      const r = text(raw, "Company Name", MAX.company);
      if (!r.error && !COMPANY_PATTERN.test(r.value))
        return { value: r.value, error: "Company Name contains unsupported characters" };
      return r;
    }
    case "phone":
    case "contactPhone":
      return phone(raw);
    case "email":
    case "contactEmail":
      return validateField("email", raw);
    case "location":
      return text(raw, "Location", MAX.location);
    case "contactDepartment":
      return text(raw, "Department", MAX.department);
    case "kraPin": {
      const value = raw.trim();
      if (!value) return { value: "" }; // optional
      if (!KRA_PIN_PATTERN.test(value))
        return { value, error: "KRA PIN must be a letter, 9 digits and a letter, e.g. P051234567A" };
      return { value };
    }
  }
}

/** Phone fields keep only common phone formatting characters while typing or pasting. */
export function sanitizeSupplierInput(field: SupplierFieldName, raw: string): string {
  return field === "phone" || field === "contactPhone" ? sanitizePhoneInput(raw) : raw;
}
