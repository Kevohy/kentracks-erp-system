import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { change, MONTHS, wholeKes, type DashboardMoney, type DashboardSummary } from "@/lib/dashboard";
import { cn } from "@/lib/cn";
import { Card } from "./Card";

/** This month so far against the same days of last month: "+12%", "−8%", "×11", or nothing to compare with. */
function trend(m: DashboardMoney): { up: boolean; text: string } | null {
  const pct = change(m.monthMinor, m.previousMinor);
  if (pct === null) return null;
  const r = Math.round(pct);
  if (r === 0) return { up: true, text: "0%" };
  if (r >= 1000) {
    const ratio = m.monthMinor / m.previousMinor;
    return { up: true, text: `×${ratio >= 100 ? Math.round(ratio).toLocaleString("en-US") : ratio.toFixed(1)}` };
  }
  return { up: r > 0, text: `${r > 0 ? "+" : "−"}${Math.abs(r).toLocaleString("en-US")}%` };
}

type Kpi = { label: string; value: string; money?: boolean; trend?: ReturnType<typeof trend>; note: string; negative?: boolean };

/** The four headline figures: quiet tiles, one number each. */
export function KpiCards({ data }: { data: DashboardSummary }) {
  const month = Number(data.today.slice(5, 7)) - 1;
  const prev = MONTHS[(month + 11) % 12];
  const kpis: Kpi[] = [
    { label: `Sales in ${MONTHS[month]}`, value: wholeKes(data.revenue.monthMinor), money: true, trend: trend(data.revenue), note: `vs same days of ${prev}` },
    { label: `Profit in ${MONTHS[month]}`, value: wholeKes(data.profit.monthMinor), money: true, trend: trend(data.profit), note: `vs same days of ${prev}`, negative: data.profit.monthMinor < 0 },
    {
      label: "Outstanding",
      value: wholeKes(data.outstanding.amountMinor),
      money: true,
      note: data.outstanding.sales === 0 ? "Every sale is paid in full" : `${data.outstanding.sales.toLocaleString("en-US")} sale${data.outstanding.sales === 1 ? "" : "s"} not fully paid`,
    },
    { label: "Customers", value: data.customers.total.toLocaleString("en-US"), note: `${data.customers.newThisMonth.toLocaleString("en-US")} new this month` },
  ];

  return (
    <section aria-label="Key figures" className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
      {kpis.map((k) => (
        <Card key={k.label} className="flex min-w-0 flex-col gap-1.5 px-4 py-4 sm:px-5 sm:py-[18px]">
          <h2 className="text-[13px] font-medium text-muted">{k.label}{k.money && <span className="sm:hidden"> · KES</span>}</h2>
          <p className={cn("whitespace-nowrap text-[19px] font-semibold leading-tight tracking-[-0.4px] tabular-nums sm:text-[28px]", k.negative && "text-[#a3261c]")}>
            {k.money && <span className="mr-1 hidden text-[13px] font-medium tracking-normal text-muted sm:inline">KES</span>}
            {k.value}
          </p>
          <p className="flex flex-wrap items-center gap-x-1.5 text-[12.5px] text-muted">
            {k.trend && (
              <span className={cn("inline-flex items-center gap-0.5 rounded-full px-1.5 py-px font-semibold", k.trend.up ? "bg-[#e4f3ea] text-[#14633a]" : "bg-[#fce7e4] text-[#9e241a]")}>
                {k.trend.up ? <ArrowUpRight size={12} strokeWidth={2.6} aria-hidden="true" /> : <ArrowDownRight size={12} strokeWidth={2.6} aria-hidden="true" />}
                <span className="sr-only">{k.trend.up ? "Up" : "Down"} </span>
                {k.trend.text}
              </span>
            )}
            <span>{k.note}</span>
          </p>
        </Card>
      ))}
    </section>
  );
}
