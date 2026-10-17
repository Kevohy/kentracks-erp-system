import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/shell/PageHeader";
import { ProductsView } from "@/components/inventory/ProductsView";

export const metadata: Metadata = { title: "Products" };

export default function ProductsViewPage() {
  return (
    <>
      <Breadcrumbs items={["Inventory", "Products"]} />
      <ProductsView />
    </>
  );
}
