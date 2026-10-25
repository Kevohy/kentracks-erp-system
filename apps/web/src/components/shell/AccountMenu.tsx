"use client";

import { useEffect, useRef, useState } from "react";
import { Building2, Loader2, LogOut } from "lucide-react";

type Me = { fullName: string; email: string; company: string; role?: "admin" | "staff" };

const initialsOf = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?";

/** The signed-in user in the top bar, with Sign out. Details come from the server session. */
export function AccountMenu() {
  const [me, setMe] = useState<Me | null>(null);
  const [open, setOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    fetch("/api/auth/session")
      .then((r) => (r.ok ? (r.json() as Promise<Me>) : null))
      .then((m) => live && setMe(m))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onDown = (e: MouseEvent) => root.current && !root.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open]);

  async function signOut() {
    if (leaving) return;
    setLeaving(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      /* even if the request failed, leave: the next page load re-checks the session */
    }
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- full load on purpose: clears all in-memory app data
    window.location.href = "/login?signedout=1";
  }

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-label="Account"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2.5 rounded-xl text-left"
      >
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-navy text-sm font-semibold tracking-[0.5px] text-white">
          {me ? initialsOf(me.fullName) : ""}
        </span>
        <span className="hidden min-w-28 lg:block">
          <span className="block text-[14.5px] font-semibold leading-tight">{me?.fullName ?? " "}</span>
          <span className="block text-[12.5px] text-muted">{me?.company ?? " "}</span>
        </span>
      </button>

      {open && (
        <div role="menu" aria-label="Account" className="absolute right-0 top-[calc(100%+10px)] z-40 w-72 rounded-2xl border border-line bg-white p-2 shadow-[0_12px_32px_rgba(10,29,44,0.16)]">
          <div className="px-3 py-2.5">
            <div className="truncate text-[15px] font-semibold">{me?.fullName}</div>
            <div className="truncate text-[13.5px] text-muted">{me?.email}</div>
            <div className="mt-1.5 flex items-center gap-1.5 text-[13px] text-muted">
              <Building2 size={14} aria-hidden="true" />
              <span className="truncate">{me?.company}</span>
            </div>
            {me?.role && (
              <div className="mt-1.5 text-[12.5px]">
                <span className={me.role === "admin" ? "rounded-full bg-tint px-2 py-0.5 font-semibold text-navy" : "rounded-full bg-canvas px-2 py-0.5 font-semibold text-muted"}>
                  {me.role === "admin" ? "Administrator" : "Staff"}
                </span>
              </div>
            )}
          </div>
          <div className="my-1 border-t border-line" />
          <button
            type="button"
            role="menuitem"
            onClick={signOut}
            disabled={leaving}
            className="flex min-h-11 w-full items-center gap-2.5 rounded-xl px-3 text-[15px] font-medium hover:bg-canvas disabled:opacity-70"
          >
            {leaving ? <Loader2 size={18} className="animate-spin" aria-hidden="true" /> : <LogOut size={18} aria-hidden="true" />}
            {leaving ? "Signing out…" : "Sign out"}
          </button>
        </div>
      )}
    </div>
  );
}
