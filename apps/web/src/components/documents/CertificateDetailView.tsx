"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, Download, Printer } from "lucide-react";
import { contractLabel, longDate, type Certificate } from "@/lib/certificates";
import { erpApi } from "@/lib/erp-api";
import { CertificateFrame } from "./CertificateFrame";
import { certificateFileName, downloadCertificatePdf } from "./certificate-pdf";

/** One issued certificate, ready to print or save as PDF. */
export function CertificateDetailView({ id }: { id: string }) {
  const [state, setState] = useState<{ status: "loading" } | { status: "error"; message: string } | { status: "ready"; c: Certificate }>({ status: "loading" });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  useEffect(() => {
    void erpApi.certificates.get(id).then((r) => setState(r.ok ? { status: "ready", c: r.data } : { status: "error", message: r.message }));
  }, [id]);
  // The browser's "Save as PDF" in the print dialog suggests the page title as the file name: use the number plate.
  const plateTitle = state.status === "ready" ? certificateFileName(state.c.vehicleReg).replace(/\.pdf$/, "") : null;
  useEffect(() => {
    if (!plateTitle) return;
    const before = document.title;
    document.title = plateTitle;
    return () => { document.title = before; };
  }, [plateTitle]);

  async function download() {
    if (state.status !== "ready" || saving) return;
    const article = document.querySelector<HTMLElement>("article.certificate");
    if (!article) return;
    setSaving(true);
    setSaveError("");
    try {
      await downloadCertificatePdf(article, state.c.vehicleReg);
    } catch {
      setSaveError("The PDF could not be created. Use Print and choose “Save as PDF” instead.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/documents/certificates" className="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-2 text-[15px] font-semibold text-navy hover:bg-white">
          <ArrowLeft size={17} aria-hidden="true" />All certificates
        </Link>
        {state.status === "ready" && (
          <div className="flex flex-wrap gap-2.5">
            <button type="button" onClick={() => window.print()} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line bg-white px-4 text-[15px] font-semibold hover:bg-canvas">
              <Printer size={17} aria-hidden="true" />Print
            </button>
            <button type="button" onClick={() => void download()} disabled={saving}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-brand px-5 text-[15px] font-semibold text-white hover:brightness-95 disabled:opacity-60">
              <Download size={17} aria-hidden="true" />{saving ? "Creating PDF…" : "Download PDF"}
            </button>
          </div>
        )}
      </div>
      {state.status === "loading" && <p className="py-10 text-center text-[14px] text-muted">Loading certificate…</p>}
      {state.status === "error" && <p role="alert" className="py-10 text-center text-[14px] text-[#C62828]">{state.message}</p>}
      {state.status === "ready" && (
        <>
          <div>
            <h1 className="text-[24px] font-semibold tracking-tight sm:text-[28px]">Certificate {state.c.number}</h1>
            <p className="mt-1 text-[14.5px]">
              Certificate ID <span className="font-mono font-semibold">{state.c.verifyCode}</span> ·{" "}
              <a href={`/verify/${state.c.verifyCode}`} target="_blank" rel="noopener" className="font-semibold text-navy underline">Open the verification page</a>
              <span className="text-muted"> (what the QR code shows)</span>
            </p>
            <p className="mt-1 text-[14.5px] text-muted">
              {state.c.customerName} · {state.c.vehicleReg} · {state.c.brand.name} · {contractLabel(state.c.contractYears)} · issued {longDate(state.c.issuedAt)}
              {state.c.issuedByName ? ` by ${state.c.issuedByName}` : ""}
            </p>
          </div>
          <div className="rounded-2xl bg-[#e9eef3] p-3 sm:p-6">
            <CertificateFrame c={state.c} />
          </div>
          {saveError && <p role="alert" className="text-[14px] text-[#C62828]">{saveError}</p>}
          <p className="text-[13px] text-muted">
            Download PDF saves <span className="font-semibold text-ink">{certificateFileName(state.c.vehicleReg)}</span>. To print, choose Print; for a printed PDF set margins to none and keep background graphics on.
          </p>
        </>
      )}
    </div>
  );
}
