import { stock } from "@/lib/sample-data";
import { cn } from "@/lib/cn";
import { Panel } from "./Card";

export function StockLevels() {
  return (
    <Panel title="Stock levels" subtitle="Share of target quantity">
      <ul className="flex flex-col gap-5">
        {stock.map((s) => (
          <li key={s.name} className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-2.5 text-[14.5px]">
              <span className="font-medium">{s.name}</span>
              <span className="text-[13.5px] tabular-nums text-muted">
                {s.low && <span className="font-semibold text-[#9a3300]">Low · </span>}
                {s.units} units · {s.percent}%
              </span>
            </div>
            <div
              role="progressbar"
              aria-label={`${s.name}${s.low ? ", low" : ""}`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={s.percent}
              className="h-2 overflow-hidden rounded-full bg-[#e8edf1]"
            >
              <div
                className={cn("h-full rounded-full", s.low ? "bg-brand" : "bg-navy")}
                style={{ width: `${s.percent}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
