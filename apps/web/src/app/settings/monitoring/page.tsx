import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/shell/PageHeader";
import { MonitoringView } from "@/components/settings/MonitoringView";

export const metadata: Metadata = { title: "Server Monitoring" };

export default function MonitoringPage() {
  return (
    <>
      <Breadcrumbs items={["Settings", "Server Monitoring"]} />
      <MonitoringView />
    </>
  );
}
