import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/shell/PageHeader";
import { InvoiceDetailView } from "@/components/documents/InvoiceDetailView";

export const metadata: Metadata = { title: "Invoice" };

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <>
      <Breadcrumbs items={["Documents", "Invoices", "Invoice"]} />
      <InvoiceDetailView id={id} />
    </>
  );
}
