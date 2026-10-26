"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import QRCode from "qrcode";
import { invDate, type Invoice } from "@/lib/invoices";
import { formatKes } from "@/lib/purchases";
import { localPhone } from "@/lib/sms";
import { verifyUrl } from "./CertificateDocument";
import { DOC, brandAccent } from "./palette";

/** What the invoice shows. A preview has no number or verification code yet. */
export type InvoiceView = Omit<Invoice, "id" | "number" | "verifyCode" | "customerId" | "brandId" | "createdByName" | "paidAt"> & {
  number: string | null;
  verifyCode: string | null;
};

const INK = DOC.ink;
const NAVY = DOC.navy;
const MUTED = DOC.muted;
const CARD = DOC.card;
const LINE = DOC.line;
const ACCENT = "var(--accent)";

const phoneText = (p: string) => (p.startsWith("+254") ? localPhone(p) : p);
const site = (w: string) => w.replace(/^https?:\/\//, "").replace(/\/$/, "");
const qty = (q: number) => (Number.isInteger(q) ? String(q) : q.toFixed(2).replace(/0$/, ""));

function useQr(code: string | null) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    let live = true;
    void QRCode.toDataURL(verifyUrl(code ?? "PREVIEW000"), { errorCorrectionLevel: "M", margin: 0, width: 300, color: { dark: INK, light: "#FFFFFF" } })
      .then((url) => live && setSrc(url));
    return () => { live = false; };
  }, [code]);
  return src;
}

function Card({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <div style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 10, ...style }}>{children}</div>;
}

const label: CSSProperties = { fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: INK };

function DetailRow({ name, value, last }: { name: string; value: string; last?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 16, padding: "7px 0", borderBottom: last ? "none" : `1px solid ${LINE}`, fontSize: 12.5 }}>
      <span style={{ color: "#3B4656" }}>{name}</span>
      <span style={{ fontWeight: 700, color: INK, textAlign: "right" }}>{value}</span>
    </div>
  );
}

/**
 * The invoice, A4 wide (794 px). It is one page tall unless it has many lines; then it grows and the PDF is split into
 * pages between rows (each row and block is marked with data-keep). Colours follow the brand (red by default).
 */
export function InvoiceDocument({ inv }: { inv: InvoiceView }) {
  const qr = useQr(inv.verifyCode);
  const items = inv.lines.filter((l) => l.kind === "item");
  const expenses = inv.lines.filter((l) => l.kind === "expense");
  const paid = inv.status === "Paid";
  const due = paid ? 0 : inv.totalMinor;
  const b = inv.brand;
  const subtotal = inv.itemsMinor + inv.expensesMinor;

  const th: CSSProperties = { padding: "11px 14px", fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#fff" };
  const td: CSSProperties = { padding: "10px 14px", fontSize: 12.5, color: INK, borderTop: `1px solid ${LINE}` };
  const num: CSSProperties = { whiteSpace: "nowrap", textAlign: "right" };

  return (
    <article
      className="invoice"
      style={{
        "--accent": brandAccent(b.color), width: 794, minHeight: 1123, padding: "44px 50px 26px", background: "#fff", color: INK,
        display: "flex", flexDirection: "column", boxShadow: "0 10px 30px rgba(15,23,42,0.12)",
      } as CSSProperties}
    >
      {/* Header */}
      <header data-keep style={{ display: "flex", justifyContent: "space-between", gap: 24, paddingBottom: 12, borderBottom: `3px solid ${ACCENT}` }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 25, fontWeight: 700, color: ACCENT, lineHeight: 1.1 }}>{b.name}</div>
            {b.tagline && <div style={{ fontSize: 11, color: MUTED, marginTop: 7 }}>{b.tagline}</div>}
            <div style={{ fontSize: 11.5, color: MUTED, marginTop: 9, lineHeight: 1.6 }}>
              {b.phone && <div>{phoneText(b.phone)}</div>}
              {b.email && <div>{b.email}</div>}
              {b.website && <div>{site(b.website)}</div>}
            </div>
          </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: "0.16em", color: ACCENT }}>INVOICE</div>
          <div style={{ fontSize: 20, fontWeight: 700, marginTop: 2 }}>#{inv.number ?? "INV-PREVIEW"}</div>
          <span
            style={{
              display: "inline-block", marginTop: 12, padding: "4px 12px", borderRadius: 999, fontSize: 10.5, fontWeight: 700, letterSpacing: "0.06em",
              ...(paid ? { color: "#1B5E20", background: "#E8F5E9", border: "1px solid #A5D6A7" } : { color: ACCENT, background: "color-mix(in srgb, var(--accent) 8%, #fff)", border: "1px solid color-mix(in srgb, var(--accent) 45%, #fff)" }),
            }}
          >
            {paid ? "PAID" : "UNPAID"}
          </span>
        </div>
      </header>

      {/* Bill to + details */}
      <div data-keep style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 18 }}>
        <Card style={{ padding: "18px 16px" }}>
          <div style={label}>Bill to</div>
          <div style={{ fontSize: 16, fontWeight: 600, marginTop: 10 }}>{inv.customerName}</div>
          <div style={{ fontSize: 11.5, color: MUTED, marginTop: 8, lineHeight: 1.65 }}>
            {inv.customerPhone && <div>Phone: {phoneText(inv.customerPhone)}</div>}
            {inv.customerEmail && <div>Email: {inv.customerEmail}</div>}
            {inv.customerLocation && <div>Location: {inv.customerLocation}</div>}
          </div>
        </Card>
        <Card style={{ padding: "10px 16px" }}>
          <DetailRow name="Invoice date" value={invDate(inv.invoiceDate)} />
          <DetailRow name="Due date" value={invDate(inv.dueDate)} />
          <DetailRow name="Payment status" value={inv.status} />
          <DetailRow name="Reference" value={inv.title} last />
        </Card>
      </div>

      {/* Lines */}
      <div style={{ marginTop: 16, border: `1px solid ${LINE}`, borderRadius: 4, overflow: "hidden" }}>
        <div data-keep style={{ display: "grid", gridTemplateColumns: "1fr 124px 52px 132px", background: NAVY }}>
          <div style={th}>Description</div>
          <div style={{ ...th, textAlign: "right" }}>Unit price</div>
          <div style={{ ...th, textAlign: "center" }}>Qty</div>
          <div style={{ ...th, textAlign: "right" }}>Total</div>
        </div>
        {items.map((l, i) => (
          <div key={`i${i}`} data-keep style={{ display: "grid", gridTemplateColumns: "1fr 124px 52px 132px" }}>
            <div style={{ ...td, ...(i === 0 ? { borderTop: "none" } : {}) }}>{l.name}</div>
            <div style={{ ...td, ...num, ...(i === 0 ? { borderTop: "none" } : {}) }}>{formatKes(l.unitPriceMinor)}</div>
            <div style={{ ...td, textAlign: "center", ...(i === 0 ? { borderTop: "none" } : {}) }}>{qty(l.quantity)}</div>
            <div style={{ ...td, ...num, fontWeight: 700, ...(i === 0 ? { borderTop: "none" } : {}) }}>{formatKes(l.totalMinor)}</div>
          </div>
        ))}
        {expenses.length > 0 && (
          <>
            <div data-keep style={{ ...td, background: CARD, padding: "7px 14px", ...label, fontSize: 9.5, color: MUTED }}>Expenses</div>
            {expenses.map((l, i) => (
              <div key={`e${i}`} data-keep style={{ display: "grid", gridTemplateColumns: "1fr 124px 52px 132px" }}>
                <div style={td}>{l.name}</div>
                <div style={{ ...td, ...num }}>{formatKes(l.unitPriceMinor)}</div>
                <div style={{ ...td, textAlign: "center" }}>1</div>
                <div style={{ ...td, ...num, fontWeight: 700 }}>{formatKes(l.totalMinor)}</div>
              </div>
            ))}
          </>
        )}
      </div>

      {/* Payment + totals */}
      <div data-keep style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 18, alignItems: "start" }}>
        <Card style={{ padding: "16px 16px 18px" }}>
          <div style={label}>Payment instructions</div>
          <div style={{ fontSize: 11.5, color: MUTED, marginTop: 9, lineHeight: 1.7 }}>
            {inv.paymentMethod && inv.paymentDetails && <div>{inv.paymentMethod}: {inv.paymentDetails}</div>}
            {!inv.paymentMethod && inv.paymentDetails && <div>{inv.paymentDetails}</div>}
            <div>Amount: {formatKes(inv.totalMinor)}</div>
            {inv.paymentMethod && <div>Payment method: {inv.paymentMethod.toUpperCase()}</div>}
            {!inv.paymentMethod && !inv.paymentDetails && b.phone && <div>Call {phoneText(b.phone)} to arrange payment.</div>}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 14 }}>
            <div style={{ background: "#fff", padding: 5, borderRadius: 4, flexShrink: 0 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {qr ? <img src={qr} alt="QR code to verify this invoice" style={{ width: 82, height: 82, display: "block" }} /> : <div style={{ width: 82, height: 82 }} />}
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: ACCENT, lineHeight: 1.45 }}>Scan to verify this invoice online.</div>
              {inv.verifyCode && <div style={{ fontSize: 10, color: MUTED, marginTop: 4 }}>Invoice ID <span style={{ fontFamily: "ui-monospace, monospace", fontWeight: 700, color: INK }}>{inv.verifyCode}</span></div>}
            </div>
          </div>
        </Card>
        <div style={{ paddingTop: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 12px", fontSize: 12.5 }}>
            <span>Subtotal</span><span>{formatKes(inv.itemsMinor)}</span>
          </div>
          {inv.expensesMinor > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", padding: "0 12px 10px", fontSize: 12.5 }}>
              <span>Expenses</span><span>{formatKes(inv.expensesMinor)}</span>
            </div>
          )}
          {inv.vat && (
            <div style={{ display: "flex", justifyContent: "space-between", padding: "0 12px 10px", fontSize: 12.5 }}>
              <span>VAT ({inv.vatRate}%{inv.expensesMinor > 0 ? ` on ${formatKes(subtotal)}` : ""})</span><span>{formatKes(inv.vatMinor)}</span>
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: ACCENT, color: "#fff", borderRadius: 6, padding: "14px 18px", marginTop: 2 }}>
            <span style={{ fontSize: 13.5, fontWeight: 600, letterSpacing: "0.02em" }}>GRAND TOTAL</span>
            <span style={{ fontSize: 18, fontWeight: 700 }}>{formatKes(inv.totalMinor)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", background: "color-mix(in srgb, var(--accent) 7%, #fff)", borderRadius: 6, padding: "10px 14px", marginTop: 8, fontSize: 12, fontWeight: 700, color: ACCENT }}>
            <span>Total Due</span><span>{formatKes(due)}</span>
          </div>
        </div>
      </div>

      {/* Footer, kept at the bottom of the (last) page */}
      <footer data-keep style={{ marginTop: "auto", paddingTop: 28 }}>
        <div style={{ borderTop: `1px solid ${LINE}`, paddingTop: 16, display: "flex", justifyContent: "space-between", gap: 24 }}>
          <div>
            <div style={label}>Terms &amp; conditions</div>
            <div style={{ fontSize: 11, color: MUTED, marginTop: 10, lineHeight: 1.75 }}>
              <div>Payment is due upon receipt of this invoice.</div>
              <div>Late payments may attract a 2% monthly surcharge.</div>
              <div>Queries should be raised within 7 days of the invoice date.</div>
            </div>
          </div>
          <div style={{ textAlign: "right", display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
            <div style={label}>Authorised signature</div>
            <div style={{ height: 56, display: "flex", alignItems: "flex-end", justifyContent: "flex-end", marginTop: 6 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {b.signatureUrl && <img src={b.signatureUrl} alt="" style={{ maxHeight: 54, maxWidth: 170, objectFit: "contain" }} />}
            </div>
            {b.directorName && <div style={{ fontSize: 14, fontWeight: 700, marginTop: 2 }}>{b.directorName}</div>}
            <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>Managing Director</div>
          </div>
        </div>
        <div style={{ borderTop: `1px solid ${LINE}`, marginTop: 16, paddingTop: 10, display: "flex", justifyContent: "space-between", fontSize: 10, color: MUTED }}>
          <span>Thank you for your business.</span>
          <span>Generated {invDate(inv.createdAt)} at {new Date(inv.createdAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Nairobi" })}</span>
        </div>
      </footer>
    </article>
  );
}
