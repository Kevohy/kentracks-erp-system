import Link from "next/link";
import { salePayment, shortDate, wholeKes, type DashboardSummary, type PaymentStatus } from "@/lib/dashboard";
import { cn } from "@/lib/cn";
import { Panel } from "./Card";

const dot: Record<PaymentStatus, string> = { Paid: "bg-[#2E7D32]", "Part paid": "bg-[#E0A100]", Unpaid: "bg-[#C62828]" };
const short: Record<string, string> = { "Package Sale": "Package", "Hosting Sale": "Hosting", "Retailer Sale": "Retail" };

/** The latest five sales: one line each, with how much is paid. */
export function RecentSales({ data }: { data: DashboardSummary }) {
  const sales = data.recentSales;
  return (
    <Panel title="Recent sales" subtitle="Latest five"
      aside={<Link href="/sales" className="text-[13.5px] font-semibold text-navy hover:underline">All sales</Link>}>
      {sales.length === 0 ? (
        <p className="text-[14.5px] text-muted">No sales recorded yet.</p>
      ) : (
        <ul className="flex flex-col">
          {sales.map((s) => {
            const status = salePayment(s);
            return (
              <li key={s.id} className="flex items-center gap-3 border-t border-line py-2.5 first:border-t-0 first:pt-0">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-medium">{s.customerName}</p>
                  <p className="truncate text-[12.5px] text-muted">{short[s.type] ?? s.type}{s.vehiclePlate ? ` · ${s.vehiclePlate}` : ""} · {shortDate(s.date, false)}</p>
                </div>
                <div className="text-right">
                  <p className="whitespace-nowrap text-[14px] font-semibold tabular-nums">KES {wholeKes(s.totalMinor)}</p>
                  <p className="flex items-center justify-end gap-1.5 text-[12px] text-muted">
                    <i className={cn("block size-[7px] rounded-full", dot[status])} aria-hidden="true" />{status}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
