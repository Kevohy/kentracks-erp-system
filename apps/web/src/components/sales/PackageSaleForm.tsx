"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { CheckCircle2, History, Loader2, Plus, ShieldCheck, Trash2, TriangleAlert } from "lucide-react";
import { Card } from "@/components/dashboard/Card";
import { useInventory } from "@/components/inventory/InventoryProvider";
import { cn } from "@/lib/cn";
import { useCrmLookups } from "@/components/crm/useCrmLookups";
import { useCrmList } from "@/components/crm/useCrmList";
import { AddCustomerDialog } from "@/components/customers/AddCustomerDialog";
import { crmApi } from "@/lib/crm-api";
import type { Customer } from "@/lib/customers";
import { erpApi, newClientKey } from "@/lib/erp-api";
import { MOCK_IMEIS, sanitizeImeiInput, validateImei, type GpsDevice, type GpsSource } from "@/lib/gps-platform";
import { MAX_NOTES, parseMoney } from "@/lib/purchase-validation";
import { formatKes, formatSigned, paymentState } from "@/lib/sales-format";
import { matchCustomer, saleTotalMinor, type PackageSale } from "@/lib/sales";
import { MAX_OTHER_EXPENSES, NEW_CARD, SALE_CARD_TYPES, airtimeAllowed, deductionsFor, hostingPackageOf, isIotSim, parseDeduction, saleProfit, sanitizeNotes, sanitizeNumberInput, trackerCategory, validatePackageSale, oldSaleDateOf, type PackageSaleDraft, type SaleErrors } from "@/lib/sale-validation";
import { stripControlChars } from "@/lib/validation";
import { todayInNairobi } from "@/lib/billing";
import { Detail, Field, FormSection, ReadOnlyField, SelectField, TextField, controlClass } from "./fields";
import { customerMatchesIn, customerOptionsOf } from "@/lib/customer-search";
import { simLabel } from "@/lib/inventory";
import { LoadGate, notReady } from "./LoadGate";
import { DeviceCustomerPrompt } from "./DeviceCustomerPrompt";
import { SearchableSelect } from "./SearchableSelect";
import { useSales } from "./SalesProvider";

type Verify =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ok"; device: GpsDevice; missing: string[]; source: GpsSource };

type Match = { kind: "matched"; name: string; by: string } | { kind: "created"; name: string } | { kind: "ambiguous" } | { kind: "none" } | null;

const blankDraft: PackageSaleDraft = {
  customerId: "", customerLink: "manual", packageId: "", productId: "", platformId: "", cardType: "",
  deduction: "", simId: "", technicianId: "", installation: "", transport: "", commission: "", price: "", paid: "0", notes: "", deductSim: true, smsReminder: false, autoRecharge: false, otherExpenses: [],
  oldSale: false, saleDate: "",
};

/** The only deduction quantities allowed. */

/** The GPS platform that verified the IMEI ("Kentracks", "iTrack"), for messages. */
const platformOf = (v: { status: string; device?: GpsDevice }) => (v.status === "ok" && v.device?.platform) || "The GPS platform";

const deviceStatusStyle = { Online: "bg-[#E6F4EA] text-[#1B5E20]", Offline: "bg-[#EEF1F4] text-[#4A5560]", Expired: "bg-[#FDECEA] text-[#B71C1C]" } as const;

const statusStyle = { "Paid in full": "bg-[#E6F4EA] text-[#1B5E20]", "Partly paid": "bg-[#FFF4E5] text-[#9a3300]", Unpaid: "bg-[#FDECEA] text-[#B71C1C]" } as const;

/** " (in stock: 12)" or " — out of stock", shown after an item name in a dropdown. */
export const stockNote = (n: number, unit = "") => (n > 0 ? ` (${unit ? `${n} ${unit}` : `in stock: ${n}`}${unit ? " in stock" : ""})` : " — out of stock");

export function PackageSaleForm({ kind = "Package Sale" }: { kind?: "Package Sale" | "Hosting Sale" }) {
  const hosting = kind === "Hosting Sale";
  const { load: inventoryLoad, reload: reloadInventory, categories, products, platforms, simCards, stockOf, refreshStock } = useInventory();
  const { load: salesLoad, reload: reloadSales, packages, saveSale } = useSales();
  const { state: crm, retry: retryCrm } = useCrmLookups({ customers: true, technicians: true });
  // Customers added from this form (the lookup list is only read when the form opens).
  const [added, setAdded] = useState<Customer[]>([]);
  const crmCustomers = crm.status === "ready" ? crm.customers : [];
  const customers = added.length ? [...added.filter((a) => !crmCustomers.some((c) => c.id === a.id)), ...crmCustomers] : crmCustomers;
  const { state: brandState } = useCrmList(crmApi.brands.list);
  const brands = brandState.status === "ready" ? brandState.items : [];
  const [promptOpen, setPromptOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const technicians = crm.status === "ready" ? crm.technicians : [];
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");

  const [imei, setImei] = useState("");
  const [verify, setVerify] = useState<Verify>({ status: "idle" });
  const [match, setMatch] = useState<Match>(null);
  const [draft, setDraft] = useState<PackageSaleDraft>(blankDraft);
  const [errors, setErrors] = useState<SaleErrors>({});
  const [saved, setSaved] = useState<PackageSale | null>(null);

  // How the server verifies IMEIs for this company: its GPS platforms (Settings → GPS Platforms), the dev mock, or not at all.
  const [gpsMode, setGpsMode] = useState<"live" | "mock" | "none" | null>(null);
  useEffect(() => {
    let live = true;
    void erpApi.gps.mode().then((r) => live && r.ok && setGpsMode(r.data.mode));
    return () => {
      live = false;
    };
  }, []);

  const requestId = useRef(0);
  const submitted = useRef(false);
  const saleKey = useRef<string | null>(null);
  const seq = useRef(0);
  const rootRef = useRef<HTMLDivElement>(null);

  const verified = verify.status === "ok" ? { device: verify.device, source: verify.source } : null;
  const today = todayInNairobi();
  const ctx = { kind, verified, customers, packages, categories, products, platforms, simCards, technicians, stockOf, today };
  const old = !!draft.oldSale;
  // An old sale is dated on the IMEI's activation date from GPSPlatform.
  const activationDate = verify.status === "ok" ? oldSaleDateOf(verify.device) : null;
  const longActivation = activationDate ? new Date(`${activationDate}T00:00:00Z`).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "";

  const clear = (...keys: string[]) =>
    setErrors((p) => (keys.some((k) => p[k]) ? Object.fromEntries(Object.entries(p).filter(([k]) => !keys.includes(k))) : p));

  // ------------------------------------------------------------------ verify

  function changeImei(v: string) {
    requestId.current++; // a response still in flight is for the old number and must be ignored
    setImei(sanitizeImeiInput(v));
    if (verify.status !== "idle") {
      setVerify({ status: "idle" });
      setMatch(null);
      setPromptOpen(false);
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
    // The number is checked here first; the GPS platform is asked on the server, which holds the account secrets.
    const v = validateImei(imei);
    const res = v.error ? null : await erpApi.gps.verify(v.value);
    if (id !== requestId.current) return;
    const out = v.error
      ? ({ ok: false, code: "invalid-imei", message: v.error } as const)
      : res!.ok
        ? res!.data
        : ({ ok: false, code: "api-error", message: res!.message } as const);
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
    const m = hosting ? null : matchCustomer(out.device.contact, customers, out.device.account);
    if (!m) {
      // leave any customer the user already chose
    } else if (m.status === "matched") {
      setDraft((d) => ({ ...d, customerId: m.customer.id, customerLink: "automatic" }));
      setMatch({ kind: "matched", name: m.customer.name, by: m.by });
    } else {
      setDraft((d) => ({ ...d, customerId: "", customerLink: "manual" }));
      setMatch({ kind: m.status });
      // The device's contact is not in the CRM: ask whether to add them or pick an existing customer.
      if (m.status === "none" && (out.device.contact || out.device.account)) setPromptOpen(true);
    }
    clear("imei", "customer");
  }

  function chooseExisting() {
    setPromptOpen(false);
    setTimeout(() => {
      const el = document.getElementById("sale-customer");
      el?.scrollIntoView({ block: "center", behavior: "smooth" });
      el?.focus();
    }, 50);
  }

  function addNewCustomer() {
    setPromptOpen(false);
    setAddOpen(true);
  }

  // The device contact as starting values for the new customer.
  const deviceContact = verify.status === "ok" ? verify.device.contact : undefined;
  const addInitial = (() => {
    const [first = "", ...rest] = (deviceContact?.name ?? "").trim().split(/\s+/);
    const account = verify.status === "ok" ? (verify.device.account ?? "").replace(/\s+/g, "") : "";
    // The owner's role on the GPS platform picks the customer type (a virtual account is treated as an end user).
    const type = verify.status === "ok" && verify.device.accountType === "Distributor" ? ("Distributor" as const) : ("End User" as const);
    return { type, values: { firstName: first, lastName: rest.join(" "), account, phone: deviceContact?.phone ?? "", email: deviceContact?.email ?? "" } };
  })();

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

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (submitted.current) return; // already saving or saved: a second click or Enter must not add another sale
    const { errors: found, result } = validatePackageSale(draft, ctx);
    setErrors(found);
    if (!result) {
      const els = Array.from(rootRef.current?.querySelectorAll<HTMLElement>("[data-field]") ?? []);
      els.find((el) => found[el.dataset.field ?? ""])?.focus();
      return;
    }
    submitted.current = true;
    setBusy(true);
    setFormError("");
    // One key per sale form: sending it again (retry after a timeout) returns the sale already saved.
    saleKey.current ??= newClientKey();
    const key = saleKey.current;
    // The server verifies the IMEI again and works out the total, costs and profit itself.
    const r = await saveSale(() => erpApi.sales.createPackage(kind, imei, draft, key));
    setBusy(false);
    if (!r.ok) {
      submitted.current = false;
      setErrors(r.fieldErrors);
      setFormError(r.message);
      const els = Array.from(rootRef.current?.querySelectorAll<HTMLElement>("[data-field]") ?? []);
      els.find((el) => r.fieldErrors[el.dataset.field ?? ""])?.focus();
      return;
    }
    if (!draft.oldSale) void refreshStock(); // the tracker (and SIM, if chosen) left inventory
    setSaved(r.data as PackageSale);
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

  const customer = customers.find((c) => c.id === draft.customerId);
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
          platformPriceMinor: stockOf("Platform", platform.id, draft.cardType).latestPriceMinor,
          deduction: deductionValue ?? 0,
          expensesMinor: expensesTotal,
        })
      : undefined;
  const modelOptions = products
    .filter((p) => p.categoryId === trackerCat?.id)
    .map((p) => {
      const n = stockOf("Product", p.id).quantity;
      return { value: p.id, label: n > 0 ? `${p.model} (in stock: ${n})` : `${p.model} — out of stock` };
    });

  const gate = [inventoryLoad, salesLoad, crm];
  if (notReady(gate)) {
    return <LoadGate states={gate} retry={() => { reloadInventory(); reloadSales(); retryCrm(); }} />;
  }

  // ------------------------------------------------------------- confirmation

  if (saved) {
    const st = paymentState(saved);
    return (
      <Card className="flex flex-col gap-4 px-5 py-6 sm:px-6">
        <div role="status" className="flex items-start gap-3">
          <CheckCircle2 size={26} className="mt-0.5 shrink-0 text-[#1B5E20]" aria-hidden="true" />
          <div>
            <h2 className="text-lg font-semibold">{saved.oldSale ? "Old sale recorded" : "Sale completed"}</h2>
            <p className="text-[14.5px] text-muted">
              {saved.oldSale
                ? "Saved to the Sales list for tracking. Nothing was taken from inventory, and it is not counted in revenue or profit."
                : "Saved to the Sales list."}
            </p>
          </div>
        </div>
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
          <Detail label="Customer" value={saved.customerName} />
          <Detail label="Vehicle number plate" value={saved.vehiclePlate} />
          <Detail label="IMEI" value={saved.imei} />
          <Detail label="Package" value={saved.packageName} />
          {saved.licence.renewalFeeMinor != null && <Detail label="Renewal fee" value={formatKes(saved.licence.renewalFeeMinor)} />}
          {saved.licence.expirationDate && <Detail label="Platform expiration date" value={saved.licence.expirationDate} />}
          <Detail label="SIM card" value={(saved.sim.number ? `${saved.sim.name} — ${saved.sim.number}` : saved.sim.name) + (saved.sim.deducted ? " (deducted from stock)" : "")} />
          {saved.sim.iotBilling && <Detail label="Billing" value="Added to Billing → IoT SIM" />}
          {(saved.sim.smsReminder || saved.sim.autoRecharge) && (
            <Detail label="Airtime service" value={[saved.sim.smsReminder && "Monthly airtime alert (SMS)", saved.sim.autoRecharge && "Automatic airtime recharge"].filter(Boolean).join(", ")} />
          )}
          {saved.oldSale ? (
            <Detail label="Original sale date" value={new Date(saved.createdAt).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Nairobi" })} />
          ) : (
            <>
              <Detail label="Total" value={formatKes(saved.totalMinor)} />
              <Detail label="Amount paid" value={formatKes(saved.paidMinor)} />
              <Detail label="Outstanding balance" value={formatKes(saved.totalMinor - saved.paidMinor)} />
              <Detail label="Payment status" value={st} />
              <Detail label="Profit" value={formatSigned(saved.profitMinor)} />
            </>
          )}
          <Detail label="IMEI verification" value={saved.verificationSource === "mock" ? "Mock data (not confirmed by a GPS platform)" : (saved.verificationPlatform ?? "Kentracks")} />
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
      <Card className={cn("flex flex-col gap-3 px-4 py-4 sm:px-6", old && "border-[#9DB9D0] bg-tint/60")}>
        <label className="flex min-h-11 cursor-pointer items-center gap-3">
          <input type="checkbox" id="sale-old" data-field="oldSale" checked={old}
            onChange={(e) => { const on = e.target.checked; setDraft((x) => ({ ...x, oldSale: on, saleDate: on ? x.saleDate : "" })); clear("saleDate", "price", "paid", "deduction", "product", "sim"); }}
            className="size-5 shrink-0 accent-brand" />
          <span className="flex items-center gap-2 text-[15.5px] font-semibold"><History size={17} className="text-navy" aria-hidden="true" />Old sale (record only)</span>
        </label>
        {old && (
          activationDate ? (
            <ReadOnlyField id="sale-date" label="Original sale date (IMEI activation date)" value={longActivation} empty="" error={errors.saleDate} className="sm:max-w-sm" />
          ) : verify.status === "ok" ? (
            <div className="grid gap-3 sm:grid-cols-[minmax(0,240px)_1fr] sm:items-end">
              <Field id="sale-date" label="Original sale date" error={errors.saleDate}>
                <input id="sale-date" type="date" data-field="saleDate" max={today} min="2000-01-01" value={draft.saleDate ?? ""}
                  onChange={(e) => set("saleDate", e.target.value, "saleDate")}
                  aria-invalid={errors.saleDate ? true : undefined} aria-describedby={errors.saleDate ? "sale-date-err" : "sale-date-hint"}
                  className={cn(controlClass, errors.saleDate ? "border-[#C62828]" : "border-line")} />
              </Field>
              <p id="sale-date-hint" className="text-[13px] text-muted sm:pb-3">{platformOf(verify)} has no activation date for this IMEI, so enter the date it was sold.</p>
            </div>
          ) : (
            <p className="text-[13.5px] text-muted">The original sale date is taken from the IMEI activation date once you verify the IMEI.</p>
          )
        )}
      </Card>
      <FormSection n={1} title="Verify IMEI">
        {gpsMode === "mock" && (
          <div className="rounded-xl border border-[#F0C98C] bg-[#FFF8EC] px-4 py-3 text-[14px] text-[#6b3a00]">
            <p className="font-semibold">Test mode: no GPS platform account is added yet.</p>
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

        {gpsMode === "none" && (
          <div className="rounded-xl border border-[#F0C98C] bg-[#FFF8EC] px-4 py-3 text-[14px] text-[#6b3a00]">
            <p className="font-semibold">No GPS platform is connected.</p>
            <p>
              Add your Kentracks or iTrack API account in <Link href="/settings/gps-platforms" className="font-semibold underline">Settings → GPS Platforms</Link> to verify IMEIs. A {kind} cannot be completed until then.
            </p>
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
            {d.accountBlocked && (
              <p role="status" className="rounded-xl border border-[#F2B8B5] bg-[#FDECEA] px-4 py-3 text-[14px] text-[#9e241a]">
                The customer account {d.account ? <span className="font-semibold">{d.account}</span> : "of this device"} is blocked on {platformOf(verify)}.
              </p>
            )}
            {verify.missing.length > 0 && (
              <p className="rounded-xl border border-[#F0C98C] bg-[#FFF8EC] px-4 py-3 text-[14px] text-[#6b3a00]">
                The response was incomplete. Not provided: {verify.missing.join(", ")}.
              </p>
            )}
            <dl className="grid gap-x-6 gap-y-3 rounded-xl bg-canvas p-4 sm:grid-cols-2 lg:grid-cols-3">
              <Detail label="Verification status" value={verify.source === "mock" ? "Verified against mock data (not a GPS platform)" : `Verified by ${platformOf(verify)}`} />
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
              {(d.lastSeen || verify.source === "mock") && <Detail label="Last Update" value={d.lastSeen} />}
              <Detail label="Activated Date" value={d.activationDate} />
              <Detail label="Platform Expiration Date" value={d.expirationDate} />
              {d.userExpirationDate && <Detail label="User Expiration Date" value={d.userExpirationDate} />}
              {d.account && <Detail label="Customer account" value={d.account} />}
              {d.accountType && <Detail label="Account type" value={d.accountType} />}
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
                options={customerOptionsOf(customers)} searchPlaceholder="Search by name, account, phone, email or location" emptyText="No customers match your search"
                filter={customerMatchesIn(customers)}
                onChange={(v) => { set("customerId", v, "customer"); setDraft((x) => ({ ...x, customerLink: "manual" })); }} />
            ) : (
              <SelectField id="sale-customer" name="customer" label="CRM customer" value={draft.customerId} error={errors.customer}
                options={customerOptionsOf(customers)}
                onChange={(v) => { set("customerId", v, "customer"); setDraft((x) => ({ ...x, customerLink: "manual" })); }} />
            )}
            {match?.kind === "matched" && (
              <p className="text-[14px] text-muted">
                {draft.customerLink === "automatic"
                  ? `Linked automatically: ${match.name} matches the device by ${match.by}.`
                  : `The device matches ${match.name} by ${match.by}, but you selected a different customer.`}
              </p>
            )}
            {match?.kind === "ambiguous" && <p className="text-[14px] text-muted">The device contact details match more than one CRM customer, so none was linked. Select the right one.</p>}
            {match?.kind === "created" && <p className="text-[14px] text-muted">{match.name} was added to the CRM from the device details and selected for this sale.</p>}
            {match?.kind === "none" && !draft.customerId && (
              <div className="flex flex-col gap-3 rounded-xl border border-line p-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-[14px] text-muted">No CRM customer matches the device&apos;s customer account or contact details.</p>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={addNewCustomer} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-brand px-4 text-[14.5px] font-semibold text-white hover:brightness-95">
                    <Plus size={16} aria-hidden="true" />
                    Add new customer
                  </button>
                  <button type="button" onClick={chooseExisting} className="min-h-11 rounded-xl border border-line px-4 text-[14.5px] font-semibold hover:bg-canvas">
                    Choose existing
                  </button>
                </div>
              </div>
            )}
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
              {!old && (
                <TextField id="sale-price" name="price" label="Package price (KES)" value={draft.price} inputMode="decimal" placeholder="0.00"
                  error={errors.price}
                  onChange={(v) => set("price", sanitizeNumberInput(v), "price", "paid")} onBlur={() => blur("price", draft.price.trim().length > 0)} />
              )}
            </div>
          </FormSection>

          <FormSection n={4} title="Sale items">
            {!hosting && (
              <fieldset className="grid gap-4 rounded-xl border border-line p-4 sm:grid-cols-2">
                <legend className="px-1 text-[13px] font-semibold text-muted">Line 1 — GPS Tracker</legend>
                <SelectField id="sale-product" name="product" label="Model" value={draft.productId} error={errors.product}
                  disabled={!trackerCat} options={modelOptions} onChange={(v) => set("productId", v, "product")} />
                {!trackerCat && <p className="text-[14px] text-muted sm:col-span-2">No GPS tracker category found. Add a product category named &quot;GPS Trackers&quot; in Inventory → Products and add your tracker models to it.</p>}
                {trackerCat && modelOptions.length === 0 && <p className="text-[14px] text-muted sm:col-span-2">No models in &quot;{trackerCat.name}&quot; yet. Add them in Inventory → Products.</p>}
              </fieldset>
            )}

            <fieldset className="grid gap-4 rounded-xl border border-line p-4 sm:grid-cols-3">
              <legend className="px-1 text-[13px] font-semibold text-muted">Line {hosting ? 1 : 2} — Platform licence or card</legend>
              <SelectField id="sale-platform" name="platform" label="Platform" value={draft.platformId} error={errors.platform}
                options={platforms.map((p) => ({ value: p.id, label: p.name }))}
                onChange={(v) => { set("platformId", v, "platform", "cardType", "deduction"); setDraft((x) => ({ ...x, cardType: "", deduction: "", renewalFee: "" })); }} />
              <SelectField id="sale-cardType" name="cardType" label="Card type" value={draft.cardType} error={errors.cardType}
                disabled={!draft.platformId}
                options={SALE_CARD_TYPES.filter((t) => platform?.licenceTypes.includes(t)).map((t) => {
                  const n = platform ? stockOf("Platform", platform.id, t).quantity : 0;
                  return { value: t, label: n > 0 ? `${t} (${n} in stock)` : `${t} — out of stock` };
                })}
                onChange={(v) => { set("cardType", v, "cardType", "renewalFee", "deduction"); setDraft((x) => ({ ...x, renewalFee: "", deduction: "" })); }} />
              {!old && (
                <SelectField id="sale-deduction" name="deduction" label="Deduction quantity" value={draft.deduction} error={errors.deduction}
                  disabled={!draft.cardType} placeholder={draft.cardType ? "Select…" : "Select a card type first"}
                  options={deductionsFor(draft.cardType).map((v) => ({ value: String(v), label: String(v) }))} onChange={(v) => set("deduction", v, "deduction")} />
              )}
              {draft.cardType === NEW_CARD && (
                <>
                  <ReadOnlyField id="sale-platform-expiry" label="Platform expiration date"
                    value={verify.status === "ok" ? verify.device.expirationDate : undefined} empty={`Not provided by ${platformOf(verify)}`} />
                  <TextField id="sale-renewal-fee" name="renewalFee" label="Renewal fee (KES)" value={draft.renewalFee ?? ""} error={errors.renewalFee}
                    placeholder="0.00" inputMode="decimal" hint="Charged when the licence expires; not added to this sale."
                    onChange={(v) => set("renewalFee", sanitizeNumberInput(v), "renewalFee")}
                    onBlur={() => blur("renewalFee", (draft.renewalFee ?? "").trim().length > 0)} />
                </>
              )}
            </fieldset>

            <fieldset className="grid gap-4 rounded-xl border border-line p-4 sm:grid-cols-2">
              <legend className="px-1 text-[13px] font-semibold text-muted">Line {hosting ? 2 : 3} — SIM card</legend>
              <SelectField id="sale-sim" name="sim" label="SIM card" value={draft.simId} error={errors.sim}
                options={simCards.map((s) => ({ value: s.id, label: simLabel(s.name, s.type) + stockNote(stockOf("SIM Card", s.id).quantity) }))} onChange={(v) => { set("simId", v, "sim"); setDraft((x) => ({ ...x, smsReminder: false, autoRecharge: false })); }} />
              <ReadOnlyField id="sale-sim-number" label="SIM card number"
                value={draft.simId && verify.status === "ok" ? verify.device.simCard : undefined}
                empty={draft.simId ? "Not provided" : "Select a SIM card first"} />
              {old ? (
                <p className="text-[13.5px] text-muted sm:col-span-2">Old sale: nothing is taken out of inventory.</p>
              ) : hosting ? (
                <div className="flex flex-col gap-1 sm:col-span-2">
                  <label className={cn("inline-flex min-h-11 items-center gap-2.5 text-[14.5px]", !draft.simId && "text-muted")}>
                    <input type="checkbox" id="sale-deduct-sim" data-field="deductSim" checked={draft.deductSim} disabled={!draft.simId}
                      onChange={(e) => set("deductSim", e.target.checked, "sim")} className="size-4 accent-brand" />
                    Deduct this SIM card from inventory
                    {draft.simId && <span className="text-[13px] text-muted">(in stock: {stockOf("SIM Card", draft.simId).quantity})</span>}
                  </label>
                  <p className="text-[13px] text-muted">Untick if the customer brings their own SIM card. The platform licence deduction is always taken from stock.</p>
                </div>
              ) : (
                <p className="text-[13.5px] text-muted sm:col-span-2">This SIM card, the tracker and the platform licence deduction are taken out of inventory when the sale is completed.</p>
              )}
              {chosenSim && isIotSim(chosenSim.type) && (old || draft.deductSim || !hosting ? (
                <p className="rounded-xl bg-tint px-3.5 py-3 text-[14px] text-navy sm:col-span-2">
                  This is an IoT SIM ({chosenSim.type}){old ? "" : " from stock"}. It will be added to <span className="font-semibold">Billing → IoT SIM</span> automatically when the sale is {old ? "recorded" : "completed"}.
                </p>
              ) : (
                <p className="rounded-xl bg-canvas px-3.5 py-3 text-[14px] text-muted sm:col-span-2">
                  Not deducted from inventory, so this IoT SIM will not be added to Billing → IoT SIM. Tick &quot;Deduct this SIM card from inventory&quot; to bill it.
                </p>
              ))}
              {chosenSim && airtimeAllowed(kind, chosenSim.type) && (
                <div className="flex flex-col gap-1 rounded-xl bg-canvas p-3.5 sm:col-span-2">
                  <p id="sale-sim-service-label" className="text-[13.5px] font-semibold">Airtime service (choose one)</p>
                  <div role="radiogroup" aria-labelledby="sale-sim-service-label" data-field="simService" className="flex flex-col">
                    {([
                      ["none", "None", ""],
                      ["sms", "Send the customer a monthly airtime alert (SMS)", "Monthly via Bulk SMS"],
                      ["recharge", "Add to automatic airtime recharge", "Needs approval"],
                    ] as const).map(([v, label, tag]) => {
                      const current = draft.smsReminder ? "sms" : draft.autoRecharge ? "recharge" : "none";
                      return (
                        <label key={v} className="inline-flex min-h-11 items-center gap-2.5 text-[14.5px]">
                          <input type="radio" name="sale-sim-service" value={v} checked={current === v}
                            onChange={() => { setDraft((x) => ({ ...x, smsReminder: v === "sms", autoRecharge: v === "recharge" })); clear("simService"); }}
                            className="size-4 accent-brand" />
                          {label}
                          {tag && <span className="rounded-full bg-white px-2 py-0.5 text-[12px] text-muted">{tag}</span>}
                        </label>
                      );
                    })}
                  </div>
                  {errors.simService && <p className="text-[13px] text-[#C62828]">{errors.simService}</p>}
                  <p className="text-[13px] text-muted">Your choice is saved with the sale. The SMS alert lists the line in Communication → Bulk SMS → Reminders straight away. Automatic airtime starts once the line is approved in Communication → Airtime → Approval.</p>
                </div>
              )}
            </fieldset>
          </FormSection>

          <FormSection n={5} title={old ? "Technician" : "Technician and expenses"}>
            <div className="grid gap-4 sm:grid-cols-2">
              <SelectField id="sale-technician" name="technician" placeholder="None" label="Technician (optional)" value={draft.technicianId} error={errors.technician} className="sm:col-span-2"
                options={technicians.map((t) => ({ value: t.id, label: `${t.name} (${t.location})` }))} onChange={(v) => set("technicianId", v, "technician")} />
              {!old && (["installation", "transport", "commission"] as const).map((k) => (
                <TextField key={k} id={`sale-${k}`} name={k} label={`${k[0].toUpperCase()}${k.slice(1)} (KES)`} value={draft[k]} inputMode="decimal"
                  placeholder="0.00" error={errors[k]} onChange={(v) => set(k, sanitizeNumberInput(v), k)} onBlur={() => blur(k, draft[k].trim().length > 0)} />
              ))}
            </div>

            {!old && <div className="flex flex-col gap-3">
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
            </div>}
          </FormSection>

          {!old && <FormSection n={6} title="Payment">
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
          </FormSection>}

          <FormSection n={old ? 6 : 7} title="Notes">
            <Field id="sale-notes" label="Notes (optional)" error={errors.notes}>
              <textarea id="sale-notes" data-field="notes" rows={3} spellCheck={false} placeholder="Optional notes" value={draft.notes}
                onChange={(e) => set("notes", sanitizeNotes(e.target.value), "notes")} onBlur={() => blur("notes", draft.notes.length > 0)}
                aria-invalid={errors.notes ? true : undefined} aria-describedby={errors.notes ? "sale-notes-err" : undefined}
                className={cn(controlClass, "py-2.5", errors.notes ? "border-[#C62828]" : "border-line")} />
            </Field>
            <p className="text-[12.5px] text-muted">{draft.notes.length}/{MAX_NOTES}</p>
          </FormSection>
        </fieldset>

        {formError && <p role="alert" className="text-[14px] text-[#C62828]">{formError}</p>}
        <div className="flex justify-end">
          <button type="submit" disabled={!verified || busy}
            className="min-h-12 rounded-xl bg-brand px-8 text-[16px] font-semibold text-white hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50">
            {busy ? (old ? "Saving…" : "Completing…") : old ? "Record Old Sale" : "Complete Sale"}
          </button>
        </div>
      </form>

      {!hosting && (
        <>
          <DeviceCustomerPrompt open={promptOpen} contact={deviceContact} account={verify.status === "ok" ? verify.device.account : undefined} accountType={verify.status === "ok" ? verify.device.accountType : undefined} onAddNew={addNewCustomer} onChooseExisting={chooseExisting} onClose={() => setPromptOpen(false)} />
          <AddCustomerDialog
            open={addOpen}
            onClose={() => setAddOpen(false)}
            brands={brands}
            initial={addInitial}
            onAdd={async (type, values) => {
              const r = await crmApi.customers.create(type, values);
              if (!r.ok) return r;
              setAdded((list) => [r.data, ...list]);
              setDraft((d) => ({ ...d, customerId: r.data.id, customerLink: "manual" }));
              setMatch({ kind: "created", name: r.data.name });
              clear("customer");
              return { ok: true };
            }}
          />
        </>
      )}
    </div>
  );
}
