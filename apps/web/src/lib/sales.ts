import type { Customer } from "./customers";
import { validateEmail, validatePhone } from "./validation";

/** Types and mock data for the Sales module. Frontend only; nothing is persisted. */

export const saleTypes = ["Package Sale", "Hosting Sale", "Retailer Sale"] as const;
export type SaleType = (typeof saleTypes)[number];

export type GpsContact = { name?: string; phone?: string; email?: string };

/** A configurable package name (managed under Settings). The price is entered on each sale. */
export type SalePackage = { id: string; name: string };

/** Sample packages so the page has something to select. Names are placeholders. */
export const samplePackages: SalePackage[] = [
  { id: "pk1", name: "Basic" },
  { id: "pk2", name: "Standard" },
  { id: "pk3", name: "Premium" },
  { id: "pk4", name: "Hosting" },
];

export const CARD_TYPES = ["New Card", "Annual Card", "Lifelong Card"] as const;

/** A completed Package or Hosting Sale. Names are copied in so the record stays readable if inventory or packages change. */
export type PackageSale = {
  id: string;
  type: "Package Sale" | "Hosting Sale";
  customerId: string;
  customerName: string;
  customerLink: "automatic" | "manual";
  imei: string;
  vehiclePlate: string;
  gpsAccount: string;
  /** How the IMEI was verified. "mock" means sample data, not GPSPlatform. */
  verificationSource: "mock" | "gpsplatform";
  packageId: string;
  packageName: string;
  packagePriceMinor: number;
  /** Null for a Hosting Sale, which has no tracker line. */
  tracker: { categoryName: string; productId: string; model: string } | null;
  licence: { platformId: string; platformName: string; cardType: string; deduction: number };
  /** `name` is the inventory SIM card; `number` is the SIM number GPSPlatform returned for the IMEI. */
  /** `deducted` is true when one was taken out of inventory stock. */
  sim: { id: string; name: string; number: string; deducted: boolean };
  /** Null when no technician was assigned (optional). */
  technician: { id: string; name: string } | null;
  expensesMinor: { installation: number; transport: number; commission: number; other: { description: string; amountMinor: number }[] };
  notes: string;
  totalMinor: number;
  paidMinor: number;
  /** Buying-price cost of what was sold, taken from Purchases when the sale was made. */
  costMinor: { tracker: number; sim: number; licence: number };
  /** Names of items that had no buying price yet, so their cost is not in `costMinor`. */
  costMissing: string[];
  /** Sale total minus item costs minus expenses. Negative is a loss. */
  profitMinor: number;
};

export type RetailerProductLine = {
  categoryName: string;
  productId: string;
  model: string;
  quantity: number;
  unitPriceMinor: number;
  lineTotalMinor: number;
  /** Latest buying price from Purchases when the sale was made; null when there was none. */
  unitCostMinor: number | null;
};

export type RetailerCardLine = {
  platformId: string;
  platformName: string;
  cardType: string;
  quantity: number;
  unitPriceMinor: number;
  lineTotalMinor: number;
  unitCostMinor: number | null;
};

/** A completed Retailer Sale: product lines and platform card lines sold to an existing customer. */
export type RetailerSale = {
  id: string;
  type: "Retailer Sale";
  customerId: string;
  customerName: string;
  productLines: RetailerProductLine[];
  cardLines: RetailerCardLine[];
  totalMinor: number;
  paidMinor: number;
  /** Quantity x buying cost for every line that has a buying cost. */
  costMinor: number;
  /** Lines with no buying cost yet; their cost is not in `costMinor`, so the profit is incomplete. */
  costMissing: string[];
  profitMinor: number;
};

export type Sale = PackageSale | RetailerSale;

/**
 * The single pricing rule: the sale total IS the package price. The tracker, platform licence
 * and SIM card are included in the package and are never charged on top of it. Installation,
 * transport and commission are costs of the sale and are recorded, not added to the total.
 */
export const saleTotalMinor = (packagePriceMinor: number): number => packagePriceMinor;

const norm = (s: string | undefined) => (s ?? "").trim().toLowerCase();

/**
 * Finds the CRM customer a GPSPlatform contact belongs to. Only an exact normalised phone
 * (E.164) or case-insensitive email match counts. If the matches point at more than one
 * customer the result is ambiguous and nothing is linked automatically.
 */
export function matchCustomer(
  contact: GpsContact | undefined,
  customers: Customer[],
): { status: "matched"; customer: Customer; by: "phone" | "email" | "phone and email" } | { status: "ambiguous" } | { status: "none" } {
  if (!contact) return { status: "none" };
  const phone = contact.phone ? validatePhone(contact.phone) : undefined;
  const email = contact.email ? validateEmail(contact.email) : undefined;
  const phoneKey = phone && !phone.error ? phone.value : "";
  const emailKey = email && !email.error ? norm(email.value) : "";

  const byPhone = phoneKey ? customers.filter((c) => c.phone === phoneKey) : [];
  const byEmail = emailKey ? customers.filter((c) => norm(c.email) === emailKey) : [];
  const ids = new Set([...byPhone, ...byEmail].map((c) => c.id));
  if (ids.size === 0) return { status: "none" };
  if (ids.size > 1) return { status: "ambiguous" };
  const customer = [...byPhone, ...byEmail][0];
  const both = byPhone.some((c) => c.id === customer.id) && byEmail.some((c) => c.id === customer.id);
  return { status: "matched", customer, by: both ? "phone and email" : byPhone.length ? "phone" : "email" };
}
