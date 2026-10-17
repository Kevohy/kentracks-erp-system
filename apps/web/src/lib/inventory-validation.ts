import { stripControlChars, validateRequiredText, type FieldResult } from "./validation";
import { simCardTypes, type ProductCategory } from "./inventory";

/** Names and models allow any letters, digits, spaces and punctuation; only length and emptiness are checked. */
const MAX_NAME = 80;

/** Applied while typing or pasting: drop control characters only. */
export const sanitizeInventoryInput = stripControlChars;

export const validateCategoryName = (raw: string): FieldResult => validateRequiredText(raw, "Category name", MAX_NAME);
export const validateModel = (raw: string): FieldResult => validateRequiredText(raw, "Model", MAX_NAME);
export const validateSimCardName = (raw: string): FieldResult => validateRequiredText(raw, "SIM card name", MAX_NAME);
export const validatePlatformName = (raw: string): FieldResult => validateRequiredText(raw, "Platform name", MAX_NAME);

export function validateCategorySelection(raw: string, categories: ProductCategory[]): FieldResult {
  if (!raw) return { value: raw, error: "Select a category" };
  if (!categories.some((c) => c.id === raw)) return { value: raw, error: "Select a valid category" };
  return { value: raw };
}

export function validateSimCardType(raw: string): FieldResult {
  if (!raw) return { value: raw, error: "Select a type" };
  if (!(simCardTypes as readonly string[]).includes(raw)) return { value: raw, error: "Select a valid type" };
  return { value: raw };
}
