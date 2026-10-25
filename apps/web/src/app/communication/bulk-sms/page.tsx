import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/shell/PageHeader";
import { BulkSmsView } from "@/components/communication/BulkSmsView";

export const metadata: Metadata = { title: "Bulk SMS" };

export default function BulkSmsPage() {
  return (
    <>
      <Breadcrumbs items={["Communication", "Bulk SMS"]} />
      <BulkSmsView />
    </>
  );
}
