import type { ReactNode } from "react";
import { MapPin } from "lucide-react";

/** Shared frame for the signed-out pages: the brand, then the form in a card, centred on every screen size. */
export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main id="main" className="flex min-h-screen flex-col items-center justify-center gap-7 bg-canvas px-4 py-10 sm:px-6">
      <Brand />
      <div className="w-full max-w-[440px] rounded-2xl border border-line bg-white px-6 py-8 shadow-[0_1px_2px_rgba(16,32,48,0.04),0_12px_32px_rgba(16,32,48,0.06)] sm:px-9 sm:py-10">
        {children}
      </div>
      <p className="text-xs text-muted">© {new Date().getFullYear()} Kentracks</p>
    </main>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-3">
      <div className="grid size-[42px] shrink-0 place-items-center rounded-[11px] bg-brand text-[#181617]">
        <MapPin size={24} strokeWidth={2} aria-hidden="true" />
      </div>
      <div>
        <div className="text-[22px] font-semibold leading-[1.1] tracking-[0.2px] text-ink">Kentracks</div>
        <div className="mt-0.5 text-xs uppercase tracking-[1.4px] text-muted">ERP System</div>
      </div>
    </div>
  );
}
