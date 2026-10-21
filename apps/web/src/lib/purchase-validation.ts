import { stripControlChars } from "./validation";
import { platformLicenceTypes, type PlatformCardType, type Product, type ProductCategory, type Platform, type SimCard } from "./inventory";
import type { Supplier } from "./suppliers";
import {
  formatKes,
  purchaseItemTypes,
  purchaseStatuses,
  type PurchaseItem,
  type PurchaseItemType,
  type PurchaseStatus,
} from "./purchases";

/**
 * Purchase form rules. Money is parsed from text into integer minor units (cents) without
 * floating point. Frontend validation is a usability layer only: the backend must repeat it.
 */

export const MAX_ITEMS = 50;
export const MAX_QUANTITY = 100_000;
export const MAX_UNIT_PRICE_MINOR = 1_000_000_000; // KES 10,000,000.00
export const MAX_NOTES = 500;

/** Typing / pasting: drop control characters only. */
export const sanitizeNumberInput = stripControlChars;

/** Notes keep line breaks but lose every other control character. */
export function sanitizeNotes(value: string): string {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0009\u000B-\u001F\u007F-\u009F]/g, "");
}

type Parsed = { value?: number; error?: string };

export function parseMoney(raw: string, label: string, maxMinor: number): Parsed {
  const s = stripControlChars(raw).trim();
  if (!s) return { error: `${label} is required` };
  if (s.startsWith("-")) return { error: `${label} cannot be negative` };
  const m = /^(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?$/.exec(s);
  if (!m) return { error: `${label} must be a number, e.g. 1500 or 1500.50` };
  if (m[2] && m[2].length > 2) return { error: `${label} can have at most 2 decimal places` };
  const whole = m[1].replace(/,/g, "").replace(/^0+(?=\d)/, "");
  if (whole.length > 13) return { error: `${label} is too large` };
  const minor = Number(whole) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
  if (!Number.isSafeInteger(minor) || minor > maxMinor) return { error: `${label} is too large` };
  return { value: minor };
}

export function parseQuantity(raw: string): Parsed {
  const s = stripControlChars(raw).trim();
  if (!s) return { error: "Quantity is required" };
  if (s.startsWith("-")) return { error: "Quantity must be greater than zero" };
  if (!/^\d+$/.test(s)) return { error: "Quantity must be a whole number" };
  const n = s.replace(/^0+(?=\d)/, "");
  if (n.length > 7) return { error: `Quantity must be ${MAX_QUANTITY.toLocaleString("en-US")} or fewer` };
  const v = Number(n);
  if (v < 1) return { error: "Quantity must be greater than zero" };
  if (v > MAX_QUANTITY) return { error: `Quantity must be ${MAX_QUANTITY.toLocaleString("en-US")} or fewer` };
  return { value: v };
}

export function validateDate(raw: string): { value: string; error?: string } {
  const value = stripControlChars(raw).trim();
  if (!value) return { value, error: "Date is required" };
  const real = /^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
  const year = Number(value.slice(0, 4));
  if (!real || year < 2000 || year > 2100) return { value, error: "Enter a valid date" };
  return { value };
}

export type RowDraft = {
  key: string;
  type: PurchaseItemType | "";
  categoryId: string;
  itemId: string;
  /** Platform rows only. */
  cardType: string;
  quantity: string;
  unitPrice: string;
};

export type PurchaseDraft = {
  supplierId: string;
  status: PurchaseStatus | "";
  date: string;
  notes: string;
  paid: string;
  rows: RowDraft[];
};

export type PurchaseContext = {
  suppliers: Supplier[];
  categories: ProductCategory[];
  products: Product[];
  simCards: SimCard[];
  platforms: Platform[];
};

export type PurchaseResult = {
  supplier: Supplier;
  status: PurchaseStatus;
  date: string;
  notes: string;
  items: Omit<PurchaseItem, "id">[];
  totalMinor: number;
  paidMinor: number;
};

/** Error keys: supplier, status, date, notes, items, paid, and `row-<key>-<field>` for item rows. */
export type PurchaseErrors = Record<string, string>;

/** Amount of one row in minor units, or null while its quantity or price is not valid. */
export function rowAmount(r: Pick<RowDraft, "quantity" | "unitPrice">): number | null {
  const q = parseQuantity(r.quantity).value;
  const p = parseMoney(r.unitPrice, "Unit buying price", MAX_UNIT_PRICE_MINOR).value;
  return q === undefined || p === undefined ? null : q * p;
}

/** Sum of the rows that currently have a valid amount. */
export function draftTotal(rows: RowDraft[]): number {
  return rows.reduce((sum, r) => sum + (rowAmount(r) ?? 0), 0);
}

export function validatePurchase(d: PurchaseDraft, ctx: PurchaseContext): { errors: PurchaseErrors; result?: PurchaseResult } {
  const errors: PurchaseErrors = {};

  const supplier = ctx.suppliers.find((s) => s.id === d.supplierId);
  if (!d.supplierId) errors.supplier = "Select a supplier";
  else if (!supplier) errors.supplier = "Select a valid supplier";

  if (!d.status) errors.status = "Select a status";
  else if (!(purchaseStatuses as readonly string[]).includes(d.status)) errors.status = "Select a valid status";

  const date = validateDate(d.date);
  if (date.error) errors.date = date.error;

  const notes = sanitizeNotes(d.notes).trim();
  if (notes.length > MAX_NOTES) errors.notes = `Notes must be ${MAX_NOTES} characters or fewer`;

  const items: Omit<PurchaseItem, "id">[] = [];
  if (d.rows.length === 0) errors.items = "Add at least one item";
  if (d.rows.length > MAX_ITEMS) errors.items = `A purchase can have at most ${MAX_ITEMS} items`;

  for (const r of d.rows) {
    const k = (f: string) => `row-${r.key}-${f}`;
    let ok = true;
    let label = "";
    let categoryName: string | undefined;
    let cardType: PlatformCardType | undefined;

    if (!r.type) {
      errors[k("type")] = "Select an item type";
      ok = false;
    } else if (!(purchaseItemTypes as readonly string[]).includes(r.type)) {
      errors[k("type")] = "Select a valid item type";
      ok = false;
    } else if (r.type === "Product") {
      const cat = ctx.categories.find((c) => c.id === r.categoryId);
      if (!r.categoryId) errors[k("category")] = "Select a category";
      else if (!cat) errors[k("category")] = "Select a valid category";
      else categoryName = cat.name;
      const product = ctx.products.find((p) => p.id === r.itemId && p.categoryId === r.categoryId);
      if (!r.itemId) errors[k("item")] = "Select a model";
      else if (!product) errors[k("item")] = "Select a valid model";
      else label = product.model;
      ok = !errors[k("category")] && !errors[k("item")];
    } else {
      const list = r.type === "SIM Card" ? ctx.simCards : ctx.platforms;
      const found = list.find((x) => x.id === r.itemId);
      if (!r.itemId) errors[k("item")] = `Select a ${r.type === "SIM Card" ? "SIM card" : "platform"}`;
      else if (!found) errors[k("item")] = "Select a valid item";
      else label = found.name;
      ok = !errors[k("item")];
      if (r.type === "Platform") {
        const ct = (platformLicenceTypes as readonly string[]).find((t) => t === r.cardType);
        if (!r.cardType) errors[k("cardType")] = "Select a card type";
        else if (!ct) errors[k("cardType")] = "Select a valid card type";
        else cardType = ct as PlatformCardType;
        ok = ok && !errors[k("cardType")];
      }
    }

    const q = parseQuantity(r.quantity);
    if (q.error) errors[k("quantity")] = q.error;
    const p = parseMoney(r.unitPrice, "Unit buying price", MAX_UNIT_PRICE_MINOR);
    if (p.error) errors[k("unitPrice")] = p.error;

    if (ok && q.value !== undefined && p.value !== undefined && r.type) {
      items.push({ itemType: r.type, itemId: r.itemId, label, categoryName, ...(cardType ? { cardType } : {}), quantity: q.value, unitPriceMinor: p.value });
    }
  }

  const rowsValid = items.length === d.rows.length && d.rows.length > 0;
  const totalMinor = items.reduce((s, i) => s + i.quantity * i.unitPriceMinor, 0);

  const paid = parseMoney(d.paid, "Amount paid", Number.MAX_SAFE_INTEGER);
  if (paid.error) errors.paid = paid.error;
  else if (rowsValid && paid.value !== undefined) {
    const v = paid.value;
    if (v > totalMinor) errors.paid = `Amount paid cannot be more than the total (${formatKes(totalMinor)})`;
  }

  if (Object.keys(errors).length > 0 || !supplier || !d.status || paid.value === undefined) return { errors };
  return {
    errors,
    result: { supplier, status: d.status, date: date.value, notes, items, totalMinor, paidMinor: paid.value },
  };
}
