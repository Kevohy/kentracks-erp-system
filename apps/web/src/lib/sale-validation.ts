import type { Customer } from "./customers";
import type { Platform, Product, ProductCategory, SimCard } from "./inventory";
import type { Technician } from "./technicians";
import { stripControlChars, validateRequiredText } from "./validation";
import { MAX_NOTES, parseMoney, sanitizeNotes } from "./purchase-validation";
import { formatKes } from "./sales-format";
import { saleTotalMinor, type PackageSale, type SalePackage } from "./sales";
import type { GpsDevice, GpsSource } from "./gps-platform";
import type { PurchaseItemType, StockEntry } from "./purchases";

export { sanitizeNotes, sanitizeNumberInput } from "./purchase-validation";

/** Price and expense limits, in minor units. KES 10,000,000.00 each. */
export const MAX_AMOUNT_MINOR = 1_000_000_000;
const MAX_PACKAGE_NAME = 60;

// ------------------------------------------------------------------ packages

export function validatePackage(
  draft: { name: string },
  packages: SalePackage[],
  editingId?: string,
): { errors: { name?: string }; name: string } {
  const errors: { name?: string } = {};
  const n = validateRequiredText(draft.name, "Package name", MAX_PACKAGE_NAME);
  if (n.error) errors.name = n.error;
  else if (packages.some((p) => p.id !== editingId && p.name.toLowerCase() === n.value.toLowerCase()))
    errors.name = "A package with this name already exists";
  return { errors, name: n.value };
}

/** A Hosting Sale always uses the package named "Hosting" (managed under Settings → Packages). */
export const HOSTING_PACKAGE = "Hosting";
export const hostingPackageOf = (packages: SalePackage[]): SalePackage | undefined =>
  packages.find((p) => p.name.trim().toLowerCase() === HOSTING_PACKAGE.toLowerCase());

/** The Inventory category that Sale line 1 draws its models from. */
export const GPS_TRACKER_CATEGORY = "GPS Trackers";
export const trackerCategory = (categories: ProductCategory[]): ProductCategory | undefined =>
  categories.find((c) => c.name.trim().toLowerCase() === GPS_TRACKER_CATEGORY.toLowerCase());

// ------------------------------------------------------------------ profit

export type SaleProfit = {
  costMinor: { tracker: number; sim: number; licence: number };
  costMissing: string[];
  expensesMinor: number;
  profitMinor: number;
};

/**
 * Profit = sale total - cost of the items sold - expenses.
 * Item cost uses each item's latest buying price from Purchases: the tracker and SIM card count once,
 * the platform licence counts once per deduction unit (0, 0.5 or 1). An item with no buying price yet
 * costs nothing here and is listed in `costMissing` so the figure is never presented as complete.
 */
export function saleProfit(i: {
  totalMinor: number;
  trackerPriceMinor: number | null;
  simPriceMinor: number | null;
  platformPriceMinor: number | null;
  deduction: number;
  expensesMinor: number;
}): SaleProfit {
  const costMissing: string[] = [];
  const tracker = i.trackerPriceMinor ?? 0;
  const sim = i.simPriceMinor ?? 0;
  const licence = i.platformPriceMinor === null ? 0 : Math.round(i.platformPriceMinor * i.deduction);
  if (i.trackerPriceMinor === null) costMissing.push("tracker");
  if (i.simPriceMinor === null) costMissing.push("SIM card");
  if (i.platformPriceMinor === null && i.deduction > 0) costMissing.push("platform licence");
  return {
    costMinor: { tracker, sim, licence },
    costMissing,
    expensesMinor: i.expensesMinor,
    profitMinor: i.totalMinor - tracker - sim - licence - i.expensesMinor,
  };
}

// -------------------------------------------------------- platform deduction

/** Deduction quantity: exactly 0, 0.5 or 1. */
export const DEDUCTION_VALUES = [0, 0.5, 1] as const;
export function parseDeduction(raw: string): { value?: number; error?: string } {
  const s = stripControlChars(raw).trim();
  if (!s) return { error: "Select a deduction quantity (0, 0.5 or 1)" };
  const n = /^\d+(\.\d+)?$/.test(s) ? Number(s) : NaN;
  if (!(DEDUCTION_VALUES as readonly number[]).includes(n)) return { error: "Deduction quantity must be 0, 0.5 or 1" };
  return { value: n };
}

// --------------------------------------------------------------- package sale

export type OtherExpenseDraft = { key: string; description: string; amount: string };

export const MAX_OTHER_EXPENSES = 10;
const MAX_EXPENSE_DESCRIPTION = 80;

export type PackageSaleDraft = {
  customerId: string;
  customerLink: "automatic" | "manual";
  packageId: string;
  productId: string;
  platformId: string;
  cardType: string;
  deduction: string;
  simId: string;
  technicianId: string;
  installation: string;
  transport: string;
  commission: string;
  /** Package price for this sale, typed by hand (KES). */
  price: string;
  paid: string;
  notes: string;
  /** Take one of the chosen SIM card out of inventory stock when the sale is completed. */
  deductSim: boolean;
  /** Extra costs of the sale. A row left completely empty is ignored. */
  otherExpenses: OtherExpenseDraft[];
};

export type VerifiedDevice = { device: GpsDevice; source: GpsSource };

export type PackageSaleContext = {
  /** A Hosting Sale has no tracker line, and its deduction and SIM card are optional. */
  kind: "Package Sale" | "Hosting Sale";
  verified: VerifiedDevice | null;
  customers: Customer[];
  packages: SalePackage[];
  categories: ProductCategory[];
  products: Product[];
  platforms: Platform[];
  simCards: SimCard[];
  technicians: Technician[];
  /** Stock and latest buying price from Purchases. */
  stockOf: (type: PurchaseItemType, id: string) => StockEntry;
};

/** Error keys: imei, customer, package, price, product, platform, cardType, deduction, sim,
 *  technician, installation, transport, commission, paid, notes. */
export type SaleErrors = Record<string, string>;

export function validatePackageSale(
  d: PackageSaleDraft,
  ctx: PackageSaleContext,
): { errors: SaleErrors; result?: Omit<PackageSale, "id"> } {
  const errors: SaleErrors = {};

  if (!ctx.verified) errors.imei = "Verify the IMEI before completing the sale";

  const customer = ctx.customers.find((c) => c.id === d.customerId);
  if (!d.customerId) errors.customer = "Select a customer";
  else if (!customer) errors.customer = "Select a valid customer";

  const pkg = ctx.kind === "Hosting Sale" ? hostingPackageOf(ctx.packages) : ctx.packages.find((p) => p.id === d.packageId);
  if (ctx.kind === "Hosting Sale") {
    if (!pkg) errors.package = `Add a "${HOSTING_PACKAGE}" package in Settings → Packages first`;
  } else if (!d.packageId) errors.package = "Select a package";
  else if (!pkg) errors.package = "Select a valid package";

  // Line 1 is always a GPS tracker, so only the model is chosen.
  const hosting = ctx.kind === "Hosting Sale";
  const category = trackerCategory(ctx.categories);
  const product = category ? ctx.products.find((p) => p.id === d.productId && p.categoryId === category.id) : undefined;
  if (!hosting) {
    if (!category) errors.product = `Add a "${GPS_TRACKER_CATEGORY}" category in Inventory first`;
    else if (!d.productId) errors.product = "Select a tracker model";
    else if (!product) errors.product = "Select a valid model";
  }

  const platform = ctx.platforms.find((p) => p.id === d.platformId);
  if (!d.platformId) errors.platform = "Select a platform";
  else if (!platform) errors.platform = "Select a valid platform";
  if (!d.cardType) errors.cardType = "Select a card type";
  else if (platform && !platform.licenceTypes.includes(d.cardType)) errors.cardType = "Select a valid card type";
  // Hosting: an empty deduction means none (0).
  const deduction = hosting && !d.deduction ? { value: 0 } : parseDeduction(d.deduction);
  if (deduction.error) errors.deduction = deduction.error;

  const sim = ctx.simCards.find((s) => s.id === d.simId);
  if (!d.simId) errors.sim = "Select a SIM card";
  else if (!sim) errors.sim = "Select a valid SIM card";
  else if (d.deductSim && ctx.stockOf("SIM Card", sim.id).quantity < 1) errors.deductSim = "No stock left for this SIM card, so it cannot be deducted";

  const technician = ctx.technicians.find((t) => t.id === d.technicianId);
  // Optional: a sale may have no technician.
  if (d.technicianId && !technician) errors.technician = "Select a valid technician";

  // Expenses are optional: left empty they count as zero.
  const money = (key: string, label: string, raw: string) => {
    if (raw.trim() === "") return 0;
    const r = parseMoney(raw, label, MAX_AMOUNT_MINOR);
    if (r.error) errors[key] = r.error;
    return r.value;
  };
  const installation = money("installation", "Installation", d.installation);
  const transport = money("transport", "Transport", d.transport);
  const commission = money("commission", "Commission", d.commission);

  const other: { description: string; amountMinor: number }[] = [];
  for (const row of d.otherExpenses) {
    const description = stripControlChars(row.description).trim();
    const amount = row.amount.trim();
    if (!description && !amount) continue; // an untouched row is ignored
    const dKey = `other-${row.key}-description`;
    const aKey = `other-${row.key}-amount`;
    if (!description) errors[dKey] = "Describe this expense";
    else if (description.length > MAX_EXPENSE_DESCRIPTION) errors[dKey] = `Description must be ${MAX_EXPENSE_DESCRIPTION} characters or fewer`;
    if (!amount) errors[aKey] = "Enter the amount";
    else {
      const r = parseMoney(amount, "Amount", MAX_AMOUNT_MINOR);
      if (r.error) errors[aKey] = r.error;
      else if (r.value === 0) errors[aKey] = "Amount must be greater than zero";
      else if (!errors[dKey]) other.push({ description, amountMinor: r.value! });
    }
  }

  const notes = sanitizeNotes(d.notes).trim();
  if (notes.length > MAX_NOTES) errors.notes = `Notes must be ${MAX_NOTES} characters or fewer`;

  const price = parseMoney(d.price, "Package price", MAX_AMOUNT_MINOR);
  if (price.error) errors.price = price.error;
  else if (price.value === 0) errors.price = "Package price must be greater than zero";
  const totalMinor = price.value !== undefined && !errors.price ? saleTotalMinor(price.value) : undefined;
  const paid = parseMoney(d.paid, "Amount paid", Number.MAX_SAFE_INTEGER);
  if (paid.error) errors.paid = paid.error;
  else if (totalMinor !== undefined && paid.value! > totalMinor)
    errors.paid = `Amount paid cannot be more than the sale total (${formatKes(totalMinor)})`;

  if (
    Object.keys(errors).length > 0 ||
    !ctx.verified || !customer || !pkg || !platform ||
    !sim || (!hosting && (!category || !product)) ||
    deduction.value === undefined || installation === undefined || transport === undefined ||
    commission === undefined || paid.value === undefined || totalMinor === undefined
  ) {
    return { errors };
  }

  const profit = saleProfit({
    totalMinor,
    trackerPriceMinor: product ? ctx.stockOf("Product", product.id).latestPriceMinor : 0,
    simPriceMinor: ctx.stockOf("SIM Card", sim.id).latestPriceMinor,
    platformPriceMinor: ctx.stockOf("Platform", platform.id).latestPriceMinor,
    deduction: deduction.value,
    expensesMinor: installation + transport + commission + other.reduce((s, o) => s + o.amountMinor, 0),
  });

  const { device, source } = ctx.verified;
  return {
    errors,
    result: {
      type: ctx.kind,
      customerId: customer.id,
      customerName: customer.name,
      customerLink: d.customerLink,
      imei: device.imei,
      vehiclePlate: device.vehiclePlate ?? "",
      gpsAccount: device.account ?? "",
      verificationSource: source,
      packageId: pkg.id,
      packageName: pkg.name,
      packagePriceMinor: totalMinor,
      tracker: category && product ? { categoryName: category.name, productId: product.id, model: product.model } : null,
      licence: { platformId: platform.id, platformName: platform.name, cardType: d.cardType, deduction: deduction.value },
      sim: { id: sim.id, name: sim.name, number: device.simCard ?? "", deducted: d.deductSim },
      technician: technician ? { id: technician.id, name: technician.name } : null,
      expensesMinor: { installation, transport, commission, other },
      notes,
      totalMinor,
      paidMinor: paid.value,
      costMinor: profit.costMinor,
      costMissing: profit.costMissing,
      profitMinor: profit.profitMinor,
    },
  };
}
