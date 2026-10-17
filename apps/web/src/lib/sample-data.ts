/**
 * Static placeholder content used only to demonstrate the dashboard layout.
 * Nothing here is real data and nothing is fetched.
 */

export const sampleAsOf = "17 October 2026";

export const currentUser = {
  name: "Kelvin Kariuki",
  role: "Administrator",
  initials: "KK",
};

export type Kpi = {
  label: string;
  unit?: string;
  value: string;
  trend: "up" | "down";
  delta: string;
  note: string;
  icon: "revenue" | "customers" | "invoices" | "renewals";
};

export const kpis: Kpi[] = [
  { label: "Revenue (October)", unit: "KES", value: "2,845,000", trend: "up", delta: "12.4%", note: "vs September", icon: "revenue" },
  { label: "Active customers", value: "1,284", trend: "up", delta: "3.1%", note: "vs September", icon: "customers" },
  { label: "Outstanding invoices", unit: "KES", value: "612,400", trend: "down", delta: "5.8%", note: "vs September", icon: "invoices" },
  { label: "Renewals due", value: "47", trend: "up", delta: "9 more", note: "than last month", icon: "renewals" },
];

export const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct"];

/** KES millions per month. */
export const revenueThisYear = [1.07, 1.33, 1.24, 1.73, 1.64, 2.18, 2.04, 2.44, 2.36, 2.84];
export const revenueLastYear = [0.62, 0.71, 0.8, 0.89, 1.02, 1.11, 1.2, 1.29, 1.38, 1.51];

export const renewals = [
  { initials: "RV", name: "Rift Valley Haulage", when: "20 Oct · in 3 days", amount: "KES 48,000" },
  { initials: "LT", name: "Lakeview Transport", when: "22 Oct · in 5 days", amount: "KES 18,500" },
  { initials: "SL", name: "Savanna Logistics Ltd", when: "25 Oct · in 8 days", amount: "KES 72,000" },
  { initials: "KF", name: "Kilimani Fleet Services", when: "28 Oct · in 11 days", amount: "KES 31,200" },
  { initials: "MR", name: "Mombasa Road Couriers", when: "31 Oct · in 14 days", amount: "KES 12,600" },
];

export type InvoiceStatus = "Paid" | "Pending" | "Overdue";

export const invoices: Array<{
  id: string;
  customer: string;
  due: string;
  amount: string;
  status: InvoiceStatus;
}> = [
  { id: "INV-2043", customer: "Savanna Logistics Ltd", due: "30 Oct 2026", amount: "184,500", status: "Pending" },
  { id: "INV-2042", customer: "Rift Valley Haulage", due: "24 Oct 2026", amount: "312,000", status: "Pending" },
  { id: "INV-2041", customer: "Lakeview Transport", due: "12 Oct 2026", amount: "58,750", status: "Paid" },
  { id: "INV-2038", customer: "Kilimani Fleet Services", due: "08 Oct 2026", amount: "126,400", status: "Paid" },
  { id: "INV-2036", customer: "Mombasa Road Couriers", due: "05 Oct 2026", amount: "96,200", status: "Overdue" },
];

export const stock = [
  { name: "GPS trackers", units: 142, percent: 71, low: false },
  { name: "SIM cards", units: 86, percent: 43, low: false },
  { name: "Relay modules", units: 24, percent: 19, low: true },
  { name: "Installation cables", units: 310, percent: 88, low: false },
];
