"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { ApiResult, SaveResult } from "@/lib/crm-api";
import { erpApi } from "@/lib/erp-api";
import type { Sale, SalePackage } from "@/lib/sales";
import type { LoadState } from "@/components/inventory/InventoryProvider";

type SalesStore = {
  load: LoadState;
  reload: () => void;
  sales: Sale[];
  packages: SalePackage[];
  /** Saves a sale on the server. A repeated submit with the same key returns the sale already saved, never a second one. */
  saveSale: (send: () => Promise<ApiResult<Sale>>) => Promise<ApiResult<Sale>>;
  addPackage: (name: string) => Promise<SaveResult>;
  updatePackage: (id: string, name: string) => Promise<SaveResult>;
  ensureLoaded: () => void;
};

const Ctx = createContext<SalesStore | null>(null);

/** Completed sales and the package list, read from and saved to the server. Nothing is fetched until a page needs it. */
export function SalesProvider({ children }: { children: ReactNode }) {
  const [load, setLoad] = useState<LoadState>({ status: "loading" });
  const [sales, setSales] = useState<Sale[]>([]);
  const [packages, setPackages] = useState<SalePackage[]>([]);
  const started = useRef(false);

  const fetchAll = useCallback(async () => {
    // The sale history pages through sales itself (Sales page), so only the package list is read here.
    const p = await erpApi.packages.list();
    if (!p.ok) {
      setLoad({ status: "error", message: p.message });
      return;
    }
    setPackages(p.data);
    setLoad({ status: "ready" });
  }, []);

  const ensureLoaded = useCallback(() => {
    if (started.current) return;
    started.current = true;
    void fetchAll();
  }, [fetchAll]);
  const reload = useCallback(() => {
    setLoad({ status: "loading" });
    void fetchAll();
  }, [fetchAll]);

  const saveSale = useCallback(async (send: () => Promise<ApiResult<Sale>>) => {
    const r = await send();
    if (r.ok) setSales((p) => (p.some((s) => s.id === r.data.id) ? p : [r.data, ...p]));
    return r;
  }, []);
  const addPackage = useCallback(async (name: string): Promise<SaveResult> => {
    const r = await erpApi.packages.create(name);
    if (!r.ok) return r;
    setPackages((p) => [...p, r.data]);
    return { ok: true };
  }, []);
  const updatePackage = useCallback(async (id: string, name: string): Promise<SaveResult> => {
    const r = await erpApi.packages.update(id, name);
    if (!r.ok) return r;
    setPackages((p) => p.map((x) => (x.id === id ? r.data : x)));
    return { ok: true };
  }, []);

  const store = useMemo(
    () => ({ load, reload, ensureLoaded, sales, packages, saveSale, addPackage, updatePackage }),
    [load, reload, ensureLoaded, sales, packages, saveSale, addPackage, updatePackage],
  );
  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useSales(): SalesStore {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSales must be used inside SalesProvider");
  const { ensureLoaded } = v;
  useEffect(() => ensureLoaded(), [ensureLoaded]);
  return v;
}
