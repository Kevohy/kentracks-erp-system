import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/shell/PageHeader";
import { DashboardView } from "@/components/dashboard/DashboardView";

export const metadata: Metadata = { title: "Dashboard" };

export default function DashboardPage() {
  return (
    <>
      <Breadcrumbs items={["Dashboard"]} />
      <DashboardView />
    </>
  );
}
