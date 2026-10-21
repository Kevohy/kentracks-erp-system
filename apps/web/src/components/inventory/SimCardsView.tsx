"use client";

import { useState } from "react";
import { PageHeader } from "@/components/shell/PageHeader";
import { Card } from "@/components/dashboard/Card";
import { simCardTypes, type SimCardType } from "@/lib/inventory";
import { formatKes } from "@/lib/purchases";
import { validateSimCardName, validateSimCardType } from "@/lib/inventory-validation";
import { ListStatusRow, type ListState } from "@/components/crm/useCrmList";
import { AddButton } from "./AddButton";
import { InventoryFormDialog } from "./InventoryFormDialog";
import { useInventory } from "./InventoryProvider";

export function SimCardsView() {
  const { load, reload, simCards, stockOf, addSimCard } = useInventory();
  const listState: ListState<unknown> = load.status === "ready" ? { status: "ready", items: simCards } : load;
  const [open, setOpen] = useState(false);

  return (
    <>
      <PageHeader title="SIM Cards" aside={<AddButton label="Add SIM Card" onClick={() => setOpen(true)} />} />

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="stack-table w-full min-w-[520px] border-collapse text-left text-[14.5px]">
            <caption className="sr-only">SIM cards</caption>
            <thead>
              <tr className="border-b border-line text-[13px] text-muted">
                <th scope="col" className="px-4 py-3 pl-6 font-medium">SIM Card Name</th>
                <th scope="col" className="px-4 py-3 font-medium">Type</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Quantity</th>
                <th scope="col" className="px-4 py-3 pr-6 text-right font-medium">Latest buying price</th>
              </tr>
            </thead>
            <tbody>
              <ListStatusRow state={listState} colSpan={4} empty="No SIM cards yet. Add one to start." retry={reload} />
              {simCards.map((c) => {
                const s = stockOf("SIM Card", c.id);
                return (
                  <tr key={c.id} className="border-b border-line last:border-b-0">
                    <th scope="row" className="px-4 py-3.5 pl-6 font-semibold">{c.name}</th>
                    <td className="px-4 py-3.5">{c.type}</td>
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
        title="Add SIM Card"
        submitLabel="Save SIM Card"
        idPrefix="sim"
        fields={[
          { name: "name", label: "SIM Card Name", kind: "text", placeholder: "e.g. Safaricom, Airtel, MTN", validate: validateSimCardName },
          {
            name: "type",
            label: "Type",
            kind: "select",
            options: simCardTypes.map((t) => ({ value: t, label: t })),
            validate: validateSimCardType,
          },
        ]}
        onClose={() => setOpen(false)}
        onSave={(v) => addSimCard(v.name, v.type as SimCardType)}
      />
    </>
  );
}
