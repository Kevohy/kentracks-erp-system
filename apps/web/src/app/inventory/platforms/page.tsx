import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/shell/PageHeader";
import { PlatformsView } from "@/components/inventory/PlatformsView";

export const metadata: Metadata = { title: "Platforms" };

export default function PlatformsViewPage() {
  return (
    <>
      <Breadcrumbs items={["Inventory", "Platforms"]} />
      <PlatformsView />
    </>
  );
}
