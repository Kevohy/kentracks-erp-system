"use client";

import { useState } from "react";
import { PageHeader } from "@/components/shell/PageHeader";
import { Card, Panel } from "@/components/dashboard/Card";
import { sampleCategories, sampleProducts, type Product, type ProductCategory } from "@/lib/inventory";
import { validateCategoryName, validateCategorySelection, validateModel } from "@/lib/inventory-validation";
import { AddButton } from "./AddButton";
import { InventoryFormDialog } from "./InventoryFormDialog";

export function ProductsView() {
  const [categories, setCategories] = useState<ProductCategory[]>(sampleCategories);
  const [products, setProducts] = useState<Product[]>(sampleProducts);
  const [dialog, setDialog] = useState<"product" | "category" | null>(null);
  const close = () => setDialog(null);
  const categoryName = (id: string) => categories.find((c) => c.id === id)?.name ?? "—";

  return (
    <>
      <PageHeader title="Products" aside={<AddButton label="Add Product" onClick={() => setDialog("product")} />} />

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[360px] border-collapse text-left text-[14.5px]">
              <caption className="sr-only">Products (sample data)</caption>
              <thead>
                <tr className="border-b border-line text-[13px] text-muted">
                  <th scope="col" className="px-4 py-3 pl-6 font-medium">Category</th>
                  <th scope="col" className="px-4 py-3 pr-6 font-medium">Model</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr key={p.id} className="border-b border-line last:border-b-0">
                    <th scope="row" className="px-4 py-3.5 pl-6 font-semibold">{categoryName(p.categoryId)}</th>
                    <td className="px-4 py-3.5 pr-6">{p.model}</td>
                  </tr>
                ))}
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
        onSave={(v) => setProducts((prev) => [{ id: `new-${Date.now()}`, categoryId: v.category, model: v.model }, ...prev])}
      />
      <InventoryFormDialog
        open={dialog === "category"}
        title="Add Category"
        submitLabel="Save Category"
        idPrefix="category"
        fields={[{ name: "name", label: "Category name", kind: "text", placeholder: "Enter category name", validate: validateCategoryName }]}
        onClose={close}
        onSave={(v) => setCategories((prev) => [...prev, { id: `new-${Date.now()}`, name: v.name }])}
      />
    </>
  );
}
