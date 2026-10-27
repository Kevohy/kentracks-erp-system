"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, CheckCircle2, Eye, FileText, Plus, Receipt, Search, ShoppingCart, Trash2 } from "lucide-react";
import { Card } from "@/components/dashboard/Card";
import { SearchableSelect } from "@/components/sales/SearchableSelect";
import { Field, SelectField, TextField } from "@/components/sales/fields";
import { PageHeader } from "@/components/shell/PageHeader";
import { todayInNairobi } from "@/lib/billing";
import type { Brand } from "@/lib/brands";
import { cn } from "@/lib/cn";
import { crmApi } from "@/lib/crm-api";
import type { Customer } from "@/lib/customers";
import { erpApi } from "@/lib/erp-api";
import {
  MAX_LINES, VAT_RATE, invDate, validateInvoice,
  type DraftLine, type Invoice, type InvoiceDraft, type InvoiceErrors, type InvoiceSale,
} from "@/lib/invoices";
import { formatKes } from "@/lib/purchases";
import { localPhone } from "@/lib/sms";
import { stripControlChars } from "@/lib/validation";
import type { InvoiceView } from "./InvoiceDocument";
import { InvoiceFrame } from "./InvoiceFrame";
import { InvoicePaymentFields, defaultPaymentForm, paymentFormFrom, paymentOptionsOf, type PaymentForm } from "./InvoicePaymentFields";

type Load<T> = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; items: T };

const phoneText = (p: string) => (p.startsWith("+254") ? localPhone(p) : p);
const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const money = (minor: number) => (minor / 100).toFixed(2).replace(/\.00$/, "");
let keySeq = 0;
const newKey = () => `l${++keySeq}`;
const blankLine = (kind: DraftLine["kind"]): DraftLine => ({ key: newKey(), kind, saleId: null, name: "", quantity: "1", unitPrice: "" });

function emptyDraft(): InvoiceDraft {
  const today = todayInNairobi();
  return { customerId: "", brandId: "", title: "", invoiceDate: today, dueDate: addDays(today, 7), paymentMethod: "", paymentDetails: "", paymentOptions: { paybill: null, sendMoney: null, bank: null }, vat: false, lines: [blankLine("item")] };
}

function Step({ n, title, done, children, aside }: { n: number; title: string; done?: boolean; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <Card className="flex flex-col gap-4 px-4 py-5 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2.5 text-[17px] font-semibold">
          <span className={cn("flex size-7 items-center justify-center rounded-full text-[13px] font-bold", done ? "bg-[#E6F4EA] text-[#1B5E20]" : "bg-brand/10 text-brand")}>
            {done ? <CheckCircle2 size={16} aria-hidden="true" /> : n}
          </span>
          {title}
        </h2>
        {aside}
      </div>
      {children}
    </Card>
  );
}

function DateField({ id, label, value, onChange, error }: { id: string; label: string; value: string; onChange: (v: string) => void; error?: string }) {
  return (
    <Field id={id} label={label} error={error}>
      <input id={id} data-field={id.replace(/^inv-/, "")} type="date" value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={!!error}
        className={cn("min-h-11 w-full rounded-xl border bg-white px-3 text-[15px] outline-none focus:border-navy", error ? "border-[#C62828]" : "border-line")} />
    </Field>
  );
}

const inputCls = (err?: string) => cn("min-h-11 w-full rounded-xl border bg-white px-3 text-[15px] outline-none focus:border-navy", err ? "border-[#C62828]" : "border-line");

/** One editable line: an item (name, qty, unit price) or an expense (name, amount). */
function LineRow({ line, total, error, onChange, onRemove, canRemove, index }: {
  line: DraftLine; total: number | null; error?: { name?: string; quantity?: string; unitPrice?: string };
  onChange: (patch: Partial<DraftLine>) => void; onRemove: () => void; canRemove: boolean; index: number;
}) {
  const item = line.kind === "item";
  const what = item ? "Item" : "Expense";
  return (
    <li className="grid grid-cols-2 gap-x-3 gap-y-2 rounded-xl border border-line p-3 sm:grid-cols-[minmax(0,1fr)_90px_140px_130px_44px] sm:items-start sm:border-0 sm:p-0">
      <div className="col-span-2 sm:col-span-1">
        <label htmlFor={`${line.key}-name`} className="mb-1 block text-[12.5px] font-semibold text-muted sm:sr-only">{what} {index + 1} name</label>
        <input id={`${line.key}-name`} data-line={line.key} value={line.name} onChange={(e) => onChange({ name: stripControlChars(e.target.value) })} aria-invalid={!!error?.name}
          placeholder={item ? "e.g. Vehicle GPS tracker" : "e.g. Transport"} className={inputCls(error?.name)} />
        {line.saleId && <span className="mt-1 inline-block rounded-full bg-tint px-2 py-0.5 text-[11.5px] font-semibold text-navy">From a sale</span>}
        {error?.name && <p className="mt-1 text-[12.5px] text-[#C62828]">{error.name}</p>}
      </div>
      {item ? (
        <div>
          <label htmlFor={`${line.key}-qty`} className="mb-1 block text-[12.5px] font-semibold text-muted sm:sr-only">Qty</label>
          <input id={`${line.key}-qty`} inputMode="decimal" value={line.quantity} onChange={(e) => onChange({ quantity: e.target.value.replace(/[^\d.]/g, "") })} aria-invalid={!!error?.quantity}
            className={cn(inputCls(error?.quantity), "text-right")} />
          {error?.quantity && <p className="mt-1 text-[12.5px] text-[#C62828]">{error.quantity}</p>}
        </div>
      ) : <div className="hidden sm:block" />}
      <div className={item ? "" : "col-span-1"}>
        <label htmlFor={`${line.key}-price`} className="mb-1 block text-[12.5px] font-semibold text-muted sm:sr-only">{item ? "Unit price (KES)" : "Amount (KES)"}</label>
        <input id={`${line.key}-price`} inputMode="decimal" value={line.unitPrice} onChange={(e) => onChange({ unitPrice: e.target.value.replace(/[^\d.,]/g, "") })} aria-invalid={!!error?.unitPrice}
          placeholder="0.00" className={cn(inputCls(error?.unitPrice), "text-right")} />
        {error?.unitPrice && <p className="mt-1 text-[12.5px] text-[#C62828]">{error.unitPrice}</p>}
      </div>
      <div className="flex min-h-11 items-center justify-end text-[15px] font-semibold sm:justify-end">
        <span className="mr-auto text-[12.5px] font-semibold text-muted sm:hidden">Total</span>
        {total === null ? "—" : formatKes(total)}
      </div>
      <div className="col-span-2 flex justify-end sm:col-span-1">
        <button type="button" onClick={onRemove} disabled={!canRemove} aria-label={`Remove ${what.toLowerCase()} ${index + 1}`}
          className="flex size-11 items-center justify-center rounded-xl text-muted hover:bg-[#FDECEA] hover:text-[#C62828] disabled:opacity-30 disabled:hover:bg-transparent">
          <Trash2 size={17} aria-hidden="true" />
        </button>
      </div>
    </li>
  );
}

/** New invoice: customer → brand → title and dates → lines (from sales or typed) → expenses → VAT → preview → create. */
function NewInvoice({ onCancel }: { onCancel: () => void }) {
  const router = useRouter();
  const [customers, setCustomers] = useState<Load<Customer[]>>({ status: "loading" });
  const [brands, setBrands] = useState<Brand[]>([]);
  const [sales, setSales] = useState<Load<InvoiceSale[]> | null>(null);
  const [form, setD] = useState<InvoiceDraft>(emptyDraft);
  const [pay, setPayState] = useState<PaymentForm>(() => defaultPaymentForm());
  // The draft as checked and sent: the payment options come from the payment section.
  const d = useMemo<InvoiceDraft>(() => ({ ...form, paymentOptions: paymentOptionsOf(pay) }), [form, pay]);
  const [errors, setErrors] = useState<InvoiceErrors>({});
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const saving = useRef(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void crmApi.customers.list().then((r) => setCustomers(r.ok ? { status: "ready", items: r.data } : { status: "error", message: r.message }));
    void crmApi.brands.list().then((r) => r.ok && setBrands(r.data));
  }, []);

  const customerList = customers.status === "ready" ? customers.items : [];
  const customer = customerList.find((c) => c.id === d.customerId) ?? null;
  const brand = brands.find((b) => b.id === d.brandId) ?? null;
  const saleList = sales?.status === "ready" ? sales.items : [];

  const touch = () => { setPreview(false); setFormError(""); };

  const setPay = (f: PaymentForm) => {
    setPayState(f);
    setErrors((e) => ({ ...e, pay: undefined }));
    touch();
  };

  /** The brand's last invoice says how customers pay; a brand without invoices yet gets the company's defaults. */
  function loadPaymentDefaults(brandId: string, account: string) {
    if (!brandId) return;
    void erpApi.invoices.paymentDefaults(brandId).then((r) => {
      if (!r.ok) return;
      const o = r.data.paymentOptions;
      const has = !!(o.paybill || o.sendMoney || o.bank);
      setPayState(has ? paymentFormFrom(o, account) : defaultPaymentForm(account));
      if (r.data.paymentDetails) setD((x) => (x.brandId === brandId && !x.paymentDetails ? { ...x, paymentDetails: r.data.paymentDetails } : x));
    });
  }

  function chooseCustomer(id: string) {
    const c = customerList.find((x) => x.id === id);
    // The brand comes from the customer; it can still be changed.
    const brandId = c?.brandId ?? "";
    setD((x) => ({ ...x, customerId: id, brandId, lines: x.lines.filter((l) => !l.saleId).length ? x.lines.filter((l) => !l.saleId) : [blankLine("item")] }));
    setErrors((e) => ({ ...e, customerId: undefined, brandId: undefined }));
    touch();
    // The Paybill account number is the customer's account.
    setPayState((f) => ({ ...f, paybill: { ...f.paybill, account: c?.account ?? "" } }));
    loadPaymentDefaults(brandId, c?.account ?? "");
    setSales(id ? { status: "loading" } : null);
    if (id) void erpApi.invoices.sales(id).then((r) => setSales(r.ok ? { status: "ready", items: r.data } : { status: "error", message: r.message }));
  }

  const set = <K extends keyof InvoiceDraft>(k: K, v: InvoiceDraft[K]) => {
    setD((x) => ({ ...x, [k]: typeof v === "string" ? stripControlChars(v) : v }));
    setErrors((e) => ({ ...e, [k]: undefined }));
    touch();
  };

  function patchLine(key: string, patch: Partial<DraftLine>) {
    setD((x) => ({ ...x, lines: x.lines.map((l) => (l.key === key ? { ...l, ...patch } : l)) }));
    setErrors((e) => {
      if (!e.line?.[key]) return e;
      const line = { ...e.line };
      delete line[key];
      return { ...e, line };
    });
    touch();
  }
  const removeLine = (key: string) => { setD((x) => ({ ...x, lines: x.lines.filter((l) => l.key !== key) })); touch(); };
  function addLine(kind: DraftLine["kind"]) {
    const l = blankLine(kind);
    setD((x) => ({ ...x, lines: [...x.lines, l] }));
    setErrors((e) => ({ ...e, lines: undefined }));
    touch();
    setTimeout(() => root.current?.querySelector<HTMLElement>(`#${l.key}-name`)?.focus(), 0);
  }

  function addSale(s: InvoiceSale) {
    setD((x) => {
      // An empty first line is replaced instead of left above the sale's lines.
      const kept = x.lines.filter((l) => l.saleId || l.name.trim() || l.unitPrice.trim());
      const added: DraftLine[] = s.lines.map((l) => ({ key: newKey(), kind: "item", saleId: s.saleId, name: l.name, quantity: String(l.quantity), unitPrice: money(l.unitPriceMinor) }));
      return { ...x, lines: [...kept, ...added].slice(0, MAX_LINES) };
    });
    setErrors((e) => ({ ...e, lines: undefined }));
    touch();
  }
  const removeSale = (saleId: string) => {
    setD((x) => {
      const rest = x.lines.filter((l) => l.saleId !== saleId);
      return { ...x, lines: rest.some((l) => l.kind === "item") ? rest : [...rest, blankLine("item")] };
    });
    touch();
  };

  const checked = useMemo(() => validateInvoice(d), [d]);
  const lineTotal = (l: DraftLine) => {
    const v = validateInvoice({ ...d, lines: [l] }).value.lines[0];
    return v ? v.totalMinor : null;
  };
  const items = d.lines.filter((l) => l.kind === "item");
  const expenses = d.lines.filter((l) => l.kind === "expense");
  const addedSales = new Set(d.lines.map((l) => l.saleId).filter(Boolean));

  function showPreview(e: FormEvent) {
    e.preventDefault();
    setErrors(checked.errors);
    const order = ["customerId", "brandId", "title", "invoiceDate", "dueDate", "paymentMethod", "paymentDetails"] as const;
    const first = order.find((k) => checked.errors[k]);
    if (first) return root.current?.querySelector<HTMLElement>(`[data-field="${first}"], #inv-${first}`)?.focus();
    const payKey = checked.errors.pay && Object.keys(checked.errors.pay)[0];
    if (payKey) return root.current?.querySelector<HTMLElement>(`#pay-${payKey.replace(".", "-")}`)?.focus();
    const badLine = d.lines.find((l) => checked.errors.line?.[l.key]);
    if (badLine) {
      const f = checked.errors.line![badLine.key];
      return root.current?.querySelector<HTMLElement>(`#${badLine.key}-${f.name ? "name" : f.quantity ? "qty" : "price"}`)?.focus();
    }
    if (checked.errors.lines) return root.current?.querySelector<HTMLElement>("#inv-lines")?.scrollIntoView({ behavior: "smooth", block: "center" });
    setPreview(true);
    setTimeout(() => root.current?.querySelector("#inv-preview")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  }

  async function create() {
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    setFormError("");
    const r = await erpApi.invoices.create({ ...d, lines: d.lines.map(({ kind, saleId, name, quantity, unitPrice }) => ({ kind, saleId, name, quantity, unitPrice })) });
    saving.current = false;
    setBusy(false);
    if (r.ok) return router.push(`/documents/invoices/${r.data.id}`);
    if (Object.keys(r.fieldErrors).length) {
      // The server numbers line errors by position; the form keys them by line.
      const fe = r.fieldErrors as InvoiceErrors;
      const line = fe.line ? Object.fromEntries(Object.entries(fe.line).map(([i, e]) => [d.lines[Number(i)]?.key ?? i, e])) : undefined;
      setErrors({ ...fe, line });
      setPreview(false);
    }
    setFormError(r.message);
  }

  const view: InvoiceView | null = preview && customer && brand ? {
    number: null, verifyCode: null, title: checked.value.title, invoiceDate: d.invoiceDate, dueDate: d.dueDate, status: "Unpaid",
    paymentMethod: checked.value.paymentMethod, paymentDetails: checked.value.paymentDetails, paymentOptions: checked.value.paymentOptions, vat: d.vat, vatRate: VAT_RATE, ...checked.totals,
    customerName: customer.name, customerPhone: customer.phone, customerEmail: customer.email, customerLocation: customer.location,
    brand: { name: brand.name, tagline: brand.tagline, phone: brand.phone, email: brand.email, website: brand.website, location: brand.location, directorName: brand.directorName, logoUrl: brand.logoUrl, iconUrl: brand.iconUrl, signatureUrl: brand.signatureUrl, color: brand.color },
    lines: checked.value.lines, createdAt: new Date().toISOString(),
  } : null;

  const t = checked.totals;

  return (
    <div ref={root} className="flex flex-col gap-4">
      <form onSubmit={showPreview} noValidate className="flex flex-col gap-4">
        <Step n={1} title="Customer and brand" done={!!customer && !!brand}>
          {customers.status === "loading" && <p className="text-[14px] text-muted">Loading customers…</p>}
          {customers.status === "error" && <p role="alert" className="text-[14px] text-[#C62828]">{customers.message}</p>}
          {customers.status === "ready" && (customerList.length === 0 ? (
            <p className="text-[14px] text-muted">No customers yet. Add one in <Link href="/crm/customers" className="font-semibold underline">Customers</Link> first.</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <SearchableSelect id="inv-customerId" name="customerId" label="Customer" value={d.customerId} onChange={chooseCustomer} error={errors.customerId}
                placeholder="Select a customer" searchPlaceholder="Search by name, account or phone"
                options={customerList.map((c) => ({ value: c.id, label: `${c.name} · ${c.account}` }))}
                filter={(o, q) => o.label.toLowerCase().includes(q) || (customerList.find((c) => c.id === o.value)?.phone ?? "").includes(q.replace(/\s/g, ""))} />
              <SelectField id="inv-brandId" name="brandId" label="Brand" value={d.brandId} onChange={(v) => { set("brandId", v); loadPaymentDefaults(v, customer?.account ?? ""); }} error={errors.brandId}
                options={brands.map((b) => ({ value: b.id, label: b.name }))} placeholder="Select a brand" />
            </div>
          ))}
          {customer && (
            <p className="text-[13px] text-muted">
              {[customer.phone && phoneText(customer.phone), customer.email, customer.location].filter(Boolean).join(" · ")}
              {customer.brandId && d.brandId === customer.brandId ? ` · Brand picked up from ${customer.name}'s details.` : !customer.brandId ? " · This customer has no brand yet: choose one." : ""}
            </p>
          )}
        </Step>

        {customer && (
          <>
            <Step n={2} title="Invoice details">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <TextField id="inv-title" label="Invoice title" value={d.title} onChange={(v) => set("title", v)} error={errors.title} placeholder="e.g. Vehicle tracking installation" className="sm:col-span-2 lg:col-span-1" />
                <DateField id="inv-invoiceDate" label="Invoice date" value={d.invoiceDate} onChange={(v) => set("invoiceDate", v)} error={errors.invoiceDate} />
                <DateField id="inv-dueDate" label="Due date" value={d.dueDate} onChange={(v) => set("dueDate", v)} error={errors.dueDate} />
              </div>
            </Step>

            <Step n={3} title="Payment" done={!!pay.method && !errors.pay}>
              <InvoicePaymentFields value={pay} onChange={setPay} errors={errors.pay} />
              <TextField id="inv-paymentDetails" label="Other payment instructions (optional)" value={d.paymentDetails} onChange={(v) => set("paymentDetails", v)} error={errors.paymentDetails}
                placeholder="e.g. Quote the invoice number when paying" />
            </Step>

            <Step n={4} title="Items" aside={<span className="text-[13px] text-muted">{items.length} item{items.length === 1 ? "" : "s"}</span>}>
              <div className="rounded-xl bg-canvas p-3 sm:p-4">
                <h3 className="flex items-center gap-2 text-[14.5px] font-semibold"><ShoppingCart size={16} aria-hidden="true" />Add from {customer.name}&apos;s sales</h3>
                {sales?.status === "loading" && <p className="mt-2 text-[14px] text-muted">Loading sales…</p>}
                {sales?.status === "error" && <p role="alert" className="mt-2 text-[14px] text-[#C62828]">{sales.message}</p>}
                {sales?.status === "ready" && saleList.length === 0 && <p className="mt-2 text-[14px] text-muted">No sales recorded for this customer. Type the items below.</p>}
                {saleList.length > 0 && (
                  <ul className="mt-2.5 flex max-h-72 flex-col gap-2 overflow-y-auto">
                    {saleList.map((s) => {
                      const added = addedSales.has(s.saleId);
                      return (
                        <li key={s.saleId} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-line bg-white px-3 py-2.5">
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[14.5px] font-semibold">{s.lines.map((l) => l.name).join(", ")}</span>
                            <span className="block text-[12.5px] text-muted">
                              {s.type} · {invDate(s.date)} · {formatKes(s.totalMinor)}
                              {s.invoiced > 0 && <span className="ml-1.5 rounded-full bg-[#FFF4E5] px-2 py-0.5 font-semibold text-[#9a3300]">On {s.invoiced} invoice{s.invoiced === 1 ? "" : "s"}</span>}
                            </span>
                          </span>
                          {added ? (
                            <button type="button" onClick={() => removeSale(s.saleId)} className="min-h-10 rounded-lg border border-line px-3 text-[13.5px] font-semibold hover:bg-canvas">Remove</button>
                          ) : (
                            <button type="button" onClick={() => addSale(s)} disabled={d.lines.length + s.lines.length > MAX_LINES}
                              className="inline-flex min-h-10 items-center gap-1 rounded-lg bg-navy px-3 text-[13.5px] font-semibold text-white hover:brightness-110 disabled:opacity-50">
                              <Plus size={15} aria-hidden="true" />Add
                            </button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
              <div id="inv-lines" tabIndex={-1}>
                <div className="mb-1.5 hidden grid-cols-[minmax(0,1fr)_90px_140px_130px_44px] gap-x-3 px-0.5 text-[12.5px] font-semibold text-muted sm:grid">
                  <span>Item name</span><span className="text-right">Qty</span><span className="text-right">Unit price (KES)</span><span className="text-right">Total</span><span />
                </div>
                <ul className="flex flex-col gap-2.5">
                  {items.map((l, i) => (
                    <LineRow key={l.key} line={l} index={i} total={lineTotal(l)} error={errors.line?.[l.key]} onChange={(p) => patchLine(l.key, p)} onRemove={() => removeLine(l.key)} canRemove={items.length > 1} />
                  ))}
                </ul>
                {errors.lines && <p role="alert" className="mt-2 text-[13.5px] text-[#C62828]">{errors.lines}</p>}
              </div>
              <div>
                <button type="button" onClick={() => addLine("item")} disabled={d.lines.length >= MAX_LINES}
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-dashed border-navy/40 px-4 text-[14.5px] font-semibold text-navy hover:bg-tint disabled:opacity-50">
                  <Plus size={16} aria-hidden="true" />Add item
                </button>
              </div>
            </Step>

            <Step n={5} title="Expenses (optional)" aside={<span className="text-[13px] text-muted">e.g. transport, installation</span>}>
              {expenses.length > 0 && (
                <div>
                  <div className="mb-1.5 hidden grid-cols-[minmax(0,1fr)_90px_140px_130px_44px] gap-x-3 px-0.5 text-[12.5px] font-semibold text-muted sm:grid">
                    <span>Expense</span><span /><span className="text-right">Amount (KES)</span><span className="text-right">Total</span><span />
                  </div>
                  <ul className="flex flex-col gap-2.5">
                    {expenses.map((l, i) => (
                      <LineRow key={l.key} line={l} index={i} total={lineTotal(l)} error={errors.line?.[l.key]} onChange={(p) => patchLine(l.key, p)} onRemove={() => removeLine(l.key)} canRemove />
                    ))}
                  </ul>
                </div>
              )}
              <div>
                <button type="button" onClick={() => addLine("expense")} disabled={d.lines.length >= MAX_LINES}
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-dashed border-navy/40 px-4 text-[14.5px] font-semibold text-navy hover:bg-tint disabled:opacity-50">
                  <Plus size={16} aria-hidden="true" />Add expense
                </button>
              </div>
            </Step>

            <Step n={6} title="VAT and totals">
              <label className="flex min-h-11 cursor-pointer items-center gap-3 self-start rounded-xl border border-line px-3.5">
                <input type="checkbox" checked={d.vat} onChange={(e) => set("vat", e.target.checked)} className="size-5 accent-[var(--color-brand)]" />
                <span className="text-[15px] font-semibold">Add VAT ({VAT_RATE}%)</span>
              </label>
              <dl className="ml-auto w-full max-w-sm text-[15px]">
                <div className="flex justify-between py-1.5"><dt className="text-muted">Items</dt><dd>{formatKes(t.itemsMinor)}</dd></div>
                {t.expensesMinor > 0 && <div className="flex justify-between py-1.5"><dt className="text-muted">Expenses</dt><dd>{formatKes(t.expensesMinor)}</dd></div>}
                {d.vat && <div className="flex justify-between py-1.5"><dt className="text-muted">VAT {VAT_RATE}%</dt><dd>{formatKes(t.vatMinor)}</dd></div>}
                <div className="mt-1 flex justify-between rounded-xl bg-brand px-3.5 py-2.5 font-bold text-white"><dt>Grand total</dt><dd>{formatKes(t.totalMinor)}</dd></div>
              </dl>
              <div className="flex flex-wrap justify-end gap-3">
                <button type="button" onClick={onCancel} className="min-h-11 rounded-xl border border-line px-4 text-[15px] font-semibold hover:bg-canvas">Cancel</button>
                <button type="submit" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-navy px-5 text-[15px] font-semibold text-white hover:brightness-110">
                  <Eye size={17} aria-hidden="true" />Preview
                </button>
              </div>
            </Step>
          </>
        )}
        {!customer && (
          <div className="flex justify-end">
            <button type="button" onClick={onCancel} className="min-h-11 rounded-xl border border-line px-4 text-[15px] font-semibold hover:bg-canvas">Cancel</button>
          </div>
        )}
      </form>

      {view && (
        <section id="inv-preview" aria-label="Preview" className="flex flex-col gap-4 rounded-2xl bg-[#e9eef3] p-3 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-[18px] font-semibold">Preview</h2>
              <p className="text-[13.5px] text-muted">Check the invoice. Creating it gives it its number and saves it.</p>
            </div>
            <div className="flex flex-wrap gap-2.5">
              <button type="button" onClick={() => setPreview(false)} className="min-h-11 rounded-xl border border-line bg-white px-4 text-[15px] font-semibold hover:bg-canvas">Edit invoice</button>
              <button type="button" onClick={() => void create()} disabled={busy}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-brand px-5 text-[15px] font-semibold text-white hover:brightness-95 disabled:opacity-60">
                <Receipt size={17} aria-hidden="true" />{busy ? "Creating…" : "Create invoice"}
              </button>
            </div>
          </div>
          {formError && <p role="alert" className="text-[14px] text-[#C62828]">{formError}</p>}
          <InvoiceFrame inv={view} />
        </section>
      )}
      {!view && formError && <p role="alert" className="text-[14px] text-[#C62828]">{formError}</p>}
    </div>
  );
}

/** Documents → Invoices: every invoice created, and the form for a new one. */
export function InvoicesView() {
  const [creating, setCreating] = useState(false);
  const [list, setList] = useState<Load<Invoice[]>>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"" | "Unpaid" | "Paid">("");
  useEffect(() => {
    let cancelled = false;
    void erpApi.invoices.list().then((r) => {
      if (!cancelled) setList(r.ok ? { status: "ready", items: r.data } : { status: "error", message: r.message });
    });
    return () => { cancelled = true; };
  }, [attempt]);
  const load = () => { setList({ status: "loading" }); setAttempt((n) => n + 1); };

  const items = list.status === "ready" ? list.items : [];
  const query = q.trim().toLowerCase();
  const shown = items.filter((i) => (!status || i.status === status)
    && (!query || [i.number, i.verifyCode, i.customerName, i.title, i.brand.name, i.customerPhone].some((x) => x.toLowerCase().includes(query))));
  const unpaid = items.filter((i) => i.status === "Unpaid");
  const today = todayInNairobi();

  if (creating) {
    return (
      <>
        <PageHeader title="New invoice" subtitle="Bill a customer for sales, items and expenses." aside={
          <button type="button" onClick={() => setCreating(false)} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-[15px] font-semibold text-navy hover:bg-white">
            <ArrowLeft size={17} aria-hidden="true" />All invoices
          </button>
        } />
        <NewInvoice onCancel={() => setCreating(false)} />
      </>
    );
  }

  return (
    <>
      <PageHeader title="Invoices" subtitle="Invoices sent to customers, with their payment status." aside={
        <button type="button" onClick={() => setCreating(true)} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-brand px-5 text-[15px] font-semibold text-white hover:brightness-95">
          <Plus size={18} aria-hidden="true" />New invoice
        </button>
      } />
      {list.status === "ready" && items.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
          <Card className="px-3 py-3 sm:px-4 sm:py-3.5"><p className="text-[12.5px] text-muted sm:text-[13px]">Invoices</p><p className="text-[16px] font-semibold sm:text-[22px]">{items.length}</p></Card>
          <Card className="px-3 py-3 sm:px-4 sm:py-3.5"><p className="text-[12.5px] text-muted sm:text-[13px]">Overdue</p><p className="text-[16px] font-semibold sm:text-[22px]">{unpaid.filter((i) => i.dueDate < today).length}</p></Card>
          <Card className="col-span-2 px-3 py-3 sm:col-span-1 sm:px-4 sm:py-3.5"><p className="text-[12.5px] text-muted sm:text-[13px]">Unpaid</p><p className="text-[16px] font-semibold sm:text-[22px] text-brand">{formatKes(unpaid.reduce((s, i) => s + i.totalMinor, 0))}</p></Card>
        </div>
      )}
      <Card className="overflow-hidden">
        <div className="flex flex-wrap gap-3 border-b border-line px-4 py-3 sm:px-6">
          <label className="relative block min-w-0 flex-1 basis-64">
            <span className="sr-only">Search invoices</span>
            <Search size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search number, customer, title…"
              className="min-h-11 w-full rounded-xl border border-line bg-white pl-9 pr-3 text-[15px] outline-none focus:border-navy" />
          </label>
          <div role="group" aria-label="Status" className="flex rounded-xl border border-line p-1">
            {(["", "Unpaid", "Paid"] as const).map((s) => (
              <button key={s || "all"} type="button" aria-pressed={status === s} onClick={() => setStatus(s)}
                className={cn("min-h-9 rounded-lg px-3 text-[14px] font-semibold", status === s ? "bg-navy text-white" : "text-muted hover:bg-canvas")}>{s || "All"}</button>
            ))}
          </div>
        </div>
        {list.status === "loading" && <p className="px-6 py-8 text-center text-[14px] text-muted">Loading…</p>}
        {list.status === "error" && (
          <p role="alert" className="px-6 py-8 text-center text-[14px] text-[#C62828]">{list.message} <button type="button" onClick={load} className="font-semibold underline">Try again</button></p>
        )}
        {list.status === "ready" && shown.length === 0 && (
          <div className="px-6 py-10 text-center">
            <FileText size={28} className="mx-auto text-muted" aria-hidden="true" />
            <p className="mt-2 text-[15px] font-semibold">{items.length === 0 ? "No invoices yet" : "No invoice matches"}</p>
            {items.length === 0 && <p className="text-[14px] text-muted">Click New invoice to create the first one.</p>}
          </div>
        )}
        {shown.length > 0 && (
          <ul className="divide-y divide-line">
            {shown.map((i) => {
              const overdue = i.status === "Unpaid" && i.dueDate < today;
              return (
                <li key={i.id}>
                  <Link href={`/documents/invoices/${i.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-canvas sm:px-6">
                    <span className="font-mono text-[14px] font-bold text-navy">{i.number}<span className="block text-[11.5px] font-medium text-muted">{i.brand.name}</span></span>
                    <span className="order-last min-w-0 basis-full sm:order-none sm:basis-0 sm:flex-1">
                      <span className="block truncate font-semibold">{i.customerName}</span>
                      <span className="block truncate text-[13px] text-muted">{i.title} · {invDate(i.invoiceDate)} · due {invDate(i.dueDate)}</span>
                    </span>
                    <span className="ml-auto flex items-center gap-3 text-right">
                      <span className="text-[15px] font-semibold">{formatKes(i.totalMinor)}</span>
                      <span className={cn("rounded-full px-2.5 py-0.5 text-[12px] font-bold",
                        i.status === "Paid" ? "bg-[#E6F4EA] text-[#1B5E20]" : overdue ? "bg-[#C62828] text-white" : "bg-[#FDECEA] text-[#C62828]")}>
                        {i.status === "Paid" ? "Paid" : overdue ? "Overdue" : "Unpaid"}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}
