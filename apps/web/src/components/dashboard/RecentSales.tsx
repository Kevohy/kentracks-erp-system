import Link from "next/link";
import { salePayment, shortDate, wholeKes, type DashboardSummary, type PaymentStatus } from "@/lib/dashboard";
import { cn } from "@/lib/cn";
import { Panel } from "./Card";

const pill: Record<PaymentStatus, string> = {
  Paid: "bg-[#e4f3ea] text-[#14633a]",
  "Part paid": "bg-[#fff1d6] text-[#7a5200]",
  Unpaid: "bg-[#fce7e4] text-[#9e241a]",
};

const th = "whitespace-nowrap border-b border-line pb-2.5 pr-3 text-left text-[12.5px] font-semibold uppercase tracking-[0.6px] text-muted";
const td = "border-b border-line py-3.5 pr-3 text-[14.5px]";

export function RecentSales({ data }: { data: DashboardSummary }) {
  const sales = data.recentSales;
  return (
    <Panel
      title="Recent sales"
      subtitle="Latest five · amounts in KES"
      aside={<Link href="/sales" className="text-[13.5px] font-semibold text-navy hover:underline">All sales</Link>}
    >
      {sales.length === 0 ? (
        <p className="text-[14.5px] text-muted">No sales recorded yet.</p>
      ) : (
        <div className="-mx-1 overflow-x-auto px-1">
          <table className="w-full border-collapse">
            <caption className="sr-only">Latest five sales</caption>
            <thead>
              <tr>
                <th scope="col" className={th}>Sale</th>
                <th scope="col" className={cn(th, "hidden sm:table-cell")}>Customer</th>
                <th scope="col" className={cn(th, "hidden sm:table-cell")}>Date</th>
                <th scope="col" className={cn(th, "pr-3 text-right sm:pr-5")}>Amount</th>
                <th scope="col" className={th}>Status</th>
              </tr>
            </thead>
            <tbody>
              {sales.map((s, i) => {
                const status = salePayment(s);
                const cell = cn(td, i === sales.length - 1 && "border-b-0 pb-0");
                return (
                  <tr key={s.id}>
                    <td className={cn(cell, "min-w-0")}>
                      <span className="block whitespace-nowrap font-semibold text-navy">{s.type}</span>
                      <span className="block text-[13px] text-muted">
                        {s.vehiclePlate || <span className="sm:hidden">{shortDate(s.date)}</span>}
                      </span>
                      <span className="block text-[13px] text-muted sm:hidden">{s.customerName}</span>
                    </td>
                    <td className={cn(cell, "hidden sm:table-cell")}>{s.customerName}</td>
                    <td className={cn(cell, "hidden whitespace-nowrap sm:table-cell")}>{shortDate(s.date)}</td>
                    <td className={cn(cell, "whitespace-nowrap pr-3 text-right tabular-nums sm:pr-5")}>
                      {wholeKes(s.totalMinor)}
                      {status === "Part paid" && <span className="block text-[12.5px] text-muted">{wholeKes(s.paidMinor)} paid</span>}
                    </td>
                    <td className={cell}>
                      <span className={cn("inline-flex h-7 items-center gap-[7px] whitespace-nowrap rounded-full px-[11px] text-[13px] font-semibold", pill[status])}>
                        <i className="block size-[7px] rounded-full bg-current" />
                        {status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
