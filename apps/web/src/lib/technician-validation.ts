import { validateField } from "./customer-validation";
import { validateSupplierField, sanitizeSupplierInput } from "./supplier-validation";
import type { TechnicianFieldName } from "./technicians";

/**
 * Frontend validation for the technician form. Reuses the shared name, phone,
 * email and location rules. A usability layer only: the backend must repeat
 * every rule. Values are always rendered by React as text, never as HTML.
 */

export type TechnicianFieldResult = { value: string; error?: string };

export function validateTechnicianField(field: TechnicianFieldName, raw: string): TechnicianFieldResult {
  switch (field) {
    case "name":
      return validateSupplierField("contactName", raw); // letters, spaces, hyphens, apostrophes
    case "phone":
      return validateSupplierField("contactPhone", raw); // libphonenumber-js, default KE, E.164
    case "location":
      return validateSupplierField("location", raw);
    case "email": {
      if (!raw.trim()) return { value: "" }; // optional
      return validateField("email", raw);
    }
  }
}

/** Phone keeps only common phone formatting characters while typing or pasting. */
export function sanitizeTechnicianInput(field: TechnicianFieldName, raw: string): string {
  return field === "phone" ? sanitizeSupplierInput("phone", raw) : raw;
}
