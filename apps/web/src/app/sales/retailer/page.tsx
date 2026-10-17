import type { Metadata } from "next";
import { Breadcrumbs, PageHeader } from "@/components/shell/PageHeader";
import { RetailerSaleForm } from "@/components/sales/RetailerSaleForm";

export const metadata: Metadata = { title: "Retailer Sale" };

export default function RetailerSalePage() {
  return (
    <>
      <Breadcrumbs items={["Sales", "Retailer Sale"]} />
      <PageHeader title="Retailer Sale" />
      <RetailerSaleForm />
    </>
  );
}
