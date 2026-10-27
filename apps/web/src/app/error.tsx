"use client";

import Link from "next/link";
import { useEffect } from "react";
import { RotateCcw, TriangleAlert } from "lucide-react";

/**
 * Shown when a page fails to load or crashes; the menu and top bar stay usable. No technical details are shown: the
 * reference matches the server log entry for the failure.
 */
export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  const digest = error instanceof Error ? (error as Error & { digest?: string }).digest : undefined;
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4 py-10">
      <div role="alert" className="w-full max-w-md rounded-2xl bg-white px-6 py-8 text-center shadow-[0_8px_30px_rgba(5,85,135,0.10)]">
        <TriangleAlert size={40} className="mx-auto text-brand" aria-hidden="true" />
        <h1 className="mt-3 text-[22px] font-semibold">Something went wrong</h1>
        <p className="mt-1.5 text-[15px] text-muted">This page could not be loaded. Your data is safe. Try again, or go back to the dashboard.</p>
        <div className="mt-5 flex flex-wrap justify-center gap-2.5">
          <button type="button" onClick={() => retry()} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-brand px-5 text-[15px] font-semibold text-white hover:brightness-95">
            <RotateCcw size={17} aria-hidden="true" />Try again
          </button>
          <Link href="/" className="inline-flex min-h-11 items-center rounded-xl border border-line px-5 text-[15px] font-semibold hover:bg-canvas">Dashboard</Link>
        </div>
        {digest && <p className="mt-4 text-[12.5px] text-muted">If this keeps happening, tell your administrator this reference: <span className="font-mono font-semibold text-ink">{digest}</span></p>}
      </div>
    </div>
  );
}
