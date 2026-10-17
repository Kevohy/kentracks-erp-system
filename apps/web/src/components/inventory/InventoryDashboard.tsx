import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Card } from "@/components/dashboard/Card";

const pages = [
  { href: "/inventory/products", label: "Products", note: "Products and their categories" },
  { href: "/inventory/sim-cards", label: "SIM Cards", note: "SIM cards and their types" },
  { href: "/inventory/platforms", label: "Platforms", note: "Platforms and their card licence types" },
];

export function InventoryDashboard() {
  return (
    <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {pages.map((p) => (
        <li key={p.href}>
          <Link href={p.href} className="block rounded-2xl hover:brightness-[0.98]">
            <Card className="flex items-center justify-between gap-3 px-5 py-5">
              <div>
                <h2 className="text-lg font-semibold">{p.label}</h2>
                <p className="mt-1 text-[13.5px] text-muted">{p.note}</p>
              </div>
              <ArrowRight size={20} className="shrink-0 text-muted" aria-hidden="true" />
            </Card>
          </Link>
        </li>
      ))}
    </ul>
  );
}
