import { MAX_BRAND_NAME, type Brand } from "./brands";
import { validateRequiredText } from "./validation";

/** Validates a brand name; a name already used by another brand (ignoring capitals) is refused. */
export function validateBrand(
  draft: { name: string },
  brands: Brand[],
  editingId?: string,
): { errors: { name?: string }; name: string } {
  const errors: { name?: string } = {};
  const n = validateRequiredText(draft.name, "Brand name", MAX_BRAND_NAME);
  if (n.error) errors.name = n.error;
  else if (brands.some((b) => b.id !== editingId && b.name.toLowerCase() === n.value.toLowerCase()))
    errors.name = "A brand with this name already exists";
  return { errors, name: n.value };
}
