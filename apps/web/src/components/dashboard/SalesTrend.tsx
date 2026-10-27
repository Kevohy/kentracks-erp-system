"use client";

import { useState } from "react";
import { MONTHS, shortKes, wholeKes, type DashboardSummary, type DashboardTrendPoint } from "@/lib/dashboard";
import { cn } from "@/lib/cn";
import { Panel } from "./Card";

const W = 640;
const H = 240;
const TOP = 12;
const BASE = 228;

/** A round number at or above v, so the gridlines read well. */
function niceMax(v: number): number {
  if (v <= 0) return 400_000; // KES 4,000 in cents: an empty chart still has a scale
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 4, 5, 8, 10]) if (v <= m * p) return m * p;
  return 10 * p;
}

const dayLabel = (key: string) => `${Number(key.slice(8, 10))} ${MONTHS[Number(key.slice(5, 7)) - 1]}`;
const monthLabel = (key: string, withYear = false) => `${MONTHS[Number(key.slice(5, 7)) - 1]}${withYear ? ` ${key.slice(0, 4)}` : ""}`;

type Range = "days" | "months";

/** Sales over time: revenue per day (last 30 days) or per month (last 12 months), with the number of sales. */
export function SalesTrend({ data }: { data: DashboardSummary }) {
  const [range, setRange] = useState<Range>("days");
  const points: DashboardTrendPoint[] = data.salesTrend[range];
  const total = points.reduce((a, p) => a + p.totalMinor, 0);
  const count = points.reduce((a, p) => a + p.count, 0);
  const max = niceMax(Math.max(...points.map((p) => p.totalMinor)));
  const step = W / points.length;
  const barW = Math.max(4, step * (range === "days" ? 0.62 : 0.56));
  const yAt = (v: number) => BASE - (v / max) * (BASE - TOP);
  const grid = [0, 0.5, 1].map((f) => max * f);
  const label = (p: DashboardTrendPoint) => (range === "days" ? dayLabel(p.key) : monthLabel(p.key, true));
  // Every 5th day / every 2nd month gets a label, and always the last one.
  const showLabel = (i: number) => i === points.length - 1 || (range === "days" ? (points.length - 1 - i) % 5 === 0 : (points.length - 1 - i) % 2 === 0);

  return (
    <Panel
      title="Sales trend"
      subtitle={range === "days" ? "Revenue per day · last 30 days" : "Revenue per month · last 12 months"}
      aside={
        <div role="group" aria-label="Period" className="flex rounded-xl bg-canvas p-1">
          {(["days", "months"] as const).map((r) => (
            <button key={r} type="button" aria-pressed={range === r} onClick={() => setRange(r)}
              className={cn("min-h-8 rounded-lg px-3 text-[13px] font-semibold", range === r ? "bg-white text-ink shadow-[0_1px_2px_rgba(16,32,48,0.08)]" : "text-muted hover:text-ink")}>
              {r === "days" ? "30 days" : "12 months"}
            </button>
          ))}
        </div>
      }
    >
      <div className="flex flex-wrap gap-x-8 gap-y-2">
        <div>
          <p className="text-[12.5px] text-muted">Revenue</p>
          <p className="text-[20px] font-semibold tabular-nums"><span className="mr-1 text-[12px] font-medium text-muted">KES</span>{wholeKes(total)}</p>
        </div>
        <div>
          <p className="text-[12.5px] text-muted">Sales</p>
          <p className="text-[20px] font-semibold tabular-nums">{count.toLocaleString("en-US")}</p>
        </div>
        <div>
          <p className="text-[12.5px] text-muted">Average sale</p>
          <p className="text-[20px] font-semibold tabular-nums"><span className="mr-1 text-[12px] font-medium text-muted">KES</span>{wholeKes(count ? Math.round(total / count) : 0)}</p>
        </div>
      </div>
      <div>
        <div className="relative pl-10">
          {grid.map((v) => (
            <span key={v} className="absolute left-0 -translate-y-1/2 text-[11.5px] tabular-nums text-muted" style={{ top: `${(yAt(v) / H) * 100}%` }}>{shortKes(v)}</span>
          ))}
          <svg viewBox={`0 0 ${W} ${H}`} role="img" className="block h-auto w-full"
            aria-label={`Sales ${range === "days" ? "per day, last 30 days" : "per month, last 12 months"}: ${points.map((p) => `${label(p)} KES ${wholeKes(p.totalMinor)} (${p.count} sales)`).join(", ")}.`}>
            {grid.map((v) => <line key={v} x1="0" x2={W} y1={yAt(v)} y2={yAt(v)} stroke={v === 0 ? "#CBD5DD" : "#EDF1F4"} strokeWidth="1" />)}
            {points.map((p, i) => {
              const x = i * step + (step - barW) / 2;
              const h = Math.max(p.totalMinor > 0 ? 3 : 0, BASE - yAt(p.totalMinor));
              const last = i === points.length - 1;
              return (
                <g key={p.key}>
                  <title>{`${label(p)}: KES ${wholeKes(p.totalMinor)} · ${p.count} sale${p.count === 1 ? "" : "s"}`}</title>
                  <rect x={i * step} y={0} width={step} height={H} fill="transparent" />
                  <rect x={x} y={BASE - h} width={barW} height={h} rx={Math.min(4, barW / 2)} fill={last ? "#FE5102" : "#055587"} fillOpacity={last ? 1 : 0.85} />
                </g>
              );
            })}
          </svg>
        </div>
        <div className="relative mt-1 h-4 pl-10" aria-hidden="true">
          {points.map((p, i) => showLabel(i) && (
            <span key={p.key} className={cn("absolute whitespace-nowrap text-[11.5px] text-muted", i === points.length - 1 ? "right-0" : "-translate-x-1/2",
              // Phones: every 10th day / 4th month, so the labels do not run into each other.
              (points.length - 1 - i) % (range === "days" ? 10 : 4) !== 0 && "max-sm:hidden")}
              style={i === points.length - 1 ? undefined : { left: `calc(2.5rem + (100% - 2.5rem) * ${(i + 0.5) / points.length})` }}>
              {range === "days" ? dayLabel(p.key) : monthLabel(p.key)}
            </span>
          ))}
        </div>
      </div>
    </Panel>
  );
}
