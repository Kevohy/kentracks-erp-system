import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/shell/PageHeader";
import { SalesView } from "@/components/sales/SalesView";

export const metadata: Metadata = { title: "Sales" };

export default function SalesPage() {
  return (
    <>
      <Breadcrumbs items={["Sales"]} />
      <SalesView />
    </>
  );
}
