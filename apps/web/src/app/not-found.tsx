import type { Metadata } from "next";
import Link from "next/link";
import { Compass } from "lucide-react";

export const metadata: Metadata = { title: "Page not found", robots: { index: false, follow: false } };

/** Shown for an address that does not exist, or a record that is not in this company. */
export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4 py-10">
      <div className="w-full max-w-md rounded-2xl bg-white px-6 py-8 text-center shadow-[0_8px_30px_rgba(5,85,135,0.10)]">
        <Compass size={40} className="mx-auto text-navy" aria-hidden="true" />
        <p className="mt-3 text-[13px] font-bold uppercase tracking-[0.16em] text-brand">Error 404</p>
        <h1 className="mt-1 text-[22px] font-semibold">Page not found</h1>
        <p className="mt-1.5 text-[15px] text-muted">The page you are looking for does not exist or has been moved. Check the address, or go back to the dashboard.</p>
        <Link href="/" className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-navy px-5 text-[15px] font-semibold text-white hover:brightness-110">Go to the dashboard</Link>
      </div>
    </div>
  );
}
