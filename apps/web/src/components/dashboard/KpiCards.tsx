import { ArrowDownRight, ArrowUpRight, Minus, Receipt, TrendingUp, Users, Wallet } from "lucide-react";
import { change, MONTHS, wholeKes, type DashboardMoney, type DashboardSummary } from "@/lib/dashboard";
import { cn } from "@/lib/cn";
import { Card } from "./Card";

type Trend = { kind: "up" | "down" | "flat" | "none"; text: string; note: string };

/** This month so far against the same days of last month. */
function moneyTrend(m: DashboardMoney, prevMonth: string): Trend {
  const pct = change(m.monthMinor, m.previousMinor);
  if (pct === null) return { kind: "none", text: "", note: m.monthMinor === 0 ? "None recorded yet this month" : `None in the same days of ${prevMonth}` };
  const rounded = Math.round(pct * 10) / 10;
  if (rounded === 0) return { kind: "flat", text: "0%", note: `vs same days of ${prevMonth}` };
  // A rise of 1000% or more reads better as a multiple (×11 rather than 1000%).
  const ratio = m.monthMinor / m.previousMinor;
  const text = rounded >= 1000 ? `×${ratio >= 100 ? Math.round(ratio).toLocaleString("en-US") : ratio.toFixed(1)}` : `${Math.abs(rounded).toLocaleString("en-US")}%`;
  return { kind: rounded > 0 ? "up" : "down", text, note: `vs same days of ${prevMonth}` };
}

type Kpi = { label: string; unit?: string; value: string; icon: typeof TrendingUp; trend: Trend; negative?: boolean };

export function KpiCards({ data }: { data: DashboardSummary }) {
  const month = Number(data.today.slice(5, 7)) - 1;
  const name = MONTHS[month];
  const prev = MONTHS[(month + 11) % 12];
  const kpis: Kpi[] = [
    { label: `Sales (${name})`, unit: "KES", value: wholeKes(data.revenue.monthMinor), icon: TrendingUp, trend: moneyTrend(data.revenue, prev) },
    { label: `Profit (${name})`, unit: "KES", value: wholeKes(data.profit.monthMinor), icon: Wallet, trend: moneyTrend(data.profit, prev), negative: data.profit.monthMinor < 0 },
    {
      label: "Customers",
      value: data.customers.total.toLocaleString("en-US"),
      icon: Users,
      trend: { kind: "none", text: "", note: `${data.customers.newThisMonth} new this month · ${data.customers.withVehicles} with tracked vehicles` },
    },
    {
      label: "Outstanding balances",
      unit: "KES",
      value: wholeKes(data.outstanding.amountMinor),
      icon: Receipt,
      trend: { kind: "none", text: "", note: data.outstanding.sales === 0 ? "Every sale is paid in full" : `On ${data.outstanding.sales} sale${data.outstanding.sales === 1 ? "" : "s"} not paid in full` },
    },
  ];

  return (
    <section aria-label="Key figures" className="grid grid-cols-2 gap-3 sm:gap-[18px] xl:grid-cols-4">
      {kpis.map((k) => {
        const Icon = k.icon;
        const Arrow = k.trend.kind === "up" ? ArrowUpRight : k.trend.kind === "down" ? ArrowDownRight : Minus;
        return (
          <Card key={k.label} className="flex min-w-0 flex-col gap-2.5 p-3.5 sm:gap-3.5 sm:p-[18px] sm:px-[22px] sm:py-5">
            <div className="flex items-start justify-between gap-2 sm:min-h-11 sm:items-center sm:gap-3">
              <h2 className="text-[13.5px] font-medium leading-tight text-muted sm:text-[14.5px]">{k.label}</h2>
              <div className="hidden size-10 shrink-0 place-items-center rounded-xl bg-tint text-navy sm:grid">
                <Icon size={20} strokeWidth={1.8} aria-hidden="true" />
              </div>
            </div>
            <div className={cn("break-words text-[22px] font-semibold leading-[1.1] tracking-[-0.5px] tabular-nums sm:text-[32px]", k.negative && "text-[#a3261c]")}>
              {k.unit && <small className="mr-1 text-[12px] font-medium tracking-normal text-muted sm:mr-1.5 sm:text-[15px]">{k.unit}</small>}
              {k.value}
            </div>
            <div className="flex flex-wrap items-center gap-x-1 text-[13px] leading-snug sm:text-[13.5px]">
              {k.trend.kind !== "none" && (
                <span
                  className={cn(
                    "inline-flex items-center gap-1 font-semibold",
                    k.trend.kind === "up" ? "text-[#14633a]" : k.trend.kind === "down" ? "text-[#a3261c]" : "text-muted",
                  )}
                >
                  <Arrow size={14} strokeWidth={2.4} aria-hidden="true" />
                  <span className="sr-only">{k.trend.kind === "up" ? "Up" : k.trend.kind === "down" ? "Down" : "No change"} </span>
                  {k.trend.text}
                </span>
              )}
              <span className="text-muted">{k.trend.note}</span>
            </div>
          </Card>
        );
      })}
    </section>
  );
}
