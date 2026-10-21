import { parseMoney } from "./purchase-validation";
import { cleanText, stripControlChars } from "./validation";
import { formatKes } from "./purchases";

/**
 * Payments recorded after a sale for the part that was not paid at the time (Sales → sale → Record payment). Each one
 * adds to the sale's amount paid; together they can never be more than the sale total. The same rules run in the form
 * and on the server.
 */

export const PAYMENT_METHODS = ["Cash", "M-Pesa", "Bank transfer", "Cheque", "Card", "Other"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export const MAX_REFERENCE = 60;
export const MAX_PAYMENT_NOTE = 300;

export type SalePayment = {
  id: string;
  amountMinor: number;
  method: PaymentMethod;
  /** e.g. the M-Pesa or bank transaction code. */
  reference: string;
  note: string;
  /** YYYY-MM-DD: the day the money was received. */
  paidOn: string;
  /** Who recorded it (the signed-in user's name), when known. */
  recordedBy: string | null;
  createdAt: string;
};

export type SalePayments = {
  /** What was paid when the sale was made (the sale's amount paid before any recorded payment). */
  atSaleMinor: number;
  payments: SalePayment[];
  totalMinor: number;
  paidMinor: number;
  balanceMinor: number;
};

export type PaymentDraft = { amount: string; method: string; reference: string; note: string; paidOn: string };
export type PaymentErrors = Partial<Record<keyof PaymentDraft | "form", string>>;

/** Validates a payment against the sale's balance and dates (YYYY-MM-DD, Nairobi). */
export function validatePayment(
  d: PaymentDraft,
  ctx: { balanceMinor: number; saleDate: string; today: string },
): { errors: PaymentErrors; value?: { amountMinor: number; method: PaymentMethod; reference: string; note: string; paidOn: string } } {
  const errors: PaymentErrors = {};
  const amount = parseMoney(d.amount, "Amount", 1_000_000_000_00);
  let amountMinor = 0;
  if (amount.error) errors.amount = amount.error;
  else if (amount.value! <= 0) errors.amount = "Amount must be more than 0";
  else if (amount.value! > ctx.balanceMinor) errors.amount = `Amount cannot be more than the balance (${formatKes(ctx.balanceMinor)})`;
  else amountMinor = amount.value!;

  const method = (PAYMENT_METHODS as readonly string[]).includes(d.method) ? (d.method as PaymentMethod) : null;
  if (!method) errors.method = "Select how it was paid";

  const reference = cleanText(stripControlChars(d.reference));
  if (reference.length > MAX_REFERENCE) errors.reference = `Reference must be ${MAX_REFERENCE} characters or fewer`;
  const note = stripControlChars(d.note).trim();
  if (note.length > MAX_PAYMENT_NOTE) errors.note = `Note must be ${MAX_PAYMENT_NOTE} characters or fewer`;

  const paidOn = d.paidOn.trim();
  const real = /^\d{4}-\d{2}-\d{2}$/.test(paidOn) && !Number.isNaN(Date.parse(`${paidOn}T00:00:00Z`)) && new Date(`${paidOn}T00:00:00Z`).toISOString().slice(0, 10) === paidOn;
  if (!paidOn) errors.paidOn = "Enter the date it was paid";
  else if (!real) errors.paidOn = "Enter a valid date";
  else if (paidOn > ctx.today) errors.paidOn = "The date cannot be in the future";
  else if (paidOn < ctx.saleDate) errors.paidOn = "The date cannot be before the sale";

  if (Object.keys(errors).length) return { errors };
  return { errors, value: { amountMinor, method: method!, reference, note, paidOn } };
}
