import { invoices, type InvoiceStatus } from "@/lib/sample-data";
import { cn } from "@/lib/cn";
import { Panel } from "./Card";

const pill: Record<InvoiceStatus, string> = {
  Paid: "bg-[#e4f3ea] text-[#14633a]",
  Pending: "bg-[#fff1d6] text-[#7a5200]",
  Overdue: "bg-[#fce7e4] text-[#9e241a]",
};

const th = "whitespace-nowrap border-b border-line pb-2.5 pr-3 text-left text-[12.5px] font-semibold uppercase tracking-[0.6px] text-muted";
const td = "whitespace-nowrap border-b border-line py-3.5 pr-3 text-[14.5px]";

export function RecentInvoices() {
  return (
    <Panel title="Recent invoices" subtitle="Latest five · amounts in KES">
      <div className="-mx-1 overflow-x-auto px-1">
        <table className="w-full border-collapse">
          <caption className="sr-only">Recent invoices (sample data)</caption>
          <thead>
            <tr>
              <th scope="col" className={th}>Invoice</th>
              <th scope="col" className={cn(th, "hidden sm:table-cell")}>Customer</th>
              <th scope="col" className={cn(th, "hidden sm:table-cell")}>Due</th>
              <th scope="col" className={cn(th, "pr-3 text-right sm:pr-5")}>Amount<span className="hidden sm:inline"> (KES)</span></th>
              <th scope="col" className={th}>Status</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv, i) => {
              const last = i === invoices.length - 1;
              const cell = cn(td, last && "border-b-0 pb-0");
              return (
                <tr key={inv.id}>
                  <td className={cn(cell, "font-semibold text-navy")}>
                    {inv.id}
                    <span className="block text-[13px] font-normal text-muted sm:hidden">{inv.customer}</span>
                  </td>
                  <td className={cn(cell, "hidden sm:table-cell")}>{inv.customer}</td>
                  <td className={cn(cell, "hidden sm:table-cell")}>{inv.due}</td>
                  <td className={cn(cell, "pr-3 text-right tabular-nums sm:pr-5")}>{inv.amount}</td>
                  <td className={cell}>
                    <span className={cn("inline-flex h-7 items-center gap-[7px] rounded-full px-[11px] text-[13px] font-semibold", pill[inv.status])}>
                      <i className="block size-[7px] rounded-full bg-current" />
                      {inv.status}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
