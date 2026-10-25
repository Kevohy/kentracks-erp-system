import { MAX_BRAND_DIRECTOR, MAX_BRAND_LOCATION, MAX_BRAND_NAME, MAX_BRAND_TAGLINE, MAX_BRAND_WEBSITE, type Brand, type BrandProfile } from "./brands";
import { cleanText, validateEmail, validatePhone, validateRequiredText } from "./validation";

export type BrandErrors = Partial<Record<keyof BrandProfile, string>>;

const optionalText = (raw: string, label: string, max: number): { value: string; error?: string } => {
  const value = cleanText(raw);
  return value.length > max ? { value, error: `${label} must be ${max} characters or fewer` } : { value };
};

/** A website: empty, or an http(s) address. "kentracksgps.com" becomes "https://kentracksgps.com". */
export function validateWebsite(raw: string): { value: string; error?: string } {
  const text = cleanText(raw).replace(/\s+/g, "");
  if (!text) return { value: "" };
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`;
  const bad = { value: text, error: "Enter a website such as kentracksgps.com or https://kentracksgps.com" };
  let u: URL;
  try {
    u = new URL(withScheme);
  } catch {
    return bad;
  }
  if ((u.protocol !== "https:" && u.protocol !== "http:") || !u.hostname.includes(".") || u.username || u.password) return bad;
  const value = u.toString().replace(/\/$/, "");
  if (value.length > MAX_BRAND_WEBSITE) return { value, error: `Website must be ${MAX_BRAND_WEBSITE} characters or fewer` };
  return { value };
}

/**
 * Validates a brand profile. The name is required and unique within the company (ignoring capitals); everything else
 * is optional. Phone numbers are saved as E.164 (Kenya by default), like customers' numbers.
 */
export function validateBrand(
  draft: Partial<BrandProfile> & { name: string },
  brands: Brand[],
  editingId?: string,
): { errors: BrandErrors; value: BrandProfile; name: string } {
  const errors: BrandErrors = {};
  const n = validateRequiredText(draft.name, "Brand name", MAX_BRAND_NAME);
  if (n.error) errors.name = n.error;
  else if (brands.some((b) => b.id !== editingId && b.name.toLowerCase() === n.value.toLowerCase()))
    errors.name = "A brand with this name already exists";

  const tagline = optionalText(draft.tagline ?? "", "Tagline", MAX_BRAND_TAGLINE);
  const location = optionalText(draft.location ?? "", "Location", MAX_BRAND_LOCATION);
  const director = optionalText(draft.directorName ?? "", "Director name", MAX_BRAND_DIRECTOR);
  const website = validateWebsite(draft.website ?? "");
  const phoneRaw = (draft.phone ?? "").trim();
  const phone = phoneRaw ? validatePhone(phoneRaw) : { value: "" };
  const emailRaw = (draft.email ?? "").trim();
  const email = emailRaw ? validateEmail(emailRaw) : { value: "" };

  if (tagline.error) errors.tagline = tagline.error;
  if (location.error) errors.location = location.error;
  if (director.error) errors.directorName = director.error;
  if (website.error) errors.website = website.error;
  if ("error" in phone && phone.error) errors.phone = phone.error;
  if ("error" in email && email.error) errors.email = email.error;

  const value: BrandProfile = {
    name: n.value,
    tagline: tagline.value,
    phone: phone.value,
    email: email.value,
    website: website.value,
    location: location.value,
    directorName: director.value,
  };
  return { errors, value, name: n.value };
}
