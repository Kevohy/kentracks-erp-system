import type { GpsStatus } from "./gps-platform";
import { daysUntil, EXPIRY_WINDOW_DAYS, normalizeDate, todayInNairobi } from "./billing";

/**
 * Billing → IoT SIM. Every Package/Hosting sale that took an IoT SIM card out of stock is an IoT SIM line.
 * Lines are grouped by the SIM card item in inventory (its name and IoT type, e.g. "Safaricom — International IoT").
 * Each line has its own yearly renewal (fee and expiry), separate from the platform licence.
 */

export const IOT_SIM_TYPES = ["International IoT", "Local IoT"] as const;
export type IotSimType = (typeof IOT_SIM_TYPES)[number];
export const BILLING_PERIODS = ["Monthly", "Yearly"] as const;
export type BillingPeriod = (typeof BILLING_PERIODS)[number];

export type IotSim = {
  saleId: string;
  simCardId: string;
  groupName: string;
  simType: string;
  simNumber: string;
  imei: string;
  vehiclePlate: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  /** YYYY-MM-DD: the day the SIM was sold. */
  activationDate: string;
  /** YYYY-MM-DD. One year after activation until a renewal or an edit sets it. */
  expiryDate: string;
  renewalFeeMinor: number | null;
  suspended: boolean;
  /** Device status from GPSPlatform (null until checked). */
  deviceStatus: GpsStatus | null;
  lastCheckedAt: string | null;
  /** This line's share of the group's provider bill, per year (null when no bill is recorded). */
  annualCostMinor: number | null;
  /** Renewal fee minus the yearly bill share. */
  profitMinor: number;
};

export type IotClient = { id: string; name: string; phone: string; account: string; sims: IotSim[] };

export type IotCounts = { sims: number; active: number; suspended: number; online: number; offline: number; expired: number; expiringSoon: number };

export type IotBill = { id: string; simCardId: string; period: string; amountMinor: number; lines: number; note: string; createdAt: string };

export type IotGroup = IotCounts & {
  simCardId: string;
  name: string;
  type: string;
  billingPeriod: BillingPeriod;
  latestBill: IotBill | null;
  /** Latest bill divided by its lines, per billing period. */
  perLineMinor: number | null;
  /** Renewal fees of active lines (per year). */
  receivedMinor: number;
  expectedProfitMinor: number;
};

export type IotRenewal = {
  id: string; saleId: string; simNumber: string; customerName: string; amountMinor: number;
  previousExpiry: string | null; newExpiry: string; note: string; createdAt: string;
};

export type IotClientsPage = { items: IotClient[]; nextOffset: number | null; totals: IotCounts };
export type IotGroupsResult = { groups: IotGroup[]; totals: IotCounts & { receivedMinor: number; expectedProfitMinor: number } };
export type IotSimsPage = { items: IotSim[]; nextOffset: number | null };
export type IotRenewalsResult = { due: IotSim[]; recent: IotRenewal[]; expired: number; dueSoon: number };
export type IotOverview = IotGroupsResult & { recentRenewals: IotRenewal[]; recentBills: (IotBill & { groupName: string })[] };

export type SimExpiry = "suspended" | "expired" | "soon" | "active";

export function simExpiry(s: Pick<IotSim, "suspended" | "expiryDate">, today = todayInNairobi()): SimExpiry {
  if (s.suspended) return "suspended";
  const d = daysUntil(s.expiryDate, today);
  return d < 0 ? "expired" : d <= EXPIRY_WINDOW_DAYS ? "soon" : "active";
}

/** One year after a YYYY-MM-DD date (29 Feb becomes 28 Feb). */
export function plusOneYear(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const t = new Date(Date.UTC(y + 1, m - 1, d));
  if (t.getUTCMonth() !== m - 1) t.setUTCDate(0);
  return t.toISOString().slice(0, 10);
}

/** The usual new expiry for a renewal: one year after the current expiry, or after today if it already passed. */
export function defaultRenewalExpiry(current: string, today = todayInNairobi()): string {
  return plusOneYear(current >= today ? current : today);
}

/** A real calendar date between 2000 and 2100, as YYYY-MM-DD, or an error. */
export function parseDate(raw: string, label: string): { value?: string; error?: string } {
  const s = raw.trim();
  if (!s) return { error: `${label} is required` };
  const v = /^\d{4}-\d{2}-\d{2}$/.test(s) ? normalizeDate(s) : null;
  if (!v) return { error: `${label} must be a valid date` };
  if (v < "2000-01-01" || v > "2100-12-31") return { error: `${label} must be between 2000 and 2100` };
  return { value: v };
}

/** "2026-10" for a bill period; a month that is not yet over is allowed. */
export function parsePeriod(raw: string): { value?: string; error?: string } {
  const s = raw.trim();
  if (!s) return { error: "Bill month is required" };
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(s)) return { error: "Bill month must look like 2026-10" };
  if (s < "2000-01" || s > "2100-12") return { error: "Bill month must be between 2000 and 2100" };
  return { value: s };
}

export const currentPeriod = (today = todayInNairobi()) => today.slice(0, 7);
