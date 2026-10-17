import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/shell/PageHeader";
import { PackagesView } from "@/components/settings/PackagesView";

export const metadata: Metadata = { title: "Packages" };

export default function PackagesSettingsPage() {
  return (
    <>
      <Breadcrumbs items={["Settings", "Packages"]} />
      <PackagesView />
    </>
  );
}
