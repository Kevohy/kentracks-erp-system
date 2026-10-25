import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/shell/PageHeader";
import { AfricasTalkingView } from "@/components/settings/AfricasTalkingView";

export const metadata: Metadata = { title: "Africa's Talking" };

export default function AfricasTalkingPage() {
  return (
    <>
      <Breadcrumbs items={["Settings", "Africa's Talking"]} />
      <AfricasTalkingView />
    </>
  );
}
