"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Ref } from "react";
import { House, LayoutGrid, MapPin, Receipt, TrendingUp, Users, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { NavMenu } from "./NavMenu";

/** Shortcuts in the phone bottom bar: the pages used most. Everything else is in Menu (the same menu as desktop). */
const SHORTCUTS = [
  { label: "Home", href: "/", icon: House, match: (p: string) => p === "/" },
  { label: "Sales", href: "/sales", icon: TrendingUp, match: (p: string) => p === "/sales" || p.startsWith("/sales/") },
  { label: "Billing", href: "/billing/vehicles", icon: Receipt, match: (p: string) => p.startsWith("/billing/") },
  { label: "Customers", href: "/crm/customers", icon: Users, match: (p: string) => p.startsWith("/crm/") },
] as const;

/**
 * Phones and tablets: a bottom bar with the main shortcuts and a Menu button that slides up a sheet with the full
 * menu. Large screens use the desktop sidebar instead.
 */
export function MobileNav({
  open,
  onOpen,
  onClose,
  menuButtonRef,
  closeButtonRef,
}: {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  menuButtonRef?: Ref<HTMLButtonElement>;
  closeButtonRef?: Ref<HTMLButtonElement>;
}) {
  const pathname = usePathname();
  const inMenu = !SHORTCUTS.some((s) => s.match(pathname));

  return (
    <>
      {/* Backdrop */}
      <div aria-hidden="true" onClick={onClose}
        className={cn("fixed inset-0 z-40 bg-[#08141e]/45 backdrop-blur-[2px] transition-opacity duration-200 motion-reduce:transition-none lg:hidden",
          open ? "opacity-100" : "pointer-events-none opacity-0")} />

      {/* Menu sheet */}
      <div id="primary-sidebar" role="dialog" aria-modal="true" aria-label="Menu" inert={!open}
        className={cn(
          "fixed inset-x-0 bottom-0 z-50 flex max-h-[88dvh] flex-col rounded-t-[28px] bg-white shadow-[0_-18px_50px_rgba(8,20,30,0.25)] lg:hidden",
          "duration-300 ease-out motion-reduce:transition-none",
          // Visible at once when opening (so focus can move into it), hidden only after it has slid away.
          open ? "visible translate-y-0 transition-transform" : "invisible translate-y-full transition-[transform,visibility]",
        )}>
        <div className="flex justify-center pt-2.5" aria-hidden="true"><span className="h-1.5 w-11 rounded-full bg-line" /></div>
        <div className="flex items-center gap-3 px-5 pb-3 pt-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand text-[#181617]" aria-hidden="true">
            <MapPin size={21} strokeWidth={2} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[18px] font-semibold leading-tight">Kentracks</div>
            <div className="text-[11.5px] uppercase tracking-[1.3px] text-muted">ERP System</div>
          </div>
          <button type="button" ref={closeButtonRef} onClick={onClose} aria-label="Close menu"
            className="grid size-11 place-items-center rounded-full bg-canvas text-ink hover:bg-tint">
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        <div className="overflow-y-auto overscroll-contain px-3 pb-[calc(16px+env(safe-area-inset-bottom))]">
          <NavMenu pathname={pathname} variant="sheet" onNavigate={onClose} />
        </div>
      </div>

      {/* Bottom bar */}
      <nav aria-label="Shortcuts" inert={open}
        className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        <ul className="mx-auto grid max-w-xl grid-cols-5">
          {SHORTCUTS.map((s) => {
            const on = s.match(pathname);
            const Icon = s.icon;
            return (
              <li key={s.href}>
                <Link href={s.href} aria-current={on ? "page" : undefined}
                  className={cn("flex h-16 flex-col items-center justify-center gap-1 text-[11.5px] font-medium", on ? "text-brand" : "text-muted hover:text-ink")}>
                  <span className={cn("grid h-7 w-12 place-items-center rounded-full transition-colors", on && "bg-[#FFF1EA]")}>
                    <Icon size={21} strokeWidth={on ? 2.1 : 1.8} aria-hidden="true" />
                  </span>
                  {s.label}
                </Link>
              </li>
            );
          })}
          <li>
            <button type="button" ref={menuButtonRef} onClick={onOpen} aria-label="Open menu" aria-controls="primary-sidebar" aria-expanded={open}
              className={cn("flex h-16 w-full flex-col items-center justify-center gap-1 text-[11.5px] font-medium", inMenu ? "text-brand" : "text-muted hover:text-ink")}>
              <span className={cn("grid h-7 w-12 place-items-center rounded-full", inMenu && "bg-[#FFF1EA]")}>
                <LayoutGrid size={21} strokeWidth={inMenu ? 2.1 : 1.8} aria-hidden="true" />
              </span>
              Menu
            </button>
          </li>
        </ul>
      </nav>
    </>
  );
}
