"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { ApiResult, SaveResult } from "@/lib/crm-api";
import { erpApi } from "@/lib/erp-api";
import type { Platform, Product, ProductCategory, SimCard, SimCardType } from "@/lib/inventory";
import { makeStockLookup, type Purchase, type StockLookup, type StockRow } from "@/lib/purchases";
import type { PurchaseDraft } from "@/lib/purchase-validation";

export type LoadState = { status: "loading" } | { status: "error"; message: string } | { status: "ready" };

type InventoryStore = {
  /** Whether the inventory and purchases have been loaded from the server. */
  load: LoadState;
  reload: () => void;
  categories: ProductCategory[];
  products: Product[];
  simCards: SimCard[];
  platforms: Platform[];
  /** Loaded only when a page asks for it (the Purchases page), so other pages stay light as purchases grow. */
  purchases: Purchase[];
  purchasesLoad: LoadState;
  ensurePurchases: () => void;
  reloadPurchases: () => void;
  addCategory: (name: string) => Promise<SaveResult>;
  addProduct: (categoryId: string, model: string) => Promise<SaveResult>;
  addSimCard: (name: string, type: SimCardType) => Promise<SaveResult>;
  addPlatform: (name: string) => Promise<SaveResult>;
  addPurchase: (draft: PurchaseDraft, clientKey: string) => Promise<ApiResult<Purchase>>;
  /** Reads stock again from the server (after a sale took something out). */
  refreshStock: () => Promise<void>;
  /** Quantity and latest buying price for an item, derived on the server from received purchases and sales. */
  /** Stock of an item; for a platform, pass a card type to get that card type's stock. */
  stockOf: StockLookup;
  /** Starts loading on first use. Called by useInventory(). */
  ensureLoaded: () => void;
};

const Ctx = createContext<InventoryStore | null>(null);

/**
 * Inventory and Purchases, read from and saved to the server. It lives in the root layout so pages
 * share one copy, but nothing is fetched until a page that needs it asks (useInventory), so the
 * CRM pages never trigger these requests. Stock is worked out by the server, never edited here.
 */
export function InventoryProvider({ children }: { children: ReactNode }) {
  const [load, setLoad] = useState<LoadState>({ status: "loading" });
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [simCards, setSimCards] = useState<SimCard[]>([]);
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [purchasesLoad, setPurchasesLoad] = useState<LoadState>({ status: "loading" });
  const purchasesStarted = useRef(false);
  const [stock, setStock] = useState<StockRow[]>([]);
  const started = useRef(false);

  const fetchAll = useCallback(async () => {
    const [c, p, s, pl, st] = await Promise.all([
      erpApi.categories.list(), erpApi.products.list(), erpApi.simCards.list(), erpApi.platforms.list(), erpApi.stock.list(),
    ]);
    if (!c.ok || !p.ok || !s.ok || !pl.ok || !st.ok) {
      const failed = [c, p, s, pl, st].find((r) => !r.ok);
      setLoad({ status: "error", message: failed && !failed.ok ? failed.message : "Something went wrong. Please try again." });
      return;
    }
    setCategories(c.data);
    setProducts(p.data);
    setSimCards(s.data);
    setPlatforms(pl.data);
    setStock(st.data);
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

  const fetchPurchases = useCallback(async () => {
    setPurchasesLoad({ status: "loading" });
    const r = await erpApi.purchases.list();
    if (!r.ok) return setPurchasesLoad({ status: "error", message: r.message });
    setPurchases(r.data);
    setPurchasesLoad({ status: "ready" });
  }, []);
  const ensurePurchases = useCallback(() => {
    if (purchasesStarted.current) return;
    purchasesStarted.current = true;
    void fetchPurchases();
  }, [fetchPurchases]);
  const reloadPurchases = useCallback(() => void fetchPurchases(), [fetchPurchases]);

  const refreshStock = useCallback(async () => {
    const r = await erpApi.stock.list();
    if (r.ok) setStock(r.data);
  }, []);

  const stockOf = useMemo(() => makeStockLookup(stock), [stock]);

  const store = useMemo<InventoryStore>(() => {
    const ok = <T,>(r: ApiResult<T>, apply: (v: T) => void): SaveResult => {
      if (!r.ok) return r;
      apply(r.data);
      return { ok: true };
    };
    return {
      load, reload, ensureLoaded, categories, products, simCards, platforms, purchases, purchasesLoad, ensurePurchases, reloadPurchases, stockOf, refreshStock,
      addCategory: async (name) => ok(await erpApi.categories.create(name), (v) => setCategories((p) => [...p, v])),
      addProduct: async (categoryId, model) => ok(await erpApi.products.create(categoryId, model), (v) => setProducts((p) => [v, ...p])),
      addSimCard: async (name, type) => ok(await erpApi.simCards.create(name, type), (v) => setSimCards((p) => [v, ...p])),
      addPlatform: async (name) => ok(await erpApi.platforms.create(name), (v) => setPlatforms((p) => [v, ...p])),
      addPurchase: async (draft, clientKey) => {
        const r = await erpApi.purchases.create(draft, clientKey);
        if (r.ok) {
          // A repeated submit returns the same purchase, so never list it twice.
          setPurchases((p) => (p.some((x) => x.id === r.data.id) ? p : [r.data, ...p]));
          void refreshStock();
        }
        return r;
      },
    };
  }, [load, reload, ensureLoaded, categories, products, simCards, platforms, purchases, purchasesLoad, ensurePurchases, reloadPurchases, stockOf, refreshStock]);

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useInventory(): InventoryStore {
  const v = useContext(Ctx);
  if (!v) throw new Error("useInventory must be used inside InventoryProvider");
  const { ensureLoaded } = v;
  useEffect(() => ensureLoaded(), [ensureLoaded]);
  return v;
}
