import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";

export const metadata: Metadata = { title: "Verify a document", robots: { index: false, follow: false } };

/** Public: type the ID printed on a certificate or invoice (or scan its QR code) to confirm it. */
export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ code?: string | string[] }> }) {
  const raw = (await searchParams).code;
  const code = (Array.isArray(raw) ? raw[0] : raw ?? "").replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 10);
  if (code) redirect(`/verify/${code}`);
  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-4 py-10">
      <div className="w-full max-w-md rounded-2xl bg-white px-6 py-8 text-center shadow-[0_8px_30px_rgba(5,85,135,0.10)]">
        <ShieldCheck size={36} className="mx-auto text-navy" aria-hidden="true" />
        <h1 className="mt-3 text-[22px] font-semibold">Verify a certificate or invoice</h1>
        <p className="mt-1 text-[14.5px] text-muted">Enter the Certificate ID or Invoice ID printed next to the QR code.</p>
        <form method="get" action="/verify" className="mt-5 flex flex-col gap-3">
          <label htmlFor="code" className="sr-only">Certificate or Invoice ID</label>
          <input id="code" name="code" required maxLength={12} autoComplete="off" placeholder="e.g. MMBSVBCN0Z"
            className="min-h-12 rounded-xl border border-line px-4 text-center font-mono text-[18px] uppercase tracking-[0.15em] outline-none focus:border-navy" />
          <button type="submit" className="min-h-12 rounded-xl bg-navy text-[15px] font-semibold text-white hover:brightness-110">Verify</button>
        </form>
      </div>
    </main>
  );
}
