import type { Metadata } from "next";
import { Breadcrumbs, PageHeader } from "@/components/shell/PageHeader";
import { PackageSaleForm } from "@/components/sales/PackageSaleForm";

export const metadata: Metadata = { title: "Package Sale" };

export default function PackageSalePage() {
  return (
    <>
      <Breadcrumbs items={["Sales", "Package Sale"]} />
      <PageHeader title="Package Sale" />
      <PackageSaleForm />
    </>
  );
}
