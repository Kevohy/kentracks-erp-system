/** Brands a company sells under. Managed under Settings → Brands and chosen on each customer. */
export type BrandImageKind = "logo" | "icon" | "signature";

/** A brand and its profile (used on documents). Text fields are "" when not set; image URLs are null when none. */
export type Brand = {
  id: string;
  name: string;
  tagline: string;
  phone: string;
  email: string;
  website: string;
  location: string;
  directorName: string;
  /** "#RRGGBB" used on the brand's certificates and stamp, or "" for the default red. */
  color: string;
  /** Same-origin URL of the logo (changes when the image changes), or null. */
  logoUrl: string | null;
  /** Same-origin URL of the square icon (app-style mark used on documents), or null. */
  iconUrl: string | null;
  /** Same-origin URL of the director's signature (changes when the image changes), or null. */
  signatureUrl: string | null;
};

/** The editable text fields of a brand profile (everything except the images). */
export type BrandProfile = Pick<Brand, "name" | "tagline" | "phone" | "email" | "website" | "location" | "directorName" | "color">;
export const BRAND_PROFILE_FIELDS = ["name", "tagline", "phone", "email", "website", "location", "directorName", "color"] as const;

/** Certificates and stamps of a brand without its own colour use the red of the Kentracks logo. */
export const DEFAULT_BRAND_COLOR = "#EE1D21";

/** Every company starts with these two; they can be renamed in Settings and more can be added. */
export const defaultBrandNames = ["Protrack", "Kentracks"] as const;

export const MAX_BRAND_NAME = 40;
export const MAX_BRAND_TAGLINE = 120;
export const MAX_BRAND_WEBSITE = 200;
export const MAX_BRAND_LOCATION = 200;
export const MAX_BRAND_DIRECTOR = 80;

/** Logo, icon and signature images: PNG, JPEG or WebP, at most 500 KB. */
export const BRAND_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export const MAX_BRAND_IMAGE_BYTES = 500 * 1024;

/** The brand pre-selected on new customers: Kentracks when it exists, otherwise the first brand. */
export const DEFAULT_BRAND_NAME = "Kentracks";
export const defaultBrandId = (brands: Brand[]): string =>
  (brands.find((b) => b.name.trim().toLowerCase() === DEFAULT_BRAND_NAME.toLowerCase()) ?? brands[0])?.id ?? "";
