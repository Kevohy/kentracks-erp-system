import { parseMoney } from "./purchase-validation";
import { cleanText, stripControlChars } from "./validation";

/** Documents → Invoices. Amounts are minor units (cents). */

export const VAT_RATE = 16;
export const MAX_LINES = 40;
export const INVOICE_STATUSES = ["Unpaid", "Paid"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];
export const PAYMENT_METHODS = ["Paybill", "Till number", "Bank transfer", "Cash", "Cheque"] as const;

export type InvoiceLineKind = "item" | "expense";
export type InvoiceLine = { kind: InvoiceLineKind; saleId: string | null; name: string; quantity: number; unitPriceMinor: number; totalMinor: number };

export type Invoice = {
  id: string;
  number: string;
  verifyCode: string;
  customerId: string;
  brandId: string;
  title: string;
  invoiceDate: string;
  dueDate: string;
  status: InvoiceStatus;
  paymentMethod: string;
  paymentDetails: string;
  vat: boolean;
  vatRate: number;
  itemsMinor: number;
  expensesMinor: number;
  vatMinor: number;
  totalMinor: number;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  customerLocation: string;
  brand: {
    name: string; tagline: string; phone: string; email: string; website: string; location: string; directorName: string;
    logoUrl: string | null; iconUrl: string | null; signatureUrl: string | null; color: string;
  };
  lines: InvoiceLine[];
  createdAt: string;
  createdByName: string | null;
  paidAt: string | null;
};

/** One of the customer's sales, offered as invoice lines. */
export type InvoiceSale = {
  saleId: string;
  type: string;
  date: string;
  totalMinor: number;
  /** The lines this sale adds to an invoice (a retailer sale: one per product; otherwise one). */
  lines: { name: string; quantity: number; unitPriceMinor: number }[];
  /** Invoices that already include this sale. */
  invoiced: number;
};

/** The form, as typed (text), before checking. */
export type DraftLine = { key: string; kind: InvoiceLineKind; saleId: string | null; name: string; quantity: string; unitPrice: string };
export type InvoiceDraft = {
  customerId: string;
  brandId: string;
  title: string;
  invoiceDate: string;
  dueDate: string;
  paymentMethod: string;
  paymentDetails: string;
  vat: boolean;
  lines: DraftLine[];
};
export type InvoiceErrors = Partial<Record<"customerId" | "brandId" | "title" | "invoiceDate" | "dueDate" | "paymentMethod" | "paymentDetails" | "lines", string>> & {
  line?: Record<string, { name?: string; quantity?: string; unitPrice?: string }>;
};

const MAX_UNIT_MINOR = 100_000_000_00; // KES 100 million
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A quantity: more than 0, up to 2 decimals (e.g. 1, 2.5). */
export function parseQty(raw: string): { value?: number; error?: string } {
  const s = stripControlChars(raw).trim();
  if (!s) return { error: "Enter the quantity" };
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(s)) return { error: "A number, e.g. 1 or 2.5" };
  const v = Number(s);
  return v > 0 ? { value: v } : { error: "Must be more than 0" };
}

const lineTotal = (qty: number, unitMinor: number) => Math.round(qty * unitMinor);

function validDate(s: string) {
  if (!DATE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** Checks the form and works out every line and the totals. The same rules run in the browser and on the server. */
export function validateInvoice(d: InvoiceDraft): {
  errors: InvoiceErrors;
  value: { title: string; invoiceDate: string; dueDate: string; paymentMethod: string; paymentDetails: string; vat: boolean; lines: InvoiceLine[] };
  totals: { itemsMinor: number; expensesMinor: number; vatMinor: number; totalMinor: number };
} {
  const errors: InvoiceErrors = {};
  if (!d.customerId) errors.customerId = "Select a customer";
  if (!d.brandId) errors.brandId = "Select a brand";
  const title = cleanText(d.title);
  if (!title) errors.title = "Enter the invoice title, e.g. Vehicle tracking installation";
  else if (title.length > 120) errors.title = "Keep the title under 120 characters";
  if (!validDate(d.invoiceDate)) errors.invoiceDate = "Choose the invoice date";
  if (!validDate(d.dueDate)) errors.dueDate = "Choose the due date";
  else if (validDate(d.invoiceDate) && d.dueDate < d.invoiceDate) errors.dueDate = "The due date cannot be before the invoice date";
  const paymentMethod = cleanText(d.paymentMethod);
  if (paymentMethod.length > 40) errors.paymentMethod = "Keep it under 40 characters";
  const paymentDetails = cleanText(d.paymentDetails);
  if (paymentDetails.length > 200) errors.paymentDetails = "Keep it under 200 characters";

  const lines: InvoiceLine[] = [];
  const lineErrors: NonNullable<InvoiceErrors["line"]> = {};
  if (d.lines.length > MAX_LINES) errors.lines = `An invoice can have up to ${MAX_LINES} lines`;
  for (const l of d.lines) {
    const e: { name?: string; quantity?: string; unitPrice?: string } = {};
    const name = cleanText(l.name);
    if (!name) e.name = l.kind === "expense" ? "Name the expense" : "Enter the item name";
    else if (name.length > 160) e.name = "Keep it under 160 characters";
    const q = l.kind === "expense" ? { value: 1 } : parseQty(l.quantity);
    if (q.error) e.quantity = q.error;
    const p = parseMoney(l.unitPrice, l.kind === "expense" ? "Amount" : "Unit price", MAX_UNIT_MINOR);
    if (p.error) e.unitPrice = p.error;
    if (Object.keys(e).length) lineErrors[l.key] = e;
    else lines.push({ kind: l.kind, saleId: l.saleId, name, quantity: q.value!, unitPriceMinor: p.value!, totalMinor: lineTotal(q.value!, p.value!) });
  }
  if (Object.keys(lineErrors).length) errors.line = lineErrors;
  if (!d.lines.some((l) => l.kind === "item")) errors.lines = errors.lines ?? "Add at least one item";

  const itemsMinor = lines.filter((l) => l.kind === "item").reduce((s, l) => s + l.totalMinor, 0);
  const expensesMinor = lines.filter((l) => l.kind === "expense").reduce((s, l) => s + l.totalMinor, 0);
  const vatMinor = d.vat ? Math.round(((itemsMinor + expensesMinor) * VAT_RATE) / 100) : 0;
  return {
    errors,
    value: { title, invoiceDate: d.invoiceDate, dueDate: d.dueDate, paymentMethod, paymentDetails, vat: d.vat, lines },
    totals: { itemsMinor, expensesMinor, vatMinor, totalMinor: itemsMinor + expensesMinor + vatMinor },
  };
}

/** "INV-2026-000013" + "RoseBooker & Sons" → "INV-2026-000013 - RoseBooker Sons.pdf" (safe on every system). */
export function invoiceFileName(number: string, customer: string): string {
  const who = customer.replace(/[^A-Za-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
  return `${number}${who ? ` - ${who}` : ""}.pdf`;
}

/** "2026-10-22" → "22 Oct 2026". */
export const invDate = (iso: string) =>
  new Date(iso.length > 10 ? iso : `${iso}T12:00:00Z`).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: iso.length > 10 ? "Africa/Nairobi" : "UTC" });
