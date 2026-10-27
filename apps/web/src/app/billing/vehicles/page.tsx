import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/shell/PageHeader";
import { BillingVehiclesView } from "@/components/billing/BillingVehiclesView";
import { billingFilters, type BillingFilter } from "@/lib/billing";

export const metadata: Metadata = { title: "Customer Vehicles" };

/** ?filter=Online (Offline, Expired, Expiring soon, Unknown) opens the page filtered, e.g. from the Dashboard. */
export default async function BillingVehiclesPage({ searchParams }: { searchParams: Promise<{ filter?: string | string[] }> }) {
  const raw = (await searchParams).filter;
  const f = Array.isArray(raw) ? raw[0] : raw;
  const filter = (billingFilters as readonly string[]).includes(f ?? "") ? (f as BillingFilter) : "All";
  return (
    <>
      <Breadcrumbs items={["Billing", "Customer Vehicles"]} />
      <BillingVehiclesView key={filter} initialFilter={filter} />
    </>
  );
}
