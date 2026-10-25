import Link from "next/link";
import { Bell, MapPin, Search } from "lucide-react";
import { AccountMenu } from "./AccountMenu";

/** Top bar. On phones and tablets the menu lives in the bottom bar (MobileNav), so the brand shows here instead. */
export function Topbar() {
  return (
    <header className="sticky top-0 z-20 flex h-17 items-center gap-3.5 border-b border-line bg-white/95 px-4 backdrop-blur sm:px-8">
      <Link href="/" aria-label="Kentracks ERP, dashboard" className="flex shrink-0 items-center gap-2.5 rounded-xl lg:hidden">
        <span className="grid size-10 place-items-center rounded-xl bg-brand text-[#181617]" aria-hidden="true">
          <MapPin size={21} strokeWidth={2} />
        </span>
        <span className="leading-tight max-sm:hidden sm:block">
          <span className="block text-[16px] font-semibold text-ink">Kentracks</span>
          <span className="block text-[10.5px] uppercase tracking-[1.3px] text-muted">ERP System</span>
        </span>
      </Link>

      <div className="relative hidden max-w-110 flex-1 sm:block">
        <Search
          size={20}
          aria-hidden="true"
          className="pointer-events-none absolute left-3.5 top-3 text-[#6b7b8a]"
        />
        <input
          type="search"
          aria-label="Search"
          placeholder="Search"
          className="h-11 w-full rounded-xl border border-line bg-canvas pl-11 pr-3.5 text-[15px] text-ink placeholder:text-[#6b7b8a] focus:bg-white"
        />
      </div>

      <div className="flex-1" />

      <button
        type="button"
        aria-label="Notifications"
        className="relative grid size-11 place-items-center rounded-xl border border-line bg-white text-ink hover:bg-canvas"
      >
        <Bell size={20} strokeWidth={1.8} aria-hidden="true" />
        <span className="absolute right-2.5 top-2.5 size-[9px] rounded-full border-2 border-white bg-brand box-content" />
      </button>

      <AccountMenu />
    </header>
  );
}
