import type { Customer } from "./customers";
import { validateEmail, validatePhone } from "./validation";

/** Types and rules for the Sales module. Records are saved by the server (src/server/erp/sales.ts). */

export const saleTypes = ["Package Sale", "Hosting Sale", "Retailer Sale"] as const;
export type SaleType = (typeof saleTypes)[number];

export type GpsContact = { name?: string; phone?: string; email?: string };

/** A configurable package name (managed under Settings). The price is entered on each sale. */
export type SalePackage = { id: string; name: string };


export const CARD_TYPES = ["New Card", "Annual Card", "Lifelong Card"] as const;

/** One item this sale took out of inventory stock. */
export type StockTaken = { itemType: "Product" | "SIM Card" | "Platform"; name: string; quantity: number };

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
  /** The GPS platform that verified the IMEI ("Kentracks", "iTrack"). Null for mock data, and for sales recorded before
   * iTrack was added (those were all verified by Kentracks). */
  verificationPlatform: string | null;
  packageId: string;
  packageName: string;
  packagePriceMinor: number;
  /** Null for a Hosting Sale, which has no tracker line. */
  tracker: { categoryName: string; productId: string; model: string } | null;
  licence: {
    platformId: string;
    platformName: string;
    cardType: string;
    deduction: number;
    /** New Card only: the renewal fee agreed with the customer (charged when the licence expires, not part of this sale). */
    renewalFeeMinor: number | null;
    /** New Card only: the platform expiration date GPSPlatform returned for the device. */
    expirationDate: string | null;
  };
  /** `name` is the inventory SIM card; `number` is the SIM number GPSPlatform returned for the IMEI. */
  /** `deducted` is true when one was taken out of inventory stock. */
  sim: {
    id: string;
    name: string;
    number: string;
    deducted: boolean;
    /** Send the customer a monthly airtime SMS reminder (Bulk SMS). */
    smsReminder: boolean;
    /** Automatic airtime recharge (Communication → Airtime, after approval). */
    autoRecharge: boolean;
    /** Changes of the airtime service after the sale, newest first. */
    serviceChanges: SimServiceChange[];
    /** Automatic airtime only: where the line stands in Communication → Airtime. */
    airtimeStatus: AirtimeLineStatus | null;
    /** SMS reminder only: this month's reminder and the latest ones sent. */
    reminder: SmsReminderInfo | null;
    /** IoT SIMs (Local or International) are added to Billing → IoT SIM automatically (billing comes later). */
    iotBilling: boolean;
  };
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
  /** When the sale was completed (ISO timestamp). For an old sale, the original sale date. */
  createdAt: string;
  /** What this sale took out of inventory stock. */
  stockTaken: StockTaken[];
  /** Recorded after the fact for tracking only: no stock taken, no money, left out of revenue and profit. */
  oldSale: boolean;
  /** Old sales only: the price it was sold for back then, if known. For reference only: never revenue, profit or a balance. */
  oldPriceMinor: number | null;
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
  createdAt: string;
  stockTaken: StockTaken[];
};

export type Sale = PackageSale | RetailerSale;

/** One page of the sale history. */
export type SalesPage = {
  items: Sale[];
  nextCursor: string | null;
  /** Revenue, balance and profit leave out old sales (recorded for tracking only); `oldSales` counts them. */
  totals?: { count: number; oldSales: number; revenueMinor: number; balanceMinor: number; profitMinor: number };
};

/**
 * The single pricing rule: the sale total IS the package price. The tracker, platform licence
 * and SIM card are included in the package and are never charged on top of it. Installation,
 * transport and commission are costs of the sale and are recorded, not added to the total.
 */
export const saleTotalMinor = (packagePriceMinor: number): number => packagePriceMinor;

const norm = (s: string | undefined) => (s ?? "").trim().toLowerCase();

/**
 * Finds the CRM customer a GPS device belongs to. The device's customer account on the platform (Kentracks
 * `customeraccount`) matching a CRM customer's account decides first: an account belongs to exactly one customer.
 * Otherwise only an exact normalised phone (E.164) or case-insensitive email of the device contact counts. If the
 * matches point at more than one customer the result is ambiguous and nothing is linked automatically.
 */
export function matchCustomer(
  contact: GpsContact | undefined,
  customers: Customer[],
  account?: string,
): { status: "matched"; customer: Customer; by: "account" | "phone" | "email" | "phone and email" } | { status: "ambiguous" } | { status: "none" } {
  const acc = norm(account);
  if (acc) {
    const byAccount = customers.find((c) => norm(c.account) === acc);
    if (byAccount) return { status: "matched", customer: byAccount, by: "account" };
  }
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

/** The airtime service chosen for a sold tracker SIM. */
export type SimService = "None" | "SMS reminder" | "Automatic airtime recharge";
export const SIM_SERVICES: readonly SimService[] = ["None", "SMS reminder", "Automatic airtime recharge"];
export const simServiceOf = (smsReminder: boolean, autoRecharge: boolean): SimService =>
  autoRecharge ? "Automatic airtime recharge" : smsReminder ? "SMS reminder" : "None";

export type SimServiceChange = {
  /** Service: the service changed. Suspended / Resumed: automatic airtime paused or restarted. */
  kind: "Service" | "Suspended" | "Resumed";
  from: SimService;
  to: SimService;
  reason: string;
  at: string;
  by: string | null;
  sms: { status: "Sent" | "Failed"; error: string | null } | null;
};

/** Automatic airtime state of a sold SIM, as shown in Sales and Billing. */
export type AirtimeLineStatus = "Waiting for approval" | "Active" | "Suspended" | "Suspended (device expired)";

/**
 * SMS reminder service only: the monthly airtime reminder (Communication → Bulk SMS → Reminders), as shown in Sales
 * and Billing. Due: no reminder yet this month. `recent` is the latest reminders, newest first.
 */
export type SmsReminderInfo = {
  status: "Due" | "Sent this month";
  recent: { at: string; status: "Pending" | "Scheduled" | "Sent" | "Delivered" | "Failed" | "Unknown" }[];
  /** How many reminders this line has been sent in total. */
  total: number;
};
