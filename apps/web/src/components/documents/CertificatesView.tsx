"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, Car, CheckCircle2, Eye, FileBadge, Plus, Search } from "lucide-react";
import { Card } from "@/components/dashboard/Card";
import { SearchableSelect } from "@/components/sales/SearchableSelect";
import { SelectField, TextField } from "@/components/sales/fields";
import { PageHeader } from "@/components/shell/PageHeader";
import { cn } from "@/lib/cn";
import {
  CONTRACT_OPTIONS, contractLabel, longDate, normaliseChassis, normalisePlate, validUntilOf, validateCertificate,
  type Certificate, type CertificateCustomer, type CertificateDraft, type CertificateErrors, type CustomerVehicle,
} from "@/lib/certificates";
import type { Brand } from "@/lib/brands";
import { crmApi } from "@/lib/crm-api";
import { erpApi } from "@/lib/erp-api";
import { localPhone } from "@/lib/sms";
import { stripControlChars } from "@/lib/validation";
import { CertificateFrame } from "./CertificateFrame";
import type { CertificateView } from "./CertificateDocument";

const EMPTY: CertificateDraft = { customerId: "", saleId: "", vehicleReg: "", make: "", model: "", year: "", chassis: "", contract: "", brandId: "" };
const phoneText = (p: string) => (p.startsWith("+254") ? localPhone(p) : p);

type Load<T> = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; items: T };

function Step({ n, title, done, children }: { n: number; title: string; done?: boolean; children: React.ReactNode }) {
  return (
    <Card className="flex flex-col gap-4 px-4 py-5 sm:px-6">
      <h2 className="flex items-center gap-2.5 text-[17px] font-semibold">
        <span className={cn("flex size-7 items-center justify-center rounded-full text-[13px] font-bold", done ? "bg-[#E6F4EA] text-[#1B5E20]" : "bg-brand/10 text-brand")}>
          {done ? <CheckCircle2 size={16} aria-hidden="true" /> : n}
        </span>
        {title}
      </h2>
      {children}
    </Card>
  );
}

/** The certificate generator: customer → vehicle → vehicle details, contract and brand → preview → generate. */
function NewCertificate({ onCancel }: { onCancel: () => void }) {
  const router = useRouter();
  const [customers, setCustomers] = useState<Load<CertificateCustomer[]>>({ status: "loading" });
  const [brands, setBrands] = useState<Brand[]>([]);
  const [vehicles, setVehicles] = useState<Load<CustomerVehicle[]> | null>(null);
  const [d, setD] = useState<CertificateDraft>(EMPTY);
  const [errors, setErrors] = useState<CertificateErrors>({});
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const saving = useRef(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void erpApi.certificates.customers().then((r) => setCustomers(r.ok ? { status: "ready", items: r.data } : { status: "error", message: r.message }));
    void crmApi.brands.list().then((r) => r.ok && setBrands(r.data));
  }, []);

  const customerList = customers.status === "ready" ? customers.items : [];
  const customer = customerList.find((c) => c.id === d.customerId) ?? null;
  const vehicleList = vehicles?.status === "ready" ? vehicles.items : [];
  const vehicle = vehicleList.find((v) => v.saleId === d.saleId) ?? null;
  const brand = brands.find((b) => b.id === d.brandId) ?? null;

  function chooseCustomer(id: string) {
    const c = customerList.find((x) => x.id === id);
    // The brand comes from the customer (Kentracks or Protrack); it can still be changed below.
    setD({ ...EMPTY, customerId: id, brandId: c?.brandId ?? "" });
    setErrors({});
    setPreview(false);
    setVehicles(id ? { status: "loading" } : null);
    if (id) void erpApi.certificates.vehicles(id).then((r) => setVehicles(r.ok ? { status: "ready", items: r.data } : { status: "error", message: r.message }));
  }

  function chooseVehicle(v: CustomerVehicle) {
    // The registration is picked up from the sale of that IMEI.
    setD((x) => ({ ...x, saleId: v.saleId, vehicleReg: v.vehiclePlate ? normalisePlate(v.vehiclePlate) : x.vehicleReg }));
    setErrors((e) => ({ ...e, saleId: undefined, vehicleReg: undefined }));
    setPreview(false);
    setTimeout(() => root.current?.querySelector<HTMLElement>("#cert-make")?.focus(), 0);
  }

  const set = (k: keyof CertificateDraft, v: string) => {
    setD((x) => ({ ...x, [k]: stripControlChars(v) }));
    setErrors((e) => ({ ...e, [k]: undefined }));
    setPreview(false);
  };

  const checked = useMemo(() => validateCertificate(d), [d]);

  function showPreview(e: FormEvent) {
    e.preventDefault();
    setErrors(checked.errors);
    const first = (["customerId", "saleId", "vehicleReg", "make", "model", "year", "chassis", "contract", "brandId"] as const).find((k) => checked.errors[k]);
    if (first) return root.current?.querySelector<HTMLElement>(`[data-field="${first}"], #cert-${first}`)?.focus();
    setPreview(true);
    setTimeout(() => root.current?.querySelector("#cert-preview")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  }

  async function generate() {
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    setFormError("");
    const r = await erpApi.certificates.create(d);
    saving.current = false;
    setBusy(false);
    if (r.ok) return router.push(`/documents/certificates/${r.data.id}`);
    if (Object.keys(r.fieldErrors).length) {
      setErrors(r.fieldErrors as CertificateErrors);
      setPreview(false);
    }
    setFormError(r.message);
  }

  const view: CertificateView | null = preview && customer && vehicle && brand ? {
    number: null, verifyCode: null,
    customerName: customer.name, customerPhone: customer.phone, customerAccount: customer.account, customerEmail: customer.email, customerLocation: customer.location,
    platformName: vehicle.platformName, simName: vehicle.simName, imei: vehicle.imei, deviceModel: vehicle.deviceModel, simNumber: vehicle.simNumber, technicianName: vehicle.technicianName,
    vehicleReg: checked.value.vehicleReg, make: checked.value.make, model: checked.value.model, year: checked.value.year, chassis: checked.value.chassis,
    contractYears: checked.value.contractYears, installedOn: vehicle.installedOn, validUntil: validUntilOf(vehicle.installedOn, checked.value.contractYears),
    brand: { name: brand.name, tagline: brand.tagline, phone: brand.phone, email: brand.email, website: brand.website, location: brand.location, directorName: brand.directorName, logoUrl: brand.logoUrl, iconUrl: brand.iconUrl, signatureUrl: brand.signatureUrl, color: brand.color },
    issuedAt: new Date().toISOString(),
  } : null;

  const brandMissing = brand ? [!brand.iconUrl && "icon", !brand.directorName && "director name", !brand.signatureUrl && "signature"].filter(Boolean) as string[] : [];

  return (
    <div ref={root} className="flex flex-col gap-4">
      <form onSubmit={showPreview} noValidate className="flex flex-col gap-4">
        <Step n={1} title="Customer" done={!!customer}>
          {customers.status === "loading" && <p className="text-[14px] text-muted">Loading customers…</p>}
          {customers.status === "error" && <p role="alert" className="text-[14px] text-[#C62828]">{customers.message}</p>}
          {customers.status === "ready" && (customerList.length === 0 ? (
            <p className="text-[14px] text-muted">No customer has a tracked vehicle yet. Record a Package or Hosting sale first.</p>
          ) : (
            <SearchableSelect id="cert-customerId" name="customerId" label="Existing customer" value={d.customerId} onChange={chooseCustomer} error={errors.customerId}
              placeholder="Select a customer" searchPlaceholder="Search by name, account or phone"
              options={customerList.map((c) => ({ value: c.id, label: `${c.name} · ${c.account} · ${c.vehicles} vehicle${c.vehicles === 1 ? "" : "s"}` }))}
              filter={(o, q) => o.label.toLowerCase().includes(q) || (customerList.find((c) => c.id === o.value)?.phone ?? "").includes(q.replace(/\s/g, ""))} />
          ))}
        </Step>

        {customer && (
          <Step n={2} title="Vehicle" done={!!vehicle}>
            <p className="-mt-2 text-[14px] text-muted">Devices (IMEIs) linked to {customer.name}. Choose the vehicle the certificate is for.</p>
            {vehicles?.status === "loading" && <p className="text-[14px] text-muted">Loading vehicles…</p>}
            {vehicles?.status === "error" && <p role="alert" className="text-[14px] text-[#C62828]">{vehicles.message}</p>}
            {vehicles?.status === "ready" && (
              <div role="radiogroup" aria-label="Vehicle" data-field="saleId" tabIndex={-1} className="grid gap-2.5 sm:grid-cols-2">
                {vehicleList.map((v) => {
                  const on = v.saleId === d.saleId;
                  return (
                    <button key={v.saleId} type="button" role="radio" aria-checked={on} onClick={() => chooseVehicle(v)}
                      className={cn("flex items-start gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors", on ? "border-brand bg-brand/5 ring-2 ring-brand/30" : "border-line hover:bg-canvas")}>
                      <span className={cn("mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg", on ? "bg-brand text-white" : "bg-canvas text-muted")}><Car size={18} aria-hidden="true" /></span>
                      <span className="min-w-0">
                        <span className="block font-semibold">{v.vehiclePlate || "No registration on the sale"}</span>
                        <span className="block font-mono text-[13px] text-muted">IMEI {v.imei}</span>
                        <span className="block text-[12.5px] text-muted">{[v.deviceModel, v.packageName, `installed ${longDate(v.installedOn)}`].filter(Boolean).join(" · ")}</span>
                        {v.certificates > 0 && <span className="mt-1 inline-block rounded-full bg-tint px-2 py-0.5 text-[11.5px] font-semibold text-navy">{v.certificates} certificate{v.certificates === 1 ? "" : "s"} issued</span>}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
            {errors.saleId && <p role="alert" className="text-[13.5px] text-[#C62828]">{errors.saleId}</p>}
          </Step>
        )}

        {vehicle && (
          <Step n={3} title="Vehicle details, contract and brand">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <TextField id="cert-vehicleReg" label="Vehicle registration" value={d.vehicleReg} onChange={(v) => set("vehicleReg", v)} error={errors.vehicleReg}
                hint={vehicle.vehiclePlate ? "Picked up from the sale of this IMEI" : undefined} placeholder="e.g. KCD 123A" />
              <TextField id="cert-make" label="Car make" value={d.make} onChange={(v) => set("make", v)} error={errors.make} placeholder="e.g. Toyota" />
              <TextField id="cert-model" label="Car model" value={d.model} onChange={(v) => set("model", v)} error={errors.model} placeholder="e.g. Hilux" />
              <TextField id="cert-year" label="Year of manufacture" value={d.year} onChange={(v) => set("year", v.replace(/\D/g, "").slice(0, 4))} error={errors.year} placeholder="e.g. 2019" inputMode="numeric" />
              <TextField id="cert-chassis" label="Chassis number" value={d.chassis} onChange={(v) => set("chassis", v)} onBlur={() => setD((x) => ({ ...x, chassis: normaliseChassis(x.chassis) }))} error={errors.chassis} placeholder="e.g. AHTFR22G406012345" />
              <SelectField id="cert-contract" name="contract" label="Contract type" value={d.contract} onChange={(v) => set("contract", v)} error={errors.contract}
                options={CONTRACT_OPTIONS.map((o) => ({ value: o.value, label: o.label }))} placeholder="Choose the contract" />
              <SelectField id="cert-brandId" name="brandId" label="Brand" value={d.brandId} onChange={(v) => set("brandId", v)} error={errors.brandId}
                options={brands.map((b) => ({ value: b.id, label: b.name }))} placeholder="Select a brand" />
            </div>
            <p className="text-[13px] text-muted">
              {customer?.brandId && d.brandId === customer.brandId ? `Brand picked up from ${customer.name}'s details. ` : ""}
              Installed on {longDate(vehicle.installedOn)}; the contract runs from that date.
            </p>
            {brandMissing.length > 0 && (
              <p className="rounded-xl bg-[#FFF4E5] px-3.5 py-2.5 text-[13.5px] text-[#9a3300]">
                {brand?.name} has no {brandMissing.join(", ")} yet. Add {brandMissing.length === 1 ? "it" : "them"} in <Link href="/settings/brands" className="font-semibold underline">Settings → Brands</Link> so the certificate shows {brandMissing.length === 1 ? "it" : "them"}.
              </p>
            )}
            <div className="flex flex-wrap justify-end gap-3">
              <button type="button" onClick={onCancel} className="min-h-11 rounded-xl border border-line px-4 text-[15px] font-semibold hover:bg-canvas">Cancel</button>
              <button type="submit" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-navy px-5 text-[15px] font-semibold text-white hover:brightness-110">
                <Eye size={17} aria-hidden="true" />Preview
              </button>
            </div>
          </Step>
        )}
        {!vehicle && (
          <div className="flex justify-end">
            <button type="button" onClick={onCancel} className="min-h-11 rounded-xl border border-line px-4 text-[15px] font-semibold hover:bg-canvas">Cancel</button>
          </div>
        )}
      </form>

      {view && (
        <section id="cert-preview" aria-label="Preview" className="flex flex-col gap-4 rounded-2xl bg-[#e9eef3] p-3 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-[18px] font-semibold">Preview</h2>
              <p className="text-[13.5px] text-muted">Check the details. Generating gives the certificate its number and saves it.</p>
            </div>
            <div className="flex flex-wrap gap-2.5">
              <button type="button" onClick={() => setPreview(false)} className="min-h-11 rounded-xl border border-line bg-white px-4 text-[15px] font-semibold hover:bg-canvas">Edit details</button>
              <button type="button" onClick={() => void generate()} disabled={busy}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-brand px-5 text-[15px] font-semibold text-white hover:brightness-95 disabled:opacity-60">
                <FileBadge size={17} aria-hidden="true" />{busy ? "Generating…" : "Generate certificate"}
              </button>
            </div>
          </div>
          {formError && <p role="alert" className="text-[14px] text-[#C62828]">{formError}</p>}
          <CertificateFrame c={view} />
        </section>
      )}
    </div>
  );
}

/** Documents → Certificates: issued vehicle tracking certificates, and the generator for a new one. */
export function CertificatesView() {
  const [creating, setCreating] = useState(false);
  const [list, setList] = useState<Load<Certificate[]>>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [q, setQ] = useState("");
  useEffect(() => {
    let cancelled = false;
    void erpApi.certificates.list().then((r) => {
      if (!cancelled) setList(r.ok ? { status: "ready", items: r.data } : { status: "error", message: r.message });
    });
    return () => { cancelled = true; };
  }, [attempt]);
  const load = () => { setList({ status: "loading" }); setAttempt((n) => n + 1); };

  const items = list.status === "ready" ? list.items : [];
  const query = q.trim().toLowerCase();
  const shown = query
    ? items.filter((c) => [c.number, c.verifyCode, c.customerName, c.vehicleReg, c.imei, c.make, c.model, c.chassis, c.brand.name].some((x) => x.toLowerCase().includes(query)))
    : items;

  if (creating) {
    return (
      <>
        <PageHeader title="New certificate" subtitle="Vehicle tracking certificate: proof that a tracker was installed." aside={
          <button type="button" onClick={() => setCreating(false)} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-[15px] font-semibold text-navy hover:bg-white">
            <ArrowLeft size={17} aria-hidden="true" />All certificates
          </button>
        } />
        <NewCertificate onCancel={() => setCreating(false)} />
      </>
    );
  }

  return (
    <>
      <PageHeader title="Certificates" subtitle="Vehicle tracking certificates issued to customers as proof of tracker installation." aside={
        <button type="button" onClick={() => setCreating(true)} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-brand px-5 text-[15px] font-semibold text-white hover:brightness-95">
          <Plus size={18} aria-hidden="true" />New certificate
        </button>
      } />
      <Card className="overflow-hidden">
        <div className="border-b border-line px-4 py-3 sm:px-6">
          <label className="relative block max-w-md">
            <span className="sr-only">Search certificates</span>
            <Search size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search number, customer, registration, IMEI…"
              className="min-h-11 w-full rounded-xl border border-line bg-white pl-9 pr-3 text-[15px] outline-none focus:border-navy" />
          </label>
        </div>
        {list.status === "loading" && <p className="px-6 py-8 text-center text-[14px] text-muted">Loading…</p>}
        {list.status === "error" && (
          <p role="alert" className="px-6 py-8 text-center text-[14px] text-[#C62828]">{list.message} <button type="button" onClick={load} className="font-semibold underline">Try again</button></p>
        )}
        {list.status === "ready" && shown.length === 0 && (
          <div className="px-6 py-10 text-center">
            <FileBadge size={28} className="mx-auto text-muted" aria-hidden="true" />
            <p className="mt-2 text-[15px] font-semibold">{items.length === 0 ? "No certificates yet" : "No certificate matches your search"}</p>
            {items.length === 0 && <p className="text-[14px] text-muted">Click New certificate to issue the first one.</p>}
          </div>
        )}
        {shown.length > 0 && (
          <ul className="divide-y divide-line">
            {shown.map((c) => (
              <li key={c.id}>
                <Link href={`/documents/certificates/${c.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-canvas sm:px-6">
                  <span className="font-mono text-[14px] font-bold text-navy">{c.number}<span className="block text-[11.5px] font-medium text-muted">ID {c.verifyCode}</span></span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{c.customerName}</span>
                    <span className="block truncate text-[13px] text-muted">{c.vehicleReg} · {c.make} {c.model} {c.year} · IMEI {c.imei}</span>
                  </span>
                  <span className="text-right text-[13px] text-muted">
                    <span className="block font-semibold text-ink">{c.brand.name} · {contractLabel(c.contractYears)}</span>
                    <span className="block">Issued {longDate(c.issuedAt)}{c.customerPhone ? ` · ${phoneText(c.customerPhone)}` : ""}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
