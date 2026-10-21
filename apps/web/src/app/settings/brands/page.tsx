import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/shell/PageHeader";
import { BrandsView } from "@/components/settings/BrandsView";

export const metadata: Metadata = { title: "Brands" };

export default function BrandsSettingsPage() {
  return (
    <>
      <Breadcrumbs items={["Settings", "Brands"]} />
      <BrandsView />
    </>
  );
}
