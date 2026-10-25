"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { navigation, type NavItem } from "@/config/navigation";
import { cn } from "@/lib/cn";

/** True when the page is this item or one of its sub-pages. */
export const isSelfActive = (item: NavItem, pathname: string) =>
  !!item.href && (pathname === item.href || (item.href !== "/" && pathname.startsWith(`${item.href}/`)));
export const isGroupActive = (item: NavItem, pathname: string) => !!item.children?.some((c) => c.href === pathname);

type Variant = "sidebar" | "sheet";

/**
 * The main menu, shared by the desktop sidebar (dark) and the phone menu sheet (light). Every group starts collapsed;
 * opening one closes the others. The section of the current page is shown in the accent colour even while collapsed.
 */
export function NavMenu({ pathname, variant, onNavigate }: { pathname: string; variant: Variant; onNavigate?: () => void }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const dark = variant === "sidebar";

  return (
    <nav aria-label="Main menu" className={cn("flex flex-col", dark ? "gap-1" : "gap-1.5")}>
      {navigation.map((item) => {
        const Icon = item.icon;
        const self = isSelfActive(item, pathname);
        const group = isGroupActive(item, pathname);
        const active = self || group;
        const isOpen = !!item.children && openId === item.id;

        const row = cn(
          "group flex w-full items-center text-left focus-visible:outline-2 focus-visible:outline-offset-2",
          dark
            ? cn(
                "min-h-12 gap-3.5 rounded-xl px-3.5 text-[16px] font-medium transition-colors focus-visible:outline-sidebar-accent",
                self ? "bg-brand/[0.16] text-sidebar-accent" : active ? "text-sidebar-accent hover:bg-white/[0.05]" : "text-sidebar-text hover:bg-white/[0.05] hover:text-white",
              )
            : cn(
                "min-h-14 gap-3.5 rounded-2xl px-2.5 text-[16px] font-semibold transition-colors focus-visible:outline-navy",
                self ? "bg-[#FFF1EA] text-brand" : active ? "text-brand" : "text-ink active:bg-canvas",
              ),
        );
        const icon = dark ? (
          <Icon size={22} strokeWidth={1.7} aria-hidden="true" className={cn("shrink-0 transition-colors", active ? "text-sidebar-accent" : "text-sidebar-icon group-hover:text-white")} />
        ) : (
          <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl", active ? "bg-[#FFE4D6] text-brand" : "bg-tint text-navy")} aria-hidden="true">
            <Icon size={20} strokeWidth={1.8} />
          </span>
        );

        return (
          <div key={item.id}>
            {item.children ? (
              <button type="button" className={row} aria-expanded={isOpen} aria-controls={`nav-${variant}-${item.id}`}
                onClick={() => setOpenId((p) => (p === item.id ? null : item.id))}>
                {icon}
                <span className="flex-1">{item.label}</span>
                <ChevronDown size={18} aria-hidden="true"
                  className={cn("shrink-0 transition-transform duration-200 motion-reduce:transition-none", dark ? "text-sidebar-icon" : "text-muted", isOpen && "rotate-180")} />
              </button>
            ) : (
              <Link href={item.href ?? "/"} className={row} aria-current={self ? "page" : undefined} onClick={onNavigate}>
                {icon}
                <span className="flex-1">{item.label}</span>
              </Link>
            )}

            {item.children && (
              // Collapsed groups stay in the page for the open/close animation but are hidden and out of the tab order.
              <div id={`nav-${variant}-${item.id}`} inert={!isOpen} aria-hidden={!isOpen}
                className={cn("grid transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none", isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")}>
                <div className="overflow-hidden">
                  <ul className={cn(dark ? "mb-2 ml-[26px] mt-1 flex flex-col gap-0.5 border-l border-white/[0.12] pl-3" : "grid grid-cols-2 gap-2 pb-2 pl-[54px] pr-1 pt-1")}>
                    {item.children.map((child) => {
                      const on = pathname === child.href;
                      return (
                        <li key={child.href}>
                          <Link href={child.href} aria-current={on ? "page" : undefined} onClick={onNavigate}
                            className={cn(
                              "flex w-full items-center focus-visible:outline-2 focus-visible:outline-offset-2",
                              dark
                                ? cn("min-h-10 gap-2.5 rounded-lg px-3 text-[14.5px] focus-visible:outline-sidebar-accent",
                                    on ? "bg-brand/[0.16] font-medium text-white" : "text-sidebar-muted hover:bg-white/[0.05] hover:text-white")
                                : cn("min-h-11 rounded-xl px-3 text-[14px] font-medium leading-tight focus-visible:outline-navy",
                                    on ? "bg-brand text-white" : "bg-canvas text-ink active:bg-tint"),
                            )}>
                            {dark && <span className={cn("size-1.5 shrink-0 rounded-full", on ? "bg-sidebar-accent" : "bg-[#4a5f72]")} aria-hidden="true" />}
                            <span>{child.label}</span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}
