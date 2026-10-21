import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/shell/PageHeader";
import { BillingVehiclesView } from "@/components/billing/BillingVehiclesView";

export const metadata: Metadata = { title: "Customer Vehicles" };

export default function BillingVehiclesPage() {
  return (
    <>
      <Breadcrumbs items={["Billing", "Customer Vehicles"]} />
      <BillingVehiclesView />
    </>
  );
}
