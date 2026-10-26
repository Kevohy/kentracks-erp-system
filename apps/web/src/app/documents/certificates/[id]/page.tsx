import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/shell/PageHeader";
import { CertificateDetailView } from "@/components/documents/CertificateDetailView";

export const metadata: Metadata = { title: "Certificate" };

export default async function CertificatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <>
      <Breadcrumbs items={["Documents", "Certificates", "Certificate"]} />
      <CertificateDetailView id={id} />
    </>
  );
}
