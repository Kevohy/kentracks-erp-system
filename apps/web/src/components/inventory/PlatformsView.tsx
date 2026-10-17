"use client";

import { useState } from "react";
import { PageHeader } from "@/components/shell/PageHeader";
import { Card } from "@/components/dashboard/Card";
import { formatKes } from "@/lib/purchases";
import { validatePlatformName } from "@/lib/inventory-validation";
import { AddButton } from "./AddButton";
import { InventoryFormDialog } from "./InventoryFormDialog";
import { useInventory } from "./InventoryProvider";

export function PlatformsView() {
  const { platforms, stockOf, addPlatform } = useInventory();
  const [open, setOpen] = useState(false);

  return (
    <>
      <PageHeader title="Platforms" aside={<AddButton label="Add Platform" onClick={() => setOpen(true)} />} />

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-left text-[14.5px]">
            <caption className="sr-only">Platforms (sample data)</caption>
            <thead>
              <tr className="border-b border-line text-[13px] text-muted">
                <th scope="col" className="px-4 py-3 pl-6 font-medium">Platform Name</th>
                <th scope="col" className="px-4 py-3 font-medium">Card licence types</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Quantity</th>
                <th scope="col" className="px-4 py-3 pr-6 text-right font-medium">Latest buying price</th>
              </tr>
            </thead>
            <tbody>
              {platforms.map((p) => {
                const s = stockOf("Platform", p.id);
                return (
                  <tr key={p.id} className="border-b border-line last:border-b-0">
                    <th scope="row" className="px-4 py-3.5 pl-6 font-semibold">{p.name}</th>
                    <td className="px-4 py-3.5 text-muted">{p.licenceTypes.join(", ")}</td>
                    <td className="px-4 py-3.5 text-right tabular-nums">{s.quantity}</td>
                    <td className="whitespace-nowrap px-4 py-3.5 pr-6 text-right tabular-nums text-muted">
                      {s.latestPriceMinor === null ? "—" : formatKes(s.latestPriceMinor)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <InventoryFormDialog
        open={open}
        title="Add Platform"
        submitLabel="Save Platform"
        idPrefix="platform"
        fields={[{ name: "name", label: "Platform Name", kind: "text", placeholder: "Enter platform name", validate: validatePlatformName }]}
        onClose={() => setOpen(false)}
        onSave={(v) => addPlatform(v.name)}
      />
    </>
  );
}
