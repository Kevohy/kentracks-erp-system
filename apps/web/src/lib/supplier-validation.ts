import {
  sanitizePhoneInput,
  validateEmail,
  validateName,
  validatePhone,
  validateRequiredText,
  type FieldResult,
} from "./validation";
import type { SupplierFieldName } from "./suppliers";

/**
 * Supplier form validation. A usability layer only: the backend must repeat
 * every rule.
 */

const COMPANY_PATTERN = /^[\p{L}\p{N}][\p{L}\p{M}\p{N} &'’.,()\-/+@#!:*"“”]*$/u;
// KRA PIN: a letter (A for individuals, P for companies), nine digits, a letter.
const KRA_PIN_PATTERN = /^[AP]\d{9}[A-Z]$/;

const MAX = { company: 120, location: 120, department: 60 } as const;

/** Validates and normalises one supplier field. The returned value is what gets saved. */
export function validateSupplierField(field: SupplierFieldName, raw: string): FieldResult {
  switch (field) {
    case "fullName":
      return validateName(raw, "Full Name");
    case "contactName":
      return validateName(raw, "Name");
    case "companyName": {
      const r = validateRequiredText(raw, "Company Name", MAX.company);
      if (!r.error && !COMPANY_PATTERN.test(r.value))
        return { value: r.value, error: "Company Name contains unsupported characters" };
      return r;
    }
    case "phone":
    case "contactPhone":
      return validatePhone(raw);
    case "email":
    case "contactEmail":
      return validateEmail(raw);
    case "location":
      return validateRequiredText(raw, "Location", MAX.location);
    case "contactDepartment":
      return validateRequiredText(raw, "Department", MAX.department);
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
