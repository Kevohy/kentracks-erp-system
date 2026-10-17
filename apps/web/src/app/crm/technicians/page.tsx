import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/shell/PageHeader";
import { TechniciansView } from "@/components/technicians/TechniciansView";

export const metadata: Metadata = { title: "Technicians" };

export default function TechniciansPage() {
  return (
    <>
      <Breadcrumbs items={["CRM", "Technicians"]} />
      <TechniciansView />
    </>
  );
}
