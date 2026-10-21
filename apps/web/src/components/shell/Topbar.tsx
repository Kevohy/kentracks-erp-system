import type { Ref } from "react";
import { Bell, Menu, Search } from "lucide-react";
import { AccountMenu } from "./AccountMenu";

export function Topbar({ onMenu, menuButtonRef }: { onMenu: () => void; menuButtonRef?: Ref<HTMLButtonElement> }) {
  return (
    <header className="sticky top-0 z-20 flex h-17 items-center gap-3.5 border-b border-line bg-white/95 px-4 backdrop-blur sm:px-8">
      <button
        type="button"
        ref={menuButtonRef}
        onClick={onMenu}
        aria-label="Open menu"
        aria-controls="primary-sidebar"
        className="grid size-11 shrink-0 place-items-center rounded-[10px] border border-line text-ink hover:bg-canvas lg:hidden"
      >
        <Menu size={22} aria-hidden="true" />
      </button>

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
