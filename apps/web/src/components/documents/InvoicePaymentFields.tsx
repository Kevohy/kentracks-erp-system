"use client";

import { Building2, ChevronDown, Smartphone, Wallet, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { DEFAULT_BANK, DEFAULT_PAYBILL, type PaymentOptions } from "@/lib/invoices";
import { localPhone } from "@/lib/sms";

export type PaymentMethodKey = keyof PaymentOptions;

/**
 * The payment section as typed. One method is printed on the invoice; the others keep what was typed, so switching
 * back restores it.
 */
export type PaymentForm = {
  method: PaymentMethodKey | "";
  paybill: { business: string; account: string; accountName: string };
  sendMoney: { phone: string; name: string };
  bank: { accountName: string; accountNo: string; bankName: string; branch: string; bankCode: string; swift: string };
};

const METHODS: { key: PaymentMethodKey; label: string; hint: string; icon: LucideIcon }[] = [
  { key: "paybill", label: "M-Pesa Paybill", hint: "Pay to a business number with the customer's account", icon: Wallet },
  { key: "sendMoney", label: "M-Pesa Send Money", hint: "Send money to a phone number", icon: Smartphone },
  { key: "bank", label: "Bank transfer", hint: "Deposit or transfer to a bank account", icon: Building2 },
];

/** A new invoice offers the Paybill, with the customer's account number. */
export function defaultPaymentForm(account = ""): PaymentForm {
  return { method: "paybill", paybill: { ...DEFAULT_PAYBILL, account }, sendMoney: { phone: "", name: "" }, bank: { ...DEFAULT_BANK } };
}

/** The form from a saved invoice's payment details (its method chosen, the others at the defaults). */
export function paymentFormFrom(o: PaymentOptions, account: string): PaymentForm {
  const base = defaultPaymentForm(account);
  const method: PaymentForm["method"] = o.paybill ? "paybill" : o.sendMoney ? "sendMoney" : o.bank ? "bank" : "paybill";
  return {
    method,
    // The Paybill account number is the customer's, so it is never carried over from another customer's invoice.
    paybill: o.paybill ? { ...o.paybill, account } : base.paybill,
    sendMoney: o.sendMoney ? { ...o.sendMoney, phone: o.sendMoney.phone.startsWith("+254") ? localPhone(o.sendMoney.phone).replace(/\s/g, "") : o.sendMoney.phone } : base.sendMoney,
    bank: o.bank ?? base.bank,
  };
}

/** Only the chosen method is sent and printed. */
export function paymentOptionsOf(f: PaymentForm): PaymentOptions {
  return { paybill: f.method === "paybill" ? f.paybill : null, sendMoney: f.method === "sendMoney" ? f.sendMoney : null, bank: f.method === "bank" ? f.bank : null };
}

function Input({ id, label, value, onChange, error, placeholder, mono, inputMode, optional }: {
  id: string; label: string; value: string; onChange: (v: string) => void; error?: string; placeholder?: string; mono?: boolean;
  inputMode?: "numeric" | "tel"; optional?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className="text-[13px] font-medium">{label}{optional && <span className="font-normal text-muted"> (optional)</span>}</label>
      <input id={id} data-field={id} type="text" autoComplete="off" spellCheck={false} inputMode={inputMode} placeholder={placeholder} value={value}
        onChange={(e) => onChange(e.target.value)} aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-err` : undefined}
        className={cn("min-h-11 w-full rounded-xl border bg-white px-3 text-[15px] outline-none focus:border-navy focus:ring-2 focus:ring-navy/15", mono && "font-mono text-[14px]", error ? "border-[#C62828]" : "border-line")} />
      {error && <p id={`${id}-err`} className="text-[13px] text-[#C62828]">{error}</p>}
    </div>
  );
}

/** Invoice payment: one method chosen from a dropdown, then its details. Only the chosen method is printed on the invoice. */
export function InvoicePaymentFields({ value, onChange, errors = {} }: { value: PaymentForm; onChange: (f: PaymentForm) => void; errors?: Record<string, string> }) {
  const set = <S extends PaymentMethodKey>(s: S, patch: Partial<PaymentForm[S]>) => onChange({ ...value, [s]: { ...value[s], ...patch } });
  const chosen = METHODS.find((m) => m.key === value.method);
  const Icon = chosen?.icon ?? Wallet;
  const p = value.paybill, m = value.sendMoney, b = value.bank;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="pay-method" className="text-[14px] font-medium">Payment method</label>
        <div className="relative sm:max-w-md">
          <span className={cn("pointer-events-none absolute left-2 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-lg", chosen ? "bg-tint text-navy" : "bg-canvas text-muted")} aria-hidden="true">
            <Icon size={17} />
          </span>
          <select id="pay-method" data-field="pay-method" value={value.method} onChange={(e) => onChange({ ...value, method: e.target.value as PaymentForm["method"] })}
            className="min-h-12 w-full appearance-none rounded-xl border border-line bg-white pl-12 pr-10 text-[15.5px] font-semibold outline-none focus:border-navy focus:ring-2 focus:ring-navy/15">
            {METHODS.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
            <option value="">No payment details</option>
          </select>
          <ChevronDown size={18} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
        </div>
        <p className="text-[13px] text-muted">{chosen ? `${chosen.hint}. Only this method is printed on the invoice.` : "The invoice shows only the amount and any instructions below."}</p>
      </div>

      {value.method && (
        <div className="grid gap-3 rounded-xl border border-line bg-canvas/50 p-3.5 sm:grid-cols-2 lg:grid-cols-3">
          {value.method === "paybill" && (
            <>
              <Input id="pay-paybill-business" label="Paybill number" value={p.business} onChange={(v) => set("paybill", { business: v.replace(/[^\d]/g, "") })} error={errors["paybill.business"]} inputMode="numeric" mono />
              <Input id="pay-paybill-account" label="Account number" value={p.account} onChange={(v) => set("paybill", { account: v })} error={errors["paybill.account"]} placeholder="Customer account" mono />
              <Input id="pay-paybill-accountName" label="Account name" value={p.accountName} onChange={(v) => set("paybill", { accountName: v })} error={errors["paybill.accountName"]} />
            </>
          )}
          {value.method === "sendMoney" && (
            <>
              <Input id="pay-sendMoney-phone" label="M-Pesa number" value={m.phone} onChange={(v) => set("sendMoney", { phone: v.replace(/[^\d+\s]/g, "") })} error={errors["sendMoney.phone"]} placeholder="0712345678" inputMode="tel" mono />
              <Input id="pay-sendMoney-name" label="Registered name" value={m.name} onChange={(v) => set("sendMoney", { name: v })} error={errors["sendMoney.name"]} placeholder="Name shown on M-Pesa" optional />
            </>
          )}
          {value.method === "bank" && (
            <>
              <Input id="pay-bank-accountName" label="Account name" value={b.accountName} onChange={(v) => set("bank", { accountName: v })} error={errors["bank.accountName"]} />
              <Input id="pay-bank-accountNo" label="Account number" value={b.accountNo} onChange={(v) => set("bank", { accountNo: v })} error={errors["bank.accountNo"]} mono />
              <Input id="pay-bank-bankName" label="Bank name" value={b.bankName} onChange={(v) => set("bank", { bankName: v })} error={errors["bank.bankName"]} />
              <Input id="pay-bank-branch" label="Branch name" value={b.branch} onChange={(v) => set("bank", { branch: v })} error={errors["bank.branch"]} optional />
              <Input id="pay-bank-bankCode" label="Bank code" value={b.bankCode} onChange={(v) => set("bank", { bankCode: v })} error={errors["bank.bankCode"]} mono optional />
              <Input id="pay-bank-swift" label="SWIFT code" value={b.swift} onChange={(v) => set("bank", { swift: v.toUpperCase() })} error={errors["bank.swift"]} mono optional />
            </>
          )}
        </div>
      )}
    </div>
  );
}
