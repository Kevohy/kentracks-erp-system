import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/shell/PageHeader";
import { IotSimsView } from "@/components/iot/IotSimsView";

export const metadata: Metadata = { title: "IoT SIMs" };

export default function IotSimPage() {
  return (
    <>
      <Breadcrumbs items={["Billing", "IoT SIM"]} />
      <IotSimsView />
    </>
  );
}
