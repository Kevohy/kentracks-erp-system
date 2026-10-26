"use client";

import { invoiceFileName } from "@/lib/invoices";

const PAGE_W = 794;
const PAGE_H = 1123;

/**
 * Where to start each new page: never inside a row or block (elements marked data-keep). Returns the top of every page
 * in CSS pixels of the invoice.
 */
function pageStarts(article: HTMLElement, total: number): number[] {
  const top = article.getBoundingClientRect().top;
  const blocks = [...article.querySelectorAll<HTMLElement>("[data-keep]")].map((el) => {
    const r = el.getBoundingClientRect();
    return { start: r.top - top, end: r.bottom - top };
  });
  const starts = [0];
  let pageTop = 0;
  // Later pages start 40 px down (see below), so they hold a little less.
  const room = () => (starts.length === 1 ? PAGE_H : PAGE_H - 40);
  // The bottom padding after the last block does not need a page of its own.
  const end = Math.min(total, Math.max(0, ...blocks.map((b) => b.end)) + 8);
  while (end - pageTop > room()) {
    const limit = pageTop + room();
    // The first block that does not fit on this page starts the next one.
    const cut = blocks.find((b) => b.end > limit && b.start > pageTop)?.start ?? limit;
    pageTop = cut > pageTop + 100 ? cut : limit;
    starts.push(pageTop);
  }
  return starts;
}

/**
 * Saves the invoice on screen as an A4 PDF named "INV-2026-000013 - Customer.pdf". Captured at three times screen
 * resolution so text stays sharp and the QR code scans. A long invoice is split into pages between rows.
 */
export async function downloadInvoicePdf(article: HTMLElement, number: string, customer: string): Promise<void> {
  const [{ toCanvas }, { jsPDF }] = await Promise.all([import("html-to-image"), import("jspdf")]);
  await document.fonts.ready;
  await Promise.all([...article.querySelectorAll("img")].map((img) => (img.complete ? null : new Promise((r) => { img.onload = img.onerror = r; }))));
  const height = Math.max(PAGE_H, article.offsetHeight);
  const ratio = 3;
  const canvas = await toCanvas(article, { pixelRatio: ratio, width: PAGE_W, height, backgroundColor: "#ffffff", cacheBust: true, style: { boxShadow: "none" } });
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
  pdf.setProperties({ title: `Invoice ${number}`, subject: `Invoice for ${customer}`, creator: "Kentracks ERP" });
  const starts = pageStarts(article, height);
  starts.forEach((start, i) => {
    const end = i + 1 < starts.length ? starts[i + 1] : height;
    const slice = document.createElement("canvas");
    slice.width = PAGE_W * ratio;
    slice.height = PAGE_H * ratio;
    const ctx = slice.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, slice.width, slice.height);
    // Later pages get a small top margin so rows do not touch the edge.
    const offset = i === 0 ? 0 : 40 * ratio;
    const h = Math.min((end - start) * ratio, slice.height - offset);
    ctx.drawImage(canvas, 0, start * ratio, slice.width, h, 0, offset, slice.width, h);
    if (i > 0) pdf.addPage("a4", "portrait");
    pdf.addImage(slice.toDataURL("image/jpeg", 0.95), "JPEG", 0, 0, 210, 297, undefined, "FAST");
  });
  pdf.save(invoiceFileName(number, customer));
}
