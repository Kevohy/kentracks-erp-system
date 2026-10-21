import { MONTHS, shortKes, wholeKes, type DashboardSummary } from "@/lib/dashboard";
import { Panel } from "./Card";

const W = 600;
const H = 220;
const TOP = 20;
const BASE = 200;

/** A round number at or above v, so the gridlines read well (1, 2, 2.5, 5 × 10ⁿ). */
function niceMax(v: number): number {
  if (v <= 0) return 400_000; // KES 4,000 in cents: an empty chart still has a scale
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 4, 5, 8, 10]) if (v <= m * p) return m * p;
  return 10 * p;
}

export function RevenueChart({ data }: { data: DashboardSummary }) {
  const { year, thisYear, lastYear } = data.revenueByMonth;
  const count = Number(data.today.slice(5, 7)); // January up to this month
  const now = thisYear.slice(0, count);
  const before = lastYear.slice(0, count);
  const max = niceMax(Math.max(...now, ...before));
  const step = W / count;
  const xAt = (i: number) => step / 2 + i * step;
  const yAt = (v: number) => BASE - (v / max) * (BASE - TOP);
  const grid = [4, 3, 2, 1, 0].map((i) => (max / 4) * i);

  const path = (values: number[]) => values.map((v, i) => `${i === 0 ? "M" : "L"}${xAt(i)},${yAt(v)}`).join(" ");
  const line = path(now);
  const area = `${line} L${xAt(count - 1)},${BASE} L${xAt(0)},${BASE} Z`;
  const sumNow = now.reduce((a, b) => a + b, 0);
  const sumBefore = before.reduce((a, b) => a + b, 0);
  const label = `Monthly sales revenue, January to ${MONTHS[count - 1]}: ${now.map((v, i) => `${MONTHS[i]} KES ${wholeKes(v)}`).join(", ")}.`;

  return (
    <Panel
      title="Revenue overview"
      subtitle={`KES · January to ${MONTHS[count - 1]} · ${wholeKes(sumNow)} in ${year} (${wholeKes(sumBefore)} by this time in ${year - 1})`}
      aside={
        <div className="flex items-center gap-4 text-[13.5px] text-muted">
          <span className="inline-flex items-center gap-2">
            <i className="block w-[18px] rounded-sm border-t-[3px] border-navy" />{year}
          </span>
          <span className="inline-flex items-center gap-2">
            <i className="block w-[18px] border-t-2 border-dashed border-sidebar-icon" />{year - 1}
          </span>
        </div>
      }
    >
      <div>
        <div className="relative pl-11">
          {grid.map((v) => (
            <span key={v} className="absolute left-0 -translate-y-1/2 text-xs tabular-nums text-muted" style={{ top: `${(yAt(v) / H) * 100}%` }}>
              {shortKes(v)}
            </span>
          ))}
          <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="block h-auto w-full">
            <g>
              {grid.map((v) => (
                <line key={v} x1="0" x2={W} y1={yAt(v)} y2={yAt(v)} stroke={v === 0 ? "#CBD5DD" : "#E3E8ED"} strokeWidth="1" />
              ))}
            </g>
            {count > 1 && <path d={area} fill="#055587" fillOpacity="0.09" />}
            {count > 1 && (
              <path d={path(before)} fill="none" stroke="#8FA2B3" strokeWidth="2" strokeDasharray="5 5" strokeLinecap="round" strokeLinejoin="round" />
            )}
            {count > 1 && <path d={line} fill="none" stroke="#055587" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />}
            {now.map((v, i) => (
              <g key={i}>
                <title>{`${MONTHS[i]} ${year}: KES ${wholeKes(v)} · ${MONTHS[i]} ${year - 1}: KES ${wholeKes(before[i])}`}</title>
                <circle cx={xAt(i)} cy={yAt(v)} r={i === count - 1 ? 5.5 : 3.5} fill="#fff" stroke={i === count - 1 ? "#FE5102" : "#055587"} strokeWidth={i === count - 1 ? 3 : 2} />
                <rect x={xAt(i) - step / 2} y={0} width={step} height={H} fill="transparent" />
              </g>
            ))}
          </svg>
        </div>
        <div className="mt-1 flex pl-11" aria-hidden="true">
          {now.map((_, i) => (
            <span key={i} className="flex-1 text-center text-xs text-muted">{MONTHS[i]}</span>
          ))}
        </div>
      </div>
    </Panel>
  );
}
