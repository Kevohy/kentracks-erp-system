"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, Search, Users } from "lucide-react";
import { PageHeader } from "@/components/shell/PageHeader";
import { Card } from "@/components/dashboard/Card";
import { cn } from "@/lib/cn";
import { crmApi } from "@/lib/crm-api";
import { customerTypes, type Customer, type CustomerType } from "@/lib/customers";
import { localPhone } from "@/lib/sms";
import { useCrmList } from "@/components/crm/useCrmList";
import { AddCustomerDialog } from "./AddCustomerDialog";
import { CustomerDetailsDialog } from "./CustomerDetailsDialog";

const typeStyle: Record<CustomerType, string> = {
  "End User": "bg-tint text-navy",
  Distributor: "bg-[#FFF1EA] text-[#B43A00]",
  Company: "bg-canvas text-ink",
};

const phoneText = (p: string) => (p.startsWith("+254") ? localPhone(p) : p);
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?";

/** Row heights (px) used to fit one page of customers to the screen: table rows on wide screens, cards on phones. */
const ROW_WIDE = 57;
const ROW_PHONE = 72;

/**
 * How many customers fit on the screen below the list's top edge, leaving room for the pager (and the phone's bottom
 * menu). Re-measured when the window is resized or the phone is turned.
 */
function useRowsThatFit(ref: React.RefObject<HTMLElement | null>, ready: boolean) {
  const [rows, setRows] = useState(10);
  useEffect(() => {
    const measure = () => {
      const el = ref.current;
      if (!el) return;
      const wide = window.matchMedia("(min-width: 768px)").matches;
      const top = el.getBoundingClientRect().top + window.scrollY;
      const below = wide ? 44 + 64 + 24 : 64 + 104; // table header + pager + margin; phones: pager + bottom menu
      const fit = Math.floor((window.innerHeight - top - below) / (wide ? ROW_WIDE : ROW_PHONE));
      setRows(Math.max(4, Math.min(50, fit)));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [ref, ready]);
  return rows;
}

export function CustomersView() {
  const { state, retry, prepend, replace } = useCrmList(crmApi.customers.list);
  const { state: brandState } = useCrmList(crmApi.brands.list);
  const brands = brandState.status === "ready" ? brandState.items : [];
  const customers = useMemo(() => (state.status === "ready" ? state.items : []), [state]);
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = customers.find((c) => c.id === selectedId) ?? null;
  const [q, setQ] = useState("");
  const [type, setType] = useState<CustomerType | "All">("All");
  const [page, setPage] = useState(0);

  const listRef = useRef<HTMLDivElement>(null);
  const perPage = useRowsThatFit(listRef, state.status === "ready");

  const shown = useMemo(() => {
    const query = q.trim().toLowerCase();
    const digits = query.replace(/[\s+-]/g, "");
    return customers.filter((c) => (type === "All" || c.type === type)
      && (!query || [c.name, c.account, c.email, c.location, c.brandName ?? ""].some((x) => x.toLowerCase().includes(query))
        || (digits.length >= 3 && /^\d+$/.test(digits) && (c.phone.includes(digits) || phoneText(c.phone).replace(/\s/g, "").includes(digits)))));
  }, [customers, q, type]);
  const pages = Math.max(1, Math.ceil(shown.length / perPage));
  const current = Math.min(page, pages - 1);
  const rows = shown.slice(current * perPage, current * perPage + perPage);
  const from = shown.length ? current * perPage + 1 : 0;
  const to = current * perPage + rows.length;
  const counts = useMemo(() => Object.fromEntries(customerTypes.map((t) => [t, customers.filter((c) => c.type === t).length])), [customers]);

  const pickType = (t: CustomerType | "All") => { setType(t); setPage(0); };

  return (
    <>
      <PageHeader
        title="Customers"
        aside={
          <button type="button" onClick={() => setOpen(true)}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-brand px-4 text-[15px] font-semibold text-white hover:brightness-95">
            <Plus size={18} aria-hidden="true" />
            Add Customer
          </button>
        }
      />

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-line px-4 py-3 md:flex-row md:items-center md:px-5">
          <label className="relative block min-w-0 flex-1">
            <span className="sr-only">Search customers</span>
            <Search size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
            <input type="search" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} placeholder="Search name, phone, account, email…"
              className="min-h-11 w-full rounded-xl border border-line bg-white pl-9 pr-3 text-[16px] outline-none focus:border-navy md:text-[15px]" />
          </label>
          <div role="group" aria-label="Type" className="-mx-1 flex gap-1 overflow-x-auto px-1">
            {(["All", ...customerTypes] as const).map((t) => (
              <button key={t} type="button" aria-pressed={type === t} onClick={() => pickType(t)}
                className={cn("min-h-9 shrink-0 whitespace-nowrap rounded-full px-3 text-[13.5px] font-semibold",
                  type === t ? "bg-navy text-white" : "bg-canvas text-muted hover:text-ink")}>
                {t}<span className={cn("ml-1.5 tabular-nums", type === t ? "text-white/70" : "text-muted/70")}>{t === "All" ? customers.length : counts[t]}</span>
              </button>
            ))}
          </div>
        </div>

        <div ref={listRef}>
          {state.status === "loading" && <p role="status" className="px-6 py-12 text-center text-muted">Loading…</p>}
          {state.status === "error" && (
            <div role="alert" className="flex flex-col items-center gap-3 px-6 py-12 text-center">
              <span className="text-[#C62828]">{state.message}</span>
              <button type="button" onClick={retry} className="min-h-11 rounded-xl border border-line px-4 text-[15px] font-semibold hover:bg-canvas">Try again</button>
            </div>
          )}
          {state.status === "ready" && shown.length === 0 && (
            <div className="px-6 py-12 text-center">
              <Users size={28} className="mx-auto text-muted" aria-hidden="true" />
              <p className="mt-2 font-semibold">{customers.length ? "No customer matches" : "No customers yet"}</p>
              <p className="text-[14px] text-muted">{customers.length ? "Try another name, phone or account." : "Use Add Customer to create the first one."}</p>
            </div>
          )}

          {rows.length > 0 && (
            <>
              {/* Wide screens: a table. */}
              <table className="hidden w-full table-fixed border-collapse text-left text-[14.5px] md:table">
                <caption className="sr-only">Customers, page {current + 1} of {pages}</caption>
                <thead>
                  <tr className="h-11 border-b border-line text-[12.5px] uppercase tracking-[0.06em] text-muted">
                    <th scope="col" className="w-[30%] px-5 font-semibold">Customer</th>
                    <th scope="col" className="w-[13%] px-3 font-semibold">Type</th>
                    <th scope="col" className="w-[15%] px-3 font-semibold">Phone</th>
                    <th scope="col" className="hidden w-[22%] px-3 font-semibold lg:table-cell">Email</th>
                    <th scope="col" className="w-[20%] px-3 pr-5 font-semibold">Location</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((c) => (
                    <tr key={c.id} onClick={() => setSelectedId(c.id)} className="h-[57px] cursor-pointer border-b border-line last:border-b-0 hover:bg-canvas">
                      <th scope="row" className="px-5 font-normal">
                        <button type="button" onClick={(e) => { e.stopPropagation(); setSelectedId(c.id); }} aria-label={`View ${c.name}`}
                          className="flex w-full min-w-0 items-center gap-3 text-left">
                          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-tint text-[12.5px] font-semibold text-navy" aria-hidden="true">{initials(c.name)}</span>
                          <span className="min-w-0">
                            <span className="block truncate font-semibold">{c.name}</span>
                            <span className="block truncate text-[12.5px] text-muted">{c.account}{c.brandName ? ` · ${c.brandName}` : ""}</span>
                          </span>
                        </button>
                      </th>
                      <td className="px-3"><span className={cn("rounded-full px-2.5 py-1 text-[12.5px] font-medium", typeStyle[c.type])}>{c.type}</span></td>
                      <td className="truncate whitespace-nowrap px-3 tabular-nums">{c.phone ? phoneText(c.phone) : <span className="text-muted">—</span>}</td>
                      <td className="hidden truncate px-3 text-muted lg:table-cell">{c.email || "—"}</td>
                      <td className="truncate px-3 pr-5">{c.location}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Phones: compact cards. */}
              <ul className="divide-y divide-line md:hidden">
                {rows.map((c) => (
                  <li key={c.id}>
                    <button type="button" onClick={() => setSelectedId(c.id)} aria-label={`View ${c.name}`}
                      className="flex h-[72px] w-full items-center gap-3 px-4 text-left active:bg-canvas">
                      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-tint text-[13px] font-semibold text-navy" aria-hidden="true">{initials(c.name)}</span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate font-semibold">{c.name}</span>
                          <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11.5px] font-medium", typeStyle[c.type])}>{c.type}</span>
                        </span>
                        <span className="block truncate text-[13px] text-muted">{[c.phone && phoneText(c.phone), c.email, c.location].filter(Boolean).join(" · ")}</span>
                      </span>
                      <ChevronRight size={18} className="shrink-0 text-muted" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        {shown.length > 0 && (
          <nav aria-label="Pages" className="flex items-center justify-between gap-3 border-t border-line px-4 py-3 md:px-5">
            <p className="text-[13.5px] text-muted" aria-live="polite">
              <span className="font-semibold text-ink tabular-nums">{from}–{to}</span> of <span className="tabular-nums">{shown.length.toLocaleString("en-US")}</span>
            </p>
            <div className="flex items-center gap-1.5">
              <button type="button" onClick={() => setPage(current - 1)} disabled={current === 0} aria-label="Previous page"
                className="grid size-10 place-items-center rounded-xl border border-line hover:bg-canvas disabled:opacity-40">
                <ChevronLeft size={18} aria-hidden="true" />
              </button>
              <span className="min-w-[4.5rem] text-center text-[13.5px] tabular-nums">Page {current + 1} / {pages}</span>
              <button type="button" onClick={() => setPage(current + 1)} disabled={current >= pages - 1} aria-label="Next page"
                className="grid size-10 place-items-center rounded-xl border border-line hover:bg-canvas disabled:opacity-40">
                <ChevronRight size={18} aria-hidden="true" />
              </button>
            </div>
          </nav>
        )}
      </Card>

      <AddCustomerDialog
        brands={brands}
        existing={customers}
        open={open}
        onClose={() => setOpen(false)}
        onAdd={async (t, values) => {
          const r = await crmApi.customers.create(t, values);
          if (r.ok) {
            prepend(r.data);
            setType("All");
            setQ("");
            setPage(0);
          }
          return r.ok ? { ok: true } : r;
        }}
      />
      <CustomerDetailsDialog
        brands={brands}
        existing={customers}
        customer={selected as Customer | null}
        onClose={() => setSelectedId(null)}
        onSave={async (c, t, values) => {
          const r = await crmApi.customers.update(c.id, t, values);
          if (r.ok) replace(r.data);
          return r.ok ? { ok: true } : r;
        }}
      />
    </>
  );
}
