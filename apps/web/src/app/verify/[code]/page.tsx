import type { Metadata } from "next";
import Link from "next/link";
import { BadgeCheck, CircleAlert, CircleX } from "lucide-react";
import { contractLabel, longDate } from "@/lib/certificates";
import { invDate } from "@/lib/invoices";
import { formatKes } from "@/lib/purchases";
import { checkCertificate } from "@/server/erp/certificates";
import { checkInvoice } from "@/server/erp/invoices";

export const metadata: Metadata = { title: "Document verification", robots: { index: false, follow: false } };

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line py-2.5 last:border-b-0">
      <dt className="text-[13.5px] text-muted">{label}</dt>
      <dd className="text-right text-[15px] font-semibold">{value}</dd>
    </div>
  );
}

/**
 * Public page a certificate's QR code opens. Confirms that the certificate is genuine and whether it is still valid.
 * No contact details are shown: the owner's name is shortened and the IMEI's last four digits are hidden.
 */
export default async function VerifyCertificatePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const c = await checkCertificate(decodeURIComponent(code));
  const inv = c ? null : await checkInvoice(decodeURIComponent(code));
  if (inv) {
    const paid = inv.status === "Paid";
    return (
      <main className="flex min-h-screen items-center justify-center bg-canvas px-4 py-10">
        <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-[0_8px_30px_rgba(5,85,135,0.10)]">
          <div className={paid ? "bg-[#1B5E20] px-6 py-6 text-center text-white" : "bg-navy px-6 py-6 text-center text-white"}>
            <BadgeCheck size={46} className="mx-auto" aria-hidden="true" />
            <h1 className="mt-2 text-[22px] font-semibold">Genuine invoice · {paid ? "Paid" : "Unpaid"}</h1>
            <p className="mt-1 text-[14.5px] text-white/85">Issued by {inv.brandName} on {invDate(inv.invoiceDate)}</p>
          </div>
          <dl className="px-6 py-4">
            <Row label="Invoice ID" value={inv.verifyCode} />
            <Row label="Invoice No." value={inv.number} />
            <Row label="Billed to" value={inv.customerName} />
            <Row label="Reference" value={inv.title} />
            <Row label="Amount" value={formatKes(inv.totalMinor)} />
            <Row label="Due date" value={invDate(inv.dueDate)} />
            <Row label="Payment status" value={inv.status} />
          </dl>
          <p className="border-t border-line px-6 py-4 text-center text-[13px] text-muted">
            Check that the number and amount match the invoice you received. If they do not, do not pay it and contact {inv.brandName}.
          </p>
        </div>
      </main>
    );
  }
  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-4 py-10">
      <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-[0_8px_30px_rgba(5,85,135,0.10)]">
        {!c ? (
          <div className="px-6 py-10 text-center">
            <CircleX size={44} className="mx-auto text-[#C62828]" aria-hidden="true" />
            <h1 className="mt-3 text-[22px] font-semibold">Not found</h1>
            <p className="mt-1 text-[15px] text-muted">No certificate or invoice has the ID <span className="font-mono font-semibold text-ink">{code.toUpperCase().slice(0, 12)}</span>. Check the ID printed next to the QR code. A document that cannot be found here is not genuine.</p>
            <Link href="/verify" className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-navy px-5 text-[15px] font-semibold text-white">Try another ID</Link>
          </div>
        ) : (
          <>
            <div className={c.status === "Valid" ? "bg-[#1B5E20] px-6 py-6 text-center text-white" : "bg-[#9a3300] px-6 py-6 text-center text-white"}>
              {c.status === "Valid" ? <BadgeCheck size={46} className="mx-auto" aria-hidden="true" /> : <CircleAlert size={46} className="mx-auto" aria-hidden="true" />}
              <h1 className="mt-2 text-[22px] font-semibold">{c.status === "Valid" ? "Genuine certificate · Valid" : "Genuine certificate · Expired"}</h1>
              <p className="mt-1 text-[14.5px] text-white/85">Issued by {c.brandName} on {longDate(c.issuedAt)}</p>
            </div>
            <dl className="px-6 py-4">
              <Row label="Certificate ID" value={c.verifyCode} />
              <Row label="Certificate No." value={c.number} />
              <Row label="Vehicle" value={c.vehicleReg} />
              <Row label="Make & model" value={`${c.makeModel} (${c.year})`} />
              <Row label="Owner" value={c.ownerName} />
              <Row label="Tracker IMEI" value={c.imeiMasked} />
              <Row label="Installed on" value={longDate(c.installedOn)} />
              <Row label="Contract" value={contractLabel(c.contractYears)} />
              <Row label="Valid until" value={c.validUntil ? longDate(c.validUntil) : "Lifetime"} />
            </dl>
            <p className="border-t border-line px-6 py-4 text-center text-[13px] text-muted">
              Questions? Contact {c.brandName}{c.brandPhone ? ` on ${c.brandPhone}` : ""}{c.brandWebsite ? ` · ${c.brandWebsite.replace(/^https?:\/\//, "")}` : ""}.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
