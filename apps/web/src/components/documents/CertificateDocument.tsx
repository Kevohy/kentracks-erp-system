"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { Car, Globe, Mail, MapPin, Phone, QrCode as QrIcon, UserRound } from "lucide-react";
import QRCode from "qrcode";
import { cn } from "@/lib/cn";
import { contractLabel, dateTime, type Certificate } from "@/lib/certificates";
import { DOC, brandAccent } from "./palette";

/**
 * What the certificate shows. On a preview nothing has been issued yet: `number` and `verifyCode` are null, and the QR
 * code is a placeholder.
 */
export type CertificateView = Omit<Certificate, "id" | "number" | "verifyCode" | "saleId" | "customerId" | "brandId" | "issuedByName"> & {
  number: string | null;
  verifyCode: string | null;
};

// The app's light theme. The accent is the brand's own colour (Settings → Brands), set on the certificate as the CSS
// variable --accent; brands without one use the red of the Kentracks logo.
const RED = "var(--accent)";
/** Stamp ink: the brand colour deepened towards the dark red-violet of real stamp-pad ink. */
const STAMP_INK = "color-mix(in srgb, var(--accent) 68%, #4a0a26)";
const NAVY = DOC.navy;
const INK = DOC.ink;
const MUTED = DOC.muted;
const LINE = DOC.line;

/** +254727089995 → "+254 727 089 995"; other numbers unchanged. */
const spaced = (p: string) => (/^\+254\d{9}$/.test(p) ? `+254 ${p.slice(4, 7)} ${p.slice(7, 10)} ${p.slice(10)}` : p);
/** The IMEI with its last four digits hidden, as on the printed template. */
export const maskImei = (imei: string) => (imei.length > 4 ? `${imei.slice(0, -4)}****` : imei);
const host = (url: string) => url.replace(/^https?:\/\//i, "").replace(/\/$/, "");
/** "2026-07-04" → "04 Jul 2026". */
const dmy = (iso: string) =>
  new Date(iso.length > 10 ? iso : `${iso}T12:00:00Z`).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: iso.length > 10 ? "Africa/Nairobi" : "UTC" });

/** The public address a QR code opens to confirm the certificate. */
export function verifyUrl(code: string) {
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  return `${origin}/verify/${code}`;
}

function QrCode({ code }: { code: string | null }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void QRCode.toDataURL(verifyUrl(code ?? "PREVIEW0000"), { errorCorrectionLevel: "M", margin: 0, width: 300, color: { dark: INK, light: "#FFFFFF" } })
      .then((url) => live && setSrc(url));
    return () => { live = false; };
  }, [code]);
  return (
    <div className="relative mx-auto size-[150px]">
      {/* eslint-disable-next-line @next/next/no-img-element -- generated data URL */}
      {src && <img src={src} alt={code ? `QR code to verify certificate ${code}` : "QR code (preview)"} className={`size-full [image-rendering:pixelated] ${code ? "" : "opacity-20"}`} />}
      {!code && <span className="absolute inset-0 flex items-center justify-center text-center text-[10px] font-bold" style={{ color: MUTED }}>Created when<br />generated</span>}
    </div>
  );
}

/** The brand's square icon (falls back to the logo, then to its first letter). */
function BrandIcon({ b, size }: { b: CertificateView["brand"]; size: number }) {
  const src = b.iconUrl ?? b.logoUrl;
  return (
    <div className="flex shrink-0 items-center justify-center overflow-hidden rounded-[18px]" style={{ width: size, height: size, backgroundColor: src ? "transparent" : RED }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- same-origin brand image */}
      {src ? <img src={src} alt={`${b.name} icon`} className="size-full object-contain" /> : <span className="font-black text-white" style={{ fontSize: size * 0.45 }}>{b.name.slice(0, 1).toUpperCase()}</span>}
    </div>
  );
}

function Bar({ children, color = RED, icon: Icon, className = "" }: { children: ReactNode; color?: string; icon?: typeof Car; className?: string }) {
  return (
    <div className={`flex items-center gap-[7px] px-[11px] py-[7px] text-[12.5px] font-bold uppercase tracking-[0.08em] text-white ${className}`} style={{ backgroundColor: color }}>
      {Icon && <Icon size={14} strokeWidth={2.4} aria-hidden="true" />}
      {children}
    </div>
  );
}

/** A details card: coloured title bar, then label / value rows with soft alternate shading. */
function DetailCard({ icon, title, children }: { icon: typeof Car; title: string; children: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-[8px] border bg-white/95" style={{ borderColor: LINE }}>
      <Bar icon={icon}>{title}</Bar>
      <dl className="[&>div:nth-child(even)]:bg-[#F7F9FB]">{children}</dl>
    </section>
  );
}

function Line({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid grid-cols-[132px_1fr] items-center border-t px-[11px] py-[5px] first:border-t-0" style={{ borderColor: "#E8EDF2" }}>
      <dt className="text-[10px] font-semibold uppercase tracking-[0.1em]" style={{ color: MUTED }}>{label}</dt>
      <dd className="min-w-0 break-words text-[13px] font-medium" style={{ color: INK }}>{value || <span style={{ color: MUTED }}>N/A</span>}</dd>
    </div>
  );
}

/**
 * The company's rubber stamp: the brand name around the ring, "CERTIFIED" on a band across
 * the middle and the date of issue, in the brand's colour. The ink is uneven (speckled, with rough edges), slightly
 * tilted and see-through, like a real stamp. SVG, so it prints sharp.
 */
function RubberStamp({ b, issuedAt, preview, className }: { b: CertificateView["brand"]; issuedAt: string; preview: boolean; className?: string }) {
  const id = useId().replace(/:/g, "");
  const top = b.name.toUpperCase();
  // Long names get smaller letters so they fit on the arc (keeping clear of the stars at the sides).
  const fontSize = Math.min(17, 180 / Math.max(1, top.length * 0.72));
  const spacing = Math.max(0.4, Math.min(5, (180 - top.length * fontSize * 0.72) / Math.max(1, top.length)));
  const date = preview ? "PREVIEW" : dmy(issuedAt).toUpperCase();
  return (
    <svg viewBox="0 0 220 220" role="img" aria-label={`${b.name} certified stamp, ${preview ? "preview" : dmy(issuedAt)}`}
      className={cn("pointer-events-none shrink-0 rotate-[-12deg] opacity-[0.84] mix-blend-multiply", className)}>
      <defs>
        <path id={`${id}-t`} d="M 40,110 A 70,70 0 0 1 180,110" />
        <path id={`${id}-b`} d="M 33,110 A 77,77 0 0 0 187,110" />
        {/* Worn ink: rough edges, then specks where the ink did not take. */}
        <filter id={`${id}-ink`} x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="7" result="warp" />
          <feDisplacementMap in="SourceGraphic" in2="warp" scale="2.6" xChannelSelector="R" yChannelSelector="G" result="rough" />
          <feTurbulence type="fractalNoise" baseFrequency="0.55" numOctaves="2" seed="3" result="grain" />
          <feColorMatrix in="grain" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -3.2 2.75" result="specks" />
          <feComposite in="rough" in2="specks" operator="in" />
        </filter>
      </defs>
      <g filter={`url(#${id}-ink)`} style={{ fill: STAMP_INK, stroke: STAMP_INK }}>
        <circle cx="110" cy="110" r="100" fill="none" strokeWidth="6" />
        <circle cx="110" cy="110" r="92" fill="none" strokeWidth="1.6" />
        <circle cx="110" cy="110" r="58" fill="none" strokeWidth="1.6" />
        <text fontSize={fontSize} fontWeight="900" letterSpacing={spacing} textAnchor="middle" stroke="none"><textPath href={`#${id}-t`} startOffset="50%">{top}</textPath></text>
        <text fontSize="11" fontWeight="800" letterSpacing="1.8" textAnchor="middle" dominantBaseline="hanging" stroke="none"><textPath href={`#${id}-b`} startOffset="50%">AUTHORIZED INSTALLER</textPath></text>
        <text x="21" y="116" fontSize="14" stroke="none">★</text>
        <text x="185" y="116" fontSize="14" stroke="none">★</text>
        <text x="110" y="83" textAnchor="middle" fontSize="11" letterSpacing="3" stroke="none">★★★</text>
        {/* The band across the middle, with the word knocked out of the ink. */}
        <rect x="10" y="92" width="200" height="34" rx="2" stroke="none" />
        <text x="110" y="117" textAnchor="middle" fontSize="23" fontWeight="900" letterSpacing="3.5" fill="#fff" stroke="none">CERTIFIED</text>
        <text x="110" y="146" textAnchor="middle" fontSize="13" fontWeight="800" letterSpacing="1.2" stroke="none">{date}</text>
      </g>
    </svg>
  );
}

/** A faint "CERTIFIED" seal behind the details, as on the paper certificate. */
function CertifiedSeal() {
  const points = Array.from({ length: 64 }, (_, i) => {
    const r = i % 2 === 0 ? 150 : 138;
    const a = (Math.PI * 2 * i) / 64;
    return `${(160 + r * Math.cos(a)).toFixed(1)},${(160 + r * Math.sin(a)).toFixed(1)}`;
  }).join(" ");
  return (
    <svg aria-hidden="true" viewBox="0 0 320 320" className="pointer-events-none absolute left-[238px] top-[330px] size-[300px] opacity-[0.10]">
      <g fill="none" style={{ stroke: RED }}>
        <polygon points={points} strokeWidth="9" strokeLinejoin="round" />
        <circle cx="160" cy="160" r="116" strokeWidth="5" />
        <circle cx="160" cy="160" r="104" strokeWidth="2" />
      </g>
      <g transform="rotate(-14 160 160)">
        <rect x="18" y="126" width="284" height="68" fill="#fff" style={{ stroke: RED }} strokeWidth="6" />
        <text x="160" y="178" textAnchor="middle" fontWeight="900" fontSize="54" letterSpacing="3" style={{ fill: RED }}>CERTIFIED</text>
      </g>
    </svg>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-2 rounded-t-[10px] px-4 py-[9px]" style={{ backgroundColor: NAVY }}>
      <span className="h-[14px] w-[3px] rounded-full" style={{ backgroundColor: RED }} />
      <span className="text-[10.5px] font-bold uppercase tracking-[0.22em] text-white">{children}</span>
    </div>
  );
}

/**
 * The certificate of installation (A4 portrait, 794 × 1123 px at 96 dpi) in the app's light theme: logo, title bar,
 * customer and vehicle details with the QR code beside them (as on the paper certificate); then installed products,
 * warranty, the authorised-installer stamp and the director's signature, and contacts.
 */
export function CertificateDocument({ c }: { c: CertificateView }) {
  const b = c.brand;
  const preview = c.verifyCode === null;
  const brandName = b.name.toUpperCase();
  const strap = "MAKE GPS BUSINESS SIMPLE";
  const contacts = [
    b.location && { icon: MapPin, text: b.location },
    b.phone && { icon: Phone, text: spaced(b.phone) },
    b.email && { icon: Mail, text: b.email },
    b.website && { icon: Globe, text: host(b.website) },
  ].filter(Boolean) as { icon: typeof Phone; text: string }[];

  return (
    <article
      aria-label={preview ? "Certificate preview" : `Certificate ${c.verifyCode}`}
      className="certificate relative flex h-[1123px] w-[794px] flex-col overflow-hidden bg-white [print-color-adjust:exact] [-webkit-print-color-adjust:exact]"
      style={{ color: INK, ["--accent" as string]: brandAccent(b.color) }}
    >
      <CertifiedSeal />
      {preview && (
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="rotate-[-32deg] whitespace-nowrap text-[96px] font-black tracking-[0.18em]" style={{ color: "rgba(20,32,43,0.05)" }}>PREVIEW</span>
        </div>
      )}

      <div className="relative flex flex-1 flex-col px-[34px] pt-[34px]">
        {/* Top: logo, title bar, intro, details and the QR code */}
        <div className="flex h-[58px] items-center">
          {/* eslint-disable-next-line @next/next/no-img-element -- same-origin brand image */}
          {b.logoUrl ? <img src={b.logoUrl} alt={`${b.name} logo`} className="max-h-[58px] max-w-[200px] object-contain object-left" />
            : <span className="flex items-center gap-2.5"><BrandIcon b={b} size={46} /><span className="text-[24px] font-extrabold tracking-tight">{b.name}</span></span>}
        </div>
        <div className="mt-[14px] py-[8px] text-center text-[19px] font-bold uppercase tracking-[0.02em] text-white" style={{ backgroundColor: RED }}>
          Certificate of Installation
        </div>
        <p className="mt-[16px] text-[13px] leading-[21px]">
          This certificate confirms that a tracker unit has been installed on your vehicle and is valid from the date of issue. Please note that any changes to
          your contract may affect its validity.
        </p>

        <div className="mt-[16px] grid grid-cols-[1fr_206px] gap-[14px]">
          <div className="flex flex-col gap-[12px]">
            <DetailCard icon={UserRound} title="Customer Details">
              <Line label="Name" value={<span className="font-bold">{c.customerName}</span>} />
              <Line label="Phone" value={c.customerPhone} />
              <Line label="Email" value={c.customerEmail} />
              <Line label="Address" value={c.customerLocation} />
            </DetailCard>
            <DetailCard icon={Car} title="Vehicle Details">
              <Line label="Make & Model" value={<span className="font-bold">{c.make} {c.model}</span>} />
              <Line label="Year" value={c.year} />
              <Line label="Plate Number" value={
                <span className="font-mono text-[13.5px] font-bold tracking-[0.12em]">{c.vehicleReg}</span>
              } />
              <Line label="Chassis Number" value={<span className="font-mono tracking-[0.04em]">{c.chassis}</span>} />
              <Line label="Contract" value={
                <span className="inline-flex flex-wrap items-center gap-x-2">
                  <span className="rounded-full px-[9px] py-px text-[11.5px] font-bold text-white" style={{ backgroundColor: RED }}>{contractLabel(c.contractYears)}</span>
                  <span className="text-[12px]" style={{ color: MUTED }}>{c.validUntil ? `valid to ${dmy(c.validUntil)}` : "no end date"}</span>
                </span>
              } />
            </DetailCard>
          </div>
          <section className="flex flex-col overflow-hidden rounded-[8px] border" style={{ borderColor: LINE }}>
            <Bar color={NAVY} icon={QrIcon} className="justify-center">Scan to Verify</Bar>
            <div className="flex flex-1 flex-col items-center justify-center bg-white/95 px-3 py-[14px]">
              <div className="rounded-[10px] border p-[8px]" style={{ borderColor: LINE }}><QrCode code={c.verifyCode} /></div>
              <p className="mt-[12px] text-[9.5px] font-bold uppercase tracking-[0.18em]" style={{ color: MUTED }}>Certificate ID</p>
              <p className="mt-[3px] rounded-[6px] px-[10px] py-[3px] font-mono text-[14px] font-bold tracking-[0.1em]" style={{ backgroundColor: DOC.card }}>{c.verifyCode ?? "PREVIEW"}</p>
              {c.number && <p className="mt-[6px] text-[10px]" style={{ color: MUTED }}>No. {c.number}</p>}
              <p className="mt-[8px] text-center text-[9px] leading-[12px]" style={{ color: MUTED }}>Scan with any phone camera to confirm this certificate is genuine.</p>
            </div>
          </section>
        </div>

        {/* Installed products */}
        <section className="mt-[20px] rounded-[10px] border bg-white/95" style={{ borderColor: LINE }}>
          <SectionTitle>Installed Products</SectionTitle>
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="text-[9.5px] font-bold uppercase tracking-[0.14em]" style={{ color: MUTED, backgroundColor: DOC.card }}>
                <th scope="col" className="px-4 py-[8px]">Product / Device</th>
                <th scope="col" className="w-[200px] border-l px-4 py-[8px]" style={{ borderColor: LINE }}>Serial / IMEI</th>
                <th scope="col" className="w-[170px] border-l px-4 py-[8px]" style={{ borderColor: LINE }}>Date Installed</th>
              </tr>
            </thead>
            <tbody className="text-[12px]">
              <tr>
                <td className="px-4 py-[12px] font-medium">Vehicle GPS Tracker{c.deviceModel ? ` · ${c.deviceModel}` : ""}</td>
                <td className="border-l px-4 py-[12px] font-mono text-[11.5px] tracking-[0.04em]" style={{ borderColor: LINE, color: MUTED }}>{maskImei(c.imei)}</td>
                <td className="border-l px-4 py-[12px] font-medium" style={{ borderColor: LINE }}>{dmy(c.installedOn)}</td>
              </tr>
            </tbody>
          </table>
        </section>

        {/* Warranty */}
        <section className="mt-[20px] rounded-[10px] border border-l-[4px] px-4 py-[13px]" style={{ backgroundColor: "#FFF8E6", borderColor: "#F7DFA6", borderLeftColor: "#F5A623" }}>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: "#8A4B00" }}>Device Warranty — Terms &amp; Conditions</p>
          <p className="mt-[5px] text-[11px] leading-[18px]" style={{ color: "#5c3d0a" }}>
            The device(s) warranty is valid for <strong>1 year</strong> from the date of installation. The warranty does not cover mishandling or tampering by
            individuals not authorized by {brandName}, including motor vehicle mechanics, electricians or any other contractors.
          </p>
        </section>

        {/* Stamp and signature */}
        <div className="mt-[18px] grid grid-cols-[1fr_1fr] items-center gap-6">
          <div className="flex w-[170px] flex-col items-center">
            <RubberStamp b={b} issuedAt={c.issuedAt} preview={preview} className="size-[150px]" />
            <p className="-mt-[2px] text-[12px] font-bold tracking-[0.06em]" style={{ color: STAMP_INK }}>{preview ? "Preview" : dmy(c.issuedAt)}</p>
          </div>
          <div className="flex flex-col items-end pt-[6px] text-right">
            <div className="flex h-[70px] w-full items-end justify-end">
              {/* eslint-disable-next-line @next/next/no-img-element -- same-origin brand image */}
              {b.signatureUrl ? <img src={b.signatureUrl} alt="Director's signature" className="max-h-[70px] max-w-[190px] object-contain" /> : null}
            </div>
            <div className="mt-[4px] h-[2px] w-full" style={{ backgroundColor: INK }} />
            <p className="mt-[10px] text-[11.5px] font-extrabold tracking-[0.1em]">{(b.directorName || "Authorised signatory").toUpperCase()}</p>
            <p className="mt-[2px] text-[9.5px]" style={{ color: MUTED }}>{b.directorName ? `Managing Director, ${brandName}` : brandName}</p>
            <div className="my-[12px] h-px w-full" style={{ backgroundColor: LINE }} />
            <p className="text-[11.5px] font-extrabold tracking-[0.14em]">THANK YOU FOR YOUR BUSINESS</p>
          </div>
        </div>

        {/* Contacts */}
        {contacts.length > 0 ? (
          <div className="mb-[16px] mt-auto rounded-[10px] px-4 py-[9px]" style={{ backgroundColor: DOC.card }}>
            <div className="flex flex-wrap items-center justify-center gap-x-0 gap-y-1 text-[9.5px]" style={{ color: MUTED }}>
              {contacts.map(({ icon: Icon, text }, i) => (
                <span key={text} className="inline-flex items-center gap-1.5 px-3" style={i ? { borderLeft: `1px solid ${LINE}` } : undefined}>
                  <Icon size={11} style={{ color: RED }} aria-hidden="true" />{text}
                </span>
              ))}
            </div>
          </div>
        ) : <div className="mt-auto" />}
      </div>

      {/* Bottom band */}
      <footer className="relative px-6 pb-[10px] pt-[11px] text-center" style={{ backgroundColor: NAVY }}>
        <div className="flex items-center justify-center gap-4">
          <span className="h-[2px] w-[56px]" style={{ backgroundColor: RED }} />
          <span className="text-[8.5px] font-semibold tracking-[0.34em] text-white/75">{strap}</span>
          <span className="h-[2px] w-[56px]" style={{ backgroundColor: RED }} />
        </div>
        <p className="mt-[5px] text-[8px] text-white/45">
          This is a computer generated document. <span className="mx-2">|</span> {preview ? "Preview — not yet generated" : `Generated: ${dateTime(c.issuedAt)}`}
          {c.number ? <><span className="mx-2">|</span>No. {c.number}</> : null}
        </p>
      </footer>
    </article>
  );
}
