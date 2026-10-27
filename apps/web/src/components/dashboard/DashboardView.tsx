"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/shell/PageHeader";
import { DASHBOARD_REFRESH_SECONDS, type DashboardSummary } from "@/lib/dashboard";
import { erpApi } from "@/lib/erp-api";
import { DevicesCard } from "./DevicesCard";
import { KpiCards } from "./KpiCards";
import { RecentSales } from "./RecentSales";
import { SalesTrend } from "./SalesTrend";
import { UpcomingRenewals } from "./UpcomingRenewals";

const rowClass = "grid grid-cols-1 gap-4 min-[1180px]:grid-cols-[minmax(0,1.75fr)_minmax(0,1fr)]";
const time = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Nairobi" });

/**
 * The main Dashboard: headline figures, the sales trend, devices by GPS status, recent sales and renewals. Live
 * figures from the company's records, refreshed every minute and when the tab is shown again.
 */
export function DashboardView() {
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);

  const load = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    const r = await erpApi.dashboard.get();
    inFlight.current = false;
    setBusy(false);
    if (r.ok) {
      setData(r.data);
      setError(null);
    } else setError(r.message);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, DASHBOARD_REFRESH_SECONDS * 1000);
    const onShow = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onShow);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onShow);
    };
  }, [load]);

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle="Sales, devices and renewals at a glance"
        aside={
          <div className="flex items-center gap-2.5">
            {data && (
              <span className="inline-flex h-8 items-center gap-2 rounded-full border border-line bg-white px-3 text-[13px] font-medium text-muted" role="status">
                <i className="block size-[7px] rounded-full bg-[#2E7D32]" aria-hidden="true" />
                Live · updated {time(data.asOf)}
              </span>
            )}
            <button
              type="button"
              onClick={() => void load()}
              disabled={busy}
              aria-label="Refresh"
              title="Refresh"
              className="grid size-8 place-items-center rounded-full border border-line bg-white text-navy hover:bg-canvas disabled:opacity-60"
            >
              <RefreshCw size={14} className={busy ? "animate-spin" : undefined} aria-hidden="true" />
            </button>
          </div>
        }
      />
      {error && (
        <p role="alert" className="rounded-xl bg-[#FDECEA] px-3.5 py-3 text-[14px] text-[#B71C1C]">
          {data ? `Could not refresh: ${error} Showing the last figures.` : error}
        </p>
      )}
      {!data && !error && (
        <p role="status" className="flex items-center gap-2 text-muted">
          <Loader2 size={16} className="animate-spin" aria-hidden="true" />
          Loading the dashboard…
        </p>
      )}
      {data && (
        <>
          {(data.renewals.overdueCount > 0 || data.lowStockCount > 0) && (
            <p className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-[#F6D9B8] bg-[#FFF8EF] px-3.5 py-2.5 text-[13.5px] text-[#7a3600]">
              <AlertTriangle size={15} className="shrink-0" aria-hidden="true" />
              {data.renewals.overdueCount > 0 && (
                <Link href="/billing/vehicles?filter=Expired" className="hover:underline">
                  <span className="font-semibold">{data.renewals.overdueCount.toLocaleString("en-US")}</span> renewal{data.renewals.overdueCount === 1 ? "" : "s"} expired
                </Link>
              )}
              {data.lowStockCount > 0 && (
                <Link href="/inventory/products" className="hover:underline">
                  <span className="font-semibold">{data.lowStockCount.toLocaleString("en-US")}</span> item{data.lowStockCount === 1 ? "" : "s"} low on stock
                </Link>
              )}
            </p>
          )}
          <KpiCards data={data} />
          <section className={rowClass}>
            <SalesTrend data={data} />
            <DevicesCard data={data} />
          </section>
          <section className="grid grid-cols-1 gap-4 min-[1000px]:grid-cols-2">
            <RecentSales data={data} />
            <UpcomingRenewals data={data} />
          </section>
        </>
      )}
    </>
  );
}
