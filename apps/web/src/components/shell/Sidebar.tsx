"use client";

import { usePathname } from "next/navigation";
import { MapPin } from "lucide-react";
import { NavMenu } from "./NavMenu";

/** Desktop menu (large screens): a dark full-height column. Phones and tablets use MobileNav instead. */
export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside
      id="primary-sidebar"
      aria-label="Primary"
      className="sticky top-0 z-30 hidden h-screen w-68 shrink-0 flex-col overflow-y-auto bg-sidebar px-3.5 pb-6 pt-5 text-sidebar-text lg:flex"
    >
      <div className="flex items-center gap-3 px-2 pb-7 pt-1">
        <div className="grid size-[38px] shrink-0 place-items-center rounded-[11px] bg-brand text-[#181617]">
          <MapPin size={22} strokeWidth={2} aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xl font-semibold leading-[1.1] tracking-[0.2px] text-white">Kentracks</div>
          <div className="mt-0.5 text-xs uppercase tracking-[1.4px] text-sidebar-icon">ERP System</div>
        </div>
      </div>
      <NavMenu pathname={pathname} variant="sidebar" />
    </aside>
  );
}
