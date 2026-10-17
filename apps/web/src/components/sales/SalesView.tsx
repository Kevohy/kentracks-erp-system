"use client";

import Link from "next/link";
import { PageHeader } from "@/components/shell/PageHeader";
import { Card } from "@/components/dashboard/Card";
import { cn } from "@/lib/cn";
import { formatKes, formatSigned, paymentState } from "@/lib/sales-format";
import { useSales } from "./SalesProvider";

const statusStyle = { "Paid in full": "bg-[#E6F4EA] text-[#1B5E20]", "Partly paid": "bg-[#FFF4E5] text-[#9a3300]", Unpaid: "bg-[#FDECEA] text-[#B71C1C]" } as const;
const th = "px-4 py-3 font-medium";
const secondary = "inline-flex min-h-11 items-center rounded-xl border border-line bg-white px-4 text-[15px] font-semibold hover:bg-canvas";

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
const itemsSummary = (products: number, cards: number) => `${plural(products, "product")}, ${plural(cards, "card")}`;

export function SalesView() {
  const { sales } = useSales();

  return (
    <>
      <PageHeader
        title="Sales"
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

      <Card className="overflow-hidden">
        <div className="hidden overflow-x-auto lg:block">
          <table className="w-full min-w-[1000px] border-collapse text-left text-[14.5px]">
            <caption className="sr-only">Completed sales (this session, amounts in KES)</caption>
            <thead>
              <tr className="border-b border-line text-[13px] text-muted">
                <th scope="col" className={cn(th, "pl-6")}>Sale type</th>
                <th scope="col" className={th}>Customer</th>
                <th scope="col" className={th}>Vehicle plate</th>
                <th scope="col" className={th}>IMEI</th>
                <th scope="col" className={th}>Package</th>
                <th scope="col" className={cn(th, "text-right")}>Total</th>
                <th scope="col" className={cn(th, "text-right")}>Amount paid</th>
                <th scope="col" className={cn(th, "text-right")}>Balance</th>
                <th scope="col" className={cn(th, "text-right")}>Profit</th>
                <th scope="col" className={cn(th, "pr-6")}>Payment status</th>
              </tr>
            </thead>
            <tbody>
              {sales.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-6 py-12 text-center text-muted">
                    No sales yet. Complete a sale and it will appear here.
                  </td>
                </tr>
              )}
              {sales.map((s) => {
                const st = paymentState(s);
                return (
                  <tr key={s.id} className="border-b border-line last:border-b-0">
                    <th scope="row" className="whitespace-nowrap px-4 py-3.5 pl-6 font-semibold">{s.type}</th>
                    <td className="px-4 py-3.5">{s.customerName}</td>
                    <td className="whitespace-nowrap px-4 py-3.5">{s.type === "Retailer Sale" ? "—" : s.vehiclePlate || "—"}</td>
                    <td className="whitespace-nowrap px-4 py-3.5 font-mono text-[13.5px]">
                      {s.type === "Retailer Sale" ? "—" : s.imei}
                      {s.type !== "Retailer Sale" && s.verificationSource === "mock" && <span className="block font-sans text-[12px] text-muted">mock verification</span>}
                    </td>
                    <td className="px-4 py-3.5">{s.type === "Retailer Sale" ? itemsSummary(s.productLines.length, s.cardLines.length) : s.packageName}</td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-right tabular-nums">{formatKes(s.totalMinor)}</td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-right tabular-nums">{formatKes(s.paidMinor)}</td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-right font-semibold tabular-nums">{formatKes(s.totalMinor - s.paidMinor)}</td>
                    <td className={cn("whitespace-nowrap px-4 py-3.5 text-right font-semibold tabular-nums", s.profitMinor < 0 ? "text-[#B71C1C]" : "text-[#1B5E20]")}>{formatSigned(s.profitMinor)}</td>
                    <td className="px-4 py-3.5 pr-6">
                      <span className={cn("inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-[13px] font-semibold", statusStyle[st])}>{st}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <ul aria-label="Completed sales" className="divide-y divide-line lg:hidden">
          {sales.length === 0 && <li className="px-5 py-10 text-center text-muted">No sales yet. Complete a sale and it will appear here.</li>}
          {sales.map((s) => {
            const st = paymentState(s);
            const retailer = s.type === "Retailer Sale";
            return (
              <li key={s.id} className="flex flex-col gap-3 px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-muted">{s.type}</p>
                    <p className="break-words text-[16px] font-semibold">{s.customerName}</p>
                  </div>
                  <span className={cn("inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-[13px] font-semibold", statusStyle[st])}>{st}</span>
                </div>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[14px] sm:grid-cols-3">
                  {!retailer && <div className="min-w-0"><dt className="text-[12.5px] text-muted">Vehicle plate</dt><dd className="break-words">{s.vehiclePlate || "—"}</dd></div>}
                  {!retailer && <div className="min-w-0"><dt className="text-[12.5px] text-muted">IMEI</dt><dd className="break-all font-mono text-[13px]">{s.imei}{s.verificationSource === "mock" && <span className="block font-sans text-[12px] text-muted">mock verification</span>}</dd></div>}
                  <div className="min-w-0"><dt className="text-[12.5px] text-muted">{retailer ? "Items" : "Package"}</dt><dd className="break-words">{retailer ? itemsSummary(s.productLines.length, s.cardLines.length) : s.packageName}</dd></div>
                  <div className="min-w-0"><dt className="text-[12.5px] text-muted">Total</dt><dd className="tabular-nums">{formatKes(s.totalMinor)}</dd></div>
                  <div className="min-w-0"><dt className="text-[12.5px] text-muted">Amount paid</dt><dd className="tabular-nums">{formatKes(s.paidMinor)}</dd></div>
                  <div className="min-w-0"><dt className="text-[12.5px] text-muted">Balance</dt><dd className="font-semibold tabular-nums">{formatKes(s.totalMinor - s.paidMinor)}</dd></div>
                  <div className="min-w-0"><dt className="text-[12.5px] text-muted">Profit</dt><dd className={cn("font-semibold tabular-nums", s.profitMinor < 0 ? "text-[#B71C1C]" : "text-[#1B5E20]")}>{formatSigned(s.profitMinor)}</dd></div>
                </dl>
              </li>
            );
          })}
        </ul>
      </Card>
    </>
  );
}
