import type { ReactNode } from "react";

export function Breadcrumbs({ items }: { items: string[] }) {
  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-[13.5px] text-muted">
      <span>Kentracks</span>
      {items.map((item) => (
        <span key={item} className="flex items-center gap-2">
          <span aria-hidden="true">/</span>
          <span>{item}</span>
        </span>
      ))}
    </nav>
  );
}

export function PageHeader({
  title,
  subtitle,
  aside,
}: {
  title: string;
  subtitle?: string;
  aside?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-[26px] font-semibold leading-[1.15] tracking-[-0.2px] sm:text-[30px]">{title}</h1>
        {subtitle && <p className="mt-1.5 text-[15px] text-muted">{subtitle}</p>}
      </div>
      {aside}
    </div>
  );
}
