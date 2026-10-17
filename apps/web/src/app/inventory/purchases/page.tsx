import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/shell/PageHeader";
import { PurchasesView } from "@/components/purchases/PurchasesView";

export const metadata: Metadata = { title: "Purchases" };

export default function PurchasesPage() {
  return (
    <>
      <Breadcrumbs items={["Inventory", "Purchases"]} />
      <PurchasesView />
    </>
  );
}
