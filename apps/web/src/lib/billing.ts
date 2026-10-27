import type { GpsStatus } from "./gps-platform";
import type { SmsReminderInfo } from "./sales";

/** Billing: every tracker sold through a Package Sale or Hosting Sale, grouped by customer. */

export type BillingVehicle = {
  imei: string;
  vehiclePlate: string;
  /** GPS platform account the device is on. */
  gpsAccount: string;
  /** Device model as GPSPlatform reports it (falls back to the tracker sold). */
  deviceModel: string | null;
  packageName: string;
  saleType: "Package Sale" | "Hosting Sale";
  platformName: string;
  cardType: string;
  /** Online / Offline / Expired as GPSPlatform last reported it; null until checked. */
  status: GpsStatus | null;
  simNumber: string;
  simName: string;
  simType: string;
  /** YYYY-MM-DD where known. */
  activationDate: string | null;
  /** YYYY-MM-DD; null for a Lifelong Card or when the platform gave none. */
  expirationDate: string | null;
  renewalFeeMinor: number | null;
  technicianName: string | null;
  /** When GPSPlatform was last asked about this device (ISO). */
  checkedAt: string | null;
  /** When the device last sent data to the platform: "YYYY-MM-DD HH:mm" in Nairobi time; null if never or unknown. */
  lastSeen: string | null;
  saleId: string;
  soldAt: string;
  /** The SIM's airtime service, and for automatic airtime its approval state. */
  airtime: {
    service: "None" | "SMS reminder" | "Automatic airtime recharge";
    status: "Waiting for approval" | "Active" | "Suspended" | "Suspended (device expired)" | null;
    /** SMS reminder only: this month's monthly airtime reminder and the latest one sent. */
    reminder: SmsReminderInfo | null;
  };
};

export type BillingCustomer = {
  id: string;
  name: string;
  account: string;
  phone: string;
  email: string;
  brandName: string | null;
  vehicles: BillingVehicle[];
};

/** "Unknown" means GPSPlatform has not reported a status for the device yet. */
export const billingFilters = ["All", "Online", "Offline", "Expiring soon", "Expired", "Unknown"] as const;
export type BillingFilter = (typeof billingFilters)[number];

export type BillingTotals = {
  customers: number;
  vehicles: number;
  online: number;
  offline: number;
  expiringSoon: number;
  expired: number;
  unknown: number;
  /** Vehicles with a renewal fee that are expired or expire within the window. */
  renewalsDue: number;
  /** Renewal fees of vehicles that are expired or expire within the window. */
  renewalDueMinor: number;
};

export type BillingPage = { items: BillingCustomer[]; nextOffset: number | null; totals: BillingTotals };

export type BillingSyncResult = { items: BillingCustomer[]; checked: number; failed: number; message?: string };

/** The page re-checks device status this often (and a device is not asked again sooner). */
export const LIVE_REFRESH_SECONDS = 60;

/** "Expiring soon" means within this many days. */
export const EXPIRY_WINDOW_DAYS = 30;

/** Today's date (YYYY-MM-DD) in Nairobi, the company's time zone. */
export function todayInNairobi(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Nairobi", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** Whole days from today to a YYYY-MM-DD date (negative when past). */
export function daysUntil(date: string, today = todayInNairobi()): number {
  const t = (d: string) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)));
  return Math.round((t(date) - t(today)) / 86_400_000);
}

export type ExpiryState = "lifelong" | "unknown" | "active" | "soon" | "expired";

export function expiryState(v: Pick<BillingVehicle, "cardType" | "expirationDate" | "status">, today = todayInNairobi()): ExpiryState {
  if (v.cardType === "Lifelong Card") return "lifelong";
  if (!v.expirationDate) return v.status === "Expired" ? "expired" : "unknown";
  const d = daysUntil(v.expirationDate, today);
  if (d < 0 || v.status === "Expired") return "expired";
  return d <= EXPIRY_WINDOW_DAYS ? "soon" : "active";
}

/** True when a vehicle belongs under the given filter. Mirrors the database filter in src/server/erp/billing.ts. */
export function vehicleMatches(v: BillingVehicle, f: BillingFilter, today = todayInNairobi()): boolean {
  if (f === "All") return true;
  if (f === "Online") return v.status === "Online";
  if (f === "Offline") return v.status === "Offline";
  if (f === "Unknown") return v.status === null;
  const s = expiryState(v, today);
  return f === "Expired" ? s === "expired" : s === "soon";
}

/** A YYYY-MM-DD string if `v` starts with a real calendar date, else null. */
export function normalizeDate(v: string | null | undefined): string | null {
  const m = v ? /^(\d{4})-(\d{2})-(\d{2})/.exec(v) : null;
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3] ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

export type RenewalStatus = "Active" | "Expiring soon" | "Expired" | "Lifelong" | "No expiry date";
export const renewalStatus = (s: ExpiryState): RenewalStatus =>
  ({ lifelong: "Lifelong", unknown: "No expiry date", active: "Active", soon: "Expiring soon", expired: "Expired" } as const)[s];

/** The customer's next expiry: the soonest date still ahead, else the latest one already passed, else Lifelong. */
export function nextExpiry(vehicles: BillingVehicle[], today = todayInNairobi()): { date: string; past: boolean } | "lifelong" | null {
  const dates = vehicles.map((v) => (v.cardType === "Lifelong Card" ? null : v.expirationDate)).filter((d): d is string => !!d).sort();
  const ahead = dates.find((d) => d >= today);
  if (ahead) return { date: ahead, past: false };
  if (dates.length) return { date: dates[dates.length - 1], past: true };
  return vehicles.length > 0 && vehicles.every((v) => v.cardType === "Lifelong Card") ? "lifelong" : null;
}

/** "2026-10-27 13:05" (Nairobi time) → "4 h ago" / "12 min ago" / "3 days ago", relative to now. */
export function seenAgo(lastSeen: string, now = Date.now()): string {
  const [d, t = "00:00"] = lastSeen.split(" ");
  const at = Date.parse(`${d}T${t}:00+03:00`);
  if (Number.isNaN(at)) return "";
  const min = Math.max(0, Math.round((now - at) / 60_000));
  if (min < 2) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 48) return `${h} h ago`;
  const days = Math.round(h / 24);
  return `${days} days ago`;
}
