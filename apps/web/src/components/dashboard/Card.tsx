import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn("rounded-2xl border border-line bg-white shadow-[0_1px_2px_rgba(16,32,48,0.04)]", className)}>
      {children}
    </div>
  );
}

export function Panel({
  title,
  subtitle,
  aside,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("flex min-w-0 flex-col gap-[18px] px-4 py-[18px] sm:px-6 sm:py-[22px]", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold leading-tight">{title}</h2>
          {subtitle && <p className="mt-[3px] text-[13.5px] text-muted">{subtitle}</p>}
        </div>
        {aside}
      </div>
      {children}
    </Card>
  );
}
