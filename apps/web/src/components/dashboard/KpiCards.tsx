import { ArrowDownRight, ArrowUpRight, Receipt, TrendingUp, Users, FileText } from "lucide-react";
import { kpis, type Kpi } from "@/lib/sample-data";
import { cn } from "@/lib/cn";
import { Card } from "./Card";

const icons: Record<Kpi["icon"], typeof TrendingUp> = {
  revenue: TrendingUp,
  customers: Users,
  invoices: FileText,
  renewals: Receipt,
};

export function KpiCards() {
  return (
    <section aria-label="Key figures" className="grid grid-cols-1 gap-[18px] sm:grid-cols-2 xl:grid-cols-4">
      {kpis.map((k) => {
        const Icon = icons[k.icon];
        const Arrow = k.trend === "up" ? ArrowUpRight : ArrowDownRight;
        return (
          <Card key={k.label} className="flex flex-col gap-3.5 p-[18px] sm:px-[22px] sm:py-5">
            <div className="flex min-h-11 items-center justify-between gap-3">
              <div className="text-[14.5px] font-medium text-muted">{k.label}</div>
              <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-tint text-navy">
                <Icon size={20} strokeWidth={1.8} aria-hidden="true" />
              </div>
            </div>
            <div className="text-[32px] font-semibold leading-[1.1] tracking-[-0.5px] tabular-nums">
              {k.unit && <small className="mr-1.5 text-[15px] font-medium tracking-normal text-muted">{k.unit}</small>}
              {k.value}
            </div>
            <div
              className={cn(
                "inline-flex items-center gap-1 text-[13.5px] font-semibold",
                k.trend === "up" ? "text-[#14633a]" : "text-[#a3261c]",
              )}
            >
              <Arrow size={14} strokeWidth={2.4} aria-hidden="true" />
              {k.delta}
              <span className="ml-1 font-normal text-muted">{k.note}</span>
            </div>
          </Card>
        );
      })}
    </section>
  );
}
