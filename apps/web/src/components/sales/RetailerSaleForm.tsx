"use client";

import { useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { CheckCircle2, Plus, Trash2, TriangleAlert } from "lucide-react";
import { Card } from "@/components/dashboard/Card";
import { useInventory } from "@/components/inventory/InventoryProvider";
import { cn } from "@/lib/cn";
import { sampleCustomers } from "@/lib/customers";
import { customerMatches, customerOptions } from "@/lib/customer-search";
import { parseMoney } from "@/lib/purchase-validation";
import {
  MAX_LINES,
  emptyCardLine,
  emptyProductLine,
  liveTotals,
  sanitizeNumberInput,
  validateRetailerSale,
  type CardLineDraft,
  type ProductLineDraft,
  type RetailerDraft,
  type RetailerErrors,
} from "@/lib/retailer-validation";
import { CARD_TYPES, type RetailerSale } from "@/lib/sales";
import { formatKes, formatSigned, paymentState } from "@/lib/sales-format";
import { Detail, Field, FormSection, ReadOnlyField, SelectField, TextField } from "./fields";
import { SearchableSelect } from "./SearchableSelect";
import { useSales } from "./SalesProvider";

const statusStyle = { "Paid in full": "bg-[#E6F4EA] text-[#1B5E20]", "Partly paid": "bg-[#FFF4E5] text-[#9a3300]", Unpaid: "bg-[#FDECEA] text-[#B71C1C]" } as const;
const iconButton = "grid size-11 shrink-0 place-items-center rounded-xl border border-line text-muted hover:bg-canvas";
const addButton = "inline-flex min-h-11 items-center gap-2 rounded-xl border border-line px-4 text-[15px] font-semibold hover:bg-canvas disabled:opacity-50";

const initialDraft = (): RetailerDraft => ({ customerId: "", productLines: [emptyProductLine("p0")], cardLines: [], paid: "0" });

export function RetailerSaleForm() {
  const { categories, products, platforms, stockOf } = useInventory();
  const { addSale } = useSales();

  const [draft, setDraft] = useState<RetailerDraft>(initialDraft);
  const [errors, setErrors] = useState<RetailerErrors>({});
  const [saved, setSaved] = useState<RetailerSale | null>(null);
  const rootRef = useRef<HTMLFormElement>(null);
  const seq = useRef(0);
  const submitted = useRef(false);
  const saleKey = useRef<string | null>(null);

  const ctx = { customers: sampleCustomers, categories, products, platforms, stockOf };

  const clear = (...keys: string[]) =>
    setErrors((p) => (keys.some((k) => p[k]) ? Object.fromEntries(Object.entries(p).filter(([k]) => !keys.includes(k))) : p));

  // ------------------------------------------------------------ draft edits

  const patchProduct = (key: string, patch: Partial<ProductLineDraft>, ...clearFields: string[]) => {
    setDraft((d) => ({ ...d, productLines: d.productLines.map((l) => (l.key === key ? { ...l, ...patch } : l)) }));
    clear("items", "paid", ...clearFields.map((f) => `p-${key}-${f}`));
  };
  const patchCard = (key: string, patch: Partial<CardLineDraft>, ...clearFields: string[]) => {
    setDraft((d) => ({ ...d, cardLines: d.cardLines.map((l) => (l.key === key ? { ...l, ...patch } : l)) }));
    clear("items", "paid", ...clearFields.map((f) => `c-${key}-${f}`));
  };
  const addProduct = () =>
    setDraft((d) => (d.productLines.length >= MAX_LINES ? d : { ...d, productLines: [...d.productLines, emptyProductLine(`p${++seq.current}`)] }));
  const addCard = () =>
    setDraft((d) => (d.cardLines.length >= MAX_LINES ? d : { ...d, cardLines: [...d.cardLines, emptyCardLine(`c${++seq.current}`)] }));
  const removeProduct = (key: string) => {
    setDraft((d) => ({ ...d, productLines: d.productLines.filter((l) => l.key !== key) }));
    setErrors((p) => Object.fromEntries(Object.entries(p).filter(([k]) => !k.startsWith(`p-${key}-`))));
    clear("paid");
  };
  const removeCard = (key: string) => {
    setDraft((d) => ({ ...d, cardLines: d.cardLines.filter((l) => l.key !== key) }));
    setErrors((p) => Object.fromEntries(Object.entries(p).filter(([k]) => !k.startsWith(`c-${key}-`))));
    clear("paid");
  };

  function submit(e: FormEvent) {
    e.preventDefault();
    if (submitted.current) return; // already saved: a second click or Enter must not add another sale
    const { errors: found, result } = validateRetailerSale(draft, ctx);
    setErrors(found);
    if (!result) {
      const els = Array.from(rootRef.current?.querySelectorAll<HTMLElement>("[data-field]") ?? []);
      els.find((el) => found[el.dataset.field ?? ""])?.focus();
      return;
    }
    submitted.current = true;
    saleKey.current ??= `sale-${Date.now().toString(36)}-${++seq.current}`;
    const sale: RetailerSale = { ...result, id: saleKey.current };
    addSale(sale);
    setSaved(sale);
  }

  function startNew() {
    submitted.current = false;
    saleKey.current = null;
    setDraft(initialDraft());
    setErrors({});
    setSaved(null);
  }

  // ------------------------------------------------------------ derived values

  const live = liveTotals(draft, ctx);
  const paidMinor = parseMoney(draft.paid, "Amount paid", Number.MAX_SAFE_INTEGER).value;
  const payable = live.hasLines && paidMinor !== undefined && paidMinor <= live.totalMinor;
  const balance = payable ? live.totalMinor - paidMinor : undefined;
  const state = payable ? paymentState({ totalMinor: live.totalMinor, paidMinor }) : undefined;
  const customer = sampleCustomers.find((c) => c.id === draft.customerId);

  // ------------------------------------------------------------ confirmation

  if (saved) {
    const st = paymentState(saved);
    return (
      <Card className="flex flex-col gap-4 px-5 py-6 sm:px-6">
        <div role="status" className="flex items-start gap-3">
          <CheckCircle2 size={26} className="mt-0.5 shrink-0 text-[#1B5E20]" aria-hidden="true" />
          <div>
            <h2 className="text-lg font-semibold">Sale completed</h2>
            <p className="text-[14.5px] text-muted">Saved to the Sales list for this session. Nothing is stored permanently.</p>
          </div>
        </div>
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
          <Detail label="Customer" value={saved.customerName} />
          <Detail label="Product lines" value={String(saved.productLines.length)} />
          <Detail label="Platform card lines" value={String(saved.cardLines.length)} />
          <Detail label="Total selling amount" value={formatKes(saved.totalMinor)} />
          <Detail label="Total cost" value={formatKes(saved.costMinor) + (saved.costMissing.length ? " (incomplete)" : "")} />
          <Detail label="Profit" value={formatSigned(saved.profitMinor) + (saved.costMissing.length ? " (incomplete)" : "")} />
          <Detail label="Amount paid" value={formatKes(saved.paidMinor)} />
          <Detail label="Outstanding balance" value={formatKes(saved.totalMinor - saved.paidMinor)} />
          <Detail label="Payment status" value={st} />
        </dl>
        <div className="flex flex-wrap gap-3">
          <Link href="/sales" className="inline-flex min-h-11 items-center rounded-xl bg-brand px-5 text-[15px] font-semibold text-white hover:brightness-95">
            View Sales list
          </Link>
          <button type="button" onClick={startNew} className="min-h-11 rounded-xl border border-line px-5 text-[15px] font-semibold hover:bg-canvas">
            New Retailer Sale
          </button>
        </div>
      </Card>
    );
  }

  // ------------------------------------------------------------------- form

  const costNote = (unit: number | null | undefined) =>
    unit === undefined ? null : unit === null ? (
      <p className="flex items-center gap-1.5 text-[13px] text-[#9a3300]">
        <TriangleAlert size={14} aria-hidden="true" />
        No buying cost recorded yet, so this line is not counted in the cost.
      </p>
    ) : (
      <p className="text-[13px] text-muted">Buying cost: {formatKes(unit)} each</p>
    );

  return (
    <form ref={rootRef} onSubmit={submit} noValidate className="flex flex-col gap-5">
      <FormSection n={1} title="Customer">
        <SearchableSelect id="sale-customer" name="customer" label="CRM customer" value={draft.customerId} error={errors.customer}
          options={customerOptions} searchPlaceholder="Search by name, account, phone, email or location" emptyText="No customers match your search"
          filter={customerMatches}
          onChange={(v) => { setDraft((d) => ({ ...d, customerId: v })); clear("customer"); }} />
        {customer && (
          <dl className="grid gap-x-6 gap-y-3 rounded-xl bg-canvas p-4 sm:grid-cols-2 lg:grid-cols-3">
            <Detail label="Name" value={customer.name} />
            <Detail label="Type" value={customer.type} />
            <Detail label="Account" value={customer.account} />
            <Detail label="Phone" value={customer.phone} />
            <Detail label="Email" value={customer.email} />
            <Detail label="Location" value={customer.location} />
          </dl>
        )}
      </FormSection>

      <FormSection n={2} title="Products">
        {errors.items && <p role="alert" className="text-[13.5px] text-[#C62828]">{errors.items}</p>}
        {draft.productLines.map((l, i) => {
          const info = live.products[l.key];
          const models = products.filter((p) => p.categoryId === l.categoryId).map((p) => ({ value: p.id, label: p.model }));
          return (
            <fieldset key={l.key} className="flex flex-col gap-3 rounded-xl border border-line p-4">
              <legend className="px-1 text-[13px] font-semibold text-muted">Product {i + 1}</legend>
              <div className="grid items-start gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_100px_150px_150px_auto]">
                <SelectField id={`sale-p-${l.key}-category`} name={`p-${l.key}-category`} label="Category" value={l.categoryId} error={errors[`p-${l.key}-category`]}
                  options={categories.map((c) => ({ value: c.id, label: c.name }))}
                  onChange={(v) => patchProduct(l.key, { categoryId: v, productId: "" }, "category", "product")} />
                <SelectField id={`sale-p-${l.key}-product`} name={`p-${l.key}-product`} label="Model" value={l.productId} error={errors[`p-${l.key}-product`]}
                  disabled={!l.categoryId} options={models} onChange={(v) => patchProduct(l.key, { productId: v }, "product")} />
                <TextField id={`sale-p-${l.key}-quantity`} name={`p-${l.key}-quantity`} label="Quantity" value={l.quantity} inputMode="numeric" placeholder="0"
                  error={errors[`p-${l.key}-quantity`]} onChange={(v) => patchProduct(l.key, { quantity: sanitizeNumberInput(v) }, "quantity")} />
                <TextField id={`sale-p-${l.key}-price`} name={`p-${l.key}-price`} label="Unit price (KES)" value={l.unitPrice} inputMode="decimal" placeholder="0.00"
                  error={errors[`p-${l.key}-price`]} onChange={(v) => patchProduct(l.key, { unitPrice: sanitizeNumberInput(v) }, "price")} />
                <ReadOnlyField id={`sale-p-${l.key}-total`} label="Line total" value={info?.totalMinor !== undefined ? formatKes(info.totalMinor) : undefined} empty="—" />
                <button type="button" onClick={() => removeProduct(l.key)} aria-label={`Remove product ${i + 1}`} className={cn(iconButton, "lg:mt-6.5")}>
                  <Trash2 size={17} aria-hidden="true" />
                </button>
              </div>
              {costNote(info?.unitCostMinor)}
            </fieldset>
          );
        })}
        <div>
          <button type="button" onClick={addProduct} disabled={draft.productLines.length >= MAX_LINES} className={addButton}>
            <Plus size={17} aria-hidden="true" />
            Add Product
          </button>
        </div>
      </FormSection>

      <FormSection n={3} title="Platform cards">
        {draft.cardLines.map((l, i) => {
          const info = live.cards[l.key];
          return (
            <fieldset key={l.key} className="flex flex-col gap-3 rounded-xl border border-line p-4">
              <legend className="px-1 text-[13px] font-semibold text-muted">Platform card {i + 1}</legend>
              <div className="grid items-start gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_100px_150px_150px_auto]">
                <SelectField id={`sale-c-${l.key}-platform`} name={`c-${l.key}-platform`} label="Platform" value={l.platformId} error={errors[`c-${l.key}-platform`]}
                  options={platforms.map((p) => ({ value: p.id, label: p.name }))} onChange={(v) => patchCard(l.key, { platformId: v }, "platform")} />
                <SelectField id={`sale-c-${l.key}-cardType`} name={`c-${l.key}-cardType`} label="Card type" value={l.cardType} error={errors[`c-${l.key}-cardType`]}
                  options={CARD_TYPES.map((t) => ({ value: t, label: t }))} onChange={(v) => patchCard(l.key, { cardType: v }, "cardType")} />
                <TextField id={`sale-c-${l.key}-quantity`} name={`c-${l.key}-quantity`} label="Quantity" value={l.quantity} inputMode="numeric" placeholder="0"
                  error={errors[`c-${l.key}-quantity`]} onChange={(v) => patchCard(l.key, { quantity: sanitizeNumberInput(v) }, "quantity")} />
                <TextField id={`sale-c-${l.key}-price`} name={`c-${l.key}-price`} label="Unit price (KES)" value={l.unitPrice} inputMode="decimal" placeholder="0.00"
                  error={errors[`c-${l.key}-price`]} onChange={(v) => patchCard(l.key, { unitPrice: sanitizeNumberInput(v) }, "price")} />
                <ReadOnlyField id={`sale-c-${l.key}-total`} label="Line total" value={info?.totalMinor !== undefined ? formatKes(info.totalMinor) : undefined} empty="—" />
                <button type="button" onClick={() => removeCard(l.key)} aria-label={`Remove platform card ${i + 1}`} className={cn(iconButton, "lg:mt-6.5")}>
                  <Trash2 size={17} aria-hidden="true" />
                </button>
              </div>
              {costNote(info?.unitCostMinor)}
            </fieldset>
          );
        })}
        <div>
          <button type="button" onClick={addCard} disabled={draft.cardLines.length >= MAX_LINES} className={addButton}>
            <Plus size={17} aria-hidden="true" />
            Add Platform Card
          </button>
        </div>
      </FormSection>

      <FormSection n={4} title="Profit">
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-3">
          <Detail label="Total selling amount" value={live.hasLines ? formatKes(live.totalMinor) : undefined} />
          <Detail label="Total cost" value={live.hasLines ? formatKes(live.costMinor) : undefined} />
          <div className="min-w-0">
            <dt className="text-[12.5px] text-muted">Profit</dt>
            <dd>
              <output id="sale-profit" aria-live="polite" className={cn("text-[20px] font-semibold tabular-nums", live.hasLines && live.profitMinor < 0 ? "text-[#B71C1C]" : "text-[#1B5E20]")}>
                {live.hasLines ? formatSigned(live.profitMinor) : <span className="text-muted">—</span>}
              </output>
            </dd>
          </div>
        </dl>
        {live.hasLines && live.costMissing.length > 0 && (
          <p id="sale-profit-note" className="text-[13.5px] text-[#9a3300]">
            Profit cannot yet be calculated accurately: no buying cost is recorded for {live.costMissing.join(", ")}. Their cost is not counted. Receive a purchase for them in Purchases.
          </p>
        )}
        {!live.hasLines && <p className="text-[13px] text-muted">Add a product or platform card with a quantity and unit price to see the totals.</p>}
      </FormSection>

      <FormSection n={5} title="Payment">
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-3">
          <Detail label="Total sale amount" value={live.hasLines ? formatKes(live.totalMinor) : undefined} />
        </dl>
        <div className="grid gap-4 sm:grid-cols-3">
          <TextField id="sale-paid" name="paid" label="Amount paid (KES)" value={draft.paid} inputMode="decimal" placeholder="0.00" error={errors.paid}
            onChange={(v) => { setDraft((d) => ({ ...d, paid: sanitizeNumberInput(v) })); clear("paid"); }} />
          <Field id="sale-balance" label="Outstanding balance">
            <output id="sale-balance" className="flex min-h-11 items-center text-[17px] font-semibold tabular-nums">{balance !== undefined ? formatKes(balance) : "—"}</output>
          </Field>
          <Field id="sale-status" label="Payment status">
            <output id="sale-status" className="flex min-h-11 items-center">
              {state ? <span className={cn("rounded-full px-2.5 py-0.5 text-[13.5px] font-semibold", statusStyle[state])}>{state}</span> : "—"}
            </output>
          </Field>
        </div>
      </FormSection>

      <div className="flex justify-end">
        <button type="submit" className="min-h-12 rounded-xl bg-brand px-7 text-[16px] font-semibold text-white hover:brightness-95">
          Complete Sale
        </button>
      </div>
    </form>
  );
}
