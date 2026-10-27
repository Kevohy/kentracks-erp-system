import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { DashboardSummary } from "@/lib/dashboard";
import { Panel } from "./Card";

const R = 52;

/** "just now", "3 min ago", or the time for anything older than an hour. */
function checked(iso: string): string {
  const min = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  return `at ${new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Nairobi" })}`;
}
const C = 2 * Math.PI * R;

/** Tracked devices by GPS status: a ring, then one row per status that opens Billing filtered to it. */
export function DevicesCard({ data }: { data: DashboardSummary }) {
  const d = data.devices;
  const rows = [
    { label: "Online", value: d.online, color: "#2E7D32", filter: "Online" },
    { label: "Offline", value: d.offline, color: "#8A99A6", filter: "Offline" },
    { label: "Expired", value: d.expired, color: "#C62828", filter: "Expired" },
    { label: "Unknown", value: d.unknown, color: "#CBD5DD", filter: "Unknown" },
  ].filter((r) => r.label !== "Unknown" || r.value > 0);
  const pct = (v: number) => {
    const p = d.total ? (v / d.total) * 100 : 0;
    return v > 0 && p < 1 ? "<1%" : `${Math.round(p)}%`;
  };
  let offset = 0;

  return (
    <Panel title="Devices" subtitle={d.checkedAt ? `Live GPS status · checked ${checked(d.checkedAt)}` : "Live GPS status of every tracker sold"}
      aside={<Link href="/billing/vehicles" className="text-[13.5px] font-semibold text-navy hover:underline">Billing</Link>}>
      {d.total === 0 ? (
        <p className="text-[14.5px] text-muted">No tracked devices yet. They appear here after a Package or Hosting sale.</p>
      ) : (
        <>
          <div className="relative flex items-center justify-center">
            <svg viewBox="0 0 140 140" className="size-[150px] -rotate-90" role="img"
              aria-label={`${d.total} devices: ${rows.map((r) => `${r.value} ${r.label.toLowerCase()}`).join(", ")}.`}>
              <circle cx="70" cy="70" r={R} fill="none" stroke="#EEF2F5" strokeWidth="14" />
              {rows.map((r) => {
                const len = d.total ? (r.value / d.total) * C : 0;
                const seg = (
                  <circle key={r.label} cx="70" cy="70" r={R} fill="none" stroke={r.color} strokeWidth="14"
                    strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-offset} />
                );
                offset += len;
                return seg;
              })}
            </svg>
            <div className="absolute flex flex-col items-center" aria-hidden="true">
              <span className="text-[26px] font-semibold leading-none tabular-nums">{d.total.toLocaleString("en-US")}</span>
              <span className="mt-1 text-[12px] text-muted">devices</span>
            </div>
          </div>
          <ul className="-mx-2 flex flex-col">
            {rows.map((r) => (
              <li key={r.label}>
                <Link href={`/billing/vehicles?filter=${encodeURIComponent(r.filter)}`} className="flex min-h-10 items-center gap-2.5 rounded-lg px-2 hover:bg-canvas">
                  <i className="block size-2.5 shrink-0 rounded-full" style={{ backgroundColor: r.color }} aria-hidden="true" />
                  <span className="flex-1 text-[14px]">{r.label}</span>
                  <span className="text-[14px] font-semibold tabular-nums">{r.value.toLocaleString("en-US")}</span>
                  <span className="w-10 text-right text-[12.5px] tabular-nums text-muted">{pct(r.value)}</span>
                  <ChevronRight size={15} className="text-muted" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
          {d.expiringSoon > 0 && (
            <Link href={`/billing/vehicles?filter=${encodeURIComponent("Expiring soon")}`} className="-mt-2 rounded-xl bg-[#FFF4E5] px-3 py-2 text-[13px] text-[#9a3300] hover:brightness-[0.98]">
              <span className="font-semibold">{d.expiringSoon.toLocaleString("en-US")}</span> expiring in the next {data.renewals.windowDays} days
            </Link>
          )}
        </>
      )}
    </Panel>
  );
}
