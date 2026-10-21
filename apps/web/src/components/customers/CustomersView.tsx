"use client";

import { useState } from "react";
import { Eye, Plus } from "lucide-react";
import { PageHeader } from "@/components/shell/PageHeader";
import { Card } from "@/components/dashboard/Card";
import { cn } from "@/lib/cn";
import { crmApi } from "@/lib/crm-api";
import type { CustomerType } from "@/lib/customers";
import { ListStatusRow, useCrmList } from "@/components/crm/useCrmList";
import { AddCustomerDialog } from "./AddCustomerDialog";
import { CustomerDetailsDialog } from "./CustomerDetailsDialog";

const typeStyle: Record<CustomerType, string> = {
  "End User": "bg-tint text-navy",
  Distributor: "bg-[#FFF1EA] text-[#B43A00]",
  Company: "bg-canvas text-ink",
};

export function CustomersView() {
  const { state, retry, prepend, replace } = useCrmList(crmApi.customers.list);
  const { state: brandState } = useCrmList(crmApi.brands.list);
  const brands = brandState.status === "ready" ? brandState.items : [];
  const customers = state.status === "ready" ? state.items : [];
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
          <table className="stack-table w-full min-w-[900px] border-collapse text-left text-[14.5px]">
            <caption className="sr-only">Customers</caption>
            <thead>
              <tr className="border-b border-line text-[13px] text-muted">
                {["Name", "Type", "Brand", "Account", "Phone Number", "Email", "Location"].map((h) => (
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
              <ListStatusRow state={state} colSpan={8} empty="No customers yet. Use Add Customer to create the first one." retry={retry} />
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
                  <td className="px-4 py-3.5">
                    {c.brandName ? <span className="rounded-full bg-canvas px-2.5 py-1 text-[12.5px] font-medium text-ink">{c.brandName}</span> : <span className="text-muted">—</span>}
                  </td>
                  <td className="px-4 py-3.5">{c.account}</td>
                  <td className="whitespace-nowrap px-4 py-3.5">{c.phone || <span className="text-muted">—</span>}</td>
                  <td className="px-4 py-3.5 text-muted">{c.email || "—"}</td>
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
        brands={brands}
        open={open}
        onClose={() => setOpen(false)}
        onAdd={async (type, values) => {
          const r = await crmApi.customers.create(type, values);
          if (r.ok) prepend(r.data);
          return r.ok ? { ok: true } : r;
        }}
      />
      <CustomerDetailsDialog
        brands={brands}
        customer={selected}
        onClose={() => setSelectedId(null)}
        onSave={async (c, values) => {
          const r = await crmApi.customers.update(c.id, c.type as CustomerType, values);
          if (r.ok) replace(r.data);
          return r.ok ? { ok: true } : r;
        }}
      />
    </>
  );
}
