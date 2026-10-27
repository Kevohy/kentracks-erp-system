import {
  sanitizePhoneInput,
  stripControlChars,
  validateEmail,
  validateName,
  validatePhone,
  validateRequiredText,
  type FieldResult,
} from "./validation";
import { capitalizeName, splitFullName, type FieldName } from "./customers";

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
    case "fullName": {
      // One box for a person's name: at least a first and a last name, each word capitalised.
      const value = capitalizeName(stripControlChars(raw).replace(/\s+/g, " ").trim());
      if (!value) return { value, error: "Enter the customer's full name, e.g. Kelvin Kariuki" };
      const { firstName, lastName } = splitFullName(value);
      if (!lastName) return { value, error: "Add the last name too, e.g. Kelvin Kariuki" };
      const first = validateName(firstName, "First name");
      if (first.error) return { value, error: first.error.replace("First name", "The name") };
      const last = validateName(lastName, "Last name");
      if (last.error) return { value, error: last.error };
      return { value: `${first.value} ${last.value}` };
    }
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
    // Phone and email are each optional (a customer may keep one private), but at least one is needed: validateContact.
    case "phone":
      return sanitizePhoneInput(raw).trim() ? validatePhone(raw) : { value: "" };
    case "email":
      return stripControlChars(raw).trim() ? validateEmail(raw) : { value: "" };
    case "pin":
      return validateRequiredText(raw, "PIN", 20);
    case "location":
      return validateRequiredText(raw, "Location", 120);
    case "brandId":
      // Every customer has a brand; the server checks that it is one of this company's brands.
      return raw.trim() ? { value: raw.trim() } : { value: "", error: "Select a brand" };
  }
}

export const CONTACT_REQUIRED = "Enter a phone number or an email";

/** A customer needs a phone number or an email (or both). Takes the cleaned values; returns errors for both fields. */
export function validateContact(phone: string, email: string): { phone?: string; email?: string } {
  return phone || email ? {} : { phone: CONTACT_REQUIRED, email: CONTACT_REQUIRED };
}
