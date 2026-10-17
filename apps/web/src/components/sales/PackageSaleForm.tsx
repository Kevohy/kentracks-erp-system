"use client";

import Link from "next/link";
import { useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { CheckCircle2, Loader2, Plus, ShieldCheck, Trash2, TriangleAlert } from "lucide-react";
import { Card } from "@/components/dashboard/Card";
import { useInventory } from "@/components/inventory/InventoryProvider";
import { cn } from "@/lib/cn";
import { sampleCustomers } from "@/lib/customers";
import { sampleTechnicians } from "@/lib/technicians";
import { MOCK_IMEIS, gpsPlatformClient, isLocalhost, sanitizeImeiInput, verifyDevice, type GpsDevice, type GpsSource } from "@/lib/gps-platform";
import { MAX_NOTES, parseMoney } from "@/lib/purchase-validation";
import { formatKes, formatSigned, paymentState } from "@/lib/sales-format";
import { matchCustomer, saleTotalMinor, type PackageSale } from "@/lib/sales";
import { MAX_OTHER_EXPENSES, hostingPackageOf, parseDeduction, saleProfit, sanitizeNotes, sanitizeNumberInput, trackerCategory, validatePackageSale, type PackageSaleDraft, type SaleErrors } from "@/lib/sale-validation";
import { stripControlChars } from "@/lib/validation";
import { Detail, Field, FormSection, ReadOnlyField, SelectField, TextField, controlClass } from "./fields";
import { customerMatches, customerOptions } from "@/lib/customer-search";
import { SearchableSelect } from "./SearchableSelect";
import { useSales } from "./SalesProvider";

type Verify =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ok"; device: GpsDevice; missing: string[]; source: GpsSource };

type Match = { kind: "matched"; name: string; by: string } | { kind: "ambiguous" } | { kind: "none" } | null;

const blankDraft: PackageSaleDraft = {
  customerId: "", customerLink: "manual", packageId: "", productId: "", platformId: "", cardType: "",
  deduction: "", simId: "", technicianId: "", installation: "", transport: "", commission: "", price: "", paid: "0", notes: "", deductSim: false, otherExpenses: [],
};

/** The only deduction quantities allowed. */
const deductionOptions = ["0", "0.5", "1"].map((v) => ({ value: v, label: v }));

const deviceStatusStyle = { Online: "bg-[#E6F4EA] text-[#1B5E20]", Offline: "bg-[#EEF1F4] text-[#4A5560]", Expired: "bg-[#FDECEA] text-[#B71C1C]" } as const;

const statusStyle = { "Paid in full": "bg-[#E6F4EA] text-[#1B5E20]", "Partly paid": "bg-[#FFF4E5] text-[#9a3300]", Unpaid: "bg-[#FDECEA] text-[#B71C1C]" } as const;

export function PackageSaleForm({ kind = "Package Sale" }: { kind?: "Package Sale" | "Hosting Sale" }) {
  const hosting = kind === "Hosting Sale";
  const { categories, products, platforms, simCards, stockOf, deductStock } = useInventory();
  const { packages, addSale } = useSales();

  const [imei, setImei] = useState("");
  const [verify, setVerify] = useState<Verify>({ status: "idle" });
  const [match, setMatch] = useState<Match>(null);
  const [draft, setDraft] = useState<PackageSaleDraft>(blankDraft);
  const [errors, setErrors] = useState<SaleErrors>({});
  const [saved, setSaved] = useState<PackageSale | null>(null);

  // Mock verification is for local development only; false while rendering on the server.
  const local = useSyncExternalStore(() => () => {}, isLocalhost, () => false);

  const requestId = useRef(0);
  const submitted = useRef(false);
  const saleKey = useRef<string | null>(null);
  const seq = useRef(0);
  const rootRef = useRef<HTMLDivElement>(null);

  const verified = verify.status === "ok" ? { device: verify.device, source: verify.source } : null;
  const ctx = { kind, verified, customers: sampleCustomers, packages, categories, products, platforms, simCards, technicians: sampleTechnicians, stockOf };

  const clear = (...keys: string[]) =>
    setErrors((p) => (keys.some((k) => p[k]) ? Object.fromEntries(Object.entries(p).filter(([k]) => !keys.includes(k))) : p));

  // ------------------------------------------------------------------ verify

  function changeImei(v: string) {
    requestId.current++; // a response still in flight is for the old number and must be ignored
    setImei(sanitizeImeiInput(v));
    if (verify.status !== "idle") {
      setVerify({ status: "idle" });
      setMatch(null);
      // A Hosting Sale's customer is picked by hand and does not depend on the device, so it is kept.
      if (!hosting) setDraft((d) => ({ ...d, customerId: "", customerLink: "manual" }));
    }
    clear("imei");
  }

  async function runVerify(e: FormEvent) {
    e.preventDefault();
    if (verify.status === "loading") return;
    const id = ++requestId.current;
    setVerify({ status: "loading" });
    const out = await verifyDevice(gpsPlatformClient, imei);
    if (id !== requestId.current) return;
    if (!out.ok) {
      if (out.code === "invalid-imei") {
        setVerify({ status: "idle" });
        setErrors((p) => ({ ...p, imei: out.message }));
        rootRef.current?.querySelector<HTMLElement>('[data-field="imei"]')?.focus();
      } else {
        setVerify({ status: "error", message: out.message });
      }
      return;
    }
    setVerify({ status: "ok", device: out.device, missing: out.missing, source: out.source });
    // A Hosting Sale never links the customer automatically: it is always picked by hand.
    const m = hosting ? null : matchCustomer(out.device.contact, sampleCustomers);
    if (!m) {
      // leave any customer the user already chose
    } else if (m.status === "matched") {
      setDraft((d) => ({ ...d, customerId: m.customer.id, customerLink: "automatic" }));
      setMatch({ kind: "matched", name: m.customer.name, by: m.by });
    } else {
      setDraft((d) => ({ ...d, customerId: "", customerLink: "manual" }));
      setMatch({ kind: m.status });
    }
    clear("imei", "customer");
  }

  // -------------------------------------------------------------- draft edits

  function set<K extends keyof PackageSaleDraft>(key: K, value: PackageSaleDraft[K], errKey: string, ...also: string[]) {
    setDraft((d) => ({ ...d, [key]: value }));
    clear(errKey, ...also);
  }

  function blur(errKey: string, hasValue: boolean) {
    if (!hasValue) return;
    const e = validatePackageSale(draft, ctx).errors[errKey];
    setErrors((p) => {
      const n = { ...p };
      if (e) n[errKey] = e;
      else delete n[errKey];
      return n;
    });
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (submitted.current) return; // already saved: a second click or Enter must not add another sale
    const { errors: found, result } = validatePackageSale(draft, ctx);
    setErrors(found);
    if (!result) {
      const els = Array.from(rootRef.current?.querySelectorAll<HTMLElement>("[data-field]") ?? []);
      els.find((el) => found[el.dataset.field ?? ""])?.focus();
      return;
    }
    submitted.current = true;
    saleKey.current ??= `sale-${Date.now().toString(36)}-${++seq.current}`;
    const sale: PackageSale = { ...result, id: saleKey.current };
    addSale(sale);
    if (sale.sim.deducted) deductStock("SIM Card", sale.sim.id, 1);
    setSaved(sale);
  }

  function addExpense() {
    setDraft((d) => (d.otherExpenses.length >= MAX_OTHER_EXPENSES ? d : { ...d, otherExpenses: [...d.otherExpenses, { key: `x${++seq.current}`, description: "", amount: "" }] }));
  }

  function removeExpense(key: string) {
    setDraft((d) => ({ ...d, otherExpenses: d.otherExpenses.filter((r) => r.key !== key) }));
    clear(`other-${key}-description`, `other-${key}-amount`);
  }

  function setExpense(key: string, field: "description" | "amount", value: string) {
    setDraft((d) => ({ ...d, otherExpenses: d.otherExpenses.map((r) => (r.key === key ? { ...r, [field]: value } : r)) }));
    clear(`other-${key}-${field}`);
  }

  function startNew() {
    submitted.current = false;
    saleKey.current = null;
    requestId.current++;
    setImei("");
    setVerify({ status: "idle" });
    setMatch(null);
    setDraft(blankDraft);
    setErrors({});
    setSaved(null);
  }

  // ------------------------------------------------------------ derived values

  const priceMinor = parseMoney(draft.price, "Package price", 1_000_000_000).value;
  const totalMinor = priceMinor !== undefined && priceMinor > 0 ? saleTotalMinor(priceMinor) : undefined;
  const paidMinor = parseMoney(draft.paid, "Amount paid", Number.MAX_SAFE_INTEGER).value;
  const balance = totalMinor !== undefined && paidMinor !== undefined && paidMinor <= totalMinor ? totalMinor - paidMinor : undefined;
  const state = totalMinor !== undefined && paidMinor !== undefined && paidMinor <= totalMinor ? paymentState({ totalMinor, paidMinor }) : undefined;
  const expense = (raw: string) => (raw.trim() === "" ? 0 : parseMoney(raw, "x", 1_000_000_000).value);
  const expenses = [expense(draft.installation), expense(draft.transport), expense(draft.commission), ...draft.otherExpenses.map((r) => expense(r.amount))];
  const expensesTotal = expenses.every((x) => x !== undefined) ? expenses.reduce<number>((s, x) => s + (x ?? 0), 0) : undefined;

  const customer = sampleCustomers.find((c) => c.id === draft.customerId);
  const platform = platforms.find((p) => p.id === draft.platformId);
  const trackerCat = trackerCategory(categories);
  const hostingPackage = hostingPackageOf(packages);
  const chosenSim = simCards.find((s) => s.id === draft.simId);
  const chosenProduct = products.find((p) => p.id === draft.productId && p.categoryId === trackerCat?.id);
  const deductionValue = parseDeduction(draft.deduction).value;
  // Live profit: only once the price, items and expenses are all valid.
  const profit =
    totalMinor !== undefined && expensesTotal !== undefined && platform && chosenSim && (hosting || (chosenProduct && deductionValue !== undefined))
      ? saleProfit({
          totalMinor,
          trackerPriceMinor: chosenProduct ? stockOf("Product", chosenProduct.id).latestPriceMinor : 0,
          simPriceMinor: stockOf("SIM Card", chosenSim.id).latestPriceMinor,
          platformPriceMinor: stockOf("Platform", platform.id).latestPriceMinor,
          deduction: deductionValue ?? 0,
          expensesMinor: expensesTotal,
        })
      : undefined;
  const modelOptions = products.filter((p) => p.categoryId === trackerCat?.id).map((p) => ({ value: p.id, label: p.model }));

  // ------------------------------------------------------------- confirmation

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
          <Detail label="Vehicle number plate" value={saved.vehiclePlate} />
          <Detail label="IMEI" value={saved.imei} />
          <Detail label="Package" value={saved.packageName} />
          <Detail label="SIM card" value={(saved.sim.number ? `${saved.sim.name} — ${saved.sim.number}` : saved.sim.name) + (saved.sim.deducted ? " (deducted from stock)" : "")} />
          <Detail label="Total" value={formatKes(saved.totalMinor)} />
          <Detail label="Amount paid" value={formatKes(saved.paidMinor)} />
          <Detail label="Outstanding balance" value={formatKes(saved.totalMinor - saved.paidMinor)} />
          <Detail label="Payment status" value={st} />
          <Detail label="Profit" value={formatSigned(saved.profitMinor)} />
          <Detail label="IMEI verification" value={saved.verificationSource === "mock" ? "Mock data (not confirmed by GPSPlatform)" : "GPSPlatform"} />
        </dl>
        <div className="flex flex-wrap gap-3">
          <Link href="/sales" className="inline-flex min-h-11 items-center rounded-xl bg-brand px-5 text-[15px] font-semibold text-white hover:brightness-95">
            View Sales list
          </Link>
          <button type="button" onClick={startNew} className="min-h-11 rounded-xl border border-line px-5 text-[15px] font-semibold hover:bg-canvas">
            New {kind}
          </button>
        </div>
      </Card>
    );
  }

  // --------------------------------------------------------------------- form

  const d = verify.status === "ok" ? verify.device : undefined;

  return (
    <div ref={rootRef} className="flex flex-col gap-5">
      <FormSection n={1} title="Verify IMEI">
        {gpsPlatformClient.source === "mock" && local && (
          <div className="rounded-xl border border-[#F0C98C] bg-[#FFF8EC] px-4 py-3 text-[14px] text-[#6b3a00]">
            <p className="font-semibold">GPSPlatform is not connected yet.</p>
            <p>Verification uses fake (mock) devices and does not confirm a real tracker. Any valid 15-digit IMEI returns a made-up device.</p>
            <details className="mt-1.5">
              <summary className="cursor-pointer font-medium">Special test IMEIs (customer matching and error cases)</summary>
              <ul className="mt-1.5 grid gap-x-6 gap-y-0.5 font-mono text-[13px] sm:grid-cols-2">
                {Object.entries(MOCK_IMEIS).map(([k, v]) => (
                  <li key={k}>
                    {v} <span className="font-sans text-[#8a5a1f]">{k.replace(/([A-Z])/g, " $1").toLowerCase()}</span>
                  </li>
                ))}
              </ul>
            </details>
          </div>
        )}

        {gpsPlatformClient.source === "mock" && !local && (
          <div className="rounded-xl border border-[#F0C98C] bg-[#FFF8EC] px-4 py-3 text-[14px] text-[#6b3a00]">
            <p className="font-semibold">GPSPlatform is not connected yet.</p>
            <p>IMEI verification is not available here, so a {kind} cannot be completed until the integration is set up.</p>
          </div>
        )}

        <form onSubmit={runVerify} noValidate className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <TextField id="sale-imei" name="imei" label="GPS tracker IMEI" value={imei} inputMode="numeric" placeholder="15-digit IMEI"
            className="sm:max-w-md sm:flex-1" error={errors.imei} onChange={changeImei} />
          <button type="submit" disabled={verify.status === "loading"} aria-busy={verify.status === "loading"}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-navy px-5 text-[15px] font-semibold text-white hover:brightness-110 disabled:opacity-70">
            {verify.status === "loading" ? <Loader2 size={18} className="animate-spin" aria-hidden="true" /> : <ShieldCheck size={18} aria-hidden="true" />}
            {verify.status === "loading" ? "Verifying…" : "Verify"}
          </button>
        </form>

        <div aria-live="polite">
          {verify.status === "loading" && <p className="text-[14.5px] text-muted">Checking the IMEI…</p>}
          {verify.status === "error" && (
            <p role="alert" className="flex items-start gap-2 rounded-xl border border-[#F2B8B5] bg-[#FDECEA] px-4 py-3 text-[14.5px] text-[#B71C1C]">
              <TriangleAlert size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
              {verify.message}
            </p>
          )}
        </div>

        {verify.status === "ok" && d && (
          <div className="flex flex-col gap-3">
            {verify.missing.length > 0 && (
              <p className="rounded-xl border border-[#F0C98C] bg-[#FFF8EC] px-4 py-3 text-[14px] text-[#6b3a00]">
                The response was incomplete. Not provided: {verify.missing.join(", ")}.
              </p>
            )}
            <dl className="grid gap-x-6 gap-y-3 rounded-xl bg-canvas p-4 sm:grid-cols-2 lg:grid-cols-3">
              <Detail label="Verification status" value={verify.source === "mock" ? "Verified against mock data (not GPSPlatform)" : "Verified by GPSPlatform"} />
              <div className="min-w-0">
                <dt className="text-[12.5px] text-muted">Status</dt>
                <dd className="mt-0.5">
                  {d.status ? (
                    <span className={cn("inline-block rounded-full px-2.5 py-0.5 text-[13.5px] font-semibold", deviceStatusStyle[d.status])}>{d.status}</span>
                  ) : (
                    <span className="text-[14.5px] text-muted">Not provided</span>
                  )}
                </dd>
              </div>
              <Detail label="Name" value={d.name} />
              <Detail label="IMEI" value={d.imei} />
              <Detail label="Vehicle Plate Number" value={d.vehiclePlate} />
              <Detail label="Model" value={d.model} />
              <Detail label="SIM Card" value={d.simCard} />
              <Detail label="Last Update" value={d.lastSeen} />
              <Detail label="Activated Date" value={d.activationDate} />
              <Detail label="Platform Expiration Date" value={d.expirationDate} />
              {d.account && <Detail label="GPS account" value={d.account} />}
              {d.contact?.name && <Detail label="Contact name" value={d.contact.name} />}
              {!hosting && d.contact?.phone && <Detail label="Contact phone" value={d.contact.phone} />}
              {!hosting && d.contact?.email && <Detail label="Contact email" value={d.contact.email} />}
            </dl>
          </div>
        )}
      </FormSection>

      <form onSubmit={submit} noValidate className="flex flex-col gap-5">
        <fieldset disabled={!verified} className={cn("m-0 flex min-w-0 flex-col gap-5 border-0 p-0", !verified && "opacity-60")}>
          {!verified && <p className="text-[14px] text-muted">Verify the IMEI to continue with the sale.</p>}

          <FormSection n={2} title="Customer">
            {hosting ? (
              <SearchableSelect id="sale-customer" name="customer" label="CRM customer" value={draft.customerId} error={errors.customer}
                options={customerOptions} searchPlaceholder="Search by name, account, phone, email or location" emptyText="No customers match your search"
                filter={customerMatches}
                onChange={(v) => { set("customerId", v, "customer"); setDraft((x) => ({ ...x, customerLink: "manual" })); }} />
            ) : (
              <SelectField id="sale-customer" name="customer" label="CRM customer" value={draft.customerId} error={errors.customer}
                options={customerOptions}
                onChange={(v) => { set("customerId", v, "customer"); setDraft((x) => ({ ...x, customerLink: "manual" })); }} />
            )}
            {match?.kind === "matched" && (
              <p className="text-[14px] text-muted">
                {draft.customerLink === "automatic"
                  ? `Linked automatically: ${match.name} matched the GPSPlatform contact by ${match.by}.`
                  : `GPSPlatform contact matched ${match.name} by ${match.by}, but you selected a different customer.`}
              </p>
            )}
            {match?.kind === "ambiguous" && <p className="text-[14px] text-muted">The GPSPlatform contact details match more than one CRM customer, so none was linked. Select the right one.</p>}
            {match?.kind === "none" && <p className="text-[14px] text-muted">No CRM customer reliably matches the GPSPlatform contact details. Select an existing customer.</p>}
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

          <FormSection n={3} title="Package">
            <div className="grid items-start gap-4 sm:grid-cols-2">
              {hosting ? (
                <ReadOnlyField id="sale-package" label="Package" value={hostingPackage?.name} error={errors.package}
                  empty="Hosting package missing" />
              ) : (
                <SelectField id="sale-package" name="package" label="Package" value={draft.packageId} error={errors.package}
                  options={packages.map((p) => ({ value: p.id, label: p.name }))}
                  onChange={(v) => set("packageId", v, "package")} />
              )}
              <TextField id="sale-price" name="price" label="Package price (KES)" value={draft.price} inputMode="decimal" placeholder="0.00"
                error={errors.price}
                onChange={(v) => set("price", sanitizeNumberInput(v), "price", "paid")} onBlur={() => blur("price", draft.price.trim().length > 0)} />
            </div>
          </FormSection>

          <FormSection n={4} title="Sale items">
            {!hosting && (
              <fieldset className="grid gap-4 rounded-xl border border-line p-4 sm:grid-cols-2">
                <legend className="px-1 text-[13px] font-semibold text-muted">Line 1 — GPS Tracker</legend>
                <SelectField id="sale-product" name="product" label="Model" value={draft.productId} error={errors.product}
                  disabled={!trackerCat} options={modelOptions} onChange={(v) => set("productId", v, "product")} />
              </fieldset>
            )}

            <fieldset className="grid gap-4 rounded-xl border border-line p-4 sm:grid-cols-3">
              <legend className="px-1 text-[13px] font-semibold text-muted">Line {hosting ? 1 : 2} — Platform licence or card</legend>
              <SelectField id="sale-platform" name="platform" label="Platform" value={draft.platformId} error={errors.platform}
                options={platforms.map((p) => ({ value: p.id, label: p.name }))}
                onChange={(v) => { set("platformId", v, "platform", "cardType"); setDraft((x) => ({ ...x, cardType: "" })); }} />
              <SelectField id="sale-cardType" name="cardType" label="Card type" value={draft.cardType} error={errors.cardType}
                disabled={!draft.platformId} options={(platform?.licenceTypes ?? []).map((t) => ({ value: t, label: t }))}
                onChange={(v) => set("cardType", v, "cardType")} />
              <SelectField id="sale-deduction" name="deduction" label={hosting ? "Deduction quantity (optional)" : "Deduction quantity"} value={draft.deduction} error={errors.deduction}
                placeholder={hosting ? "None" : undefined} options={deductionOptions} onChange={(v) => set("deduction", v, "deduction")} />
            </fieldset>

            <fieldset className="grid gap-4 rounded-xl border border-line p-4 sm:grid-cols-2">
              <legend className="px-1 text-[13px] font-semibold text-muted">Line {hosting ? 2 : 3} — SIM card</legend>
              <SelectField id="sale-sim" name="sim" label="SIM card" value={draft.simId} error={errors.sim}
                options={simCards.map((s) => ({ value: s.id, label: s.name }))} onChange={(v) => { set("simId", v, "sim", "deductSim"); if (!v) setDraft((x) => ({ ...x, deductSim: false })); }} />
              <ReadOnlyField id="sale-sim-number" label="SIM card number"
                value={draft.simId && verify.status === "ok" ? verify.device.simCard : undefined}
                empty={draft.simId ? "Not provided" : "Select a SIM card first"} />
              <div className="flex flex-col gap-1 sm:col-span-2">
                <label className={cn("inline-flex min-h-11 items-center gap-2.5 text-[14.5px]", !draft.simId && "text-muted")}>
                  <input type="checkbox" id="sale-deduct-sim" data-field="deductSim" checked={draft.deductSim} disabled={!draft.simId}
                    onChange={(e) => set("deductSim", e.target.checked, "deductSim")} className="size-4 accent-brand" />
                  Deduct this SIM card from inventory
                  {draft.simId && <span className="text-[13px] text-muted">(in stock: {stockOf("SIM Card", draft.simId).quantity})</span>}
                </label>
                {errors.deductSim && <p id="sale-deduct-sim-err" className="text-[13px] text-[#C62828]">{errors.deductSim}</p>}
              </div>
            </fieldset>
          </FormSection>

          <FormSection n={5} title="Technician and expenses">
            <div className="grid gap-4 sm:grid-cols-2">
              <SelectField id="sale-technician" name="technician" placeholder="None" label="Technician (optional)" value={draft.technicianId} error={errors.technician} className="sm:col-span-2"
                options={sampleTechnicians.map((t) => ({ value: t.id, label: `${t.name} (${t.location})` }))} onChange={(v) => set("technicianId", v, "technician")} />
              {(["installation", "transport", "commission"] as const).map((k) => (
                <TextField key={k} id={`sale-${k}`} name={k} label={`${k[0].toUpperCase()}${k.slice(1)} (KES)`} value={draft[k]} inputMode="decimal"
                  placeholder="0.00" error={errors[k]} onChange={(v) => set(k, sanitizeNumberInput(v), k)} onBlur={() => blur(k, draft[k].trim().length > 0)} />
              ))}
            </div>

            <div className="flex flex-col gap-3">
              <h3 className="text-[14px] font-semibold">Other expenses</h3>
              {draft.otherExpenses.map((row) => (
                <div key={row.key} className="grid items-start gap-3 sm:grid-cols-[1fr_200px_auto]">
                  <TextField id={`sale-other-${row.key}-description`} name={`other-${row.key}-description`} label="Expense" value={row.description} placeholder="What was it for?"
                    error={errors[`other-${row.key}-description`]} onChange={(v) => setExpense(row.key, "description", stripControlChars(v))} />
                  <TextField id={`sale-other-${row.key}-amount`} name={`other-${row.key}-amount`} label="Amount (KES)" value={row.amount} inputMode="decimal" placeholder="0.00"
                    error={errors[`other-${row.key}-amount`]} onChange={(v) => setExpense(row.key, "amount", sanitizeNumberInput(v))} />
                  <button type="button" onClick={() => removeExpense(row.key)} aria-label="Remove expense"
                    className="grid size-11 place-items-center rounded-xl border border-line text-muted hover:bg-canvas sm:mt-6.5">
                    <Trash2 size={17} aria-hidden="true" />
                  </button>
                </div>
              ))}
              <div>
                <button type="button" onClick={addExpense} disabled={draft.otherExpenses.length >= MAX_OTHER_EXPENSES}
                  className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line px-4 text-[15px] font-semibold hover:bg-canvas disabled:opacity-50">
                  <Plus size={17} aria-hidden="true" />
                  Add expense
                </button>
              </div>
            </div>
          </FormSection>

          <FormSection n={6} title="Payment">
            <p className="rounded-xl bg-canvas px-4 py-3 text-[14px] text-muted">
              <span className="font-semibold text-ink">Pricing rule:</span> the sale total is the package price you enter. {hosting ? "The platform licence and SIM card" : "The tracker, platform licence and SIM card"}
              {" "}are included in the package and are not charged again. Installation, transport, commission and other expenses are costs of the sale; they are recorded
              but not added to the total.
            </p>
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-3">
              <Detail label="Package price" value={totalMinor !== undefined ? formatKes(totalMinor) : "—"} />
              <Detail label="Sale total" value={totalMinor !== undefined ? formatKes(totalMinor) : "—"} />
              <Detail label="Expenses recorded (not in total)" value={expensesTotal !== undefined ? formatKes(expensesTotal) : "—"} />
            </dl>
            <div className="flex flex-col gap-3 rounded-xl border border-line p-4" aria-live="polite">
              <h3 className="text-[14px] font-semibold">Profit</h3>
              <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-3 lg:grid-cols-5">
                <Detail label="Sale total" value={totalMinor !== undefined ? formatKes(totalMinor) : undefined} />
                {!hosting && <Detail label="Tracker cost" value={profit ? formatKes(profit.costMinor.tracker) : undefined} />}
                <Detail label="SIM card cost" value={profit ? formatKes(profit.costMinor.sim) : undefined} />
                <Detail label="Platform licence cost" value={profit ? formatKes(profit.costMinor.licence) : undefined} />
                <Detail label="Expenses" value={profit ? formatKes(profit.expensesMinor) : undefined} />
              </dl>
              <div className="flex flex-wrap items-baseline gap-x-3">
                <span className="text-[13.5px] font-medium">Profit</span>
                <output id="sale-profit" className={cn("text-[20px] font-semibold tabular-nums", profit && profit.profitMinor < 0 ? "text-[#B71C1C]" : "text-[#1B5E20]")}>
                  {profit ? formatSigned(profit.profitMinor) : <span className="text-muted">—</span>}
                </output>
              </div>
              {profit && profit.costMissing.length > 0 && (
                <p className="text-[13px] text-[#9a3300]">
                  No buying price yet for the {profit.costMissing.join(", ")}. Receive a purchase for it in Purchases; until then its cost is not counted.
                </p>
              )}
              {!profit && <p className="text-[13px] text-muted">{hosting ? "Enter the package price and choose the platform, card type and SIM card to see the profit." : "Enter the package price and choose the tracker, platform, deduction and SIM card to see the profit."}</p>}
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <TextField id="sale-paid" name="paid" label="Amount paid (KES)" value={draft.paid} inputMode="decimal" placeholder="0.00" error={errors.paid}
                onChange={(v) => set("paid", sanitizeNumberInput(v), "paid")} onBlur={() => blur("paid", draft.paid.trim().length > 0)} />
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

          <FormSection n={7} title="Notes">
            <Field id="sale-notes" label="Notes (optional)" error={errors.notes}>
              <textarea id="sale-notes" data-field="notes" rows={3} spellCheck={false} placeholder="Optional notes" value={draft.notes}
                onChange={(e) => set("notes", sanitizeNotes(e.target.value), "notes")} onBlur={() => blur("notes", draft.notes.length > 0)}
                aria-invalid={errors.notes ? true : undefined} aria-describedby={errors.notes ? "sale-notes-err" : undefined}
                className={cn(controlClass, "py-2.5", errors.notes ? "border-[#C62828]" : "border-line")} />
            </Field>
            <p className="text-[12.5px] text-muted">{draft.notes.length}/{MAX_NOTES}</p>
          </FormSection>
        </fieldset>

        <div className="flex justify-end">
          <button type="submit" disabled={!verified}
            className="min-h-12 rounded-xl bg-brand px-8 text-[16px] font-semibold text-white hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50">
            Complete Sale
          </button>
        </div>
      </form>
    </div>
  );
}
