import type { Metadata } from "next";
import { Breadcrumbs, PageHeader } from "@/components/shell/PageHeader";
import { PackageSaleForm } from "@/components/sales/PackageSaleForm";

export const metadata: Metadata = { title: "Hosting Sale" };

export default function HostingSalePage() {
  return (
    <>
      <Breadcrumbs items={["Sales", "Hosting Sale"]} />
      <PageHeader title="Hosting Sale" />
      <PackageSaleForm kind="Hosting Sale" />
    </>
  );
}
