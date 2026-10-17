import { parsePhoneNumberFromString } from "libphonenumber-js/max";
import type { CustomerType, FieldName } from "./customers";

/**
 * Frontend validation and sanitization for the customer form.
 * This is a usability layer only. The same rules must be enforced again
 * on the server when the backend exists.
 */

export const DEFAULT_COUNTRY = "KE" as const;

const CONTROL_CHARS = /[\u0000-\u001F\u007F-\u009F]/g;
// Letters (any script), combining marks, spaces, hyphen, straight/curly apostrophe and period.
// Must start with a letter. Capitalisation is never changed.
const NAME_PATTERN = /^\p{L}[\p{L}\p{M}'’. -]*$/u;
const ACCOUNT_PATTERN = /^[A-Za-z0-9._\-/]+$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_TYPING_ALLOWED = /[^0-9+()\-.\s]/g;

const MAX = { name: 60, company: 120, account: 40, email: 254, pin: 20, location: 120 } as const;

/** Trim, drop control characters and collapse repeated whitespace. */
export function cleanText(value: string): string {
  return value.replace(CONTROL_CHARS, "").replace(/\s+/g, " ").trim();
}

/** Applied on every keystroke or paste: accounts never contain whitespace. */
export function sanitizeAccountInput(value: string): string {
  return value.replace(/\s+/g, "");
}

/** Applied on every keystroke or paste: keep only common phone formatting characters. */
export function sanitizePhoneInput(value: string): string {
  return value.replace(PHONE_TYPING_ALLOWED, "");
}

export type FieldResult = { value: string; error?: string };

function name(raw: string, label: string): FieldResult {
  const value = cleanText(raw);
  if (!value) return { value, error: `${label} is required` };
  if (value.length > MAX.name) return { value, error: `${label} must be ${MAX.name} characters or fewer` };
  if (!NAME_PATTERN.test(value))
    return { value, error: `${label} can only contain letters, spaces, hyphens and apostrophes` };
  return { value };
}

function phone(raw: string): FieldResult {
  const input = sanitizePhoneInput(raw).trim();
  if (!input) return { value: "", error: "Phone Number is required" };
  const parsed = parsePhoneNumberFromString(input, DEFAULT_COUNTRY);
  if (!parsed || !parsed.isValid())
    return { value: input, error: "Enter a valid phone number, e.g. 0712345678 or +254712345678" };
  return { value: parsed.number }; // E.164, e.g. +254712345678
}

/** Validates and normalises a single field. The returned value is what gets saved. */
export function validateField(field: FieldName, raw: string): FieldResult {
  switch (field) {
    case "firstName":
      return name(raw, "First Name");
    case "lastName":
      return name(raw, "Last Name");
    case "companyName": {
      const value = cleanText(raw);
      if (!value) return { value, error: "Company Name is required" };
      if (value.length > MAX.company) return { value, error: `Company Name must be ${MAX.company} characters or fewer` };
      return { value };
    }
    case "account": {
      const value = sanitizeAccountInput(raw).replace(CONTROL_CHARS, "");
      if (!value) return { value, error: "Account is required" };
      if (value.length > MAX.account) return { value, error: `Account must be ${MAX.account} characters or fewer` };
      if (!ACCOUNT_PATTERN.test(value))
        return { value, error: "Account can only contain letters, numbers, dots, hyphens, underscores and slashes" };
      return { value };
    }
    case "phone":
      return phone(raw);
    case "email": {
      const value = raw.replace(CONTROL_CHARS, "").trim();
      if (!value) return { value, error: "Email is required" };
      if (value.length > MAX.email || !EMAIL_PATTERN.test(value))
        return { value, error: "Enter a valid email address, e.g. name@example.com" };
      return { value };
    }
    case "pin": {
      const value = cleanText(raw);
      if (!value) return { value, error: "PIN is required" };
      if (value.length > MAX.pin) return { value, error: `PIN must be ${MAX.pin} characters or fewer` };
      return { value };
    }
    case "location": {
      const value = cleanText(raw);
      if (!value) return { value, error: "Location is required" };
      if (value.length > MAX.location) return { value, error: `Location must be ${MAX.location} characters or fewer` };
      return { value };
    }
  }
}

/** Fields shown for a type are validated together by the form. */
export type { CustomerType };
