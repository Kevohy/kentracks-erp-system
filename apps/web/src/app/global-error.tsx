"use client";

import "@fontsource-variable/jost";
import "./globals.css";

/**
 * Last-resort screen when the app's frame itself (menu, top bar) fails. It replaces the whole page, so it brings its
 * own <html>, <body> and styles. No technical details are shown.
 */
export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  const digest = error instanceof Error ? (error as Error & { digest?: string }).digest : undefined;
  return (
    <html lang="en">
      <body>
        <title>Something went wrong · Kentracks ERP</title>
        <main className="flex min-h-screen items-center justify-center bg-canvas px-4 py-10">
          <div role="alert" className="w-full max-w-md rounded-2xl bg-white px-6 py-8 text-center shadow-[0_8px_30px_rgba(5,85,135,0.10)]">
            <h1 className="text-[22px] font-semibold">Something went wrong</h1>
            <p className="mt-1.5 text-[15px] text-muted">Kentracks ERP could not load. Your data is safe. Try again in a moment.</p>
            <div className="mt-5 flex flex-wrap justify-center gap-2.5">
              <button type="button" onClick={() => retry()} className="inline-flex min-h-11 items-center rounded-xl bg-brand px-5 text-[15px] font-semibold text-white hover:brightness-95">Try again</button>
              {/* A full page load, since the app's own navigation is what failed. */}
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
              <a href="/" className="inline-flex min-h-11 items-center rounded-xl border border-line px-5 text-[15px] font-semibold hover:bg-canvas">Reload</a>
            </div>
            {digest && <p className="mt-4 text-[12.5px] text-muted">Reference: <span className="font-mono font-semibold text-ink">{digest}</span></p>}
          </div>
        </main>
      </body>
    </html>
  );
}
