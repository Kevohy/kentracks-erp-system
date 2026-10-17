"use client";

import { useState } from "react";
import { Eye, Plus } from "lucide-react";
import { PageHeader } from "@/components/shell/PageHeader";
import { Card } from "@/components/dashboard/Card";
import { cn } from "@/lib/cn";
import { sampleCustomers, type Customer, type CustomerType } from "@/lib/customers";
import { AddCustomerDialog } from "./AddCustomerDialog";
import { CustomerDetailsDialog } from "./CustomerDetailsDialog";

const typeStyle: Record<CustomerType, string> = {
  "End User": "bg-tint text-navy",
  Distributor: "bg-[#FFF1EA] text-[#B43A00]",
  Company: "bg-canvas text-ink",
};

export function CustomersView() {
  const [customers, setCustomers] = useState<Customer[]>(sampleCustomers);
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = customers.find((c) => c.id === selectedId) ?? null;

  return (
    <>
      <PageHeader
        title="Customers"
        aside={
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-brand px-4 text-[15px] font-semibold text-white hover:brightness-95"
          >
            <Plus size={18} aria-hidden="true" />
            Add Customer
          </button>
        }
      />

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse text-left text-[14.5px]">
            <caption className="sr-only">Customers (sample data)</caption>
            <thead>
              <tr className="border-b border-line text-[13px] text-muted">
                {["Name", "Type", "Account", "Phone Number", "Email", "Location"].map((h) => (
                  <th key={h} scope="col" className="px-4 py-3 font-medium first:pl-6 last:pr-6">
                    {h}
                  </th>
                ))}
                <th scope="col" className="relative px-4 py-3 pr-6">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.id} className="border-b border-line last:border-b-0">
                  <th scope="row" className="px-4 py-3.5 pl-6 font-semibold">
                    {c.name}
                  </th>
                  <td className="px-4 py-3.5">
                    <span className={cn("rounded-full px-2.5 py-1 text-[12.5px] font-medium", typeStyle[c.type])}>
                      {c.type}
                    </span>
                  </td>
                  <td className="px-4 py-3.5">{c.account}</td>
                  <td className="whitespace-nowrap px-4 py-3.5">{c.phone}</td>
                  <td className="px-4 py-3.5 text-muted">{c.email}</td>
                  <td className="px-4 py-3.5">{c.location}</td>
                  <td className="px-4 py-2 pr-6 text-right">
                    <button
                      type="button"
                      onClick={() => setSelectedId(c.id)}
                      aria-label={`View ${c.name}`}
                      className="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-[14px] font-semibold text-navy hover:bg-tint"
                    >
                      <Eye size={16} aria-hidden="true" />
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <AddCustomerDialog
        open={open}
        onClose={() => setOpen(false)}
        onAdd={(c) => setCustomers((prev) => [c, ...prev])}
      />
      <CustomerDetailsDialog
        customer={selected}
        onClose={() => setSelectedId(null)}
        onSave={(updated) => setCustomers((prev) => prev.map((c) => (c.id === updated.id ? updated : c)))}
      />
    </>
  );
}
