"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, ChevronDown, ChevronUp, Copy, History, Loader2, Pencil, Plus, Receipt, RefreshCw, Search, ShoppingCart, PauseCircle, PlayCircle } from "lucide-react";
import { PageHeader } from "@/components/shell/PageHeader";
import { Card } from "@/components/dashboard/Card";
import { ActionsMenu, type MenuItem } from "@/components/billing/ActionsMenu";
import { cn } from "@/lib/cn";
import { erpApi } from "@/lib/erp-api";
import { daysUntil, todayInNairobi } from "@/lib/billing";
import { simExpiry, type IotClient, type IotCounts, type IotGroup, type IotOverview, type IotRenewalsResult, type IotSim, type SimExpiry } from "@/lib/iot-sims";
import { formatKes } from "@/lib/sales-format";
import { AddGroupDialog, BillDialog, longDate, monthLabel, SimActionDialog, type SimAction } from "./IotDialogs";

const TABS = ["SIMs by client", "SIMs by group", "Overview", "Renewals"] as const;
type Tab = (typeof TABS)[number];
const tabId = (t: Tab) => t.toLowerCase().replace(/\s+/g, "-");

const n = (v: number) => v.toLocaleString("en-KE");
const plural = (c: number, w: string) => `${n(c)} ${w}${c === 1 ? "" : "s"}`;
const initials = (name: string) => name.split(/[\s—-]+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?";
const rel = (date: string, today: string) => {
  const d = daysUntil(date, today);
  return d < 0 ? `${plural(-d, "day")} ago` : d === 0 ? "today" : `in ${plural(d, "day")}`;
};
function ago(iso: string | null) {
  if (!iso) return "never";
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : new Date(iso).toLocaleDateString("en-KE", { day: "numeric", month: "short" });
}
/** "Last update: 5 min ago" for an online device, "Last seen: …" otherwise. */
const seenLine = (s: IotSim) => (s.lastCheckedAt ? `${s.deviceStatus === "Online" ? "Last update" : "Last seen"}: ${ago(s.lastCheckedAt)}` : "Not checked yet");

const tone = { total: "text-brand", active: "text-navy", online: "text-[#1B7A34]", offline: "text-[#5b6b7a]", expired: "text-[#C62828]", soon: "text-[#B25B00]" };

// ------------------------------------------------------------------ bits

function Pill({ className, children }: { className: string; children: ReactNode }) {
  return <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[12.5px] font-semibold", className)}>{children}</span>;
}

/** The one status that matters most for a SIM line: suspended, expired, else the device status. */
function SimStatus({ s, today }: { s: IotSim; today: string }) {
  const e = simExpiry(s, today);
  if (e === "suspended") return <Pill className="bg-[#EEF1F4] text-[#3d4b57]">Suspended</Pill>;
  if (e === "expired") return <Pill className="bg-[#FFF4E5] text-[#9a3300]"><AlertTriangle size={12} aria-hidden="true" />Expired</Pill>;
  // The device's own status from GPSPlatform. "Expired" there means the platform licence, not this SIM.
  const st = s.deviceStatus ?? "Unknown";
  const style = { Online: "bg-[#E6F4EA] text-[#1B5E20]", Offline: "bg-[#FDECEA] text-[#B71C1C]", Expired: "bg-[#FFF4E5] text-[#9a3300]", Unknown: "bg-canvas text-muted" }[st];
  const dot = { Online: "bg-[#2E7D32]", Offline: "bg-[#C62828]", Expired: "bg-[#E8890C]", Unknown: "bg-[#B8C3CC]" }[st];
  return <Pill className={style}><span className={cn("size-1.5 rounded-full", dot)} aria-hidden="true" />{st === "Expired" ? "Platform expired" : st}</Pill>;
}

function ExpiryText({ s, today, wrap }: { s: IotSim; today: string; wrap?: boolean }) {
  const e = simExpiry(s, today);
  return (
    <span className={cn("block", !wrap && "whitespace-nowrap")}>
      <span className={cn("block font-semibold", e === "expired" && "text-[#B71C1C]", e === "soon" && "text-[#9a3300]")}>{longDate(s.expiryDate)}</span>
      <span className={cn("block text-[12px]", e === "expired" ? "text-[#B71C1C]" : e === "soon" ? "text-[#9a3300]" : "text-muted")}>{rel(s.expiryDate, today)}</span>
    </span>
  );
}

function StatBox({ value, label, short, className }: { value: number; label: string; short?: string; className: string }) {
  return (
    <div className="flex min-w-0 flex-col items-center justify-center rounded-xl border border-line bg-white px-0.5 py-2 sm:min-w-[86px] sm:px-2.5">
      <span className={cn("text-[18px] font-semibold leading-none tabular-nums", className)}>{n(value)}</span>
      <span className="mt-1.5 max-w-full truncate whitespace-nowrap text-[9px] font-semibold uppercase text-muted sm:text-[10.5px] sm:tracking-wide">
        {short ? <><span className="sm:hidden">{short}</span><span className="hidden sm:inline">{label}</span></> : label}
      </span>
    </div>
  );
}

function Avatar({ text }: { text: string }) {
  return <span className="grid size-11 shrink-0 place-items-center rounded-full bg-[#FFF1EA] text-[14px] font-semibold text-brand" aria-hidden="true">{initials(text)}</span>;
}

/** Only SIMs that need attention stand out: expired in red, due soon in amber, suspended greyed. */
const cardTone: Record<SimExpiry, string> = {
  expired: "border-[#F2C4C0] border-l-[3px] border-l-[#D93025] bg-[#FFF8F7]",
  soon: "border-[#F3D2AE] border-l-[3px] border-l-[#E8890C] bg-[#FFFCF7]",
  active: "border-line bg-white",
  suspended: "border-line bg-canvas/70",
};

function simMenu(s: IotSim, act: (a: SimAction) => void, copy: (what: string, text: string) => void): MenuItem[] {
  return [
    ...(!s.suspended ? [{ label: "Record renewal", icon: RefreshCw, onSelect: () => act({ kind: "renew", sim: s }) }] : []),
    { label: "Edit renewal fee & expiry", icon: Pencil, onSelect: () => act({ kind: "edit", sim: s }) },
    { label: "View renewal history", icon: History, onSelect: () => act({ kind: "history", sim: s }) },
    { label: s.suspended ? "Reactivate" : "Suspend", icon: s.suspended ? PlayCircle : PauseCircle, onSelect: () => act({ kind: "suspend", sim: s }) },
    ...(s.simNumber ? [{ label: "Copy SIM number", icon: Copy, onSelect: () => copy("SIM number", s.simNumber) }] : []),
  ];
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-0.5 truncate text-[13.5px] font-semibold">{children}</dd>
    </div>
  );
}

/** One SIM line as a compact card (client tab, and the group tab on small screens). */
function SimCard({ s, today, act, copy, showCustomer }: { s: IotSim; today: string; act: (a: SimAction) => void; copy: (w: string, t: string) => void; showCustomer?: boolean }) {
  const e = simExpiry(s, today);
  return (
    <article aria-label={`SIM ${s.simNumber || s.imei}`} className={cn("w-full min-w-0 rounded-xl border", cardTone[e])}>
      <div className="flex items-center gap-3 px-4 py-3 sm:px-5">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15.5px] font-semibold tracking-tight">{s.simNumber || "No SIM number"}</p>
          <p className="truncate text-[12.5px] text-muted">{s.vehiclePlate || "No plate"} · <span className="font-mono">{s.imei}</span>{showCustomer ? ` · ${s.customerName}` : ""}</p>
        </div>
        <SimStatus s={s} today={today} />
        <ActionsMenu small label={`Actions for SIM ${s.simNumber || s.imei}`} items={simMenu(s, act, copy)} />
      </div>
      <dl className={cn("grid grid-cols-2 gap-x-4 gap-y-3 border-t px-4 py-3 sm:grid-cols-4 sm:px-5", e === "expired" ? "border-[#F2C4C0]" : e === "soon" ? "border-[#F3D2AE]" : "border-line")}>
        <Field label="Activation">{longDate(s.activationDate)}</Field>
        <Field label="Expiry">
          <span className={cn(e === "expired" && "text-[#B71C1C]", e === "soon" && "text-[#9a3300]")}>{longDate(s.expiryDate)}</span>
          {(e === "expired" || e === "soon") && <span className={cn("font-normal", e === "expired" ? "text-[#B71C1C]" : "text-[#9a3300]")}> ({rel(s.expiryDate, today)})</span>}
        </Field>
        <Field label="Renewal fee">{s.renewalFeeMinor != null ? formatKes(s.renewalFeeMinor) : <span className="font-normal text-muted">Not set</span>}</Field>
        <Field label="Status">{s.suspended ? <span className="text-[#5b6b7a]">Suspended</span> : <span className="text-[#1B5E20]">Active</span>}</Field>
      </dl>
    </article>
  );
}

function nextExpiryOf(sims: IotSim[]): IotSim | undefined {
  return sims.filter((s) => !s.suspended).sort((a, b) => a.expiryDate.localeCompare(b.expiryDate))[0];
}

function countsOf(sims: IotSim[], today: string): IotCounts {
  const c: IotCounts = { sims: sims.length, active: 0, suspended: 0, online: 0, offline: 0, expired: 0, expiringSoon: 0 };
  for (const s of sims) {
    if (s.suspended) c.suspended++; else c.active++;
    if (s.deviceStatus === "Online") c.online++;
    if (s.deviceStatus === "Offline") c.offline++;
    const e = simExpiry(s, today);
    if (e === "expired") c.expired++;
    if (e === "soon") c.expiringSoon++;
  }
  return c;
}

function Loading() {
  return <Card className="flex items-center justify-center gap-2 px-5 py-14 text-muted"><Loader2 size={18} className="animate-spin" aria-hidden="true" /><span role="status">Loading…</span></Card>;
}
function Failed({ message, retry }: { message: string; retry: () => void }) {
  return (
    <Card className="flex flex-col items-center gap-3 px-5 py-12 text-center">
      <span role="alert" className="text-[#C62828]">{message}</span>
      <button type="button" onClick={retry} className="min-h-11 rounded-xl border border-line px-4 text-[15px] font-semibold hover:bg-canvas">Try again</button>
    </Card>
  );
}
function Empty({ children }: { children: ReactNode }) {
  return <Card className="px-6 py-14 text-center text-muted">{children}</Card>;
}

type Shared = { today: string; version: number; act: (a: SimAction) => void; copy: (w: string, t: string) => void };

// ------------------------------------------------------------ by client

function ByClient({ today, version, act, copy }: Shared) {
  const [query, setQuery] = useState("");
  const [q, setQ] = useState("");
  const [items, setItems] = useState<IotClient[]>([]);
  const [next, setNext] = useState<number | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "more" | { error: string }>("loading");
  const [open, setOpen] = useState<Set<string>>(new Set());
  const request = useRef(0);
  const first = useRef(true);

  useEffect(() => {
    const t = setTimeout(() => setQ(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  const load = useCallback(async (offset: number, quiet = false) => {
    const id = ++request.current;
    if (!quiet) setState(offset ? "more" : "loading");
    const r = await erpApi.iotSims.clients({ q, offset });
    if (id !== request.current) return;
    if (!r.ok) return setState({ error: r.message });
    setItems((p) => (offset ? [...p, ...r.data.items.filter((c) => !p.some((x) => x.id === c.id))] : r.data.items));
    setNext(r.data.nextOffset);
    setState("ready");
    if (!offset && !quiet) setOpen(new Set((q ? r.data.items.slice(0, 5) : r.data.items.slice(0, 1)).map((c) => c.id)));
  }, [q]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(0);
  }, [load]);
  // After an action, reload what is on screen without collapsing anything.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    void load(0, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  const toggle = (id: string) => setOpen((s) => { const x = new Set(s); if (x.has(id)) x.delete(id); else x.add(id); return x; });

  return (
    <div className="flex flex-col gap-3">
      <label className="relative block w-full sm:max-w-md">
        <span className="sr-only">Search clients and SIMs</span>
        <Search size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search client, phone, SIM, vehicle or IMEI"
          className="min-h-11 w-full rounded-xl border border-line bg-white pl-10 pr-3.5 text-[15px] placeholder:text-muted/70" />
      </label>
      {state === "loading" ? <Loading /> : typeof state === "object" ? <Failed message={state.error} retry={() => void load(0)} /> : items.length === 0 ? (
        <Empty>{q ? "No clients match your search." : "No IoT SIMs yet. Package and Hosting sales that take an IoT SIM card from stock appear here."}</Empty>
      ) : (
        <>
          {items.map((c) => {
            const k = countsOf(c.sims, today);
            const nx = nextExpiryOf(c.sims);
            const isOpen = open.has(c.id);
            const menu = (
              <ActionsMenu label={`Actions for ${c.name}`} items={[
                { label: isOpen ? "Hide SIMs" : "Show SIMs", icon: isOpen ? ChevronUp : ChevronDown, onSelect: () => toggle(c.id) },
                { label: "Copy phone number", icon: Copy, onSelect: () => copy("Phone number", c.phone) },
              ]} />
            );
            return (
              <Card key={c.id} className="overflow-visible">
                <div className="flex flex-col gap-3 px-4 py-4 sm:px-5 lg:flex-row lg:items-center">
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <button type="button" onClick={() => toggle(c.id)} aria-expanded={isOpen} aria-controls={`iot-c-${c.id}`} aria-label={`${c.name}, ${plural(c.sims.length, "SIM")}`}
                      className="-m-2 flex min-w-0 flex-1 items-center gap-3.5 rounded-xl p-2 text-left hover:bg-canvas/60">
                      <Avatar text={c.name} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[16px] font-semibold">{c.name}</span>
                        <span className="block truncate text-[13px] text-muted">{c.phone} · <span className="font-mono">{c.account}</span></span>
                        <span className="block text-[13px] text-muted">Next expiry: {nx ? <span className={cn("font-medium", simExpiry(nx, today) === "expired" ? "text-[#B71C1C]" : "text-ink")}>{longDate(nx.expiryDate)}</span> : "—"}</span>
                      </span>
                      <ChevronDown size={20} className={cn("shrink-0 text-muted transition-transform lg:hidden", isOpen && "rotate-180")} aria-hidden="true" />
                    </button>
                    <div className="lg:hidden">{menu}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="grid flex-1 grid-cols-5 gap-1.5 sm:flex sm:flex-none sm:gap-2">
                      <StatBox value={k.sims} label="SIMs" className={tone.total} />
                      <StatBox value={k.online} label="Online" className={tone.online} />
                      <StatBox value={k.offline} label="Offline" className={tone.offline} />
                      <StatBox value={k.expired} label="Expired" className={tone.expired} />
                      <StatBox value={k.expiringSoon} label="Expiring soon" short="Expiring" className={tone.soon} />
                    </div>
                    <div className="hidden lg:block">{menu}</div>
                  </div>
                </div>
                {isOpen && (
                  <div id={`iot-c-${c.id}`} className="flex flex-col gap-2.5 border-t border-line px-3 py-3 sm:px-4">
                    {c.sims.map((s) => <SimCard key={s.saleId} s={s} today={today} act={act} copy={copy} />)}
                  </div>
                )}
              </Card>
            );
          })}
          {next !== null && (
            <div className="flex justify-center py-3">
              <button type="button" disabled={state !== "ready"} onClick={() => void load(next)}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line bg-white px-5 text-[15px] font-semibold hover:bg-canvas disabled:opacity-60">
                {state === "more" && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}Load more clients
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ------------------------------------------------------------- by group

const th = "px-3 py-2.5 text-left text-[12px] font-medium uppercase tracking-wide text-muted";
/** Group table headers: tighter, and allowed to wrap ("Bill share") so every column fits beside the sidebar. */
const thc = "px-2 py-2.5 text-left align-bottom text-[11.5px] font-medium uppercase tracking-wide text-muted";

function GroupSims({ group, today, version, act, copy }: Shared & { group: IotGroup }) {
  const [items, setItems] = useState<IotSim[] | null>(null);
  const [next, setNext] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async (offset: number) => {
    const r = await erpApi.iotSims.groupSims(group.simCardId, { offset });
    if (!r.ok) return setError(r.message);
    setError(null);
    setItems((p) => (offset && p ? [...p, ...r.data.items] : r.data.items));
    setNext(r.data.nextOffset);
  }, [group.simCardId]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(0);
  }, [load, version]);

  if (error) return <p role="alert" className="px-5 py-4 text-[#C62828]">{error}</p>;
  if (!items) return <p role="status" className="flex items-center gap-2 px-5 py-4 text-muted"><Loader2 size={16} className="animate-spin" aria-hidden="true" />Loading SIMs…</p>;
  if (items.length === 0) return <p className="px-5 py-4 text-muted">No SIMs in this group yet. They appear when a Package or Hosting sale takes a {group.name} SIM from stock.</p>;

  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full border-collapse text-[13.5px]">
          <caption className="sr-only">SIMs in {group.name} — {group.type}</caption>
          <thead>
            <tr className="border-b border-line bg-canvas/60">
              <th scope="col" className={cn(thc, "pl-4")}>SIM number</th>
              <th scope="col" className={thc}>Vehicle</th>
              <th scope="col" className={thc}>Customer</th>
              <th scope="col" className={thc}>IMEI</th>
              <th scope="col" className={thc}>Status</th>
              <th scope="col" className={thc}>Expiry</th>
              <th scope="col" className={cn(thc, "text-right")}>Received</th>
              <th scope="col" className={cn(thc, "text-right")}>Bill share</th>
              <th scope="col" className={cn(thc, "text-right")}>Profit</th>
              <th scope="col" className={cn(thc, "pr-3 text-right")}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((s) => {
              const e = simExpiry(s, today);
              return (
                <tr key={s.saleId} className={cn("border-b border-line last:border-b-0", e === "expired" && "bg-[#FFF8F7] shadow-[inset_3px_0_0_#D93025]", e === "soon" && "shadow-[inset_3px_0_0_#E8890C]", e === "suspended" && "text-muted")}>
                  <th scope="row" className="px-2 py-3 pl-4 text-left text-[13px] font-semibold tabular-nums">{s.simNumber || "—"}</th>
                  <td className="px-2 py-3 font-medium">{s.vehiclePlate || "—"}</td>
                  <td className="max-w-[135px] px-2 py-3">
                    <span className="block font-medium leading-snug">{s.customerName}</span>
                    <span className="block text-[12.5px] text-muted">{s.customerPhone}</span>
                  </td>
                  <td className="px-2 py-3 text-[13px] tabular-nums text-muted">{s.imei}</td>
                  <td className="px-2 py-3">
                    <SimStatus s={s} today={today} />
                    <span className="mt-0.5 block max-w-[105px] text-[12px] leading-snug text-muted">{seenLine(s)}</span>
                  </td>
                  <td className="px-2 py-3"><ExpiryText s={s} today={today} wrap /></td>
                  <td className="px-2 py-3 text-right tabular-nums">{s.renewalFeeMinor != null ? formatKes(s.renewalFeeMinor) : <span className="text-muted">Not set</span>}</td>
                  <td className="px-2 py-3 text-right tabular-nums text-muted">{formatKes(s.annualCostMinor ?? 0)}</td>
                  <td className={cn("px-2 py-3 text-right font-semibold tabular-nums", s.profitMinor < 0 ? "text-[#B71C1C]" : "text-[#1B7A34]")}>{s.suspended ? <span className="font-normal text-muted">—</span> : formatKes(s.profitMinor)}</td>
                  <td className="px-2 py-2 pr-3 text-right"><ActionsMenu small label={`Actions for SIM ${s.simNumber || s.imei}`} items={simMenu(s, act, copy)} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-col gap-2.5 px-3 py-3 sm:px-4 md:hidden">
        {items.map((s) => <SimCard key={s.saleId} s={s} today={today} act={act} copy={copy} showCustomer />)}
      </div>
      {next !== null && (
        <div className="flex justify-center border-t border-line py-3">
          <button type="button" onClick={() => void load(next)} className="min-h-10 rounded-lg px-4 text-[14px] font-semibold text-navy hover:bg-tint">Load more SIMs</button>
        </div>
      )}
    </>
  );
}

function ByGroup(props: Shared & { onBill: (g: IotGroup) => void; onAddGroup: () => void }) {
  const { version, onBill, onAddGroup } = props;
  const router = useRouter();
  const [groups, setGroups] = useState<IotGroup[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Set<string> | null>(null);
  const load = useCallback(async () => {
    const r = await erpApi.iotSims.groups();
    if (!r.ok) return setError(r.message);
    setError(null);
    // Groups with SIMs first (most SIMs on top); empty groups after, by name.
    const sorted = [...r.data.groups].sort((x, y) => Number(y.sims > 0) - Number(x.sims > 0) || y.sims - x.sims || x.name.localeCompare(y.name));
    setGroups(sorted);
    setOpen((o) => o ?? new Set());
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load, version]);
  const toggle = (id: string) => setOpen((s) => { const x = new Set(s); if (x.has(id)) x.delete(id); else x.add(id); return x; });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[14px] text-muted">Each group is an IoT SIM card from inventory. It shows its SIMs, live status, and the bill share and profit per line (per year).</p>
        <button type="button" onClick={onAddGroup} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line bg-white px-4 text-[15px] font-semibold hover:bg-canvas">
          <Plus size={17} aria-hidden="true" />Add group
        </button>
      </div>
      {error ? <Failed message={error} retry={() => void load()} /> : !groups ? <Loading /> : groups.length === 0 ? (
        <Empty>No IoT SIM cards in inventory yet. Use Add group to add one (for example Safaricom — International IoT).</Empty>
      ) : groups.map((g) => {
        const isOpen = open?.has(g.simCardId) ?? false;
        const menu = (
          <ActionsMenu label={`Actions for ${g.name} — ${g.type}`} items={[
            { label: isOpen ? "Collapse SIMs" : "Show SIMs", icon: isOpen ? ChevronUp : ChevronDown, onSelect: () => toggle(g.simCardId) },
            { label: "Record provider bill", icon: Receipt, onSelect: () => onBill(g) },
            { label: "Add SIM (new Package Sale)", icon: ShoppingCart, onSelect: () => router.push("/sales/package") },
          ]} />
        );
        return (
          <Card key={g.simCardId} className="overflow-visible">
            <div className="flex flex-col gap-3 px-4 py-4 sm:px-5 lg:flex-row lg:items-center">
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <button type="button" onClick={() => toggle(g.simCardId)} aria-expanded={isOpen} aria-controls={`iot-g-${g.simCardId}`}
                  aria-label={`${g.name} — ${g.type}, ${plural(g.sims, "SIM")}`}
                  className="-m-2 flex min-w-0 flex-1 items-center gap-3.5 rounded-xl p-2 text-left hover:bg-canvas/60">
                  <Avatar text={g.name} />
                  <span className="min-w-0 flex-1">
                    <span className="block break-words text-[16px] font-semibold leading-snug sm:truncate">{g.name} — {g.type}</span>
                    <span className="block break-words text-[13px] text-muted sm:truncate" title={g.latestBill ? `${g.billingPeriod} bill for ${monthLabel(g.latestBill.period)}: ${formatKes(g.latestBill.amountMinor)}` : "No provider bill recorded yet"}>
                      {g.name} · {formatKes(g.perLineMinor ?? 0)}/line{g.billingPeriod === "Yearly" ? " (yearly)" : ""}
                    </span>
                    <span className="block text-[13px] text-muted">Expected profit <span className={cn("font-semibold", g.expectedProfitMinor < 0 ? "text-[#B71C1C]" : "text-[#1B7A34]")}>{formatKes(g.expectedProfitMinor)}</span></span>
                  </span>
                  <ChevronDown size={20} className={cn("shrink-0 text-muted transition-transform lg:hidden", isOpen && "rotate-180")} aria-hidden="true" />
                </button>
                <div className="lg:hidden">{menu}</div>
              </div>
              <div className="flex items-center gap-2">
                <div className="grid flex-1 grid-cols-5 gap-1.5 sm:flex sm:flex-none sm:gap-2">
                  <StatBox value={g.sims} label="SIMs" className={tone.total} />
                  <StatBox value={g.active} label="Onboarded" short="Onboard" className={tone.active} />
                  <StatBox value={g.online} label="Online" className={tone.online} />
                  <StatBox value={g.offline} label="Offline" className={tone.offline} />
                  <StatBox value={g.expired} label="Expired" className={tone.expired} />
                </div>
                <div className="hidden lg:block">{menu}</div>
              </div>
            </div>
            {isOpen && <div id={`iot-g-${g.simCardId}`} className="border-t border-line"><GroupSims {...props} group={g} /></div>}
          </Card>
        );
      })}
    </div>
  );
}

// -------------------------------------------------------------- overview

function Tile({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-white px-4 py-3.5 shadow-[0_1px_2px_rgba(16,32,48,0.04)]">
      <span className="block text-[11.5px] font-semibold uppercase tracking-wide text-muted">{label}</span>
      <span className={cn("mt-1 block text-[20px] font-semibold leading-tight tabular-nums sm:text-[22px]", className)}>{value}</span>
    </div>
  );
}

function OverviewTab({ version }: { version: number }) {
  const [d, setD] = useState<IotOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    const r = await erpApi.iotSims.overview();
    if (r.ok) { setD(r.data); setError(null); } else setError(r.message);
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load, version]);
  if (error) return <Failed message={error} retry={() => void load()} />;
  if (!d) return <Loading />;
  const t = d.totals;
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label="Total SIMs" value={n(t.sims)} className={tone.total} />
        <Tile label="Active" value={n(t.active)} className={tone.active} />
        <Tile label="Online" value={n(t.online)} className={tone.online} />
        <Tile label="Offline" value={n(t.offline)} className={tone.offline} />
        <Tile label="Expired" value={n(t.expired)} className={tone.expired} />
        <Tile label="Expiring soon" value={n(t.expiringSoon)} className={tone.soon} />
        <Tile label="Suspended" value={n(t.suspended)} className="text-[#5b6b7a]" />
        <Tile label="Groups" value={n(d.groups.length)} className="text-navy" />
        <Tile label="Renewal income / year" value={formatKes(t.receivedMinor)} className="text-navy" />
        <Tile label="Provider cost / year" value={formatKes(t.receivedMinor - t.expectedProfitMinor)} className="text-[#5b6b7a]" />
        <Tile label="Expected profit / year" value={formatKes(t.expectedProfitMinor)} className={t.expectedProfitMinor < 0 ? "text-[#C62828]" : "text-[#1B7A34]"} />
      </div>

      <Card className="overflow-hidden">
        <h2 className="border-b border-line px-5 py-3.5 text-[16px] font-semibold">By group</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-[14px]">
            <thead>
              <tr className="border-b border-line bg-canvas/60">
                {["Group", "SIMs", "Active", "Expired", "Last bill", "Income / year", "Expected profit"].map((h, i) => (
                  <th key={h} scope="col" className={cn(th, i === 0 && "pl-5", i > 0 && "text-right", i === 6 && "pr-5")}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {d.groups.map((g) => (
                <tr key={g.simCardId} className="border-b border-line last:border-b-0">
                  <th scope="row" className="px-3 py-3 pl-5 text-left font-semibold">{g.name} — {g.type}</th>
                  <td className="px-3 py-3 text-right tabular-nums">{n(g.sims)}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{n(g.active)}</td>
                  <td className={cn("px-3 py-3 text-right tabular-nums", g.expired > 0 && "font-semibold text-[#B71C1C]")}>{n(g.expired)}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">{g.latestBill ? `${formatKes(g.latestBill.amountMinor)} · ${monthLabel(g.latestBill.period)}` : <span className="text-muted">—</span>}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">{formatKes(g.receivedMinor)}</td>
                  <td className={cn("whitespace-nowrap px-3 py-3 pr-5 text-right font-semibold tabular-nums", g.expectedProfitMinor < 0 ? "text-[#B71C1C]" : "text-[#1B7A34]")}>{formatKes(g.expectedProfitMinor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="overflow-hidden">
          <h2 className="border-b border-line px-5 py-3.5 text-[16px] font-semibold">Recent renewals</h2>
          {d.recentRenewals.length === 0 ? <p className="px-5 py-6 text-muted">No renewals recorded yet.</p> : (
            <ul className="divide-y divide-line">
              {d.recentRenewals.map((r) => (
                <li key={r.id} className="flex items-baseline justify-between gap-3 px-5 py-3">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{r.customerName}</span>
                    <span className="block truncate font-mono text-[12.5px] text-muted">{r.simNumber} · to {longDate(r.newExpiry)}</span>
                  </span>
                  <span className="whitespace-nowrap font-semibold tabular-nums">{formatKes(r.amountMinor)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card className="overflow-hidden">
          <h2 className="border-b border-line px-5 py-3.5 text-[16px] font-semibold">Recent provider bills</h2>
          {d.recentBills.length === 0 ? <p className="px-5 py-6 text-muted">No bills recorded yet. Record them from SIMs by group.</p> : (
            <ul className="divide-y divide-line">
              {d.recentBills.map((b) => (
                <li key={b.id} className="flex items-baseline justify-between gap-3 px-5 py-3">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{b.groupName}</span>
                    <span className="block text-[12.5px] text-muted">{monthLabel(b.period)} · {plural(b.lines, "SIM")}</span>
                  </span>
                  <span className="whitespace-nowrap font-semibold tabular-nums">{formatKes(b.amountMinor)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

// -------------------------------------------------------------- renewals

function RenewalsTab({ today, version, act }: Shared) {
  const [d, setD] = useState<IotRenewalsResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    const r = await erpApi.iotSims.renewals();
    if (r.ok) { setD(r.data); setError(null); } else setError(r.message);
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load, version]);
  if (error) return <Failed message={error} retry={() => void load()} />;
  if (!d) return <Loading />;
  return (
    <div className="flex flex-col gap-5">
      <p className="text-[14px] text-muted">
        <span className={cn("font-semibold", d.expired > 0 ? "text-[#B71C1C]" : "text-ink")}>{n(d.expired)} expired</span> · <span className="font-semibold text-ink">{n(d.dueSoon)} due soon</span> (next 30 days). Suspended SIMs are not listed.
      </p>
      <Card className="overflow-hidden">
        {d.due.length === 0 ? <p className="px-5 py-10 text-center text-muted">Nothing is due. Every active IoT SIM is paid up for more than 30 days.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-[14px]">
              <caption className="sr-only">IoT SIMs expired or due within 30 days</caption>
              <thead>
                <tr className="border-b border-line bg-canvas/60">
                  {["SIM number", "Group", "Customer", "Expiry", "Status", "Fee", ""].map((h, i) => (
                    <th key={i} scope="col" className={cn(th, i === 0 && "pl-5", i === 5 && "text-right", i === 6 && "pr-5")}>{h || <span className="sr-only">Actions</span>}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {d.due.map((s) => (
                  <tr key={s.saleId} className="border-b border-line last:border-b-0">
                    <th scope="row" className="px-3 py-3 pl-5 text-left font-mono text-[13.5px] font-semibold">{s.simNumber || "—"}</th>
                    <td className="px-3 py-3">{s.groupName} — {s.simType}</td>
                    <td className="px-3 py-3"><span className="block font-medium">{s.customerName}</span><span className="block text-[12.5px] text-muted">{s.vehiclePlate}</span></td>
                    <td className="px-3 py-3"><ExpiryText s={s} today={today} /></td>
                    <td className="px-3 py-3">{simExpiry(s, today) === "expired" ? <Pill className="bg-[#FDECEA] text-[#B71C1C]">Expired</Pill> : <Pill className="bg-[#FFF4E5] text-[#9a3300]">Due soon</Pill>}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">{s.renewalFeeMinor != null ? formatKes(s.renewalFeeMinor) : <span className="text-muted">Not set</span>}</td>
                    <td className="px-3 py-2 pr-5 text-right">
                      <button type="button" onClick={() => act({ kind: "renew", sim: s })} aria-label={`Renew SIM ${s.simNumber}`}
                        className="min-h-10 rounded-lg border border-line px-3.5 text-[14px] font-semibold hover:bg-canvas">Renew</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <Card className="overflow-hidden">
        <h2 className="border-b border-line px-5 py-3.5 text-[16px] font-semibold">Recently renewed</h2>
        {d.recent.length === 0 ? <p className="px-5 py-6 text-muted">No renewals recorded yet.</p> : (
          <ul className="divide-y divide-line">
            {d.recent.map((r) => (
              <li key={r.id} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-5 py-3">
                <span className="min-w-0">
                  <span className="block font-medium">{r.customerName} <span className="font-mono text-[13px] font-normal text-muted">{r.simNumber}</span></span>
                  <span className="block text-[12.5px] text-muted">{r.previousExpiry ? `${longDate(r.previousExpiry)} → ` : ""}{longDate(r.newExpiry)}{r.note ? ` · ${r.note}` : ""}</span>
                </span>
                <span className="whitespace-nowrap font-semibold tabular-nums">{formatKes(r.amountMinor)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

// ------------------------------------------------------------------ page

export function IotSimsView() {
  const [tab, setTab] = useState<Tab>("SIMs by client");
  const [version, setVersion] = useState(0);
  const [action, setAction] = useState<SimAction | null>(null);
  const [billGroup, setBillGroup] = useState<IotGroup | null>(null);
  const [addGroup, setAddGroup] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const today = todayInNairobi();
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);

  // Remember the tab in the address (#renewals) so a refresh or a shared link opens it.
  useEffect(() => {
    const fromHash = () => {
      const t = TABS.find((x) => tabId(x) === window.location.hash.slice(1));
      if (t) setTab(t);
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, []);
  const choose = (t: Tab) => {
    setTab(t);
    history.replaceState(null, "", `#${tabId(t)}`);
  };
  const onTabKey = (e: React.KeyboardEvent, i: number) => {
    const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const j = (i + d + TABS.length) % TABS.length;
    choose(TABS[j]);
    tabs.current[j]?.focus();
  };

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 2500);
    return () => clearTimeout(t);
  }, [flash]);
  const done = (message: string) => {
    setAction(null);
    setBillGroup(null);
    setAddGroup(false);
    setFlash(message);
    setVersion((v) => v + 1);
  };
  const copy = (what: string, text: string) => {
    void navigator.clipboard?.writeText(text).then(() => setFlash(`${what} copied`), () => setFlash(`Could not copy the ${what.toLowerCase()}`));
  };
  const shared: Shared = { today, version, act: setAction, copy };

  return (
    <>
      <PageHeader title="IoT SIMs" subtitle="Every IoT SIM sold through Package and Hosting sales, grouped by the SIM card in inventory, with renewals and provider billing." />
      <div role="tablist" aria-label="IoT SIM views" className="mb-5 mt-4 flex gap-1 overflow-x-auto border-b border-line [scrollbar-width:none]">
        {TABS.map((t, i) => (
          <button key={t} ref={(el) => { tabs.current[i] = el; }} type="button" role="tab" id={`tab-${tabId(t)}`} aria-selected={tab === t} aria-controls={`panel-${tabId(t)}`}
            tabIndex={tab === t ? 0 : -1} onClick={() => choose(t)} onKeyDown={(e) => onTabKey(e, i)}
            className={cn("-mb-px min-h-11 shrink-0 whitespace-nowrap border-b-2 px-3.5 text-[14.5px] font-semibold", tab === t ? "border-brand text-ink" : "border-transparent text-muted hover:text-ink")}>
            {t}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${tabId(tab)}`} aria-labelledby={`tab-${tabId(tab)}`}>
        {tab === "SIMs by client" && <ByClient {...shared} />}
        {tab === "SIMs by group" && <ByGroup {...shared} onBill={setBillGroup} onAddGroup={() => setAddGroup(true)} />}
        {tab === "Overview" && <OverviewTab version={version} />}
        {tab === "Renewals" && <RenewalsTab {...shared} />}
      </div>

      <SimActionDialog action={action} onClose={() => setAction(null)} onDone={done} />
      <BillDialog group={billGroup} onClose={() => setBillGroup(null)} onDone={done} />
      <AddGroupDialog open={addGroup} onClose={() => setAddGroup(false)} onDone={done} />
      {flash && <div role="status" className="fixed bottom-5 left-1/2 z-30 -translate-x-1/2 rounded-xl bg-ink px-4 py-2.5 text-[14px] font-medium text-white shadow-lg">{flash}</div>}
      <p className="mt-6 text-[12.5px] text-muted">
        IoT SIMs come from sales that took an IoT SIM card out of stock. <Link href="/sales" className="font-semibold text-navy hover:underline">See all sales</Link>
      </p>
    </>
  );
}
