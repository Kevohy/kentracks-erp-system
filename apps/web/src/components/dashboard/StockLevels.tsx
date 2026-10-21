import Link from "next/link";
import { LOW_STOCK_UNITS, type DashboardSummary } from "@/lib/dashboard";
import { cn } from "@/lib/cn";
import { Panel } from "./Card";

const fmt = (q: number) => (Number.isInteger(q) ? q.toLocaleString("en-US") : q.toFixed(1));

export function StockLevels({ data }: { data: DashboardSummary }) {
  const items = data.stock;
  const top = Math.max(1, ...items.map((s) => s.quantity));
  return (
    <Panel
      title="Stock levels"
      subtitle="Lowest first · received purchases minus sales"
      aside={<Link href="/inventory/products" className="text-[13.5px] font-semibold text-navy hover:underline">Inventory</Link>}
    >
      {items.length === 0 ? (
        <p className="text-[14.5px] text-muted">No stock yet. Stock appears once a purchase is received.</p>
      ) : (
        <ul className="flex flex-col gap-5">
          {items.map((s) => {
            const out = s.quantity <= 0;
            const low = !out && s.quantity <= LOW_STOCK_UNITS;
            const pct = Math.max(0, Math.round((s.quantity / top) * 100));
            return (
              <li key={`${s.kind}:${s.id}`} className="flex flex-col gap-2">
                <div className="flex items-baseline justify-between gap-2.5 text-[14.5px]">
                  <span className="min-w-0">
                    <span className="font-medium">{s.name}</span>
                    <span className="ml-1.5 text-[13px] text-muted">{s.detail}</span>
                  </span>
                  <span className="shrink-0 text-[13.5px] tabular-nums text-muted">
                    {out && <span className="font-semibold text-[#9e241a]">Out of stock · </span>}
                    {low && <span className="font-semibold text-[#9a3300]">Low · </span>}
                    {fmt(s.quantity)} {s.kind === "Platform" ? "licences" : "units"}
                  </span>
                </div>
                <div
                  role="meter"
                  aria-label={`${s.name}: ${fmt(s.quantity)} in stock${out ? ", out of stock" : low ? ", low" : ""}`}
                  aria-valuemin={0}
                  aria-valuemax={top}
                  aria-valuenow={Math.max(0, s.quantity)}
                  className="h-2 overflow-hidden rounded-full bg-[#e8edf1]"
                >
                  <div className={cn("h-full rounded-full", out || low ? "bg-brand" : "bg-navy")} style={{ width: `${pct}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
