import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/shell/PageHeader";
import { GpsPlatformView } from "@/components/settings/GpsPlatformView";

export const metadata: Metadata = { title: "GPS Platform" };

export default function GpsPlatformPage() {
  return (
    <>
      <Breadcrumbs items={["Communication", "GPS Platform"]} />
      <GpsPlatformView />
    </>
  );
}
