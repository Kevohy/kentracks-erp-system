import type { Customer } from "./customers";
import type { Platform, Product, ProductCategory } from "./inventory";
import type { PurchaseItemType, StockEntry } from "./purchases";
import { parseMoney, parseQuantity } from "./purchase-validation";
import { formatKes } from "./sales-format";
import { CARD_TYPES, type RetailerCardLine, type RetailerProductLine, type RetailerSale } from "./sales";

export { sanitizeNumberInput } from "./purchase-validation";

/**
 * Retailer Sale rules. Money is held in integer minor units (cents) and parsed from text without
 * floating point. Frontend validation is a usability layer only: the backend must repeat it.
 */

export const MAX_LINES = 20;
/** Selling price per unit, in minor units. KES 10,000,000.00. */
const MAX_UNIT_PRICE_MINOR = 1_000_000_000;

export type ProductLineDraft = { key: string; categoryId: string; productId: string; quantity: string; unitPrice: string };
export type CardLineDraft = { key: string; platformId: string; cardType: string; quantity: string; unitPrice: string };

export type RetailerDraft = {
  customerId: string;
  productLines: ProductLineDraft[];
  cardLines: CardLineDraft[];
  paid: string;
};

export type RetailerContext = {
  customers: Customer[];
  categories: ProductCategory[];
  products: Product[];
  platforms: Platform[];
  /** Stock and latest buying price from Purchases. */
  stockOf: (type: PurchaseItemType, id: string) => StockEntry;
};

/** Error keys: customer, items, paid, `p-<key>-category|product|quantity|price`, `c-<key>-platform|cardType|quantity|price`. */
export type RetailerErrors = Record<string, string>;

export const emptyProductLine = (key: string): ProductLineDraft => ({ key, categoryId: "", productId: "", quantity: "", unitPrice: "" });
export const emptyCardLine = (key: string): CardLineDraft => ({ key, platformId: "", cardType: "", quantity: "", unitPrice: "" });

const isBlankProduct = (l: ProductLineDraft) => !l.categoryId && !l.productId && !l.quantity.trim() && !l.unitPrice.trim();
const isBlankCard = (l: CardLineDraft) => !l.platformId && !l.cardType && !l.quantity.trim() && !l.unitPrice.trim();

/** Quantity x unit price in minor units, or undefined while either is missing or invalid. */
export function lineTotalMinor(quantity: string, unitPrice: string): number | undefined {
  const q = parseQuantity(quantity).value;
  const p = parseMoney(unitPrice, "Unit selling price", MAX_UNIT_PRICE_MINOR).value;
  if (q === undefined || p === undefined || p === 0) return undefined;
  const total = q * p;
  return Number.isSafeInteger(total) ? total : undefined;
}

export type LiveLine = {
  totalMinor?: number;
  /** Latest buying price per unit. `null` = none recorded yet; undefined = no item chosen yet. */
  unitCostMinor?: number | null;
};

export type LiveTotals = {
  products: Record<string, LiveLine>;
  cards: Record<string, LiveLine>;
  /** Sum of the line totals that are valid so far. */
  totalMinor: number;
  /** Quantity x buying cost for the lines that have one. */
  costMinor: number;
  /** Chosen lines that have no buying cost, so the profit is not yet accurate. */
  costMissing: string[];
  /** True once at least one line has a total. */
  hasLines: boolean;
  profitMinor: number;
};

/** Running figures for the form. Only lines with a valid quantity and price count towards the total. */
export function liveTotals(d: RetailerDraft, ctx: RetailerContext): LiveTotals {
  const products: Record<string, LiveLine> = {};
  const cards: Record<string, LiveLine> = {};
  let totalMinor = 0;
  let costMinor = 0;
  let hasLines = false;
  const costMissing: string[] = [];

  for (const l of d.productLines) {
    const product = ctx.products.find((p) => p.id === l.productId && p.categoryId === l.categoryId);
    const unitCostMinor = product ? ctx.stockOf("Product", product.id).latestPriceMinor : undefined;
    const t = lineTotalMinor(l.quantity, l.unitPrice);
    products[l.key] = { totalMinor: t, unitCostMinor };
    if (t === undefined) continue;
    hasLines = true;
    totalMinor += t;
    if (product && unitCostMinor === null) costMissing.push(product.model);
    else if (unitCostMinor != null) costMinor += unitCostMinor * (parseQuantity(l.quantity).value ?? 0);
  }
  for (const l of d.cardLines) {
    const platform = ctx.platforms.find((p) => p.id === l.platformId);
    const unitCostMinor = platform ? ctx.stockOf("Platform", platform.id).latestPriceMinor : undefined;
    const t = lineTotalMinor(l.quantity, l.unitPrice);
    cards[l.key] = { totalMinor: t, unitCostMinor };
    if (t === undefined) continue;
    hasLines = true;
    totalMinor += t;
    if (platform && unitCostMinor === null) costMissing.push(`${platform.name} ${l.cardType}`.trim());
    else if (unitCostMinor != null) costMinor += unitCostMinor * (parseQuantity(l.quantity).value ?? 0);
  }
  return { products, cards, totalMinor, costMinor, costMissing, hasLines, profitMinor: totalMinor - costMinor };
}

export function validateRetailerSale(d: RetailerDraft, ctx: RetailerContext): { errors: RetailerErrors; result?: Omit<RetailerSale, "id"> } {
  const errors: RetailerErrors = {};

  const customer = ctx.customers.find((c) => c.id === d.customerId);
  if (!d.customerId) errors.customer = "Select a customer";
  else if (!customer) errors.customer = "Select a valid customer";

  const productLines: RetailerProductLine[] = [];
  for (const l of d.productLines) {
    if (isBlankProduct(l)) continue; // an untouched line is ignored
    const k = (f: string) => `p-${l.key}-${f}`;
    const category = ctx.categories.find((c) => c.id === l.categoryId);
    if (!l.categoryId) errors[k("category")] = "Select a category";
    else if (!category) errors[k("category")] = "Select a valid category";
    const product = ctx.products.find((p) => p.id === l.productId && p.categoryId === l.categoryId);
    if (!l.productId) errors[k("product")] = "Select a model";
    else if (!product) errors[k("product")] = "Select a valid model";
    const q = parseQuantity(l.quantity);
    if (q.error) errors[k("quantity")] = q.error;
    const p = parseMoney(l.unitPrice, "Unit selling price", MAX_UNIT_PRICE_MINOR);
    if (p.error) errors[k("price")] = p.error;
    else if (p.value === 0) errors[k("price")] = "Unit selling price must be greater than zero";
    if (!category || !product || q.value === undefined || p.value === undefined || errors[k("price")]) continue;
    productLines.push({
      categoryName: category.name,
      productId: product.id,
      model: product.model,
      quantity: q.value,
      unitPriceMinor: p.value,
      lineTotalMinor: q.value * p.value,
      unitCostMinor: ctx.stockOf("Product", product.id).latestPriceMinor,
    });
  }

  const cardLines: RetailerCardLine[] = [];
  for (const l of d.cardLines) {
    if (isBlankCard(l)) continue;
    const k = (f: string) => `c-${l.key}-${f}`;
    const platform = ctx.platforms.find((p) => p.id === l.platformId);
    if (!l.platformId) errors[k("platform")] = "Select a platform";
    else if (!platform) errors[k("platform")] = "Select a valid platform";
    if (!l.cardType) errors[k("cardType")] = "Select a card type";
    else if (!(CARD_TYPES as readonly string[]).includes(l.cardType)) errors[k("cardType")] = "Select a valid card type";
    const q = parseQuantity(l.quantity);
    if (q.error) errors[k("quantity")] = q.error;
    const p = parseMoney(l.unitPrice, "Unit selling price", MAX_UNIT_PRICE_MINOR);
    if (p.error) errors[k("price")] = p.error;
    else if (p.value === 0) errors[k("price")] = "Unit selling price must be greater than zero";
    if (!platform || errors[k("cardType")] || q.value === undefined || p.value === undefined || errors[k("price")]) continue;
    cardLines.push({
      platformId: platform.id,
      platformName: platform.name,
      cardType: l.cardType,
      quantity: q.value,
      unitPriceMinor: p.value,
      lineTotalMinor: q.value * p.value,
      unitCostMinor: ctx.stockOf("Platform", platform.id).latestPriceMinor,
    });
  }

  const filled = d.productLines.filter((l) => !isBlankProduct(l)).length + d.cardLines.filter((l) => !isBlankCard(l)).length;
  if (filled === 0) errors.items = "Add at least one product or platform card";

  const totalMinor = [...productLines, ...cardLines].reduce((s, l) => s + l.lineTotalMinor, 0);
  const paid = parseMoney(d.paid, "Amount paid", Number.MAX_SAFE_INTEGER);
  if (paid.error) errors.paid = paid.error;
  else if (!errors.items && Object.keys(errors).length === 0 && paid.value! > totalMinor)
    errors.paid = `Amount paid cannot be more than the sale total (${formatKes(totalMinor)})`;

  if (Object.keys(errors).length > 0 || !customer || paid.value === undefined) return { errors };

  let costMinor = 0;
  const costMissing: string[] = [];
  for (const l of productLines) {
    if (l.unitCostMinor === null) costMissing.push(l.model);
    else costMinor += l.unitCostMinor * l.quantity;
  }
  for (const l of cardLines) {
    if (l.unitCostMinor === null) costMissing.push(`${l.platformName} ${l.cardType}`);
    else costMinor += l.unitCostMinor * l.quantity;
  }

  return {
    errors,
    result: {
      type: "Retailer Sale",
      customerId: customer.id,
      customerName: customer.name,
      productLines,
      cardLines,
      totalMinor,
      paidMinor: paid.value,
      costMinor,
      costMissing,
      profitMinor: totalMinor - costMinor,
    },
  };
}
