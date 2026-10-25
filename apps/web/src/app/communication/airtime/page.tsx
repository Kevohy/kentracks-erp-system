import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/shell/PageHeader";
import { AirtimeView } from "@/components/communication/AirtimeView";

export const metadata: Metadata = { title: "Airtime" };

export default function AirtimePage() {
  return (
    <>
      <Breadcrumbs items={["Communication", "Airtime"]} />
      <AirtimeView />
    </>
  );
}
