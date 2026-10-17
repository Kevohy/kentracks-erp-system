import type { Metadata } from "next";
import { Breadcrumbs, PageHeader } from "@/components/shell/PageHeader";
import { InventoryDashboard } from "@/components/inventory/InventoryDashboard";

export const metadata: Metadata = { title: "Dashboard" };

export default function InventoryDashboardPage() {
  return (
    <>
      <Breadcrumbs items={["Inventory", "Dashboard"]} />
      <PageHeader title="Dashboard" />
      <InventoryDashboard />
    </>
  );
}
