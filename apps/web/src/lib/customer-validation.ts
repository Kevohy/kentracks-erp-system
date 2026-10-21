import {
  sanitizePhoneInput,
  stripControlChars,
  validateEmail,
  validateName,
  validatePhone,
  validateRequiredText,
  type FieldResult,
} from "./validation";
import type { FieldName } from "./customers";

/**
 * Customer form validation. A usability layer only: the backend must repeat
 * every rule.
 */

const ACCOUNT_PATTERN = /^[A-Za-z0-9._\-/]+$/;
const MAX_ACCOUNT = 40;

/** Applied on every keystroke or paste: accounts never contain whitespace. */
export function sanitizeAccountInput(value: string): string {
  return value.replace(/\s+/g, "");
}

/** Phone fields keep only common phone formatting characters while typing or pasting. */
export { sanitizePhoneInput };

/** Validates and normalises a single field. The returned value is what gets saved. */
export function validateField(field: FieldName, raw: string): FieldResult {
  switch (field) {
    case "firstName":
      return validateName(raw, "First Name");
    case "lastName":
      return validateName(raw, "Last Name");
    case "companyName":
      return validateRequiredText(raw, "Company Name", 120);
    case "account": {
      // Removing whitespace is the only change; capitalisation is left as typed.
      const value = stripControlChars(sanitizeAccountInput(raw));
      if (!value) return { value, error: "Account is required" };
      if (value.length > MAX_ACCOUNT) return { value, error: `Account must be ${MAX_ACCOUNT} characters or fewer` };
      if (!ACCOUNT_PATTERN.test(value))
        return { value, error: "Account can only contain letters, numbers, dots, hyphens, underscores and slashes" };
      return { value };
    }
    case "phone":
      return validatePhone(raw);
    case "email":
      return validateEmail(raw);
    case "pin":
      return validateRequiredText(raw, "PIN", 20);
    case "location":
      return validateRequiredText(raw, "Location", 120);
    case "brandId":
      // Every customer has a brand; the server checks that it is one of this company's brands.
      return raw.trim() ? { value: raw.trim() } : { value: "", error: "Select a brand" };
  }
}
