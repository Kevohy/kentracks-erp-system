"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, ChevronDown, Copy, Eye, Loader2, Pencil, RefreshCw, Search, X } from "lucide-react";
import { PageHeader } from "@/components/shell/PageHeader";
import { ActionsMenu } from "./ActionsMenu";
import { Card } from "@/components/dashboard/Card";
import { SaleDetailsDialog } from "@/components/sales/SaleDetailsDialog";
import { cn } from "@/lib/cn";
import { erpApi } from "@/lib/erp-api";
import {
  billingFilters,
  daysUntil,
  expiryState,
  LIVE_REFRESH_SECONDS,
  nextExpiry,
  renewalStatus,
  todayInNairobi,
  vehicleMatches,
  type BillingCustomer,
  type BillingFilter,
  type BillingTotals,
  type BillingVehicle,
  type ExpiryState,
} from "@/lib/billing";
import type { Sale } from "@/lib/sales";
import { formatKes } from "@/lib/sales-format";
import { parseMoney, sanitizeNumberInput } from "@/lib/purchase-validation";
import { MAX_AMOUNT_MINOR } from "@/lib/sale-validation";

const PAGE = 20;
const n = (v: number) => v.toLocaleString("en-KE");
const plural = (c: number, w: string) => `${n(c)} ${w}${c === 1 ? "" : "s"}`;
const longDate = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const clock = (d: Date) => d.toLocaleTimeString("en-KE", { hour: "numeric", minute: "2-digit" });
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?";

/** Tone per status: number colour, and pill style. */
const tone = {
  total: "text-navy",
  online: "text-[#1B7A34]",
  offline: "text-[#5b6b7a]",
  soon: "text-[#B25B00]",
  expired: "text-[#C62828]",
  unknown: "text-[#7b8a97]",
  due: "text-navy",
  money: "text-brand",
} as const;

const statusPill: Record<string, string> = {
  Online: "bg-[#E6F4EA] text-[#1B5E20]",
  Offline: "bg-[#EEF1F4] text-[#3d4b57]",
  Expired: "bg-[#FDECEA] text-[#B71C1C]",
  Unknown: "bg-canvas text-muted",
};
const renewalPill: Record<ExpiryState, string> = {
  active: "bg-[#E6F4EA] text-[#1B5E20]",
  soon: "bg-[#FFF4E5] text-[#9a3300]",
  expired: "bg-[#FDECEA] text-[#B71C1C]",
  lifelong: "bg-tint text-navy",
  unknown: "bg-canvas text-muted",
};

function Pill({ className, children }: { className: string; children: ReactNode }) {
  return <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[12.5px] font-semibold", className)}>{children}</span>;
}

function StatusPill({ status }: { status: BillingVehicle["status"] }) {
  const s = status ?? "Unknown";
  const dot = { Online: "bg-[#2E7D32]", Offline: "bg-[#8A99A6]", Expired: "bg-[#C62828]", Unknown: "bg-[#B8C3CC]" }[s];
  return (
    <Pill className={statusPill[s]}>
      <span className={cn("size-1.5 rounded-full", dot)} aria-hidden="true" />
      {s}
    </Pill>
  );
}

// ---------------------------------------------------------------- vehicle

function Field({ label, children, mono, className }: { label: string; children: ReactNode; mono?: boolean; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="text-[11px] font-medium uppercase tracking-wide text-muted">{label}</dt>
      <dd className={cn("mt-0.5 truncate text-[13.5px] font-semibold", mono && "font-mono text-[13px] font-medium")}>{children}</dd>
    </div>
  );
}

const dash = <span className="font-normal text-muted">—</span>;
const accent: Record<ExpiryState, string> = {
  expired: "before:bg-[#D93025]",
  soon: "before:bg-[#E8890C]",
  active: "before:bg-[#2E7D32]",
  lifelong: "before:bg-navy",
  unknown: "before:bg-[#B8C3CC]",
};

/** One vehicle, kept compact so a customer with many vehicles still reads at a glance. */
function VehicleCard({ v, today, onViewSale, onCopy, onRefresh, refreshing, onEditFee }: {
  v: BillingVehicle; today: string; onViewSale: () => void; onCopy: (what: string, text: string) => void; onRefresh: () => void; refreshing: boolean;
  /** Present when a renewal fee applies (not for a Lifelong Card). */
  onEditFee?: () => void;
}) {
  const st = expiryState(v, today);
  const d = v.expirationDate ? daysUntil(v.expirationDate, today) : null;
  const rel = d === null ? "" : d < 0 ? `${plural(-d, "day")} ago` : d === 0 ? "today" : `in ${plural(d, "day")}`;
  return (
    <article aria-label={`Vehicle ${v.vehiclePlate || v.imei}`}
      className={cn("relative min-w-0 rounded-xl border border-line bg-white pl-1 before:absolute before:inset-y-0 before:left-0 before:w-1 before:rounded-l-xl", accent[st])}>
      <div className="flex items-center gap-2 px-3.5 pb-1.5 pt-2.5">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
          <h3 className="whitespace-nowrap text-[15px] font-semibold">{v.vehiclePlate || "No plate"}</h3>
          {v.deviceModel && <span className="truncate rounded-md bg-canvas px-1.5 py-0.5 text-[12px] font-medium text-[#3d4b57]">{v.deviceModel}</span>}
          <StatusPill status={v.status} />
          {(st === "soon" || (st === "expired" && v.status !== "Expired")) && <Pill className={renewalPill[st]}>{renewalStatus(st)}</Pill>}
        </div>
        <ActionsMenu
          small
          label={`Actions for ${v.vehiclePlate || v.imei}`}
          items={[
            { label: "View sale", icon: Eye, onSelect: onViewSale },
            ...(onEditFee ? [{ label: "Edit renewal fee", icon: Pencil, onSelect: onEditFee }] : []),
            { label: "Refresh status", icon: RefreshCw, onSelect: onRefresh, disabled: refreshing },
            { label: "Copy IMEI", icon: Copy, onSelect: () => onCopy("IMEI", v.imei) },
            ...(v.simNumber ? [{ label: "Copy SIM number", icon: Copy, onSelect: () => onCopy("SIM number", v.simNumber) }] : []),
          ]}
        />
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 px-3.5 pb-2.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.45fr)_minmax(0,1fr)]">
        <Field label="Package">
          {v.packageName}
          <span className="font-normal text-muted"> · {v.cardType.replace(" Card", "")}{v.saleType === "Hosting Sale" ? " · Hosting" : ""}</span>
        </Field>
        <Field label="SIM" className="order-last col-span-2 sm:order-none sm:col-span-1">
          <span className="font-mono font-medium">{v.simNumber || "—"}</span>
          {v.simType && <span className="font-normal text-muted"> · {v.simType}</span>}
        </Field>
        <Field label="GPS account">{v.gpsAccount || dash}</Field>
        <Field label="Activated">{v.activationDate ? longDate(v.activationDate) : dash}</Field>
        <Field label="Expires">
          {st === "lifelong" ? <span className="text-navy">Lifelong</span> : v.expirationDate ? (
            <span className={cn(st === "expired" && "text-[#B71C1C]", st === "soon" && "text-[#9a3300]")}>
              {longDate(v.expirationDate)}{st !== "active" && <span className="font-normal"> ({rel})</span>}
            </span>
          ) : dash}
        </Field>
        <Field label="Renewal fee">
          <span className="inline-flex max-w-full items-center gap-1">
            <span className="truncate">{v.renewalFeeMinor != null ? formatKes(v.renewalFeeMinor) : v.cardType === "Lifelong Card" ? <span className="font-normal text-muted">None</span> : <span className="font-normal text-muted">Not set</span>}</span>
            {onEditFee && (
              <button type="button" onClick={onEditFee} aria-label={`Edit renewal fee for ${v.vehiclePlate || v.imei}`}
                className="-my-1 grid size-7 shrink-0 place-items-center rounded-md text-navy hover:bg-tint">
                <Pencil size={13} aria-hidden="true" />
              </button>
            )}
          </span>
        </Field>
      </dl>
      <div className="flex items-center gap-2 border-t border-line px-3.5 py-1.5 text-[12px] text-muted">
        <span className="min-w-0 truncate">
          <span className="font-mono text-ink">{v.imei}</span>
          {" · "}{v.platformName}{v.technicianName ? ` · Installed by ${v.technicianName}` : ""}{` · Sold ${longDate(v.soldAt.slice(0, 10))}`}
        </span>
        <button type="button" onClick={onViewSale} className="ml-auto inline-flex min-h-8 shrink-0 items-center gap-1 rounded-md px-1.5 font-semibold text-navy hover:bg-tint">
          <Eye size={13} aria-hidden="true" />
          View sale
        </button>
      </div>
    </article>
  );
}

// --------------------------------------------------------------- customer

function StatBox({ value, label, className }: { value: number; label: string; className: string }) {
  return (
    <div className="flex min-w-0 flex-col items-center justify-center rounded-xl border border-line bg-white px-0.5 py-2 sm:w-[86px] sm:px-2">
      <span className={cn("text-[18px] font-semibold leading-none tabular-nums", className)}>{n(value)}</span>
      <span className="mt-1.5 max-w-full truncate text-[9px] font-semibold uppercase text-muted sm:text-[10.5px] sm:tracking-wide">{label}</span>
    </div>
  );
}

function CustomerCard({ c, open, onToggle, filter, today, syncing, onRefresh, onViewSale, onCopy, onEditFee }: {
  c: BillingCustomer; open: boolean; onToggle: () => void; filter: BillingFilter; today: string; syncing: boolean;
  onRefresh: () => void; onViewSale: (saleId: string) => void; onCopy: (what: string, text: string) => void; onEditFee: (v: BillingVehicle) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const count = (f: BillingFilter) => c.vehicles.filter((v) => vehicleMatches(v, f, today)).length;
  const shown = filter === "All" || showAll ? c.vehicles : c.vehicles.filter((v) => vehicleMatches(v, filter, today));
  const next = nextExpiry(c.vehicles, today);
  const panelId = `billing-${c.id}`;
  // Phones show the menu beside the name, wide screens after the counts (only one is ever displayed).
  const menu = (
    <ActionsMenu
      label={`Actions for ${c.name}`}
      items={[
        { label: open ? "Hide vehicles" : "Show vehicles", icon: ChevronDown, onSelect: onToggle },
        { label: "Refresh from GPS platform", icon: RefreshCw, onSelect: onRefresh, disabled: syncing },
        { label: "Copy account number", icon: Copy, onSelect: () => onCopy("Account number", c.account) },
        ...(c.phone ? [{ label: "Copy phone number", icon: Copy, onSelect: () => onCopy("Phone number", c.phone) }] : []),
      ]}
    />
  );

  return (
    <Card className="overflow-visible">
      <div className="flex flex-col gap-3 px-4 py-4 sm:px-5 lg:flex-row lg:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <button type="button" onClick={onToggle} aria-expanded={open} aria-controls={panelId} aria-label={`${c.name}, ${plural(c.vehicles.length, "vehicle")}`}
            className="-m-2 flex min-w-0 flex-1 items-center gap-3.5 rounded-xl p-2 text-left hover:bg-canvas/60">
            <span className="grid size-11 shrink-0 place-items-center rounded-full bg-[#FFF1EA] text-[14px] font-semibold text-brand" aria-hidden="true">{initials(c.name)}</span>
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="truncate text-[16px] font-semibold">{c.name}</span>
                {c.brandName && <span className="rounded-full bg-tint px-2 py-0.5 text-[11.5px] font-semibold text-navy">{c.brandName}</span>}
              </span>
              <span className="block truncate text-[13px] text-muted">{c.phone || c.email}{(c.phone || c.email) && " · "}<span className="font-mono">{c.account}</span></span>
              <span className="block text-[13px] text-muted">
                Next expiry:{" "}
                {next === "lifelong" ? <span className="font-medium text-navy">Lifelong</span>
                  : next === null ? "—"
                  : next.past ? <span className="font-medium text-[#B71C1C]">expired {longDate(next.date)}</span>
                  : <span className="font-medium text-ink">{longDate(next.date)}</span>}
              </span>
            </span>
            <ChevronDown size={20} className={cn("shrink-0 text-muted transition-transform lg:hidden", open && "rotate-180")} aria-hidden="true" />
          </button>
          <div className="lg:hidden">{menu}</div>
        </div>
        <div className="flex items-center gap-2">
          <div className="grid flex-1 grid-cols-5 gap-1.5 sm:flex sm:flex-none sm:gap-2">
            <StatBox value={c.vehicles.length} label="Vehicles" className={tone.money} />
            <StatBox value={count("Online")} label="Online" className={tone.online} />
            <StatBox value={count("Offline")} label="Offline" className={tone.offline} />
            <StatBox value={count("Expired")} label="Expired" className={tone.expired} />
            <StatBox value={count("Expiring soon")} label="Expiring" className={tone.soon} />
          </div>
          <div className="hidden lg:block">{menu}</div>
        </div>
      </div>

      {open && (
        <div id={panelId} className="flex flex-col gap-2.5 border-t border-line bg-canvas/50 px-3 py-3 sm:px-4">
          {(filter !== "All" || syncing) && (
            <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-[13px] text-muted">
              <span>
                {filter !== "All" && (showAll ? `All ${plural(c.vehicles.length, "vehicle")}` : `${shown.length} of ${plural(c.vehicles.length, "vehicle")} · ${filter.toLowerCase()}`)}
                {syncing && <span className="ml-2 inline-flex items-center gap-1"><Loader2 size={13} className="animate-spin" aria-hidden="true" />Checking GPS platform…</span>}
              </span>
              {filter !== "All" && (showAll || shown.length < c.vehicles.length) ? (
                <button type="button" onClick={() => setShowAll((s) => !s)} className="min-h-9 rounded-lg px-2.5 font-semibold text-navy hover:bg-tint">
                  {showAll ? `Only ${filter.toLowerCase()}` : `Show all ${c.vehicles.length}`}
                </button>
              ) : null}
            </div>
          )}
          <div className="grid gap-2.5 xl:grid-cols-2">
          {shown.map((v) => (
              <VehicleCard key={v.imei} v={v} today={today} refreshing={syncing} onRefresh={onRefresh} onCopy={onCopy} onViewSale={() => onViewSale(v.saleId)}
                onEditFee={v.cardType !== "Lifelong Card" ? () => onEditFee(v) : undefined} />
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

// ------------------------------------------------------------ renewal fee

type Editing = { customerId: string; vehicle: BillingVehicle };

/** Edit the renewal fee agreed for one device. */
function RenewalFeeDialog({ editing, onClose, onSaved }: { editing: Editing | null; onClose: () => void; onSaved: (c: BillingCustomer) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const v = editing?.vehicle;

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (v && !d.open) {
      setValue(v.renewalFeeMinor != null ? String(v.renewalFeeMinor / 100) : "");
      setError(null);
      setSaving(false);
      d.showModal();
      requestAnimationFrame(() => input.current?.select());
    } else if (!v && d.open) d.close();
  }, [v]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!v || saving) return;
    const parsed = parseMoney(value, "Renewal fee", MAX_AMOUNT_MINOR);
    if (parsed.error) {
      setError(parsed.error);
      input.current?.focus();
      return;
    }
    setSaving(true);
    const r = await erpApi.billing.updateRenewalFee(v.saleId, value);
    setSaving(false);
    if (!r.ok) return setError(r.fieldErrors.renewalFee ?? r.message);
    onSaved(r.data);
  };

  return (
    <dialog ref={ref} onClose={onClose} aria-labelledby="fee-title"
      className="m-auto w-[calc(100%-24px)] max-w-md rounded-2xl border border-line bg-white p-0 text-ink shadow-[0_24px_60px_rgba(10,29,44,0.25)] backdrop:bg-ink/50">
      {v && (
        <form onSubmit={(e) => void save(e)} noValidate>
          <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
            <div className="min-w-0">
              <h2 id="fee-title" className="text-lg font-semibold">Edit renewal fee</h2>
              <p className="truncate text-[13.5px] text-muted">{v.vehiclePlate || "No plate"} · {v.packageName} · {v.platformName} {v.cardType}</p>
            </div>
            <button type="button" onClick={onClose} aria-label="Close" className="grid size-10 shrink-0 place-items-center rounded-xl text-muted hover:bg-canvas">
              <X size={19} aria-hidden="true" />
            </button>
          </div>
          <div className="flex flex-col gap-1.5 px-5 py-5">
            <label htmlFor="fee-input" className="text-[14px] font-medium">Renewal fee (KES)</label>
            <input ref={input} id="fee-input" type="text" inputMode="decimal" autoComplete="off" value={value}
              onChange={(e) => { setValue(sanitizeNumberInput(e.target.value)); setError(null); }}
              aria-invalid={error ? true : undefined} aria-describedby={error ? "fee-err" : "fee-hint"}
              className={cn("min-h-11 rounded-xl border bg-white px-3.5 text-[15px] tabular-nums", error ? "border-[#C62828]" : "border-line")} />
            {error
              ? <p id="fee-err" className="text-[13.5px] text-[#C62828]">{error}</p>
              : <p id="fee-hint" className="text-[13px] text-muted">Charged when the licence expires{v.expirationDate ? ` (${longDate(v.expirationDate)})` : ""}.</p>}
          </div>
          <div className="flex justify-end gap-2 border-t border-line px-5 py-4">
            <button type="button" onClick={onClose} className="min-h-11 rounded-xl border border-line px-4 text-[15px] font-semibold hover:bg-canvas">Cancel</button>
            <button type="submit" disabled={saving}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-brand px-5 text-[15px] font-semibold text-white hover:brightness-95 disabled:opacity-60">
              {saving && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
              Save
            </button>
          </div>
        </form>
      )}
    </dialog>
  );
}

// ------------------------------------------------------------------- page

type LoadState = { status: "loading" | "ready" | "more" } | { status: "error"; message: string };

const filterLabel: Record<BillingFilter, string> = {
  All: "All devices", Online: "Online", Offline: "Offline", "Expiring soon": "Expiring soon", Expired: "Expired", Unknown: "Unknown status",
};

export function BillingVehiclesView() {
  const [query, setQuery] = useState("");
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<BillingFilter>("All");
  const [items, setItems] = useState<BillingCustomer[]>([]);
  const [totals, setTotals] = useState<BillingTotals | null>(null);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [syncing, setSyncing] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [sale, setSale] = useState<Sale | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const request = useRef(0);
  const current = useRef({ q, filter, items });
  useEffect(() => {
    current.current = { q, filter, items };
  }, [q, filter, items]);
  const today = todayInNairobi();

  useEffect(() => {
    const t = setTimeout(() => setQ(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  /** Totals change when device details or fees change. */
  const refreshTotals = useCallback(async () => {
    const t = await erpApi.billing.page({ q: current.current.q, filter: current.current.filter, offset: 0, limit: 1 });
    if (t.ok) setTotals(t.data.totals);
  }, []);

  /** Ask GPSPlatform about these customers' devices and put the fresh details (and totals) in place. */
  const sync = useCallback(async (ids: string[], force: boolean) => {
    if (ids.length === 0) return;
    setSyncing((s) => new Set([...s, ...ids]));
    const r = await erpApi.billing.sync(ids, force);
    setSyncing((s) => { const x = new Set(s); ids.forEach((id) => x.delete(id)); return x; });
    if (!r.ok) return setNotice(r.message);
    const fresh = new Map(r.data.items.map((c) => [c.id, c]));
    setItems((prev) => prev.map((c) => fresh.get(c.id) ?? c));
    setNotice(r.data.message ?? null);
    setUpdatedAt(new Date());
    if (r.data.checked > 0) await refreshTotals();
  }, [refreshTotals]);

  const fetchPage = useCallback(async (offset: number) => {
    const id = ++request.current;
    setState({ status: offset ? "more" : "loading" });
    const r = await erpApi.billing.page({ q, filter, offset, limit: PAGE });
    if (id !== request.current) return;
    if (!r.ok) return setState({ status: "error", message: r.message });
    setItems((prev) => (offset ? [...prev, ...r.data.items.filter((c) => !prev.some((p) => p.id === c.id))] : r.data.items));
    setTotals(r.data.totals);
    setNextOffset(r.data.nextOffset);
    setState({ status: "ready" });
    setUpdatedAt(new Date());
    // The first customer opens; a search opens every match (up to five).
    if (!offset) setOpen(new Set((q ? r.data.items.slice(0, 5) : r.data.items.slice(0, 1)).map((c) => c.id)));
    void sync(r.data.items.map((c) => c.id), false);
  }, [q, filter, sync]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchPage(0);
  }, [fetchPage]);

  // Live status: re-check the customers on screen every LIVE_REFRESH_SECONDS while the tab is visible.
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      const ids = current.current.items.map((c) => c.id).slice(0, 50);
      void sync(ids, false);
    }, LIVE_REFRESH_SECONDS * 1000);
    return () => clearInterval(t);
  }, [sync]);

  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || nextOffset === null) return;
    const io = new IntersectionObserver((e) => e[0]?.isIntersecting && state.status === "ready" && fetchPage(nextOffset), { rootMargin: "400px" });
    io.observe(el);
    return () => io.disconnect();
  }, [nextOffset, state.status, fetchPage]);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 2500);
    return () => clearTimeout(t);
  }, [flash]);

  const copy = (what: string, text: string) => {
    void navigator.clipboard?.writeText(text).then(
      () => setFlash(`${what} copied`),
      () => setFlash(`Could not copy the ${what.toLowerCase()}`),
    );
  };
  const viewSale = async (id: string) => {
    const r = await erpApi.sales.get(id);
    if (r.ok) setSale(r.data);
    else setNotice(r.message);
  };

  const toggle = (id: string) => setOpen((s) => { const x = new Set(s); if (x.has(id)) x.delete(id); else x.add(id); return x; });
  const anySyncing = syncing.size > 0;
  const nothingAtAll = state.status === "ready" && totals?.vehicles === 0 && !q;

  const tiles: { key: string; label: string; value: string; className: string; filter?: BillingFilter }[] = [
    { key: "total", label: "Total devices", value: totals ? n(totals.vehicles) : "—", className: tone.total, filter: "All" },
    { key: "online", label: "Online", value: totals ? n(totals.online) : "—", className: tone.online, filter: "Online" },
    { key: "offline", label: "Offline", value: totals ? n(totals.offline) : "—", className: tone.offline, filter: "Offline" },
    { key: "soon", label: "Expiring soon", value: totals ? n(totals.expiringSoon) : "—", className: tone.soon, filter: "Expiring soon" },
    { key: "expired", label: "Expired", value: totals ? n(totals.expired) : "—", className: tone.expired, filter: "Expired" },
    { key: "unknown", label: "Unknown", value: totals ? n(totals.unknown) : "—", className: tone.unknown, filter: "Unknown" },
    { key: "due", label: "Renewals due", value: totals ? n(totals.renewalsDue) : "—", className: tone.due },
    { key: "money", label: "Outstanding renewal amount", value: totals ? formatKes(totals.renewalDueMinor) : "—", className: tone.money },
  ];

  return (
    <>
      <PageHeader
        title="Customer Vehicles"
        subtitle={`${totals ? plural(totals.vehicles, "device") : "Devices"} · a live view of every tracker sold through Package and Hosting sales, its SIM and renewal status.`}
      />

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-[13px] text-muted" aria-live="polite">
          <span className="relative flex size-2.5" aria-hidden="true">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-brand opacity-60" />
            <span className="relative inline-flex size-2.5 rounded-full bg-brand" />
          </span>
          Live status · auto-refreshes every {LIVE_REFRESH_SECONDS}s{updatedAt && <> · updated {clock(updatedAt)}</>}
        </p>
        <button type="button" disabled={items.length === 0 || anySyncing} onClick={() => void sync(items.map((c) => c.id).slice(0, 50), true)}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line bg-white px-4 text-[15px] font-semibold hover:bg-canvas disabled:opacity-60">
          <RefreshCw size={17} className={cn(anySyncing && "animate-spin")} aria-hidden="true" />
          Refresh now
        </button>
      </div>

      <div className="mb-5 mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map((t) => {
          const inner = (
            <>
              <span className="block text-[11.5px] font-semibold uppercase tracking-wide text-muted">{t.label}</span>
              <span className={cn("mt-1 block font-semibold leading-tight tabular-nums", t.key === "money" ? "text-[17px] sm:text-[22px]" : "text-[22px]", t.className)}>{t.value}</span>
            </>
          );
          const base = "rounded-2xl border bg-white px-4 py-3.5 text-left shadow-[0_1px_2px_rgba(16,32,48,0.04)]";
          return t.filter ? (
            <button key={t.key} type="button" aria-pressed={filter === t.filter} onClick={() => setFilter(t.filter!)}
              className={cn(base, "transition-colors hover:border-[#c9d3dc]", filter === t.filter ? "border-brand ring-1 ring-brand" : "border-line")}>
              {inner}
            </button>
          ) : (
            <div key={t.key} className={cn(base, "border-line")}>{inner}</div>
          );
        })}
      </div>

      <Card className="mb-4 flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:px-5">
        <label className="relative block min-w-0 flex-1">
          <span className="sr-only">Search customers and vehicles</span>
          <Search size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Search customer, account, phone, IMEI, SIM, plate or GPS account"
            className="min-h-11 w-full rounded-xl border border-line bg-white pl-10 pr-3.5 text-[15px] placeholder:text-muted/70" />
        </label>
        <label className="sm:w-52">
          <span className="sr-only">Show</span>
          <select value={filter} onChange={(e) => setFilter(e.target.value as BillingFilter)}
            className="min-h-11 w-full rounded-xl border border-line bg-white px-3 text-[15px] font-medium">
            {billingFilters.map((f) => <option key={f} value={f}>{filterLabel[f]}</option>)}
          </select>
        </label>
      </Card>

      {notice && (
        <p role="status" className="mb-4 flex items-start gap-2 rounded-xl border border-[#F6D9B8] bg-[#FFF8EF] px-4 py-3 text-[14px] text-[#7a3600]">
          <AlertTriangle size={17} className="mt-0.5 shrink-0" aria-hidden="true" />
          {notice}
        </p>
      )}

      {state.status === "loading" && (
        <Card className="flex items-center justify-center gap-2 px-5 py-14 text-muted"><Loader2 size={18} className="animate-spin" aria-hidden="true" /><span role="status">Loading customers…</span></Card>
      )}
      {state.status === "error" && (
        <Card className="flex flex-col items-center gap-3 px-5 py-12 text-center">
          <span role="alert" className="text-[#C62828]">{state.message}</span>
          <button type="button" onClick={() => void fetchPage(0)} className="min-h-11 rounded-xl border border-line px-4 text-[15px] font-semibold hover:bg-canvas">Try again</button>
        </Card>
      )}
      {(state.status === "ready" || state.status === "more") && items.length === 0 && (
        <Card className="px-6 py-14 text-center text-muted">
          {nothingAtAll ? "No vehicles yet. Trackers sold through a Package Sale or Hosting Sale appear here." : "No customers match your search or filter."}
        </Card>
      )}

      <div className="flex flex-col gap-3">
        {state.status !== "loading" && items.map((c) => (
          <CustomerCard key={c.id} c={c} open={open.has(c.id)} onToggle={() => toggle(c.id)} filter={filter} today={today}
            syncing={syncing.has(c.id)} onRefresh={() => void sync([c.id], true)} onViewSale={(id) => void viewSale(id)} onCopy={copy} onEditFee={(v) => setEditing({ customerId: c.id, vehicle: v })} />
        ))}
      </div>

      {nextOffset !== null && (
        <div ref={sentinel} className="flex justify-center py-5">
          <button type="button" onClick={() => state.status === "ready" && fetchPage(nextOffset)} disabled={state.status !== "ready"}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line bg-white px-5 text-[15px] font-semibold hover:bg-canvas disabled:opacity-60">
            {state.status === "more" && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
            Load more customers
          </button>
        </div>
      )}

      {flash && (
        <div role="status" className="fixed bottom-5 left-1/2 z-30 -translate-x-1/2 rounded-xl bg-ink px-4 py-2.5 text-[14px] font-medium text-white shadow-lg">{flash}</div>
      )}
      <SaleDetailsDialog sale={sale} onClose={() => setSale(null)} />
      <RenewalFeeDialog
        editing={editing}
        onClose={() => setEditing(null)}
        onSaved={(c) => {
          setItems((prev) => prev.map((x) => (x.id === c.id ? c : x)));
          setEditing(null);
          setFlash("Renewal fee saved");
          void refreshTotals();
        }}
      />
    </>
  );
}
