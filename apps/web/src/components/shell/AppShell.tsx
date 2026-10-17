"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const close = () => setOpen(false);

  // While the mobile drawer is open: move focus into it and let Escape close it.
  useEffect(() => {
    if (!open) return;
    const menuButton = menuButtonRef.current;
    closeButtonRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      // Runs after the drawer has closed and the page is no longer inert.
      menuButton?.focus();
    };
  }, [open]);

  return (
    <div className="flex min-h-screen">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-ink"
      >
        Skip to content
      </a>

      {open && (
        <button
          type="button"
          aria-label="Close menu"
          tabIndex={-1}
          onClick={close}
          className="fixed inset-0 z-30 w-full bg-[#08141e]/50 lg:hidden"
        />
      )}

      <Sidebar open={open} onClose={close} closeButtonRef={closeButtonRef} />

      {/* Inert while the drawer is open so keyboard and screen-reader users stay inside it. */}
      <div className="flex min-w-0 flex-1 flex-col" inert={open}>
        <Topbar onMenu={() => setOpen(true)} menuButtonRef={menuButtonRef} />
        <main id="main" className="mx-auto flex w-full max-w-[1520px] flex-col gap-6 px-4 pb-8 pt-[22px] sm:px-8 sm:pb-10 sm:pt-[30px]">
          {children}
        </main>
      </div>
    </div>
  );
}
