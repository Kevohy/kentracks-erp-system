import type { Metadata } from "next";
import { Breadcrumbs, PageHeader } from "@/components/shell/PageHeader";
import { KpiCards } from "@/components/dashboard/KpiCards";
import { RevenueChart } from "@/components/dashboard/RevenueChart";
import { UpcomingRenewals } from "@/components/dashboard/UpcomingRenewals";
import { RecentInvoices } from "@/components/dashboard/RecentInvoices";
import { StockLevels } from "@/components/dashboard/StockLevels";
import { sampleAsOf } from "@/lib/sample-data";

export const metadata: Metadata = { title: "Dashboard" };

const rowClass = "grid grid-cols-1 gap-[18px] min-[1180px]:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]";

export default function DashboardPage() {
  return (
    <>
      <Breadcrumbs items={["Dashboard"]} />
      <PageHeader
        title="Dashboard"
        subtitle={`Overview · sample data as of ${sampleAsOf}`}
        aside={
          <span className="inline-flex h-8 items-center gap-2 rounded-full border border-line bg-white px-3 text-[13px] font-medium text-muted">
            <i className="block size-[7px] rounded-full bg-brand" />
            Sample data
          </span>
        }
      />
      <KpiCards />
      <section className={rowClass}>
        <RevenueChart />
        <UpcomingRenewals />
      </section>
      <section className={rowClass}>
        <RecentInvoices />
        <StockLevels />
      </section>
    </>
  );
}
