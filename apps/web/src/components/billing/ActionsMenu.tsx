"use client";

import { useEffect, useRef, useState } from "react";
import { MoreHorizontal, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

// -------------------------------------------------------------------- menu

export type MenuItem = { label: string; icon: LucideIcon; onSelect: () => void; disabled?: boolean };

/**
 * A small "…" actions menu: opens on click, closes on Escape, outside click or after a choice.
 * The list is positioned against the window (fixed), so a card or a scrolling table can never cut it off;
 * it opens upwards when there is no room below.
 */
export function ActionsMenu({ label, items, small }: { label: string; items: MenuItem[]; small?: boolean }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const first = useRef<HTMLButtonElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  /** Work out where the list goes before showing it: under the button, or above it when there is no room below. */
  const place = (): { top: number; right: number } | null => {
    const t = trigger.current?.getBoundingClientRect();
    if (!t || t.bottom < 0 || t.top > window.innerHeight) return null;
    const h = list.current?.offsetHeight || items.length * 40 + 14;
    const below = t.bottom + 4;
    const top = below + h > window.innerHeight - 8 && t.top - 4 - h > 8 ? t.top - 4 - h : below;
    return { top, right: Math.max(8, document.documentElement.clientWidth - t.right) };
  };
  const openMenu = () => {
    const p = place();
    if (!p) return;
    setPos(p);
    setOpen(true);
  };
  const close = () => {
    setOpen(false);
    setPos(null);
  };

  useEffect(() => {
    if (!open) return;
    first.current?.focus({ preventScroll: true });
    const onDown = (e: MouseEvent) => !wrap.current?.contains(e.target as Node) && close();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        close();
        trigger.current?.focus();
      }
    };
    // The list is fixed to the window, so it follows its button when the page scrolls; it closes once the button is off screen.
    const onScroll = () => {
      const p = place();
      if (p) setPos(p);
      else close();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
    // place/close only read refs and stable setters; re-subscribing on every render is not needed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <div ref={wrap} className="relative">
      <button ref={trigger} type="button" aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={() => (open ? close() : openMenu())}
        className={cn("grid place-items-center rounded-lg border border-line bg-white text-muted hover:bg-canvas hover:text-ink", small ? "size-8" : "size-10")}>
        <MoreHorizontal size={18} aria-hidden="true" />
      </button>
      {open && pos && (
        <div ref={list} role="menu" aria-label={label} style={{ top: pos.top, right: pos.right }}
          className="fixed z-40 min-w-52 rounded-xl border border-line bg-white p-1.5 shadow-[0_12px_32px_rgba(10,29,44,0.16)]">
          {items.map((it, i) => (
            <button key={it.label} ref={i === 0 ? first : undefined} type="button" role="menuitem" disabled={it.disabled}
              onClick={() => { close(); it.onSelect(); }}
              className="flex min-h-10 w-full items-center gap-2.5 rounded-lg px-3 text-left text-[14px] font-medium hover:bg-canvas focus-visible:bg-canvas disabled:opacity-50">
              <it.icon size={16} className="text-muted" aria-hidden="true" />
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

