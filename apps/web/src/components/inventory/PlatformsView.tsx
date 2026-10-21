"use client";

import { useState } from "react";
import { PageHeader } from "@/components/shell/PageHeader";
import { Card } from "@/components/dashboard/Card";
import { NO_CARD_TYPE, formatKes } from "@/lib/purchases";
import { validatePlatformName } from "@/lib/inventory-validation";
import { ListStatusRow, type ListState } from "@/components/crm/useCrmList";
import { AddButton } from "./AddButton";
import { InventoryFormDialog } from "./InventoryFormDialog";
import { useInventory } from "./InventoryProvider";

export function PlatformsView() {
  const { load, reload, platforms, stockOf, addPlatform } = useInventory();
  const listState: ListState<unknown> = load.status === "ready" ? { status: "ready", items: platforms } : load;
  const [open, setOpen] = useState(false);

  return (
    <>
      <PageHeader title="Platforms" aside={<AddButton label="Add Platform" onClick={() => setOpen(true)} />} />

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="stack-table w-full min-w-[640px] border-collapse text-left text-[14.5px]">
            <caption className="sr-only">Platforms</caption>
            <thead>
              <tr className="border-b border-line text-[13px] text-muted">
                <th scope="col" className="px-4 py-3 pl-6 font-medium">Platform Name</th>
                <th scope="col" className="px-4 py-3 font-medium">Stock by card type (latest buying price)</th>
                <th scope="col" className="px-4 py-3 pr-6 text-right font-medium">Total in stock</th>
              </tr>
            </thead>
            <tbody>
              <ListStatusRow state={listState} colSpan={3} empty="No platforms yet. Add one to start." retry={reload} />
              {platforms.map((p) => {
                const s = stockOf("Platform", p.id);
                return (
                  <tr key={p.id} className="border-b border-line last:border-b-0">
                    <th scope="row" className="px-4 py-3.5 pl-6 font-semibold">{p.name}</th>
                    <td className="px-4 py-3.5">
                      <ul className="flex flex-col gap-1">
                        {[...p.licenceTypes, NO_CARD_TYPE].map((t) => {
                          const c = stockOf("Platform", p.id, t);
                          if (t === NO_CARD_TYPE && c.quantity === 0) return null;
                          return (
                            <li key={t} className="flex flex-wrap items-baseline gap-x-2 text-[14px]">
                              <span className={t === NO_CARD_TYPE ? "text-muted" : "font-medium"}>{t}:</span>
                              <span className="font-semibold tabular-nums">{c.quantity}</span>
                              <span className="text-[13px] text-muted tabular-nums">({c.latestPriceMinor === null ? "no buying price" : formatKes(c.latestPriceMinor)})</span>
                            </li>
                          );
                        })}
                      </ul>
                    </td>
                    <td className="px-4 py-3.5 pr-6 text-right font-semibold tabular-nums">{s.quantity}</td>
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
