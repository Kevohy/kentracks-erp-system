"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import {
  newPlatform,
  sampleCategories,
  samplePlatforms,
  sampleProducts,
  sampleSimCards,
  type Platform,
  type Product,
  type ProductCategory,
  type SimCard,
  type SimCardType,
} from "@/lib/inventory";
import { buildStock, samplePurchases, type Purchase, type PurchaseItem, type StockEntry, type PurchaseItemType } from "@/lib/purchases";

type NewPurchase = Omit<Purchase, "id" | "items"> & { items: Omit<PurchaseItem, "id">[] };

type InventoryStore = {
  categories: ProductCategory[];
  products: Product[];
  simCards: SimCard[];
  platforms: Platform[];
  purchases: Purchase[];
  addCategory: (name: string) => void;
  addProduct: (categoryId: string, model: string) => void;
  addSimCard: (name: string, type: SimCardType) => void;
  addPlatform: (name: string) => void;
  addPurchase: (purchase: NewPurchase) => void;
  /** Quantity and latest buying price for an item, derived from the purchases. */
  stockOf: (type: PurchaseItemType, id: string) => StockEntry;
};

const Ctx = createContext<InventoryStore | null>(null);

/**
 * Holds the Inventory and Purchases mock data for the browser session so every page sees the
 * same records. It lives in the root layout, so it survives navigating between pages and is
 * lost on a full reload. Nothing is persisted anywhere.
 */
export function InventoryProvider({ children }: { children: ReactNode }) {
  const [categories, setCategories] = useState<ProductCategory[]>(sampleCategories);
  const [products, setProducts] = useState<Product[]>(sampleProducts);
  const [simCards, setSimCards] = useState<SimCard[]>(sampleSimCards);
  const [platforms, setPlatforms] = useState<Platform[]>(samplePlatforms);
  const [purchases, setPurchases] = useState<Purchase[]>(samplePurchases);
  const seq = useRef(0);
  const nextId = useCallback((prefix: string) => `${prefix}-new-${++seq.current}`, []);

  const stockOf = useMemo(() => buildStock(purchases), [purchases]);

  const store = useMemo<InventoryStore>(
    () => ({
      categories,
      products,
      simCards,
      platforms,
      purchases,
      stockOf,
      addCategory: (name) => setCategories((p) => [...p, { id: nextId("c"), name }]),
      addProduct: (categoryId, model) => setProducts((p) => [{ id: nextId("p"), categoryId, model }, ...p]),
      addSimCard: (name, type) => setSimCards((p) => [{ id: nextId("s"), name, type }, ...p]),
      addPlatform: (name) => setPlatforms((p) => [newPlatform(nextId("pl"), name), ...p]),
      addPurchase: (purchase) => {
        const id = nextId("pu");
        setPurchases((p) => [{ ...purchase, id, items: purchase.items.map((i, n) => ({ ...i, id: `${id}-${n + 1}` })) }, ...p]);
      },
    }),
    [categories, products, simCards, platforms, purchases, stockOf, nextId],
  );

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useInventory(): InventoryStore {
  const v = useContext(Ctx);
  if (!v) throw new Error("useInventory must be used inside InventoryProvider");
  return v;
}
