import { parsePhoneNumberFromString } from "libphonenumber-js/max";

/**
 * Validation primitives shared by every form (customers, suppliers, technicians).
 * Frontend validation is a usability layer only: the backend must repeat every
 * rule. Values are always rendered by React as text, never as HTML.
 */

export const DEFAULT_COUNTRY = "KE" as const;

const CONTROL_CHARS = /[\u0000-\u001F\u007F-\u009F]/g;
// Letters (any script), combining marks, spaces, hyphen, straight/curly apostrophe and period.
// Must start with a letter. Capitalisation is never changed.
const NAME_PATTERN = /^\p{L}[\p{L}\p{M}'’. -]*$/u;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_TYPING_ALLOWED = /[^0-9+()\-.\s]/g;

const MAX_NAME = 60;
const MAX_EMAIL = 254;

export type FieldResult = { value: string; error?: string };

/** Drop control characters without touching anything else. */
export function stripControlChars(value: string): string {
  return value.replace(CONTROL_CHARS, "");
}

/** Trim, drop control characters and collapse repeated whitespace. */
export function cleanText(value: string): string {
  return stripControlChars(value).replace(/\s+/g, " ").trim();
}

/** Applied on every keystroke or paste: keep only common phone formatting characters. */
export function sanitizePhoneInput(value: string): string {
  return value.replace(PHONE_TYPING_ALLOWED, "");
}

/** A required person name: letters, spaces, hyphens and apostrophes. */
export function validateName(raw: string, label: string): FieldResult {
  const value = cleanText(raw);
  if (!value) return { value, error: `${label} is required` };
  if (value.length > MAX_NAME) return { value, error: `${label} must be ${MAX_NAME} characters or fewer` };
  if (!NAME_PATTERN.test(value))
    return { value, error: `${label} can only contain letters, spaces, hyphens and apostrophes` };
  return { value };
}

/** A required phone number, parsed with libphonenumber-js (default country KE) and saved as E.164. */
export function validatePhone(raw: string): FieldResult {
  const input = sanitizePhoneInput(raw).trim();
  if (!input) return { value: "", error: "Phone Number is required" };
  const parsed = parsePhoneNumberFromString(input, DEFAULT_COUNTRY);
  if (!parsed || !parsed.isValid())
    return { value: input, error: "Enter a valid phone number, e.g. 0712345678 or +254712345678" };
  return { value: parsed.number }; // E.164, e.g. +254712345678
}

/** A required email address. Trimmed; case is kept as typed. */
export function validateEmail(raw: string): FieldResult {
  const value = stripControlChars(raw).trim();
  if (!value) return { value, error: "Email is required" };
  if (value.length > MAX_EMAIL || !EMAIL_PATTERN.test(value))
    return { value, error: "Enter a valid email address, e.g. name@example.com" };
  return { value };
}

/** A required free-text value: trimmed, whitespace collapsed, length-limited. */
export function validateRequiredText(raw: string, label: string, max: number): FieldResult {
  const value = cleanText(raw);
  if (!value) return { value, error: `${label} is required` };
  if (value.length > max) return { value, error: `${label} must be ${max} characters or fewer` };
  return { value };
}
