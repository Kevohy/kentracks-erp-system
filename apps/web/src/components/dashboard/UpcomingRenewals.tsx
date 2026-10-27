import Link from "next/link";
import { dueLabel, wholeKes, type DashboardSummary } from "@/lib/dashboard";
import { Panel } from "./Card";

const SHOWN = 4;

/** Renewals: two numbers (due soon, already expired) and the next few due. */
export function UpcomingRenewals({ data }: { data: DashboardSummary }) {
  const r = data.renewals;
  const list = r.upcoming.slice(0, SHOWN);
  return (
    <Panel title="Renewals" subtitle={`GPS licences and IoT SIMs · next ${r.windowDays} days`}
      aside={<Link href="/billing/vehicles" className="text-[13.5px] font-semibold text-navy hover:underline">Billing</Link>}>
      <div className="grid grid-cols-2 gap-3">
        <Link href={`/billing/vehicles?filter=${encodeURIComponent("Expiring soon")}`} className="rounded-xl bg-canvas px-3.5 py-3 hover:bg-[#ECF0F4]">
          <p className="text-[12.5px] text-muted">Due soon</p>
          <p className="text-[22px] font-semibold leading-tight tabular-nums">{r.upcomingCount.toLocaleString("en-US")}</p>
          <p className="text-[12.5px] tabular-nums text-muted">{r.upcomingFeesMinor ? `KES ${wholeKes(r.upcomingFeesMinor)}` : "No fees set"}</p>
        </Link>
        <Link href="/billing/vehicles?filter=Expired" className="rounded-xl bg-[#FDF0EE] px-3.5 py-3 hover:brightness-[0.98]">
          <p className="text-[12.5px] text-[#9e241a]">Expired</p>
          <p className="text-[22px] font-semibold leading-tight tabular-nums text-[#9e241a]">{r.overdueCount.toLocaleString("en-US")}</p>
          <p className="text-[12.5px] tabular-nums text-[#9e241a]/80">{r.overdueFeesMinor ? `KES ${wholeKes(r.overdueFeesMinor)}` : "No fees set"}</p>
        </Link>
      </div>
      {list.length === 0 ? (
        <p className="text-[14px] text-muted">Nothing is due in the next {r.windowDays} days.</p>
      ) : (
        <ul className="flex flex-col">
          {list.map((x) => (
            <li key={`${x.kind}:${x.saleId}`} className="flex items-center gap-3 border-t border-line py-2.5 first:border-t-0 first:pt-0">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-medium">{x.vehiclePlate || x.imei} <span className="font-normal text-muted">· {x.customerName}</span></p>
                <p className="text-[12.5px] text-muted">{x.kind} · {dueLabel(data.today, x.expiryDate)}</p>
              </div>
              <span className="whitespace-nowrap text-[14px] font-semibold tabular-nums">{x.feeMinor == null ? <span className="font-normal text-muted">—</span> : `KES ${wholeKes(x.feeMinor)}`}</span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
