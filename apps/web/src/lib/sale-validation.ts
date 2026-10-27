import type { Customer } from "./customers";
import type { Platform, Product, ProductCategory, SimCard } from "./inventory";
import type { Technician } from "./technicians";
import { stripControlChars, validateRequiredText } from "./validation";
import { MAX_NOTES, parseMoney, sanitizeNotes } from "./purchase-validation";
import { formatKes } from "./sales-format";
import { saleTotalMinor, type PackageSale, type SalePackage } from "./sales";
import type { GpsDevice, GpsSource } from "./gps-platform";
import type { StockLookup } from "./purchases";

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
/** "GPS Trackers" exactly; otherwise the only category whose name mentions GPS (so "Gps tracker" or a typo still works). */
export const trackerCategory = (categories: ProductCategory[]): ProductCategory | undefined => {
  const exact = categories.find((c) => c.name.trim().toLowerCase() === GPS_TRACKER_CATEGORY.toLowerCase());
  if (exact) return exact;
  const gps = categories.filter((c) => /gps/i.test(c.name));
  return gps.length === 1 ? gps[0] : undefined;
};

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
/** Card types a Package or Hosting Sale can sell, and the deduction quantities each allows. */
export const SALE_CARD_DEDUCTIONS: Record<string, readonly number[]> = { "New Card": [0, 1], "Lifelong Card": [0.5, 1] };
export const SALE_CARD_TYPES = Object.keys(SALE_CARD_DEDUCTIONS);
export const deductionsFor = (cardType: string): readonly number[] => SALE_CARD_DEDUCTIONS[cardType] ?? [];

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
  /** New Card only: the renewal fee (KES). */
  renewalFee?: string;
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
  /** Prepaid SIMs only; ignored for other SIM types. */
  smsReminder?: boolean;
  autoRecharge?: boolean;
  /** Extra costs of the sale. A row left completely empty is ignored. */
  otherExpenses: OtherExpenseDraft[];
  /**
   * An old sale (made before this system): recorded for tracking only. Nothing is taken from stock, and price,
   * payment, expenses and profit are not recorded, so it never changes inventory, revenue or profit.
   */
  oldSale?: boolean;
  /**
   * Old sales only. The original sale date is the IMEI's activation date on GPSPlatform; this typed date is used only
   * when GPSPlatform has no activation date for the device (YYYY-MM-DD, today or earlier).
   */
  saleDate?: string;
};

/** The IMEI activation date GPSPlatform gave, as YYYY-MM-DD, or null when it gave none (or not a date). */
export function oldSaleDateOf(device: GpsDevice | undefined): string | null {
  const m = device?.activationDate ? /^(\d{4}-\d{2}-\d{2})/.exec(device.activationDate) : null;
  return m ? m[1] : null;
}

/** Old sales: the original sale date must be a real date, not in the future, and not before 2000. */
export function parseSaleDate(raw: string, today: string): { value?: string; error?: string } {
  const s = stripControlChars(raw).trim();
  if (!s) return { error: "Kentracks has no activation date for this IMEI. Enter the original sale date" };
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  const d = m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null;
  if (!m || !d || d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3]) return { error: "Enter a valid date" };
  if (s > today) return { error: "The original sale date cannot be in the future" };
  if (s < "2000-01-01") return { error: "The original sale date must be in 2000 or later" };
  return { value: s };
}

export type VerifiedDevice = { device: GpsDevice; source: GpsSource };

export type PackageSaleContext = {
  /** A Hosting Sale has no tracker line; its SIM card deduction is optional. */
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
  stockOf: StockLookup;
  /** Today (YYYY-MM-DD, Nairobi): an old sale's date cannot be later. */
  today?: string;
};

/** Error keys: imei, customer, package, price, product, platform, cardType, deduction, sim,
 *  technician, installation, transport, commission, paid, notes. */
export type SaleErrors = Record<string, string>;

/** Local IoT and International IoT SIMs are billed under Billing → IoT SIM. */
export const isIotSim = (type: string) => type === "Local IoT" || type === "International IoT";

/** Whether the airtime alert / automatic recharge choice is offered for this SIM on this kind of sale. */
export const airtimeAllowed = (kind: "Package Sale" | "Hosting Sale", simType: string) =>
  !isIotSim(simType) && (simType === "Prepaid" || kind === "Hosting Sale");

/** Selling a New Card also records the platform expiration date and the renewal fee. */
export const NEW_CARD = "New Card";

export function validatePackageSale(
  d: PackageSaleDraft,
  ctx: PackageSaleContext,
): { errors: SaleErrors; result?: Omit<PackageSale, "id" | "createdAt" | "stockTaken">; saleDate?: string } {
  const errors: SaleErrors = {};
  // An old sale is tracking only: it skips every stock check and records no money.
  const old = !!d.oldSale;
  // An old sale is dated on the IMEI's activation date from GPSPlatform; a typed date is only used when it has none.
  const activation = oldSaleDateOf(ctx.verified?.device);
  const saleDate = !old
    ? { value: undefined as string | undefined }
    : parseSaleDate(activation ?? d.saleDate ?? "", ctx.today ?? new Date().toISOString().slice(0, 10));
  if (old && ctx.verified && "error" in saleDate && saleDate.error) {
    errors.saleDate = activation ? `The IMEI activation date (${activation}) cannot be used: ${saleDate.error.toLowerCase()}` : saleDate.error;
  }

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
    else if (!old && ctx.stockOf("Product", product.id).quantity < 1) errors.product = `${product.model} is out of stock. Receive a purchase for it before selling`;
  }

  const platform = ctx.platforms.find((p) => p.id === d.platformId);
  if (!d.platformId) errors.platform = "Select a platform";
  else if (!platform) errors.platform = "Select a valid platform";
  if (!d.cardType) errors.cardType = "Select a card type";
  else if (!SALE_CARD_TYPES.includes(d.cardType)) errors.cardType = "Only a New Card or Lifelong Card can be sold";
  else if (platform && !platform.licenceTypes.includes(d.cardType)) errors.cardType = "Select a valid card type";
  // A New Card needs the renewal fee the customer will pay when the licence expires.
  const isNewCard = d.cardType === NEW_CARD;
  const renewal = isNewCard ? parseMoney(d.renewalFee ?? "", "Renewal fee", MAX_AMOUNT_MINOR) : { value: undefined as number | undefined };
  if (isNewCard && "error" in renewal && renewal.error) errors.renewalFee = renewal.error;
  // The deduction is required and depends on the card type: New Card 0 or 1, Lifelong Card 0.5 or 1.
  // An old sale takes no licence from stock, so its deduction is always 0.
  let deduction = old ? { value: 0 } : parseDeduction(d.deduction);
  const allowed = deductionsFor(d.cardType);
  if (old) {
    // nothing to check
  } else if (!d.deduction.trim()) deduction = { error: "Select a deduction quantity" };
  else if (!deduction.error && allowed.length && !allowed.includes(deduction.value!))
    deduction = { error: `For a ${d.cardType} the deduction must be ${allowed.join(" or ")}` };
  if (deduction.error) errors.deduction = deduction.error;
  // The licence deduction is taken out of that card type's stock, so there must be enough.
  else if (platform && deduction.value && deduction.value > 0 && !errors.cardType) {
    const left = ctx.stockOf("Platform", platform.id, d.cardType).quantity;
    if (left < deduction.value) errors.deduction = left <= 0 ? `${platform.name} has no ${d.cardType}s in stock` : `Only ${left} ${platform.name} ${d.cardType}${left === 1 ? "" : "s"} in stock`;
  }

  const simDeducted = old ? false : ctx.kind === "Hosting Sale" ? d.deductSim : true;
  const sim = ctx.simCards.find((s) => s.id === d.simId);
  if (!d.simId) errors.sim = "Select a SIM card";
  else if (!sim) errors.sim = "Select a valid SIM card";
  // A Package Sale always takes its SIM card from stock; a Hosting Sale only when "Deduct from inventory" is ticked
  // (the customer may bring their own SIM).
  else if (simDeducted && ctx.stockOf("SIM Card", sim.id).quantity < 1) errors.sim = `${sim.name} ${sim.type} is out of stock`;
  if (d.smsReminder && d.autoRecharge) errors.simService = "Choose either the SMS reminder or automatic airtime recharge, not both";

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
  // An old sale records no money, so expenses, price and payment are not read.
  const installation = old ? 0 : money("installation", "Installation", d.installation);
  const transport = old ? 0 : money("transport", "Transport", d.transport);
  const commission = old ? 0 : money("commission", "Commission", d.commission);

  const other: { description: string; amountMinor: number }[] = [];
  for (const row of old ? [] : d.otherExpenses) {
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

  // An old sale's price is optional and kept for reference only (never revenue, profit or a balance).
  const oldPrice = old && d.price.trim() ? parseMoney(d.price, "Original price", MAX_AMOUNT_MINOR) : { value: undefined as number | undefined };
  if (old && oldPrice.error) errors.price = oldPrice.error;
  else if (old && oldPrice.value === 0) errors.price = "Original price must be greater than zero, or leave it empty";
  const price = old ? { value: 0 } : parseMoney(d.price, "Package price", MAX_AMOUNT_MINOR);
  if (price.error) errors.price = price.error;
  else if (!old && price.value === 0) errors.price = "Package price must be greater than zero";
  const totalMinor = old ? 0 : price.value !== undefined && !errors.price ? saleTotalMinor(price.value) : undefined;
  const paid = old ? { value: 0 } : parseMoney(d.paid, "Amount paid", Number.MAX_SAFE_INTEGER);
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

  const profit = old
    ? { costMinor: { tracker: 0, sim: 0, licence: 0 }, costMissing: [], expensesMinor: 0, profitMinor: 0 }
    : saleProfit({
    totalMinor,
    trackerPriceMinor: product ? ctx.stockOf("Product", product.id).latestPriceMinor : 0,
    simPriceMinor: ctx.stockOf("SIM Card", sim.id).latestPriceMinor,
    platformPriceMinor: ctx.stockOf("Platform", platform.id, d.cardType).latestPriceMinor,
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
      verificationPlatform: source === "gpsplatform" ? (device.platform ?? null) : null,
      packageId: pkg.id,
      packageName: pkg.name,
      packagePriceMinor: totalMinor,
      tracker: category && product ? { categoryName: category.name, productId: product.id, model: product.model } : null,
      licence: {
        platformId: platform.id,
        platformName: platform.name,
        cardType: d.cardType,
        deduction: deduction.value,
        renewalFeeMinor: isNewCard ? (renewal.value ?? null) : null,
        expirationDate: isNewCard ? (device.expirationDate ?? null) : null,
      },
      sim: {
        id: sim.id,
        name: sim.name,
        number: device.simCard ?? "",
        deducted: simDeducted,
        // Airtime services never apply to IoT SIMs (they are billed under Billing → IoT SIM instead). Otherwise:
        // prepaid SIMs, and any SIM on a Hosting Sale (often the customer's own SIM).
        smsReminder: airtimeAllowed(ctx.kind, sim.type) && !!d.smsReminder,
        autoRecharge: airtimeAllowed(ctx.kind, sim.type) && !!d.autoRecharge,
        // Billing → IoT SIM only covers IoT SIMs taken from our stock (a customer's own SIM is not billed).
        // An old sale's IoT SIM was taken from stock back then, so it is billed too.
        iotBilling: isIotSim(sim.type) && (simDeducted || old),
        serviceChanges: [],
        airtimeStatus: d.autoRecharge && airtimeAllowed(ctx.kind, sim.type) ? "Waiting for approval" : null,
        // A new sale on the SMS reminder is due for this month's reminder (Communication → Bulk SMS → Reminders).
        reminder: d.smsReminder && !d.autoRecharge && airtimeAllowed(ctx.kind, sim.type) ? { status: "Due", recent: [], total: 0 } : null,
      },
      technician: technician ? { id: technician.id, name: technician.name } : null,
      expensesMinor: { installation, transport, commission, other },
      notes,
      totalMinor,
      paidMinor: paid.value,
      costMinor: profit.costMinor,
      costMissing: profit.costMissing,
      profitMinor: profit.profitMinor,
      oldSale: old,
      oldPriceMinor: old ? (oldPrice.value ?? null) : null,
    },
    ...(old ? { saleDate: saleDate.value } : {}),
  };
}
