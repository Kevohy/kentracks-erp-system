"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2, Download, Printer, RotateCcw } from "lucide-react";
import { erpApi } from "@/lib/erp-api";
import { invDate, invoiceFileName, type Invoice } from "@/lib/invoices";
import { formatKes } from "@/lib/purchases";
import { InvoiceFrame } from "./InvoiceFrame";
import { downloadInvoicePdf } from "./invoice-pdf";

/** One invoice: print it, save it as PDF, or mark it paid. */
export function InvoiceDetailView({ id }: { id: string }) {
  const [state, setState] = useState<{ status: "loading" } | { status: "error"; message: string } | { status: "ready"; inv: Invoice }>({ status: "loading" });
  const [saving, setSaving] = useState(false);
  const [marking, setMarking] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    void erpApi.invoices.get(id).then((r) => setState(r.ok ? { status: "ready", inv: r.data } : { status: "error", message: r.message }));
  }, [id]);
  // The print dialog's "Save as PDF" suggests the page title as the file name.
  const fileTitle = state.status === "ready" ? invoiceFileName(state.inv.number, state.inv.customerName).replace(/\.pdf$/, "") : null;
  useEffect(() => {
    if (!fileTitle) return;
    const before = document.title;
    document.title = fileTitle;
    return () => { document.title = before; };
  }, [fileTitle]);

  async function download() {
    if (state.status !== "ready" || saving) return;
    const article = document.querySelector<HTMLElement>("article.invoice");
    if (!article) return;
    setSaving(true);
    setError("");
    try {
      await downloadInvoicePdf(article, state.inv.number, state.inv.customerName);
    } catch {
      setError("The PDF could not be created. Use Print and choose “Save as PDF” instead.");
    } finally {
      setSaving(false);
    }
  }

  async function mark(status: "Paid" | "Unpaid") {
    if (state.status !== "ready" || marking) return;
    setMarking(true);
    setError("");
    const r = await erpApi.invoices.setStatus(state.inv.id, status);
    setMarking(false);
    if (r.ok) setState({ status: "ready", inv: r.data });
    else setError(r.message);
  }

  const inv = state.status === "ready" ? state.inv : null;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/documents/invoices" className="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-2 text-[15px] font-semibold text-navy hover:bg-white">
          <ArrowLeft size={17} aria-hidden="true" />All invoices
        </Link>
        {inv && (
          <div className="flex flex-wrap gap-2.5">
            {inv.status === "Unpaid" ? (
              <button type="button" onClick={() => void mark("Paid")} disabled={marking}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#A5D6A7] bg-[#E8F5E9] px-4 text-[15px] font-semibold text-[#1B5E20] hover:brightness-95 disabled:opacity-60">
                <CheckCircle2 size={17} aria-hidden="true" />{marking ? "Saving…" : "Mark as paid"}
              </button>
            ) : (
              <button type="button" onClick={() => void mark("Unpaid")} disabled={marking}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line bg-white px-4 text-[15px] font-semibold hover:bg-canvas disabled:opacity-60">
                <RotateCcw size={17} aria-hidden="true" />{marking ? "Saving…" : "Mark as unpaid"}
              </button>
            )}
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
      {state.status === "loading" && <p className="py-10 text-center text-[14px] text-muted">Loading invoice…</p>}
      {state.status === "error" && <p role="alert" className="py-10 text-center text-[14px] text-[#C62828]">{state.message}</p>}
      {inv && (
        <>
          <div>
            <h1 className="text-[24px] font-semibold tracking-tight sm:text-[28px]">Invoice {inv.number}</h1>
            <p className="mt-1 text-[14.5px] text-muted">
              {inv.customerName} · {inv.brand.name} · {formatKes(inv.totalMinor)} · {inv.status === "Paid" && inv.paidAt ? `paid ${invDate(inv.paidAt)}` : `due ${invDate(inv.dueDate)}`}
              {inv.createdByName ? ` · created by ${inv.createdByName}` : ""}
            </p>
            <p className="mt-1 text-[14.5px]">
              Invoice ID <span className="font-mono font-semibold">{inv.verifyCode}</span> ·{" "}
              <a href={`/verify/${inv.verifyCode}`} target="_blank" rel="noopener" className="font-semibold text-navy underline">Open the verification page</a>
              <span className="text-muted"> (what the QR code shows)</span>
            </p>
          </div>
          {error && <p role="alert" className="text-[14px] text-[#C62828]">{error}</p>}
          <div className="rounded-2xl bg-[#e9eef3] p-3 sm:p-6">
            <InvoiceFrame inv={inv} />
          </div>
          <p className="text-[13px] text-muted">
            Download PDF saves <span className="font-semibold text-ink">{invoiceFileName(inv.number, inv.customerName)}</span>. To print, choose Print; set margins to none and keep background graphics on.
          </p>
        </>
      )}
    </div>
  );
}
