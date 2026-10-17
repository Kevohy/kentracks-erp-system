import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/shell/PageHeader";
import { SuppliersView } from "@/components/suppliers/SuppliersView";

export const metadata: Metadata = { title: "Suppliers" };

export default function SuppliersPage() {
  return (
    <>
      <Breadcrumbs items={["CRM", "Suppliers"]} />
      <SuppliersView />
    </>
  );
}
