import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/shell/PageHeader";
import { InvoicesView } from "@/components/documents/InvoicesView";

export const metadata: Metadata = { title: "Invoices" };

export default function InvoicesPage() {
  return (
    <>
      <Breadcrumbs items={["Documents", "Invoices"]} />
      <InvoicesView />
    </>
  );
}
