"use client";

import { useRef, useState, type FormEvent } from "react";
import { Pencil } from "lucide-react";
import { Card } from "@/components/dashboard/Card";
import { PageHeader } from "@/components/shell/PageHeader";
import { TextField } from "@/components/sales/fields";
import { useSales } from "@/components/sales/SalesProvider";
import { validatePackage } from "@/lib/sale-validation";
import { stripControlChars } from "@/lib/validation";

/** Settings → Packages: the package names offered when making a Package Sale. */
export function PackagesView() {
  const { packages, addPackage, updatePackage } = useSales();
  const rootRef = useRef<HTMLDivElement>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | undefined>();

  const reset = () => {
    setEditingId(null);
    setName("");
    setError(undefined);
  };

  function edit(id: string) {
    const p = packages.find((x) => x.id === id);
    if (!p) return;
    setEditingId(id);
    setName(p.name);
    setError(undefined);
    rootRef.current?.querySelector<HTMLElement>("#pkg-name")?.focus();
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    const r = validatePackage({ name }, packages, editingId ?? undefined);
    setError(r.errors.name);
    if (r.errors.name) {
      rootRef.current?.querySelector<HTMLElement>("#pkg-name")?.focus();
      return;
    }
    if (editingId) updatePackage(editingId, r.name);
    else addPackage(r.name);
    reset();
  }

  return (
    <>
      <PageHeader title="Packages" subtitle="Package names offered in Package Sales. The price is entered on each sale." />
      <div ref={rootRef} className="grid gap-5 lg:grid-cols-[1fr_380px] lg:items-start">
        <Card className="overflow-hidden">
          <table className="w-full border-collapse text-left text-[14.5px]">
            <caption className="sr-only">Sale packages (this session)</caption>
            <thead>
              <tr className="border-b border-line text-[13px] text-muted">
                <th scope="col" className="px-6 py-3 font-medium">Package name</th>
                <th scope="col" className="px-6 py-3 text-right font-medium"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {packages.length === 0 && (
                <tr><td colSpan={2} className="px-6 py-10 text-center text-muted">No packages yet. Add one to use it in Package Sales.</td></tr>
              )}
              {packages.map((p) => (
                <tr key={p.id} className="border-b border-line last:border-b-0">
                  <td className="px-6 py-2 font-semibold">{p.name}</td>
                  <td className="px-6 py-2 text-right">
                    <button type="button" onClick={() => edit(p.id)} aria-label={`Edit ${p.name}`}
                      className="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-[14px] font-semibold text-navy hover:bg-canvas">
                      <Pencil size={15} aria-hidden="true" />
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card className="px-5 py-5">
          <form onSubmit={submit} noValidate className="flex flex-col gap-4">
            <h2 className="text-[16px] font-semibold">{editingId ? "Edit package" : "Add package"}</h2>
            <TextField id="pkg-name" label="Package name" value={name} placeholder="e.g. Standard" error={error}
              onChange={(v) => { setName(stripControlChars(v)); setError(undefined); }} />
            <div className="flex flex-wrap justify-end gap-3">
              {editingId && (
                <button type="button" onClick={reset} className="min-h-11 rounded-xl border border-line px-4 text-[15px] font-semibold hover:bg-canvas">
                  Cancel edit
                </button>
              )}
              <button type="submit" className="min-h-11 rounded-xl bg-brand px-5 text-[15px] font-semibold text-white hover:brightness-95">
                {editingId ? "Save changes" : "Add package"}
              </button>
            </div>
          </form>
        </Card>
      </div>
    </>
  );
}
