"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { PUBLIC_PAGES } from "@/lib/auth-redirect";
import { MobileNav } from "./MobileNav";
import { Sidebar } from "./Sidebar";
import { TableLabels } from "./TableLabels";
import { Topbar } from "./Topbar";

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const close = () => setOpen(false);

  // While the phone menu is open: focus moves into it, Escape closes it, and the page behind does not scroll.
  useEffect(() => {
    if (!open) return;
    const menuButton = menuButtonRef.current;
    closeButtonRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      // Runs after the menu has closed and the page is no longer inert.
      menuButton?.focus();
    };
  }, [open]);

  // The signed-out pages (sign in, forgot password) have their own frame: no menu, no top bar.
  if (PUBLIC_PAGES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return <>{children}</>;

  return (
    <div className="flex min-h-screen">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-ink"
      >
        Skip to content
      </a>

      <TableLabels />
      <Sidebar />

      {/* Inert while the phone menu is open so keyboard and screen-reader users stay inside it. */}
      <div className="flex min-w-0 flex-1 flex-col" inert={open}>
        <Topbar />
        {/* On phones the bottom bar covers the last 64px (plus the safe area): leave room for it. */}
        <main id="main" className="mx-auto flex w-full max-w-[1520px] flex-col gap-6 px-4 pb-[calc(96px+env(safe-area-inset-bottom))] pt-[22px] sm:px-8 sm:pt-[30px] lg:pb-10">
          {children}
        </main>
      </div>

      <MobileNav open={open} onOpen={() => setOpen(true)} onClose={close} menuButtonRef={menuButtonRef} closeButtonRef={closeButtonRef} />
    </div>
  );
}
