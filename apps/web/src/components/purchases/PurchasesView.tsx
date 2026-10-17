"use client";

import { Fragment, useState } from "react";
import { ChevronDown } from "lucide-react";
import { PageHeader } from "@/components/shell/PageHeader";
import { Card } from "@/components/dashboard/Card";
import { AddButton } from "@/components/inventory/AddButton";
import { useInventory } from "@/components/inventory/InventoryProvider";
import { cn } from "@/lib/cn";
import { formatKes, itemAmountMinor, paymentState, type PurchaseStatus } from "@/lib/purchases";
import { AddPurchaseDialog } from "./AddPurchaseDialog";

const statusStyle: Record<PurchaseStatus, string> = {
  Received: "bg-[#E6F4EA] text-[#1B5E20]",
  Pending: "bg-[#FFF4E5] text-[#9a3300]",
};

const dateFormat = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m - 1]} ${y}`;
};

const th = "px-4 py-3 font-medium";

export function PurchasesView() {
  const { purchases } = useInventory();
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <>
      <PageHeader title="Purchases" aside={<AddButton label="Add Purchase" onClick={() => setOpen(true)} />} />

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] border-collapse text-left text-[14.5px]">
            <caption className="sr-only">Purchases (sample data, amounts in KES)</caption>
            <thead>
              <tr className="border-b border-line text-[13px] text-muted">
                <th scope="col" className={cn(th, "pl-6")}>Supplier</th>
                <th scope="col" className={th}>Date</th>
                <th scope="col" className={th}>Status</th>
                <th scope="col" className={cn(th, "text-right")}>Total</th>
                <th scope="col" className={cn(th, "text-right")}>Amount paid</th>
                <th scope="col" className={cn(th, "text-right")}>Balance</th>
                <th scope="col" className={cn(th, "relative pr-6")}>
                  <span className="sr-only">Details</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {purchases.map((p) => {
                const isOpen = expanded === p.id;
                return (
                  <Fragment key={p.id}>
                    <tr className="border-b border-line last:border-b-0">
                      <th scope="row" className="px-4 py-3.5 pl-6 font-semibold">{p.supplierName}</th>
                      <td className="whitespace-nowrap px-4 py-3.5">{dateFormat(p.date)}</td>
                      <td className="px-4 py-3.5">
                        <span className={cn("inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-[13px] font-semibold", statusStyle[p.status])}>
                          {p.status}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3.5 text-right tabular-nums">{formatKes(p.totalMinor)}</td>
                      <td className="whitespace-nowrap px-4 py-3.5 text-right tabular-nums">
                        {formatKes(p.paidMinor)}
                        <span className="block text-[12.5px] text-muted">{paymentState(p)}</span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3.5 text-right font-semibold tabular-nums">{formatKes(p.totalMinor - p.paidMinor)}</td>
                      <td className="px-4 py-2 pr-6 text-right">
                        <button
                          type="button"
                          aria-expanded={isOpen}
                          aria-controls={`purchase-${p.id}-details`}
                          onClick={() => setExpanded(isOpen ? null : p.id)}
                          className="inline-flex min-h-11 items-center gap-1 rounded-xl px-2 text-[14px] font-semibold text-navy hover:bg-canvas"
                        >
                          Details
                          <ChevronDown size={16} aria-hidden="true" className={cn("transition-transform", isOpen && "rotate-180")} />
                        </button>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr id={`purchase-${p.id}-details`} className="border-b border-line bg-canvas/60">
                        <td colSpan={7} className="px-6 py-4">
                          <ul className="flex flex-col gap-1.5 text-[14px]">
                            {p.items.map((i) => (
                              <li key={i.id} className="flex flex-wrap justify-between gap-x-6">
                                <span>
                                  <span className="text-muted">{i.itemType}</span> ·{" "}
                                  {i.categoryName ? `${i.categoryName} · ` : ""}
                                  <span className="font-medium">{i.label}</span>
                                </span>
                                <span className="tabular-nums text-muted">
                                  {i.quantity} × {formatKes(i.unitPriceMinor)} = <span className="font-semibold text-ink">{formatKes(itemAmountMinor(i))}</span>
                                </span>
                              </li>
                            ))}
                          </ul>
                          {p.notes && (
                            <p className="mt-3 whitespace-pre-wrap break-words text-[14px]">
                              <span className="text-muted">Notes: </span>
                              {p.notes}
                            </p>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <AddPurchaseDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}
