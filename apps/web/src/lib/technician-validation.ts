import {
  sanitizePhoneInput,
  validateEmail,
  validateName,
  validatePhone,
  validateRequiredText,
  type FieldResult,
} from "./validation";
import type { TechnicianFieldName } from "./technicians";

/**
 * Technician form validation. A usability layer only: the backend must repeat
 * every rule.
 */

export function validateTechnicianField(field: TechnicianFieldName, raw: string): FieldResult {
  switch (field) {
    case "name":
      return validateName(raw, "Name");
    case "phone":
      return validatePhone(raw);
    case "location":
      return validateRequiredText(raw, "Location", 120);
    case "email":
      if (!raw.trim()) return { value: "" }; // optional
      return validateEmail(raw);
  }
}

/** Phone keeps only common phone formatting characters while typing or pasting. */
export function sanitizeTechnicianInput(field: TechnicianFieldName, raw: string): string {
  return field === "phone" ? sanitizePhoneInput(raw) : raw;
}
