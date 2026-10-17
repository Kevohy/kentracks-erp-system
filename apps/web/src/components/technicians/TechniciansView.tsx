"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/shell/PageHeader";
import { Card } from "@/components/dashboard/Card";
import { sampleTechnicians, type Technician } from "@/lib/technicians";
import { AddTechnicianDialog } from "./AddTechnicianDialog";

const columns = ["Name", "Phone Number", "Email", "Location"];

export function TechniciansView() {
  const [technicians, setTechnicians] = useState<Technician[]>(sampleTechnicians);
  const [open, setOpen] = useState(false);

  return (
    <>
      <PageHeader
        title="Technicians"
        aside={
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-brand px-4 text-[15px] font-semibold text-white hover:brightness-95"
          >
            <Plus size={18} aria-hidden="true" />
            Add Technician
          </button>
        }
      />

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-left text-[14.5px]">
            <caption className="sr-only">Technicians (sample data)</caption>
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
              {technicians.map((t) => (
                <tr key={t.id} className="border-b border-line last:border-b-0">
                  <th scope="row" className="px-4 py-3.5 pl-6 font-semibold">
                    {t.name}
                  </th>
                  <td className="whitespace-nowrap px-4 py-3.5">{t.phone}</td>
                  <td className="px-4 py-3.5 text-muted">{t.email || "—"}</td>
                  <td className="px-4 py-3.5 pr-6">{t.location}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <AddTechnicianDialog open={open} onClose={() => setOpen(false)} onAdd={(t) => setTechnicians((prev) => [t, ...prev])} />
    </>
  );
}
