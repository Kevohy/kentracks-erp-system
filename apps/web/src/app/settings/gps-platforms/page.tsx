import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/shell/PageHeader";
import { GpsPlatformView } from "@/components/settings/GpsPlatformView";

export const metadata: Metadata = { title: "GPS Platforms" };

export default function GpsPlatformsPage() {
  return (
    <>
      <Breadcrumbs items={["Settings", "GPS Platforms"]} />
      <GpsPlatformView />
    </>
  );
}
