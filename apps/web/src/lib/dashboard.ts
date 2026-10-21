/**
 * The main Dashboard. Every figure is worked out on the server from the company's own records
 * (src/server/erp/dashboard.ts). Amounts are in minor units (cents). Dates follow Nairobi time.
 */

export type DashboardMoney = {
  /** This month so far. */
  monthMinor: number;
  /** The same days of last month (1st up to today's day), so the comparison is fair early in a month. */
  previousMinor: number;
};

export type DashboardRenewal = {
  kind: "GPS licence" | "IoT SIM";
  saleId: string;
  customerId: string;
  customerName: string;
  vehiclePlate: string;
  imei: string;
  /** YYYY-MM-DD */
  expiryDate: string;
  /** Null when no renewal fee is set. */
  feeMinor: number | null;
};

export type DashboardSale = {
  id: string;
  type: "Package Sale" | "Hosting Sale" | "Retailer Sale";
  customerName: string;
  vehiclePlate: string;
  /** Sale date, YYYY-MM-DD in Nairobi. */
  date: string;
  totalMinor: number;
  paidMinor: number;
};

export type DashboardStockItem = {
  kind: "Product" | "SIM Card" | "Platform";
  id: string;
  name: string;
  /** Category (products), SIM type (SIM cards) or "Licences" (platforms). */
  detail: string;
  quantity: number;
};

export type DashboardSummary = {
  /** When the figures were worked out (ISO). */
  asOf: string;
  /** YYYY-MM-DD in Nairobi. */
  today: string;
  /** Sales revenue (old sales are records only and never count). */
  revenue: DashboardMoney;
  profit: DashboardMoney;
  customers: { total: number; newThisMonth: number; withVehicles: number };
  /** Unpaid balances of all sales (total − paid). */
  outstanding: { amountMinor: number; sales: number };
  /** Monthly revenue for this year and last year, January to December (index 0 = January). */
  revenueByMonth: { year: number; thisYear: number[]; lastYear: number[] };
  renewals: {
    windowDays: number;
    /** Due from today up to windowDays ahead, soonest first (at most RENEWALS_SHOWN). */
    upcoming: DashboardRenewal[];
    upcomingCount: number;
    upcomingFeesMinor: number;
    /** Already expired and not renewed. */
    overdueCount: number;
    overdueFeesMinor: number;
  };
  recentSales: DashboardSale[];
  /** Items in stock or bought before, lowest quantity first. */
  stock: DashboardStockItem[];
};

export const RENEWALS_SHOWN = 6;
export const RECENT_SALES_SHOWN = 5;
export const STOCK_SHOWN = 6;
/** At or below this many units an item is shown as low. */
export const LOW_STOCK_UNITS = 5;
export const DASHBOARD_REFRESH_SECONDS = 60;

export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

/** Percentage change, or null when there is nothing to compare with. */
export function change(now: number, before: number): number | null {
  if (before === 0) return null;
  return ((now - before) / Math.abs(before)) * 100;
}

/** 1234567 cents -> "12,346" (whole shillings). */
export function wholeKes(minor: number): string {
  const v = Math.round(minor / 100);
  return (v < 0 ? "-" : "") + Math.abs(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** Short axis label: 0, 950, 12K, 1.5M. */
export function shortKes(minor: number): string {
  const v = minor / 100;
  if (Math.abs(v) >= 1_000_000) return `${+(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `${+(v / 1_000).toFixed(v >= 100_000 ? 0 : 1)}K`;
  return `${Math.round(v)}`;
}

export type PaymentStatus = "Paid" | "Part paid" | "Unpaid";
export function salePayment(s: Pick<DashboardSale, "totalMinor" | "paidMinor">): PaymentStatus {
  if (s.paidMinor >= s.totalMinor) return "Paid";
  return s.paidMinor > 0 ? "Part paid" : "Unpaid";
}

/** Whole days from today to a YYYY-MM-DD date (negative when past). */
export function daysFrom(today: string, date: string): number {
  return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
}

export function dueLabel(today: string, date: string): string {
  const d = daysFrom(today, date);
  if (d === 0) return "today";
  if (d === 1) return "tomorrow";
  return d > 0 ? `in ${d} days` : `${-d} day${d === -1 ? "" : "s"} ago`;
}

/** "2026-10-21" -> "21 Oct 2026" */
export function shortDate(date: string, withYear = true): string {
  const [y, m, d] = date.slice(0, 10).split("-").map(Number);
  return `${d} ${MONTHS[m - 1]}${withYear ? ` ${y}` : ""}`;
}
