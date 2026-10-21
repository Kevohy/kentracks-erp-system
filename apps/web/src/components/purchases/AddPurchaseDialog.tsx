"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { useInventory } from "@/components/inventory/InventoryProvider";
import { platformLicenceTypes, simLabel } from "@/lib/inventory";
import { useCrmLookups } from "@/components/crm/useCrmLookups";
import { newClientKey } from "@/lib/erp-api";
import {
  formatKes,
  purchaseItemTypes,
  purchaseStatuses,
  type PurchaseItemType,
  type PurchaseStatus,
} from "@/lib/purchases";
import {
  MAX_ITEMS,
  draftTotal,
  parseMoney,
  rowAmount,
  sanitizeNotes,
  sanitizeNumberInput,
  validatePurchase,
  type PurchaseDraft,
  type PurchaseErrors,
  type RowDraft,
} from "@/lib/purchase-validation";

const control = "min-h-11 w-full min-w-0 rounded-xl border bg-white px-3.5 text-[15px] placeholder:text-muted/70";

function Field({ id, label, error, className, children }: { id: string; label: string; error?: string; className?: string; children: ReactNode }) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-[13.5px] font-medium">
        {label}
      </label>
      {children}
      {error && (
        <p id={`${id}-err`} className="text-[13px] text-[#C62828]">
          {error}
        </p>
      )}
    </div>
  );
}

export function AddPurchaseDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { categories, products, simCards, platforms, addPurchase } = useInventory();
  const { state: crm, retry: retryCrm } = useCrmLookups({ suppliers: true });
  const suppliers = crm.status === "ready" ? crm.suppliers : [];
  const ctx = { suppliers, categories, products, simCards, platforms };

  const ref = useRef<HTMLDialogElement>(null);
  const rowSeq = useRef(0);
  const emptyRow = (key: string): RowDraft => ({ key, type: "", categoryId: "", itemId: "", cardType: "", quantity: "", unitPrice: "" });
  const newRow = () => emptyRow(`r${++rowSeq.current}`);
  const [draft, setDraft] = useState<PurchaseDraft>({ supplierId: "", status: "", date: "", notes: "", paid: "0", rows: [emptyRow("r0")] });
  const [errors, setErrors] = useState<PurchaseErrors>({});
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const saving = useRef(false);
  // One key per opened form: sending the same form twice (double click, retry after a timeout) saves one purchase.
  const clientKey = useRef(newClientKey());

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      setDraft({ supplierId: "", status: "", date: "", notes: "", paid: "0", rows: [newRow()] });
      setErrors({});
      setFormError("");
      clientKey.current = newClientKey();
      d.showModal();
    } else if (!open && d.open) {
      d.close();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const clear = (...keys: string[]) =>
    setErrors((p) => {
      if (!keys.some((k) => p[k])) return p;
      const n = { ...p };
      for (const k of keys) delete n[k];
      return n;
    });

  function setField<K extends "supplierId" | "date" | "notes" | "paid">(k: K, v: string, errKey: string) {
    setDraft((d) => ({ ...d, [k]: v }));
    clear(errKey);
  }

  function setStatus(v: string) {
    setDraft((d) => ({ ...d, status: v as PurchaseStatus | "" }));
    clear("status");
  }

  function updateRow(key: string, patch: Partial<RowDraft>, clearFields: string[]) {
    setDraft((d) => ({ ...d, rows: d.rows.map((r) => (r.key === key ? { ...r, ...patch } : r)) }));
    clear("paid", "items", ...clearFields.map((f) => `row-${key}-${f}`));
  }

  function addRow() {
    setDraft((d) => (d.rows.length >= MAX_ITEMS ? d : { ...d, rows: [...d.rows, newRow()] }));
    clear("items");
  }

  function removeRow(key: string) {
    setDraft((d) => (d.rows.length <= 1 ? d : { ...d, rows: d.rows.filter((r) => r.key !== key) }));
    clear("paid");
  }

  /** Show the error for one field once the user leaves it with a value in it. */
  function blur(errKey: string, hasValue: boolean) {
    if (!hasValue) return;
    const e = validatePurchase(draft, ctx).errors[errKey];
    setErrors((p) => {
      const n = { ...p };
      if (e) n[errKey] = e;
      else delete n[errKey];
      return n;
    });
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (saving.current) return;
    const { errors: found, result } = validatePurchase(draft, ctx);
    setErrors(found);
    if (!result) {
      const els = Array.from(ref.current?.querySelectorAll<HTMLElement>("[data-field]") ?? []);
      els.find((el) => found[el.dataset.field ?? ""])?.focus();
      return;
    }
    saving.current = true;
    setBusy(true);
    setFormError("");
    // The server repeats every check and works out the totals itself.
    const saved = await addPurchase(draft, clientKey.current);
    saving.current = false;
    setBusy(false);
    if (saved.ok) {
      onClose();
      return;
    }
    setErrors(saved.fieldErrors);
    setFormError(saved.message);
    const els = Array.from(ref.current?.querySelectorAll<HTMLElement>("[data-field]") ?? []);
    els.find((el) => saved.fieldErrors[el.dataset.field ?? ""])?.focus();
  }

  const total = draftTotal(draft.rows);
  const paid = parseMoney(draft.paid, "Amount paid", Number.MAX_SAFE_INTEGER).value;
  const balance = paid !== undefined && paid <= total ? total - paid : null;

  const common = (key: string) =>
    ({
      id: `purchase-${key}`,
      "data-field": key,
      "aria-invalid": errors[key] ? true : undefined,
      "aria-describedby": errors[key] ? `purchase-${key}-err` : undefined,
      className: cn(control, errors[key] ? "border-[#C62828]" : "border-line"),
    }) as const;

  const optionsFor = (r: RowDraft): { value: string; label: string }[] => {
    if (r.type === "Product") return products.filter((p) => p.categoryId === r.categoryId).map((p) => ({ value: p.id, label: p.model }));
    if (r.type === "SIM Card") return simCards.map((s) => ({ value: s.id, label: simLabel(s.name, s.type) }));
    if (r.type === "Platform") return platforms.map((p) => ({ value: p.id, label: p.name }));
    return [];
  };

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby="purchase-title"
      className="m-auto w-[calc(100%-32px)] max-w-3xl rounded-2xl border border-line bg-white p-0 text-ink shadow-[0_24px_60px_rgba(10,29,44,0.25)] backdrop:bg-ink/50"
    >
      <form onSubmit={submit} noValidate className="flex max-h-[calc(100dvh-32px)] flex-col">
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4 sm:px-6">
          <h2 id="purchase-title" className="text-lg font-semibold">
            Add Purchase
          </h2>
          <button type="button" onClick={onClose} aria-label="Close" className="grid size-11 place-items-center rounded-xl text-muted hover:bg-canvas">
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        <div className="flex flex-col gap-5 overflow-y-auto px-5 py-5 sm:px-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="purchase-supplier" label="Supplier" error={errors.supplier} className="sm:col-span-2">
              <select {...common("supplier")} value={draft.supplierId} onChange={(e) => setField("supplierId", e.target.value, "supplier")}>
                <option value="">{crm.status === "loading" ? "Loading suppliers…" : "Select…"}</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>
            {crm.status === "error" && (
              <p role="alert" className="flex flex-wrap items-center gap-3 text-[13px] text-[#C62828] sm:col-span-2">
                {crm.message}
                <button type="button" onClick={retryCrm} className="min-h-11 rounded-xl border border-line px-4 text-[14px] font-semibold text-ink hover:bg-canvas">Try again</button>
              </p>
            )}
            {crm.status === "ready" && suppliers.length === 0 && (
              <p className="text-[13px] text-muted sm:col-span-2">No suppliers yet. Add one under CRM → Suppliers first.</p>
            )}
            <Field id="purchase-status" label="Status" error={errors.status}>
              <select {...common("status")} value={draft.status} onChange={(e) => setStatus(e.target.value)}>
                <option value="">Select…</option>
                {purchaseStatuses.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </Field>
            <Field id="purchase-date" label="Date" error={errors.date}>
              <input
                {...common("date")}
                type="date"
                min="2000-01-01"
                max="2100-12-31"
                value={draft.date}
                onChange={(e) => setField("date", sanitizeNumberInput(e.target.value), "date")}
              />
            </Field>
            <Field id="purchase-notes" label="Notes (optional)" error={errors.notes} className="sm:col-span-2">
              <textarea
                {...common("notes")}
                rows={2}
                spellCheck={false}
                placeholder="Optional notes"
                value={draft.notes}
                onChange={(e) => setField("notes", sanitizeNotes(e.target.value), "notes")}
                onBlur={() => blur("notes", draft.notes.length > 0)}
                className={cn(control, "py-2.5", errors.notes ? "border-[#C62828]" : "border-line")}
              />
            </Field>
          </div>

          <section aria-labelledby="purchase-items-title" className="flex flex-col gap-3">
            <h3 id="purchase-items-title" className="text-[15px] font-semibold">
              Items
            </h3>
            {errors.items && <p className="text-[13px] text-[#C62828]">{errors.items}</p>}

            {draft.rows.map((r, n) => {
              const k = (f: string) => `row-${r.key}-${f}`;
              const amount = rowAmount(r);
              const opts = optionsFor(r);
              return (
                <fieldset key={r.key} className="grid gap-3 rounded-xl border border-line p-3.5 sm:grid-cols-3">
                  <legend className="px-1 text-[13px] font-semibold text-muted">Item {n + 1}</legend>

                  <Field id={`purchase-${k("type")}`} label="Item Type" error={errors[k("type")]}>
                    <select
                      {...common(k("type"))}
                      value={r.type}
                      onChange={(e) =>
                        updateRow(r.key, { type: e.target.value as PurchaseItemType | "", categoryId: "", itemId: "", cardType: "" }, ["type", "category", "item", "cardType"])
                      }
                    >
                      <option value="">Select…</option>
                      {purchaseItemTypes.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </Field>

                  {r.type === "Product" && (
                    <Field id={`purchase-${k("category")}`} label="Category" error={errors[k("category")]}>
                    <select
                      {...common(k("category"))}
                      value={r.categoryId}
                      onChange={(e) => updateRow(r.key, { categoryId: e.target.value, itemId: "" }, ["category", "item"])}
                    >
                      <option value="">Select…</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                    </Field>
                  )}

                  <Field
                    id={`purchase-${k("item")}`}
                    label={r.type === "SIM Card" ? "SIM Card" : r.type === "Platform" ? "Platform" : "Model"}
                    error={errors[k("item")]}
                    className={r.type === "SIM Card" || !r.type ? "sm:col-span-2" : undefined}
                  >
                    <select
                      {...common(k("item"))}
                      value={r.itemId}
                      disabled={!r.type || (r.type === "Product" && !r.categoryId)}
                      onChange={(e) => updateRow(r.key, { itemId: e.target.value }, ["item"])}
                    >
                      <option value="">Select…</option>
                      {opts.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </Field>

                  {r.type === "Platform" && (
                    <Field id={`purchase-${k("cardType")}`} label="Card Type" error={errors[k("cardType")]}>
                      <select {...common(k("cardType"))} value={r.cardType} onChange={(e) => updateRow(r.key, { cardType: e.target.value }, ["cardType"])}>
                        <option value="">Select…</option>
                        {platformLicenceTypes.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    </Field>
                  )}

                  <Field id={`purchase-${k("quantity")}`} label="Quantity" error={errors[k("quantity")]}>
                    <input
                      {...common(k("quantity"))}
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      placeholder="0"
                      value={r.quantity}
                      onChange={(e) => updateRow(r.key, { quantity: sanitizeNumberInput(e.target.value) }, ["quantity"])}
                      onBlur={() => blur(k("quantity"), r.quantity.trim().length > 0)}
                    />
                  </Field>

                  <Field id={`purchase-${k("unitPrice")}`} label="Unit Buying Price (KES)" error={errors[k("unitPrice")]} className={r.type !== "Product" ? "sm:col-span-2" : undefined}>
                    <input
                      {...common(k("unitPrice"))}
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
                      placeholder="0.00"
                      value={r.unitPrice}
                      onChange={(e) => updateRow(r.key, { unitPrice: sanitizeNumberInput(e.target.value) }, ["unitPrice"])}
                      onBlur={() => blur(k("unitPrice"), r.unitPrice.trim().length > 0)}
                    />
                  </Field>

                  <div className="flex min-w-0 items-end justify-between gap-3 sm:col-span-3">
                    <div className="flex min-w-0 flex-col gap-1.5">
                      <label htmlFor={`purchase-${k("amount")}`} className="text-[13.5px] font-medium">
                        Amount
                      </label>
                      <output
                        id={`purchase-${k("amount")}`}
                        className="flex min-h-11 items-center rounded-xl bg-canvas px-3.5 text-[15px] font-semibold tabular-nums"
                      >
                        {amount === null ? "—" : formatKes(amount)}
                      </output>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeRow(r.key)}
                      disabled={draft.rows.length <= 1}
                      className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-line px-3 text-[14px] font-semibold hover:bg-canvas disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Trash2 size={16} aria-hidden="true" />
                      Remove item
                    </button>
                  </div>
                </fieldset>
              );
            })}

            <button
              type="button"
              onClick={addRow}
              disabled={draft.rows.length >= MAX_ITEMS}
              className="inline-flex min-h-11 items-center gap-2 self-start rounded-xl border border-line px-4 text-[15px] font-semibold hover:bg-canvas disabled:opacity-40"
            >
              <Plus size={18} aria-hidden="true" />
              Add item
            </button>
          </section>

          <section aria-labelledby="purchase-payment-title" className="grid gap-4 rounded-xl bg-canvas p-4 sm:grid-cols-3">
            <h3 id="purchase-payment-title" className="sr-only">
              Total and payment
            </h3>
            <div className="flex flex-col gap-1.5">
              <span className="text-[13.5px] font-medium">Total</span>
              <span className="flex min-h-11 items-center text-[17px] font-semibold tabular-nums">{formatKes(total)}</span>
            </div>
            <Field id="purchase-paid" label="Amount Paid (KES)" error={errors.paid}>
              <input
                {...common("paid")}
                type="text"
                inputMode="decimal"
                autoComplete="off"
                placeholder="0.00"
                value={draft.paid}
                onChange={(e) => setField("paid", sanitizeNumberInput(e.target.value), "paid")}
                onBlur={() => blur("paid", draft.paid.trim().length > 0)}
              />
            </Field>
            <div className="flex flex-col gap-1.5">
              <span className="text-[13.5px] font-medium">Outstanding Balance</span>
              <span className="flex min-h-11 items-center text-[17px] font-semibold tabular-nums">{balance === null ? "—" : formatKes(balance)}</span>
            </div>
          </section>
        </div>

        {formError && (
          <p role="alert" className="border-t border-line px-5 py-3 text-[14px] text-[#C62828] sm:px-6">
            {formError}
          </p>
        )}
        <div className="flex justify-end gap-3 border-t border-line px-5 py-4 sm:px-6">
          <button type="button" onClick={onClose} className="min-h-11 rounded-xl border border-line px-4 text-[15px] font-semibold hover:bg-canvas">
            Cancel
          </button>
          <button type="submit" disabled={busy} className="min-h-11 rounded-xl bg-brand px-5 text-[15px] font-semibold text-white hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60">
            {busy ? "Saving…" : "Save Purchase"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
