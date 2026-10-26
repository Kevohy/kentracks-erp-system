import { DEFAULT_BRAND_COLOR } from "@/lib/brands";

/**
 * Colours shared by every printed document (certificates, invoices) so they look like one family. The accent is the
 * brand's colour from Settings → Brands (red by default); the rest stays the same for every brand.
 */
export const DOC = {
  /** Text. */
  ink: "#0F172A",
  /** Dark bars: table headers, section titles, footer band. */
  navy: "#0E1628",
  /** Secondary text. */
  muted: "#5B6676",
  /** Light grey cards. */
  card: "#F1F4F8",
  /** Borders and dividers. */
  line: "#DCE3EA",
  /** Alternate row shading. */
  row: "#F7F9FB",
} as const;

/** The brand's colour when it is a valid #RRGGBB, otherwise the default red. */
export const brandAccent = (color?: string | null) => (color && /^#[0-9A-F]{6}$/i.test(color) ? color : DEFAULT_BRAND_COLOR);
