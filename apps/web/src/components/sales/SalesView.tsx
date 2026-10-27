"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Eye, HandCoins, Loader2, Search } from "lucide-react";
import { ListStatusRow, type ListState } from "@/components/crm/useCrmList";
import { PageHeader } from "@/components/shell/PageHeader";
import { Card } from "@/components/dashboard/Card";
import { cn } from "@/lib/cn";
import { erpApi } from "@/lib/erp-api";
import type { Sale, SalesPage, SaleType } from "@/lib/sales";
import { formatKes, formatSigned, paymentState } from "@/lib/sales-format";
import { AirtimeStatusPill, SmsReminderPill } from "./SaleAirtimeService";
import { SaleDetailsDialog, formatSaleDate } from "./SaleDetailsDialog";

const oldSaleOf = (s: Sale) => s.type !== "Retailer Sale" && s.oldSale;
const statusStyle = { "Paid in full": "bg-[#E6F4EA] text-[#1B5E20]", "Partly paid": "bg-[#FFF4E5] text-[#9a3300]", Unpaid: "bg-[#FDECEA] text-[#B71C1C]" } as const;
const typeStyle: Record<SaleType, string> = { "Package Sale": "bg-tint text-navy", "Hosting Sale": "bg-[#EEF1F4] text-[#33414d]", "Retailer Sale": "bg-[#FFF1EA] text-[#B43A00]" };
const th = "px-4 py-3 font-medium";
const secondary = "inline-flex min-h-11 items-center rounded-xl border border-line bg-white px-4 text-[15px] font-semibold hover:bg-canvas";
const filters = ["All", "Package Sale", "Hosting Sale", "Retailer Sale"] as const;

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
const shortDate = (iso: string) => new Date(iso).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" });

/** What the sale was, in one line: the package (and device), or the retailer items. */
function summary(s: Sale): { main: string; sub?: string } {
  if (s.type === "Retailer Sale") return { main: `${plural(s.productLines.length, "product")}, ${plural(s.cardLines.length, "card")}` };
  return { main: s.packageName, sub: [s.vehiclePlate, s.imei].filter(Boolean).join(" · ") };
}

const PAGE = 50;
type Totals = NonNullable<SalesPage["totals"]>;

/**
 * The sale history, read page by page from the server (search, filter and totals are worked out in the
 * database), so it stays quick however many sales there are.
 */
function useSaleHistory(q: string, type: string) {
  const [items, setItems] = useState<Sale[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [state, setState] = useState<{ status: "loading" | "ready" | "more" } | { status: "error"; message: string }>({ status: "loading" });
  const request = useRef(0);

  const fetchPage = useCallback(
    async (after: string | null) => {
      const id = ++request.current;
      setState({ status: after ? "more" : "loading" });
      const r = await erpApi.sales.history({ cursor: after, q, type, limit: PAGE });
      if (id !== request.current) return; // a newer search replaced this one
      if (!r.ok) return setState({ status: "error", message: r.message });
      setItems((prev) => (after ? [...prev, ...r.data.items.filter((s) => !prev.some((p) => p.id === s.id))] : r.data.items));
      if (r.data.totals) setTotals(r.data.totals);
      setCursor(r.data.nextCursor);
      setState({ status: "ready" });
    },
    [q, type],
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchPage(null);
  }, [fetchPage]);

  /** A sale changed (a payment was recorded): show its new amounts and move the outstanding total by the same. */
  const itemsNow = useRef(items);
  useEffect(() => {
    itemsNow.current = items;
  }, [items]);
  const replace = useCallback((sale: Sale) => {
    const old = itemsNow.current.find((s) => s.id === sale.id);
    if (!old) return;
    const delta = sale.paidMinor - old.paidMinor;
    itemsNow.current = itemsNow.current.map((s) => (s.id === sale.id ? sale : s));
    setItems((prev) => prev.map((s) => (s.id === sale.id ? sale : s)));
    if (delta) setTotals((t) => (t ? { ...t, balanceMinor: t.balanceMinor - delta } : t));
  }, []);

  return { items, totals, hasMore: cursor !== null, state, loadMore: () => cursor && state.status === "ready" && fetchPage(cursor), reload: () => fetchPage(null), replace };
}

export function SalesView() {
  const [query, setQuery] = useState("");
  const [q, setQ] = useState("");
  const [type, setType] = useState<(typeof filters)[number]>("All");
  const [viewId, setViewId] = useState<string | null>(null);
  const [payFirst, setPayFirst] = useState(false);
  const open = (id: string, pay = false) => {
    setPayFirst(pay);
    setViewId(id);
  };
  const owes = (s: Sale) => !oldSaleOf(s) && s.paidMinor < s.totalMinor;

  // Search once typing pauses.
  useEffect(() => {
    const t = setTimeout(() => setQ(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  const { items: shown, totals: serverTotals, hasMore, state, loadMore, reload, replace } = useSaleHistory(q, type === "All" ? "" : type);
  const totals = { revenue: serverTotals?.revenueMinor ?? 0, balance: serverTotals?.balanceMinor ?? 0, profit: serverTotals?.profitMinor ?? 0 };
  const listState: ListState<unknown> =
    state.status === "error" ? state : state.status === "loading" ? { status: "loading" } : { status: "ready", items: shown };
  const load = listState;
  const anySales = !!serverTotals && (serverTotals.count > 0 || q !== "" || type !== "All");
  const emptyText = !q && type === "All" ? "No sales yet. Complete a sale and it will appear here." : "No sales match your search.";
  const viewing = shown.find((s) => s.id === viewId) ?? null;

  // Load the next page when the end of the list scrolls into view.
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasMore) return;
    const io = new IntersectionObserver((e) => e[0]?.isIntersecting && loadMore(), { rootMargin: "400px" });
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, loadMore]);

  return (
    <>
      <PageHeader
        title="Sales"
        subtitle="Every completed sale. Use View to see the full record and what it took out of inventory."
        aside={
          <div className="flex flex-wrap gap-2">
            <Link href="/sales/package" className="inline-flex min-h-11 items-center rounded-xl bg-brand px-4 text-[15px] font-semibold text-white hover:brightness-95">
              Package Sale
            </Link>
            <Link href="/sales/hosting" className={secondary}>Hosting Sale</Link>
            <Link href="/sales/retailer" className={secondary}>Retailer Sale</Link>
          </div>
        }
      />

      {anySales && (
        <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            ["Sales", (serverTotals?.count ?? 0).toLocaleString("en-KE") + (serverTotals?.oldSales ? ` (${serverTotals.oldSales.toLocaleString("en-KE")} old)` : ""), ""],
            ["Revenue", formatKes(totals.revenue), ""],
            ["Outstanding balance", formatKes(totals.balance), totals.balance > 0 ? "text-[#9a3300]" : ""],
            ["Profit", formatSigned(totals.profit), totals.profit < 0 ? "text-[#B71C1C]" : "text-[#1B5E20]"],
          ].map(([label, value, tone]) => (
            <Card key={label} className="px-4 py-3.5">
              <p className="text-[13px] text-muted">{label}</p>
              <p className={cn("mt-0.5 truncate text-[18px] font-semibold tabular-nums sm:text-[20px]", tone)}>{value}</p>
            </Card>
          ))}
        </div>
      )}

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-line px-4 py-3.5 sm:px-6 md:flex-row md:items-center md:justify-between">
          <label className="relative block w-full md:max-w-sm">
            <span className="sr-only">Search sales</span>
            <Search size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search customer, IMEI, plate or package"
              className="min-h-11 w-full rounded-xl border border-line bg-white pl-10 pr-3.5 text-[15px] placeholder:text-muted/70"
            />
          </label>
          <div role="group" aria-label="Sale type" className="flex gap-1 overflow-x-auto rounded-xl bg-canvas p-1">
            {filters.map((f) => (
              <button
                key={f}
                type="button"
                aria-pressed={type === f}
                onClick={() => setType(f)}
                className={cn("min-h-10 shrink-0 whitespace-nowrap rounded-lg px-3 text-[14px] font-medium", type === f ? "bg-white text-navy shadow-sm" : "text-muted hover:text-ink")}
              >
                {f === "All" ? "All" : f.replace(" Sale", "")}
              </button>
            ))}
          </div>
        </div>

        {/* Wide screens: table */}
        <div className="hidden overflow-x-auto 2xl:block">
          <table className="w-full border-collapse text-left text-[14.5px]">
            <caption className="sr-only">Completed sales (amounts in KES)</caption>
            <thead>
              <tr className="border-b border-line bg-canvas/60 text-[13px] text-muted">
                <th scope="col" className={cn(th, "pl-6")}>Customer</th>
                <th scope="col" className={th}>Sale</th>
                <th scope="col" className={cn(th, "text-right")}>Total</th>
                <th scope="col" className={cn(th, "text-right")}>Balance</th>
                <th scope="col" className={cn(th, "text-right")}>Profit</th>
                <th scope="col" className={th}>Payment</th>
                <th scope="col" className={cn(th, "pr-6")}><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              <ListStatusRow state={listState} colSpan={7} empty={emptyText} retry={() => void reload()} />
              {shown.map((s) => {
                const st = paymentState(s);
                const sm = summary(s);
                return (
                  <tr key={s.id} className="border-b border-line last:border-b-0 hover:bg-canvas/50">
                    <th scope="row" className="px-4 py-3.5 pl-6 font-semibold">
                      {s.customerName}
                      <span className="mt-1 flex flex-wrap items-center gap-1.5 font-normal">
                        <span className={cn("rounded-full px-2 py-0.5 text-[12px] font-medium", typeStyle[s.type])}>{s.type}</span>
                        {s.type !== "Retailer Sale" && s.sim.airtimeStatus && <AirtimeStatusPill status={s.sim.airtimeStatus} prefix />}
                        {s.type !== "Retailer Sale" && s.sim.reminder && <SmsReminderPill status={s.sim.reminder.status} prefix />}
                        <span className="text-[12.5px] text-muted">{shortDate(s.createdAt)}</span>
                      </span>
                    </th>
                    <td className="max-w-[220px] px-4 py-3.5">
                      <span className="block truncate">{sm.main}</span>
                      {sm.sub && <span className="block truncate font-mono text-[12.5px] text-muted">{sm.sub}</span>}
                    </td>
                    {oldSaleOf(s) ? (
                      <td colSpan={3} className="px-4 py-3.5 text-right text-[13.5px] text-muted">
                        {s.type !== "Retailer Sale" && s.oldPriceMinor != null && <span className="mr-2 font-medium text-ink tabular-nums">Was {formatKes(s.oldPriceMinor)}</span>}
                        Not counted in revenue or profit
                      </td>
                    ) : (
                      <>
                        <td className="whitespace-nowrap px-4 py-3.5 text-right tabular-nums">{formatKes(s.totalMinor)}</td>
                        <td className="whitespace-nowrap px-4 py-3.5 text-right font-semibold tabular-nums">{formatKes(s.totalMinor - s.paidMinor)}</td>
                        <td className={cn("whitespace-nowrap px-4 py-3.5 text-right font-semibold tabular-nums", s.profitMinor < 0 ? "text-[#B71C1C]" : "text-[#1B5E20]")}>{formatSigned(s.profitMinor)}</td>
                      </>
                    )}
                    <td className="px-4 py-3.5">
                      {oldSaleOf(s)
                        ? <span className="inline-block whitespace-nowrap rounded-full bg-tint px-2.5 py-0.5 text-[13px] font-semibold text-navy">Old sale</span>
                        : <span className={cn("inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-[13px] font-semibold", statusStyle[st])}>{st}</span>}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 pr-6 text-right">
                      {owes(s) && (
                        <button type="button" onClick={() => open(s.id, true)} aria-label={`Record payment for ${s.customerName}`}
                          className="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-[14px] font-semibold text-brand hover:bg-[#FFF1EA]">
                          <HandCoins size={16} aria-hidden="true" />
                          Record payment
                        </button>
                      )}
                      <button type="button" onClick={() => open(s.id)} aria-label={`View sale to ${s.customerName}`}
                        className="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-[14px] font-semibold text-navy hover:bg-tint">
                        <Eye size={16} aria-hidden="true" />
                        View
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Phones and tablets: cards */}
        <ul aria-label="Completed sales" className="divide-y divide-line 2xl:hidden md:grid md:grid-cols-2 md:divide-y-0 md:gap-px md:bg-line">
          {listState.status === "loading" && <li role="status" className="bg-white px-5 py-10 text-center text-muted md:col-span-2">Loading…</li>}
          {listState.status === "error" && (
            <li role="alert" className="flex flex-col items-center gap-3 bg-white px-5 py-10 text-center md:col-span-2">
              <span className="text-[#C62828]">{listState.message}</span>
              <button type="button" onClick={() => void reload()} className="min-h-11 rounded-xl border border-line px-4 text-[15px] font-semibold hover:bg-canvas">Try again</button>
            </li>
          )}
          {load.status === "ready" && shown.length === 0 && <li className="bg-white px-5 py-10 text-center text-muted md:col-span-2">{emptyText}</li>}
          {shown.map((s) => {
            const st = paymentState(s);
            const sm = summary(s);
            return (
              <li key={s.id} className="flex flex-col gap-3 bg-white px-4 py-4 sm:px-6">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={cn("rounded-full px-2 py-0.5 text-[12px] font-medium", typeStyle[s.type])}>{s.type}</span>
                        {s.type !== "Retailer Sale" && s.sim.airtimeStatus && <AirtimeStatusPill status={s.sim.airtimeStatus} prefix />}
                        {s.type !== "Retailer Sale" && s.sim.reminder && <SmsReminderPill status={s.sim.reminder.status} prefix />}
                      <span className="text-[12.5px] text-muted">{formatSaleDate(s.createdAt)}</span>
                    </div>
                    <p className="mt-1 break-words text-[16px] font-semibold">{s.customerName}</p>
                    <p className="break-words text-[14px]">{sm.main}</p>
                    {sm.sub && <p className="break-all font-mono text-[12.5px] text-muted">{sm.sub}</p>}
                  </div>
                  {oldSaleOf(s)
                    ? <span className="shrink-0 whitespace-nowrap rounded-full bg-tint px-2.5 py-0.5 text-[12.5px] font-semibold text-navy">Old sale</span>
                    : <span className={cn("shrink-0 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[12.5px] font-semibold", statusStyle[st])}>{st}</span>}
                </div>
                {oldSaleOf(s) ? (
                  <p className="rounded-xl bg-canvas px-3 py-2.5 text-[13.5px] text-muted">
                    {s.type !== "Retailer Sale" && s.oldPriceMinor != null && <><span className="font-semibold text-ink tabular-nums">Was {formatKes(s.oldPriceMinor)}</span>{" · "}</>}
                    Recorded for tracking only. Not counted in inventory, revenue or profit.
                  </p>
                ) : (
                <dl className="grid grid-cols-3 gap-2 rounded-xl bg-canvas px-3 py-2.5 text-[13.5px]">
                  <div className="min-w-0"><dt className="text-[12px] text-muted">Total</dt><dd className="truncate font-medium tabular-nums">{formatKes(s.totalMinor)}</dd></div>
                  <div className="min-w-0"><dt className="text-[12px] text-muted">Balance</dt><dd className="truncate font-semibold tabular-nums">{formatKes(s.totalMinor - s.paidMinor)}</dd></div>
                  <div className="min-w-0"><dt className="text-[12px] text-muted">Profit</dt><dd className={cn("truncate font-semibold tabular-nums", s.profitMinor < 0 ? "text-[#B71C1C]" : "text-[#1B5E20]")}>{formatSigned(s.profitMinor)}</dd></div>
                </dl>
                )}
                <div className={cn("grid gap-2", owes(s) && "grid-cols-2")}>
                  {owes(s) && (
                    <button type="button" onClick={() => open(s.id, true)} aria-label={`Record payment for ${s.customerName}`}
                      className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-brand px-2 text-[14.5px] font-semibold text-white hover:brightness-95">
                      <HandCoins size={16} aria-hidden="true" />
                      Record payment
                    </button>
                  )}
                  <button type="button" onClick={() => open(s.id)} aria-label={`View sale to ${s.customerName}`}
                    className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-line px-2 text-[14.5px] font-semibold text-navy hover:bg-tint">
                    <Eye size={16} aria-hidden="true" />
                    View details
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
        <div ref={sentinel} className="flex flex-col items-center gap-2 border-t border-line px-4 py-4 text-[14px] text-muted">
          {state.status === "more" && (
            <span role="status" className="inline-flex items-center gap-2">
              <Loader2 size={16} className="animate-spin" aria-hidden="true" /> Loading more…
            </span>
          )}
          {state.status === "ready" && hasMore && (
            <button type="button" onClick={() => loadMore()} className="min-h-11 rounded-xl border border-line px-4 text-[14.5px] font-semibold text-ink hover:bg-canvas">
              Load more
            </button>
          )}
          {state.status === "ready" && serverTotals && shown.length > 0 && (
            <span>
              Showing {shown.length.toLocaleString("en-KE")} of {serverTotals.count.toLocaleString("en-KE")} sales
            </span>
          )}
        </div>
      </Card>

      <SaleDetailsDialog sale={viewing} startWithPayment={payFirst} onUpdated={replace} onClose={() => setViewId(null)} />
    </>
  );
}
