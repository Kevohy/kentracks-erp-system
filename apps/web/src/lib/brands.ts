/** Brands a company sells under. Managed under Settings → Brands and chosen on each customer. */
export type Brand = { id: string; name: string };

/** Every company starts with these two; they can be renamed in Settings and more can be added. */
export const defaultBrandNames = ["Protrack", "Kentracks"] as const;

export const MAX_BRAND_NAME = 40;

/** The brand pre-selected on new customers: Kentracks when it exists, otherwise the first brand. */
export const DEFAULT_BRAND_NAME = "Kentracks";
export const defaultBrandId = (brands: Brand[]): string =>
  (brands.find((b) => b.name.trim().toLowerCase() === DEFAULT_BRAND_NAME.toLowerCase()) ?? brands[0])?.id ?? "";
