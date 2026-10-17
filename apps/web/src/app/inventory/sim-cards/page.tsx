import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/shell/PageHeader";
import { SimCardsView } from "@/components/inventory/SimCardsView";

export const metadata: Metadata = { title: "SIM Cards" };

export default function SimCardsViewPage() {
  return (
    <>
      <Breadcrumbs items={["Inventory", "SIM Cards"]} />
      <SimCardsView />
    </>
  );
}
