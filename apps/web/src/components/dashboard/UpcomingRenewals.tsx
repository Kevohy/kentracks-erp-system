import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { dueLabel, shortDate, wholeKes, type DashboardSummary } from "@/lib/dashboard";
import { Panel } from "./Card";

const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?";

export function UpcomingRenewals({ data }: { data: DashboardSummary }) {
  const r = data.renewals;
  const subtitle =
    r.upcomingCount === 0
      ? `Next ${r.windowDays} days`
      : `Next ${r.windowDays} days · ${r.upcomingCount} due${r.upcomingFeesMinor ? ` · KES ${wholeKes(r.upcomingFeesMinor)}` : ""}`;
  return (
    <Panel
      title="Upcoming renewals"
      subtitle={subtitle}
      aside={<Link href="/billing/vehicles" className="text-[13.5px] font-semibold text-navy hover:underline">Billing</Link>}
    >
      {r.upcoming.length === 0 ? (
        <p className="text-[14.5px] text-muted">Nothing is due in the next {r.windowDays} days.</p>
      ) : (
        <ul className="flex flex-col">
          {r.upcoming.map((x) => (
            <li key={`${x.kind}:${x.saleId}`} className="flex items-center gap-3.5 border-t border-line py-3 first:border-t-0 first:pt-0 last:pb-0">
              <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-tint text-[13.5px] font-semibold text-navy" aria-hidden="true">
                {initials(x.customerName)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{x.customerName}</div>
                <div className="text-[13.5px] leading-snug text-muted">
                  <span className="whitespace-nowrap">{x.kind}{x.vehiclePlate ? ` · ${x.vehiclePlate}` : ""}</span>{" "}
                  <span className="whitespace-nowrap">· {shortDate(x.expiryDate, false)} · {dueLabel(data.today, x.expiryDate)}</span>
                </div>
              </div>
              <div className="whitespace-nowrap text-right tabular-nums">
                {x.feeMinor == null ? <span className="text-[13.5px] text-muted">Fee not set</span> : <span className="font-semibold">KES {wholeKes(x.feeMinor)}</span>}
              </div>
            </li>
          ))}
        </ul>
      )}
      {r.upcomingCount > r.upcoming.length && (
        <p className="-mt-2 text-[13.5px] text-muted">and {r.upcomingCount - r.upcoming.length} more in Billing.</p>
      )}
      {r.overdueCount > 0 && (
        <p className="flex items-start gap-2 rounded-xl bg-[#FDECEA] px-3 py-2.5 text-[13.5px] text-[#9e241a]">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>
            {r.overdueCount} already expired{r.overdueFeesMinor ? ` (KES ${wholeKes(r.overdueFeesMinor)} in fees)` : ""}.{" "}
            <Link href="/billing/vehicles" className="font-semibold underline">Review in Billing</Link>
          </span>
        </p>
      )}
    </Panel>
  );
}
