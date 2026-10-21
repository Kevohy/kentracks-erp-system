"use client";

import { useRef, useState, type FormEvent } from "react";
import { Pencil } from "lucide-react";
import { Card } from "@/components/dashboard/Card";
import { ListStatusRow, useCrmList } from "@/components/crm/useCrmList";
import { TextField } from "@/components/sales/fields";
import { PageHeader } from "@/components/shell/PageHeader";
import { validateBrand } from "@/lib/brand-validation";
import { crmApi } from "@/lib/crm-api";
import { stripControlChars } from "@/lib/validation";

/** Settings → Brands: the brands offered when adding or editing a customer. Names can be changed at any time. */
export function BrandsView() {
  const { state, retry, replace } = useCrmList(crmApi.brands.list);
  const brands = state.status === "ready" ? state.items : [];
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const saving = useRef(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | undefined>();

  const focusName = () => rootRef.current?.querySelector<HTMLElement>("#brand-name")?.focus();
  const reset = () => {
    setEditingId(null);
    setName("");
    setError(undefined);
    setFormError("");
  };

  function edit(id: string) {
    const b = brands.find((x) => x.id === id);
    if (!b) return;
    setEditingId(id);
    setName(b.name);
    setError(undefined);
    focusName();
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (saving.current) return; // a second click or Enter while saving must not add another brand
    const r = validateBrand({ name }, brands, editingId ?? undefined);
    setError(r.errors.name);
    if (r.errors.name) return focusName();
    saving.current = true;
    setBusy(true);
    setFormError("");
    const result = editingId ? await crmApi.brands.update(editingId, r.name) : await crmApi.brands.create(r.name);
    saving.current = false;
    setBusy(false);
    if (result.ok) {
      // The list is in creation order, so a new brand is fetched into its place at the end.
      if (editingId) replace(result.data);
      else retry();
      return reset();
    }
    if (result.fieldErrors.name) {
      setError(result.fieldErrors.name);
      focusName();
    } else setFormError(result.message);
  }

  return (
    <>
      <PageHeader title="Brands" subtitle="Brands offered when adding a customer. Renaming a brand updates every customer that uses it." />
      <div ref={rootRef} className="grid gap-5 lg:grid-cols-[1fr_380px] lg:items-start">
        <Card className="overflow-hidden">
          <table className="stack-table w-full border-collapse text-left text-[14.5px]">
            <caption className="sr-only">Brands</caption>
            <thead>
              <tr className="border-b border-line text-[13px] text-muted">
                <th scope="col" className="px-6 py-3 font-medium">Brand name</th>
                <th scope="col" className="px-6 py-3 text-right font-medium"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              <ListStatusRow state={state} colSpan={2} empty="No brands yet. Add one to use it on customers." retry={retry} />
              {brands.map((b) => (
                <tr key={b.id} className="border-b border-line last:border-b-0">
                  <td className="px-6 py-2 font-semibold">{b.name}</td>
                  <td className="px-6 py-2 text-right">
                    <button type="button" onClick={() => edit(b.id)} aria-label={`Edit ${b.name}`}
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
            <h2 className="text-[16px] font-semibold">{editingId ? "Edit brand" : "Add brand"}</h2>
            <TextField id="brand-name" label="Brand name" value={name} placeholder="e.g. Protrack" error={error}
              onChange={(v) => { setName(stripControlChars(v)); setError(undefined); }} />
            {formError && <p role="alert" className="text-[14px] text-[#C62828]">{formError}</p>}
            <div className="flex flex-wrap justify-end gap-3">
              {editingId && (
                <button type="button" onClick={reset} className="min-h-11 rounded-xl border border-line px-4 text-[15px] font-semibold hover:bg-canvas">
                  Cancel edit
                </button>
              )}
              <button type="submit" disabled={busy} className="min-h-11 rounded-xl bg-brand px-5 text-[15px] font-semibold text-white hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60">
                {busy ? "Saving…" : editingId ? "Save changes" : "Add brand"}
              </button>
            </div>
          </form>
        </Card>
      </div>
    </>
  );
}
