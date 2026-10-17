import { months, revenueLastYear, revenueThisYear } from "@/lib/sample-data";
import { Panel } from "./Card";

const W = 600;
const H = 220;
const TOP = 20;
const BASE = 200;
const MAX = 4; // KES millions at the top gridline
const STEP = W / months.length;

const xAt = (i: number) => STEP / 2 + i * STEP;
const yAt = (v: number) => BASE - (v / MAX) * (BASE - TOP);

/** Smooth path: straight to the first midpoint, quadratic curves through the interior points, straight to the last. */
function smoothPath(values: number[]): string {
  const pts = values.map((v, i) => [xAt(i), yAt(v)] as const);
  const mid = (a: readonly [number, number], b: readonly [number, number]) =>
    [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] as const;
  let d = `M${pts[0][0]},${pts[0][1]}`;
  const m0 = mid(pts[0], pts[1]);
  d += ` L${m0[0]},${m0[1]}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const m = mid(pts[i], pts[i + 1]);
    d += ` Q${pts[i][0]},${pts[i][1]} ${m[0]},${m[1]}`;
  }
  const last = pts[pts.length - 1];
  d += ` L${last[0]},${last[1]}`;
  return d;
}

export function RevenueChart() {
  const line = smoothPath(revenueThisYear);
  const lastX = xAt(revenueThisYear.length - 1);
  const lastY = yAt(revenueThisYear[revenueThisYear.length - 1]);
  const area = `${line} L${lastX},${BASE} L${xAt(0)},${BASE} Z`;
  const prior = revenueLastYear.map((v, i) => `${xAt(i)},${yAt(v)}`).join(" ");
  const gridValues = [4, 3, 2, 1, 0];

  const first = revenueThisYear[0].toFixed(1);
  const lastLabel = revenueThisYear[revenueThisYear.length - 1].toFixed(1);

  return (
    <Panel
      title="Revenue overview"
      subtitle="KES, millions · January to October 2026"
      aside={
        <div className="flex items-center gap-4 text-[13.5px] text-muted">
          <span className="inline-flex items-center gap-2">
            <i className="block w-[18px] rounded-sm border-t-[3px] border-navy" />2026
          </span>
          <span className="inline-flex items-center gap-2">
            <i className="block w-[18px] border-t-2 border-dashed border-sidebar-icon" />2025
          </span>
        </div>
      }
    >
      <div>
        <div className="relative pl-10">
          {gridValues.map((v) => (
            <span
              key={v}
              className="absolute left-0 -translate-y-1/2 text-xs tabular-nums text-muted"
              style={{ top: `${(yAt(v) / H) * 100}%` }}
            >
              {v === 0 ? "0" : `${v}M`}
            </span>
          ))}
          <svg
            viewBox={`0 0 ${W} ${H}`}
            role="img"
            aria-label={`Line chart of monthly revenue in KES millions, rising from about ${first} million in January to about ${lastLabel} million in October 2026, above the previous year.`}
            className="block h-auto w-full"
          >
            <g stroke="#E3E8ED" strokeWidth="1">
              {gridValues.map((v) => (
                <line key={v} x1="0" x2={W} y1={yAt(v)} y2={yAt(v)} stroke={v === 0 ? "#CBD5DD" : "#E3E8ED"} />
              ))}
            </g>
            <path d={area} fill="#055587" fillOpacity="0.09" />
            <polyline
              points={prior}
              fill="none"
              stroke="#8FA2B3"
              strokeWidth="2"
              strokeDasharray="5 5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path d={line} fill="none" stroke="#055587" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx={lastX} cy={lastY} r="5.5" fill="#fff" stroke="#FE5102" strokeWidth="3" />
          </svg>
        </div>
        <div className="mt-1 flex pl-10" aria-hidden="true">
          {months.map((m) => (
            <span key={m} className="flex-1 text-center text-xs text-muted">
              {m}
            </span>
          ))}
        </div>
      </div>
    </Panel>
  );
}
