import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/shell/PageHeader";
import { CertificatesView } from "@/components/documents/CertificatesView";

export const metadata: Metadata = { title: "Certificates" };

export default function CertificatesPage() {
  return (
    <>
      <Breadcrumbs items={["Documents", "Certificates"]} />
      <CertificatesView />
    </>
  );
}
