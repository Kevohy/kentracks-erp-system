import type { SimService } from "./sales";
import { parseMoney } from "./purchase-validation";

/**
 * Communication → Airtime: send airtime with Africa's Talking to tracker SIM lines (the SIM of a device sold in a
 * Package or Hosting Sale, where the sale allows airtime: prepaid SIMs, and non-IoT SIMs on hosting sales).
 */

/** Africa's Talking limits for Kenya: KES 5 to KES 10,000 per line (Equitel/JTL lines accept up to KES 5,000). */
export const AIRTIME_MIN_MINOR = 500;
export const AIRTIME_MAX_MINOR = 1_000_000;
/** Africa's Talking accepts up to 1,000 recipients per request. */
export const AIRTIME_MAX_RECIPIENTS = 1000;

export type AirtimeLine = {
  saleId: string;
  customerId: string;
  customerName: string;
  /** The customer's phone (CRM), if any. */
  customerPhone: string | null;
  vehiclePlate: string;
  imei: string;
  simName: string;
  /** As recorded on the sale. */
  simNumber: string;
  /** E.164 when the SIM number is a valid phone number, else null (the line cannot get airtime). */
  phone: string | null;
  /** The sale chose automatic airtime recharge for this SIM. */
  autoRecharge: boolean;
  /** The sale's current airtime service. */
  service: SimService;
  last: { amountMinor: number; status: AirtimeStatus; at: string } | null;
};

export type AirtimeStatus = "Pending" | "Sent" | "Failed" | "Unknown";

export type AirtimeItem = {
  saleId: string | null;
  customerName: string;
  vehiclePlate: string;
  phone: string;
  amountMinor: number;
  status: AirtimeStatus;
  requestId: string | null;
  discount: string | null;
  error: string | null;
};

export type AirtimeBatch = {
  id: string;
  /** Manual: picked lines, one amount. Monthly: approved lines due this month. TopUp: a one-off number. */
  kind: "Manual" | "Monthly" | "TopUp";
  /** Null when the lines got different amounts (monthly airtime). */
  amountMinor: number | null;
  recipients: number;
  sent: number;
  failed: number;
  totalAmount: string | null;
  totalDiscount: string | null;
  error: string | null;
  createdAt: string;
  createdBy: string | null;
  items: AirtimeItem[];
};

/** Whether Africa's Talking is set up on the server. Nothing about the account or the API key is ever sent to the browser. */
export type AfricasTalkingStatus = { configured: boolean };

/** "110" / "110.50" / "1,000" -> minor units, within the Africa's Talking limits. */
export function parseAirtimeAmount(raw: string): { value?: number; error?: string } {
  const r = parseMoney(raw, "Amount", AIRTIME_MAX_MINOR * 10);
  if (r.error) return { error: r.error };
  if (r.value! < AIRTIME_MIN_MINOR) return { error: "The smallest airtime amount is KES 5" };
  if (r.value! > AIRTIME_MAX_MINOR) return { error: "The largest airtime amount is KES 10,000 per line" };
  return { value: r.value };
}

/** 11050 -> "KES 110.50" (the format Africa's Talking expects). */
export const atAmount = (minor: number) => `KES ${(minor / 100).toFixed(2)}`;

// ------------------------------------------------------------------ monthly airtime (approvals)

/** Where an approved line's airtime stops: the device's expiry on the GPS platform, or a date chosen at approval. */
export type AirtimeExpirySource = "IMEI" | "Custom";

export type AirtimePlan = {
  monthlyAmountMinor: number;
  renewalPriceMinor: number;
  expirySource: AirtimeExpirySource;
  customExpiry: string | null;
  approvedAt: string;
  approvedBy: string | null;
  /** No monthly airtime until resumed. */
  suspended: boolean;
  /** Manual, or Expired (suspended automatically when the line reached its expiry date). */
  suspendedReason: "Manual" | "Expired" | null;
};

/**
 * Due: no monthly airtime yet this month. Sent: this month's airtime went (or is unconfirmed: never resent).
 * Expired: past the expiry date. Expiry unknown: from IMEI, but the GPS platform has no date yet (refresh it).
 * No SIM number: the SIM number is not a valid phone number.
 */
export type MonthlyState = "Due" | "Sent" | "Suspended" | "Expired" | "Expiry unknown" | "No SIM number";

/** A sale ticked "automatic airtime recharge" waiting for approval. */
export type PendingAirtimeLine = AirtimeLine & {
  /** The device's expiry on the GPS platform (last known), null if none known. */
  imeiExpiry: string | null;
  /** Lifelong Card: the device never expires. */
  lifelong: boolean;
};

export type ApprovedAirtimeLine = PendingAirtimeLine & {
  plan: AirtimePlan;
  /** When the airtime stops (null: never, a Lifelong Card on IMEI expiry). */
  expiry: string | null;
  state: MonthlyState;
  /** This month's monthly airtime, if any. */
  thisMonth: { amountMinor: number; status: AirtimeStatus; at: string } | null;
  /** The device on the GPS platform, as last checked (null: not checked yet). */
  connection: "Online" | "Offline" | "Expired" | null;
  /** Expires within the next 30 days. */
  expiringSoon: boolean;
};

/** Communication → Airtime → Overview. */
export type AirtimeOverview = {
  month: string;
  configured: boolean;
  /** Africa's Talking balance, e.g. "KES 1500.0000"; null when not set up or it could not be read. */
  balance: string | null;
  balanceError: string | null;
  active: number;
  suspended: number;
  expired: number;
  pending: number;
  /** Approved lines due this month, and the KES total. */
  dueCount: number;
  dueMinor: number;
  sentThisMonth: number;
};

export type AirtimeMonthly = {
  /** YYYY-MM in Nairobi time. */
  month: string;
  pending: PendingAirtimeLine[];
  approved: ApprovedAirtimeLine[];
};

export type AirtimePlanDraft = { monthlyAmount: string; renewalPrice: string; expirySource: string; customExpiry: string };

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const realDate = (v: string) => {
  const m = DATE.exec(v);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
};

/** The same checks in the approval form and on the server. `today` is YYYY-MM-DD (Nairobi). */
export function validateAirtimePlan(d: AirtimePlanDraft, today: string): {
  errors: Record<string, string>;
  value?: { monthlyAmountMinor: number; renewalPriceMinor: number; expirySource: AirtimeExpirySource; customExpiry: string | null };
} {
  const errors: Record<string, string> = {};
  const amount = parseAirtimeAmount(d.monthlyAmount);
  if (amount.error) errors.monthlyAmount = amount.error.replace(/^Amount/, "Amount to disburse");
  const price = parseMoney(d.renewalPrice, "Airtime renewal fee", 1_000_000_000);
  if (price.error) errors.renewalPrice = price.error;
  const source = d.expirySource === "IMEI" || d.expirySource === "Custom" ? d.expirySource : null;
  if (!source) errors.expirySource = "Choose where the expiry date comes from";
  const custom = d.customExpiry.trim();
  if (source === "Custom") {
    if (!custom) errors.customExpiry = "Enter the expiry date";
    else if (!realDate(custom)) errors.customExpiry = "Enter a valid date";
    else if (custom < today) errors.customExpiry = "The expiry date cannot be in the past";
  }
  if (Object.keys(errors).length) return { errors };
  return { errors, value: { monthlyAmountMinor: amount.value!, renewalPriceMinor: price.value!, expirySource: source!, customExpiry: source === "Custom" ? custom : null } };
}


/**
 * The airtime period of an approved line: from approval to its expiry (whole months, at least 1); a line that never
 * expires counts 12 months. Profit = airtime renewal fee − monthly airtime × months.
 */
export function airtimePeriod(approvedAt: string, expiry: string | null, monthlyMinor: number, renewalMinor: number) {
  let months = 12;
  if (expiry) {
    const [y1, m1, d1] = approvedAt.slice(0, 10).split("-").map(Number);
    const [y2, m2, d2] = expiry.split("-").map(Number);
    months = Math.max(1, (y2 - y1) * 12 + (m2 - m1) + (d2 > d1 ? 1 : 0));
  }
  const costMinor = monthlyMinor * months;
  return { months, costMinor, profitMinor: renewalMinor - costMinor, open: !expiry };
}
