"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { Car, Globe, Mail, MapPin, Phone, QrCode as QrIcon, UserRound } from "lucide-react";
import QRCode from "qrcode";
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
/** The brand colour with transparency, e.g. tint(40) = 40 % of the colour. */
const tint = (pct: number) => `color-mix(in srgb, var(--accent) ${pct}%, transparent)`;
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
 * The installer's seal: a round red stamp with the brand name around the top, "Authorized Installer" around the bottom
 * and the brand icon and the date of issue in the middle. SVG, so it prints sharp.
 */
function InstallerSeal({ b, issuedAt, preview }: { b: CertificateView["brand"]; issuedAt: string; preview: boolean }) {
  const id = useId().replace(/:/g, "");
  const top = b.name.toUpperCase();
  const icon = b.iconUrl ?? b.logoUrl;
  const spacing = Math.max(0.6, Math.min(4, (170 - top.length * 9.2) / Math.max(1, top.length)));
  return (
    <svg viewBox="0 0 200 200" className="size-[124px] shrink-0" role="img" aria-label={`${b.name} authorized installer seal`}>
      <defs>
        <path id={`${id}-t`} d="M 34,100 A 66,66 0 0 1 166,100" />
        <path id={`${id}-b`} d="M 27,100 A 73,73 0 0 0 173,100" />
        <clipPath id={`${id}-c`}><circle cx="100" cy="86" r="25" /></clipPath>
      </defs>
      <g fill="none" style={{ stroke: RED }}>
        <circle cx="100" cy="100" r="95" strokeWidth="5" />
        <circle cx="100" cy="100" r="88" strokeWidth="1.4" />
        <circle cx="100" cy="100" r="56" strokeWidth="1.8" />
        <circle cx="100" cy="100" r="51" strokeWidth="0.9" strokeDasharray="2 2.6" />
      </g>
      <g style={{ fill: RED }} fontWeight="800">
        <text fontSize="15.5" letterSpacing={spacing} textAnchor="middle"><textPath href={`#${id}-t`} startOffset="50%">{top}</textPath></text>
        <text fontSize="10" letterSpacing="1.5" textAnchor="middle" dominantBaseline="hanging"><textPath href={`#${id}-b`} startOffset="50%">AUTHORIZED INSTALLER</textPath></text>
        <text x="25" y="105" fontSize="13">★</text>
        <text x="163" y="105" fontSize="13">★</text>
      </g>
      {icon ? <image href={icon} x="75" y="61" width="50" height="50" clipPath={`url(#${id}-c)`} preserveAspectRatio="xMidYMid meet" />
        : <text x="100" y="98" textAnchor="middle" fontSize="26" fontWeight="900" style={{ fill: RED }}>{b.name.slice(0, 1).toUpperCase()}</text>}
      <rect x="52" y="115" width="96" height="20" rx="3" fill="#fff" style={{ stroke: RED }} strokeWidth="1.4" />
      <text x="100" y="129.5" textAnchor="middle" fontSize="12" fontWeight="800" style={{ fill: RED }} letterSpacing="0.6">{preview ? "PREVIEW" : dmy(issuedAt).toUpperCase()}</text>
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
  const strap = (b.tagline || "GPS Tracking & Vehicle Security").toUpperCase();
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

        {/* Installer stamp and signature */}
        <div className="mt-[22px] grid grid-cols-[330px_1fr] items-start gap-6">
          <div className="rounded-[12px] border-[2.5px] p-[4px]" style={{ borderColor: RED }}>
            <div className="flex items-center gap-[12px] rounded-[8px] border px-[10px] py-[10px]" style={{ borderColor: tint(40) }}>
              <InstallerSeal b={b} issuedAt={c.issuedAt} preview={preview} />
              <div className="min-w-0 flex-1">
                <p className="text-[12px] font-extrabold leading-tight tracking-[0.08em]" style={{ color: RED }}>{brandName}</p>
                <p className="mt-[1px] text-[8.5px] font-bold uppercase tracking-[0.16em]" style={{ color: INK }}>Authorized Installer</p>
                <div className="my-[6px] h-px" style={{ background: `linear-gradient(90deg, ${tint(40)}, transparent)` }} />
                {b.phone && <p className="text-[9.5px] font-semibold leading-[14px]">Tel: {spaced(b.phone)}</p>}
                {b.website && <p className="text-[9px] font-semibold leading-[14px]" style={{ color: RED }}>{host(b.website)}</p>}
                {b.location && <p className="text-[8.5px] leading-[12px]" style={{ color: MUTED }}>{b.location}</p>}
                <div className="mt-[6px] rounded-[5px] px-[7px] py-[3px] text-[8px] font-semibold leading-[12px]" style={{ backgroundColor: tint(7), color: INK }}>
                  {preview ? "Stamp applied when generated" : <>Digitally stamped<br /><span className="whitespace-nowrap font-bold">{dateTime(c.issuedAt)}</span><br />ID <span className="font-mono font-bold tracking-[0.06em]">{c.verifyCode}</span></>}
                </div>
              </div>
            </div>
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
          <div className="mb-[16px] mt-auto rounded-[10px] border-t-[3px] px-4 py-[9px]" style={{ borderTopColor: RED, backgroundColor: DOC.card }}>
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
