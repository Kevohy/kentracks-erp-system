"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { samplePackages, type Sale, type SalePackage } from "@/lib/sales";

type SalesStore = {
  sales: Sale[];
  packages: SalePackage[];
  /** Ignored if a sale with the same id already exists, so a repeated submit cannot add it twice. */
  addSale: (sale: Sale) => void;
  addPackage: (name: string) => void;
  updatePackage: (id: string, name: string) => void;
};

const Ctx = createContext<SalesStore | null>(null);

/** Session-only Sales data (completed sales and the package list). Lost on a full reload. */
export function SalesProvider({ children }: { children: ReactNode }) {
  const [sales, setSales] = useState<Sale[]>([]);
  const [packages, setPackages] = useState<SalePackage[]>(samplePackages);
  const seq = useRef(0);

  const addSale = useCallback((sale: Sale) => setSales((p) => (p.some((s) => s.id === sale.id) ? p : [sale, ...p])), []);
  const addPackage = useCallback(
    (name: string) => setPackages((p) => [...p, { id: `pk-new-${++seq.current}`, name }]),
    [],
  );
  const updatePackage = useCallback(
    (id: string, name: string) => setPackages((p) => p.map((x) => (x.id === id ? { ...x, name } : x))),
    [],
  );

  const store = useMemo(() => ({ sales, packages, addSale, addPackage, updatePackage }), [sales, packages, addSale, addPackage, updatePackage]);
  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useSales(): SalesStore {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSales must be used inside SalesProvider");
  return v;
}
