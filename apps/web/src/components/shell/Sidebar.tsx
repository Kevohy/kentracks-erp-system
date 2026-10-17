"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type Ref } from "react";
import { ChevronDown, MapPin, X } from "lucide-react";
import { navigation } from "@/config/navigation";
import { cn } from "@/lib/cn";

type SidebarProps = {
  open: boolean;
  onClose: () => void;
  closeButtonRef?: Ref<HTMLButtonElement>;
};

export function Sidebar({ open, onClose, closeButtonRef }: SidebarProps) {
  const pathname = usePathname();
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(navigation.filter((i) => i.children).map((i) => [i.id, true])),
  );

  const toggle = (id: string) => setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));

  return (
    <aside
      id="primary-sidebar"
      aria-label="Primary"
      className={cn(
        "z-40 flex w-72 shrink-0 flex-col overflow-y-auto bg-sidebar px-3.5 pb-6 pt-5 text-sidebar-text",
        // Desktop: sticky full-height column.
        "lg:sticky lg:top-0 lg:h-screen lg:w-68",
        // Below lg: off-canvas drawer. `invisible` removes it from the tab order while closed.
        "max-lg:fixed max-lg:inset-y-0 max-lg:left-0 max-lg:max-w-[86vw] max-lg:transition-[transform,visibility] max-lg:duration-200 motion-reduce:transition-none",
        open
          ? "max-lg:visible max-lg:translate-x-0 max-lg:shadow-[12px_0_40px_rgba(5,15,25,0.35)]"
          : "max-lg:invisible max-lg:-translate-x-full",
      )}
    >
      <div className="flex items-center gap-3 px-2 pb-6 pt-1">
        <div className="grid size-[38px] shrink-0 place-items-center rounded-[11px] bg-brand text-[#181617]">
          <MapPin size={22} strokeWidth={2} aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xl font-semibold leading-[1.1] tracking-[0.2px] text-white">Kentracks</div>
          <div className="mt-0.5 text-xs uppercase tracking-[1.4px] text-sidebar-icon">ERP System</div>
        </div>
        <button
          type="button"
          ref={closeButtonRef}
          onClick={onClose}
          aria-label="Close menu"
          className="grid size-11 place-items-center rounded-[10px] text-sidebar-text hover:bg-white/5 focus-visible:outline-sidebar-accent lg:hidden"
        >
          <X size={22} aria-hidden="true" />
        </button>
      </div>

      <nav aria-label="Main menu" className="flex flex-col gap-[3px]">
        {navigation.map((item) => {
          const Icon = item.icon;
          const hasChildren = !!item.children;
          const isOpen = hasChildren && expanded[item.id];
          const selfActive = !!item.href && pathname === item.href;
          const childActive = !!item.children?.some((c) => c.href === pathname);
          const rowClass = cn(
            "flex min-h-11 w-full items-center gap-3 rounded-[10px] px-3 text-left text-[15px] font-medium focus-visible:outline-sidebar-accent",
            selfActive
              ? "bg-brand/[0.18] text-white"
              : childActive
                ? "text-white hover:bg-white/[0.06]"
                : "text-sidebar-text hover:bg-white/[0.06] hover:text-white",
          );
          const iconClass = cn(
            "shrink-0",
            selfActive || childActive ? "text-sidebar-accent" : "text-sidebar-icon",
          );

          return (
            <div key={item.id}>
              {hasChildren ? (
                <button
                  type="button"
                  className={rowClass}
                  aria-expanded={isOpen}
                  aria-controls={`nav-sub-${item.id}`}
                  onClick={() => toggle(item.id)}
                >
                  <Icon size={20} strokeWidth={1.8} className={iconClass} aria-hidden="true" />
                  <span className="flex-1">{item.label}</span>
                  <ChevronDown
                    size={16}
                    className={cn(
                      "shrink-0 text-sidebar-icon transition-transform duration-200 motion-reduce:transition-none",
                      isOpen && "rotate-180",
                    )}
                    aria-hidden="true"
                  />
                </button>
              ) : (
                <Link
                  href={item.href ?? "/"}
                  className={rowClass}
                  aria-current={selfActive ? "page" : undefined}
                  onClick={onClose}
                >
                  <Icon size={20} strokeWidth={1.8} className={iconClass} aria-hidden="true" />
                  <span className="flex-1">{item.label}</span>
                </Link>
              )}

              {hasChildren && isOpen && (
                <ul
                  id={`nav-sub-${item.id}`}
                  className="mb-1.5 ml-[22px] mt-0.5 flex flex-col gap-0.5 border-l border-white/[0.12] pl-3"
                >
                  {item.children!.map((child) => {
                    const active = pathname === child.href;
                    return (
                      <li key={child.href}>
                        <Link
                          href={child.href}
                          aria-current={active ? "page" : undefined}
                          onClick={onClose}
                          className={cn(
                            "flex min-h-10 w-full items-center gap-2.5 rounded-lg px-3 text-left text-[14.5px] focus-visible:outline-sidebar-accent",
                            active
                              ? "bg-brand/[0.18] font-medium text-white"
                              : "text-sidebar-muted hover:bg-white/[0.06] hover:text-white",
                          )}
                        >
                          <span
                            className={cn(
                              "size-1.5 shrink-0 rounded-full",
                              active ? "bg-sidebar-accent" : "bg-[#4a5f72]",
                            )}
                          />
                          <span>{child.label}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
