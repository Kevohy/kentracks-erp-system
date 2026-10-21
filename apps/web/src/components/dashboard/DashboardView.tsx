"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/shell/PageHeader";
import { DASHBOARD_REFRESH_SECONDS, type DashboardSummary } from "@/lib/dashboard";
import { erpApi } from "@/lib/erp-api";
import { KpiCards } from "./KpiCards";
import { RecentSales } from "./RecentSales";
import { RevenueChart } from "./RevenueChart";
import { StockLevels } from "./StockLevels";
import { UpcomingRenewals } from "./UpcomingRenewals";

const rowClass = "grid grid-cols-1 gap-[18px] min-[1180px]:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]";
const time = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Nairobi" });

/** The main Dashboard: live figures from the company's records, refreshed every minute and when the tab is shown again. */
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
        subtitle="Overview of sales, customers, renewals and stock"
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
              className="inline-flex h-8 items-center gap-1.5 rounded-full border border-line bg-white px-3 text-[13px] font-semibold text-navy hover:bg-canvas disabled:opacity-60"
            >
              <RefreshCw size={14} className={busy ? "animate-spin" : undefined} aria-hidden="true" />
              Refresh
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
          <KpiCards data={data} />
          <section className={rowClass}>
            <RevenueChart data={data} />
            <UpcomingRenewals data={data} />
          </section>
          <section className={rowClass}>
            <RecentSales data={data} />
            <StockLevels data={data} />
          </section>
        </>
      )}
    </>
  );
}
