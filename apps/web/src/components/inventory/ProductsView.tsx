"use client";

import { useState } from "react";
import { PageHeader } from "@/components/shell/PageHeader";
import { Card, Panel } from "@/components/dashboard/Card";
import { formatKes } from "@/lib/purchases";
import { validateCategoryName, validateCategorySelection, validateModel } from "@/lib/inventory-validation";
import { ListStatusRow, type ListState } from "@/components/crm/useCrmList";
import { AddButton } from "./AddButton";
import { InventoryFormDialog } from "./InventoryFormDialog";
import { useInventory } from "./InventoryProvider";

export function ProductsView() {
  const { load, reload, categories, products, stockOf, addCategory, addProduct } = useInventory();
  const listState: ListState<unknown> = load.status === "ready" ? { status: "ready", items: products } : load;
  const [dialog, setDialog] = useState<"product" | "category" | null>(null);
  const close = () => setDialog(null);
  const categoryName = (id: string) => categories.find((c) => c.id === id)?.name ?? "—";

  return (
    <>
      <PageHeader title="Products" aside={<AddButton label="Add Product" onClick={() => setDialog("product")} />} />

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="stack-table w-full min-w-[520px] border-collapse text-left text-[14.5px]">
              <caption className="sr-only">Products</caption>
              <thead>
                <tr className="border-b border-line text-[13px] text-muted">
                  <th scope="col" className="px-4 py-3 pl-6 font-medium">Category</th>
                  <th scope="col" className="px-4 py-3 font-medium">Model</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Quantity</th>
                  <th scope="col" className="px-4 py-3 pr-6 text-right font-medium">Latest buying price</th>
                </tr>
              </thead>
              <tbody>
                <ListStatusRow state={listState} colSpan={4} empty="No products yet. Add a category, then add a product." retry={reload} />
                {products.map((p) => {
                  const s = stockOf("Product", p.id);
                  return (
                    <tr key={p.id} className="border-b border-line last:border-b-0">
                      <th scope="row" className="px-4 py-3.5 pl-6 font-semibold">{categoryName(p.categoryId)}</th>
                      <td className="px-4 py-3.5">{p.model}</td>
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

        <Panel title="Product categories" aside={<AddButton label="Add Category" onClick={() => setDialog("category")} />}>
          <ul className="flex flex-col divide-y divide-line text-[14.5px]">
            {categories.map((c) => (
              <li key={c.id} className="py-2.5 first:pt-0 last:pb-0">{c.name}</li>
            ))}
          </ul>
        </Panel>
      </div>

      <InventoryFormDialog
        open={dialog === "product"}
        title="Add Product"
        submitLabel="Save Product"
        idPrefix="product"
        fields={[
          {
            name: "category",
            label: "Category",
            kind: "select",
            options: categories.map((c) => ({ value: c.id, label: c.name })),
            validate: (raw) => validateCategorySelection(raw, categories),
          },
          { name: "model", label: "Model", kind: "text", placeholder: "Enter model", validate: validateModel },
        ]}
        onClose={close}
        onSave={(v) => addProduct(v.category, v.model)}
      />
      <InventoryFormDialog
        open={dialog === "category"}
        title="Add Category"
        submitLabel="Save Category"
        idPrefix="category"
        fields={[{ name: "name", label: "Category name", kind: "text", placeholder: "Enter category name", validate: validateCategoryName }]}
        onClose={close}
        onSave={(v) => addCategory(v.name)}
      />
    </>
  );
}
