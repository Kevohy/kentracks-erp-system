"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/shell/PageHeader";
import { Card } from "@/components/dashboard/Card";
import { cn } from "@/lib/cn";
import { sampleSuppliers, type Supplier, type SupplierType } from "@/lib/suppliers";
import { AddSupplierDialog } from "./AddSupplierDialog";

const typeStyle: Record<SupplierType, string> = {
  Individual: "bg-tint text-navy",
  Company: "bg-canvas text-ink",
};

const columns = ["Supplier Type", "Supplier Name / Company Name", "Contact Person", "Phone Number", "Email", "Location"];

export function SuppliersView() {
  const [suppliers, setSuppliers] = useState<Supplier[]>(sampleSuppliers);
  const [open, setOpen] = useState(false);

  return (
    <>
      <PageHeader
        title="Suppliers"
        aside={
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-brand px-4 text-[15px] font-semibold text-white hover:brightness-95"
          >
            <Plus size={18} aria-hidden="true" />
            Add Supplier
          </button>
        }
      />

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse text-left text-[14.5px]">
            <caption className="sr-only">Suppliers (sample data)</caption>
            <thead>
              <tr className="border-b border-line text-[13px] text-muted">
                {columns.map((h) => (
                  <th key={h} scope="col" className="px-4 py-3 font-medium first:pl-6 last:pr-6">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {suppliers.map((s) => (
                <tr key={s.id} className="border-b border-line last:border-b-0">
                  <td className="px-4 py-3.5 pl-6">
                    <span className={cn("rounded-full px-2.5 py-1 text-[12.5px] font-medium", typeStyle[s.type])}>
                      {s.type}
                    </span>
                  </td>
                  <th scope="row" className="px-4 py-3.5 font-semibold">
                    {s.name}
                  </th>
                  <td className="px-4 py-3.5">{s.contactPerson ?? <span className="text-muted">—</span>}</td>
                  <td className="whitespace-nowrap px-4 py-3.5">{s.phone}</td>
                  <td className="px-4 py-3.5 text-muted">{s.email}</td>
                  <td className="px-4 py-3.5 pr-6">{s.location}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <AddSupplierDialog open={open} onClose={() => setOpen(false)} onAdd={(s) => setSuppliers((prev) => [s, ...prev])} />
    </>
  );
}
