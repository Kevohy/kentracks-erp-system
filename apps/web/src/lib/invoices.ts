import { parseMoney } from "./purchase-validation";
import { cleanText, stripControlChars, validatePhone } from "./validation";

/** Documents → Invoices. Amounts are minor units (cents). */

export const VAT_RATE = 16;
export const MAX_LINES = 40;
export const INVOICE_STATUSES = ["Unpaid", "Paid"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

/**
 * How the customer can pay, printed on the invoice. One of the three is chosen (or none); each is copied into the invoice
 * when it is created, so the invoice keeps saying what it said on the day.
 */
export type PaymentOptions = {
  paybill: { business: string; account: string; accountName: string } | null;
  sendMoney: { phone: string; name: string } | null;
  bank: { accountName: string; accountNo: string; bankName: string; branch: string; bankCode: string; swift: string } | null;
};
export const NO_PAYMENT_OPTIONS: PaymentOptions = { paybill: null, sendMoney: null, bank: null };
/** The company's payment details, offered on a new invoice (each can be edited). The Paybill account is the customer's account number. */
export const DEFAULT_PAYBILL = { business: "4140445", accountName: "KENTRACKS TECHNOLOGIES LTD" };
export const DEFAULT_BANK = {
  accountName: "KENTRACKS TECHNOLOGIES LTD", accountNo: "1342643607", bankName: "KCB BANK", branch: "KERICHO BRANCH", bankCode: "01-106", swift: "KCBLKENX",
};
export const PAYMENT_OPTION_NAMES = { paybill: "M-Pesa Paybill", sendMoney: "Send Money", bank: "Bank" } as const;

/** The payment options as stored (jsonb): anything missing or malformed is left out. */
export function readPaymentOptions(raw: unknown): PaymentOptions {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const obj = (v: unknown, keys: string[]) => {
    if (!v || typeof v !== "object") return null;
    const r = v as Record<string, unknown>;
    return keys.every((k) => typeof r[k] === "string") ? Object.fromEntries(keys.map((k) => [k, r[k] as string])) : null;
  };
  return {
    paybill: obj(o.paybill, ["business", "account", "accountName"]) as PaymentOptions["paybill"],
    sendMoney: obj(o.sendMoney, ["phone", "name"]) as PaymentOptions["sendMoney"],
    bank: obj(o.bank, ["accountName", "accountNo", "bankName", "branch", "bankCode", "swift"]) as PaymentOptions["bank"],
  };
}

/** Checks the payment options (at most one). Error keys are "method", "paybill.business", "sendMoney.phone", "bank.accountNo" and so on. */
export function validatePaymentOptions(p: PaymentOptions): { value: PaymentOptions; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  // One payment method per invoice, so the customer is never shown two ways to pay.
  if ([p.paybill, p.sendMoney, p.bank].filter(Boolean).length > 1) errors.method = "Choose one payment method";
  const text = (key: string, raw: string, label: string, max: number, required = true) => {
    const v = cleanText(raw);
    if (!v && required) errors[key] = `Enter the ${label}`;
    else if (v.length > max) errors[key] = `Keep it under ${max} characters`;
    return v;
  };
  let paybill: PaymentOptions["paybill"] = null;
  if (p.paybill) {
    const business = cleanText(p.paybill.business).replace(/\s/g, "");
    if (!business) errors["paybill.business"] = "Enter the Paybill number";
    else if (!/^\d{5,8}$/.test(business)) errors["paybill.business"] = "A Paybill number has 5 to 8 digits";
    paybill = { business, account: text("paybill.account", p.paybill.account, "account number", 40), accountName: text("paybill.accountName", p.paybill.accountName, "account name", 80) };
  }
  let sendMoney: PaymentOptions["sendMoney"] = null;
  if (p.sendMoney) {
    const ph = validatePhone(p.sendMoney.phone);
    if (!cleanText(p.sendMoney.phone)) errors["sendMoney.phone"] = "Enter the M-Pesa number to send money to";
    else if (ph.error) errors["sendMoney.phone"] = "Enter a valid phone number, e.g. 0712345678";
    sendMoney = { phone: ph.error ? cleanText(p.sendMoney.phone) : ph.value, name: text("sendMoney.name", p.sendMoney.name, "name", 80, false) };
  }
  let bank: PaymentOptions["bank"] = null;
  if (p.bank) {
    const accountNo = cleanText(p.bank.accountNo);
    if (!accountNo) errors["bank.accountNo"] = "Enter the account number";
    else if (!/^[0-9A-Za-z -]{4,30}$/.test(accountNo)) errors["bank.accountNo"] = "Use 4 to 30 digits or letters";
    bank = {
      accountName: text("bank.accountName", p.bank.accountName, "account name", 80),
      accountNo,
      bankName: text("bank.bankName", p.bank.bankName, "bank name", 60),
      branch: text("bank.branch", p.bank.branch, "branch", 60, false),
      bankCode: text("bank.bankCode", p.bank.bankCode, "bank code", 20, false),
      swift: (() => {
        const v = cleanText(p.bank.swift).toUpperCase();
        if (v && !/^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(v)) errors["bank.swift"] = "A SWIFT code has 8 or 11 letters and digits";
        return v;
      })(),
    };
  }
  return { value: { paybill, sendMoney, bank }, errors };
}

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
  paymentOptions: PaymentOptions;
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
  paymentOptions: PaymentOptions;
  vat: boolean;
  lines: DraftLine[];
};
export type InvoiceErrors = Partial<Record<"customerId" | "brandId" | "title" | "invoiceDate" | "dueDate" | "paymentMethod" | "paymentDetails" | "lines", string>> & {
  line?: Record<string, { name?: string; quantity?: string; unitPrice?: string }>;
  /** Payment options, keyed "paybill.business", "bank.accountNo" and so on. */
  pay?: Record<string, string>;
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
  value: { title: string; invoiceDate: string; dueDate: string; paymentMethod: string; paymentDetails: string; paymentOptions: PaymentOptions; vat: boolean; lines: InvoiceLine[] };
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
  const pay = validatePaymentOptions(d.paymentOptions);
  if (Object.keys(pay.errors).length) errors.pay = pay.errors;
  // The method line lists the options chosen ("M-Pesa Paybill, Bank"); with none, whatever was typed.
  const chosen = (Object.keys(PAYMENT_OPTION_NAMES) as (keyof PaymentOptions)[]).filter((k) => pay.value[k]).map((k) => PAYMENT_OPTION_NAMES[k]);
  const paymentMethod = chosen.length ? chosen.join(", ") : cleanText(d.paymentMethod);
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
    value: { title, invoiceDate: d.invoiceDate, dueDate: d.dueDate, paymentMethod, paymentDetails, paymentOptions: pay.value, vat: d.vat, lines },
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
