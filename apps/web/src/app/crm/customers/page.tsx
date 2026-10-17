import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/shell/PageHeader";
import { CustomersView } from "@/components/customers/CustomersView";

export const metadata: Metadata = { title: "Customers" };

export default function CustomersPage() {
  return (
    <>
      <Breadcrumbs items={["CRM", "Customers"]} />
      <CustomersView />
    </>
  );
}
