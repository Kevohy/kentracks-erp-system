import {
  sampleCategories,
  sampleProducts,
  samplePlatforms,
  sampleSimCards,
  type Product,
  type ProductCategory,
} from "./inventory";
import { sampleSuppliers } from "./suppliers";

/** Mock data and helpers for Purchases. Frontend only; nothing is persisted. */

export const purchaseItemTypes = ["Product", "SIM Card", "Platform"] as const;
export type PurchaseItemType = (typeof purchaseItemTypes)[number];

/** Whether the goods have arrived. Payment is tracked separately by the amount paid. */
export const purchaseStatuses = ["Pending", "Received"] as const;
export type PurchaseStatus = (typeof purchaseStatuses)[number];

export type PurchaseItem = {
  id: string;
  itemType: PurchaseItemType;
  /** Id of the inventory record (product, SIM card or platform) this row bought. */
  itemId: string;
  /** Model / SIM card name / platform name at the time of purchase. */
  label: string;
  /** Products only. */
  categoryName?: string;
  quantity: number;
  /** Money is held in minor units (cents) so totals never suffer float errors. */
  unitPriceMinor: number;
};

export type Purchase = {
  id: string;
  supplierId: string;
  supplierName: string;
  /** ISO date, yyyy-mm-dd. */
  date: string;
  status: PurchaseStatus;
  notes: string;
  items: PurchaseItem[];
  totalMinor: number;
  paidMinor: number;
};

/** Derived from the amounts, never entered by hand, so it cannot disagree with them. */
export function paymentState(p: Pick<Purchase, "totalMinor" | "paidMinor">): "Unpaid" | "Partly paid" | "Paid in full" {
  if (p.paidMinor <= 0) return "Unpaid";
  return p.paidMinor >= p.totalMinor ? "Paid in full" : "Partly paid";
}

export const itemAmountMinor = (i: Pick<PurchaseItem, "quantity" | "unitPriceMinor">) => i.quantity * i.unitPriceMinor;

/** "1234567" cents -> "12,345.67" */
export function formatMinor(minor: number): string {
  const whole = Math.floor(minor / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${whole}.${(minor % 100).toString().padStart(2, "0")}`;
}
export const formatKes = (minor: number) => `KES ${formatMinor(minor)}`;

// ---- Stock is derived from the purchase ledger, so Purchases and Inventory can never disagree.

export type StockEntry = { quantity: number; latestPriceMinor: number | null };
const stockKey = (type: PurchaseItemType, id: string) => `${type}:${id}`;

export function buildStock(purchases: Purchase[]): (type: PurchaseItemType, id: string) => StockEntry {
  const map = new Map<string, StockEntry & { latestDate: string }>();
  // Purchases are ordered newest-added first, so on equal dates the first one seen wins.
  // Only received purchases are in stock; a pending one has not arrived yet.
  for (const p of purchases) {
    if (p.status !== "Received") continue;
    for (const i of p.items) {
      const k = stockKey(i.itemType, i.itemId);
      const cur = map.get(k) ?? { quantity: 0, latestPriceMinor: null, latestDate: "" };
      cur.quantity += i.quantity;
      if (p.date > cur.latestDate) {
        cur.latestDate = p.date;
        cur.latestPriceMinor = i.unitPriceMinor;
      }
      map.set(k, cur);
    }
  }
  return (type, id) => map.get(stockKey(type, id)) ?? { quantity: 0, latestPriceMinor: null };
}

// ---- Sample purchases, built only from the existing sample suppliers and inventory.

const cat = (c: ProductCategory[], id: string) => c.find((x) => x.id === id)?.name;
const prod = (id: string): Product => sampleProducts.find((p) => p.id === id)!;
const supplier = (id: string) => sampleSuppliers.find((s) => s.id === id)!;

function productItem(id: string, productId: string, quantity: number, unitPriceMinor: number): PurchaseItem {
  const p = prod(productId);
  return { id, itemType: "Product", itemId: p.id, label: p.model, categoryName: cat(sampleCategories, p.categoryId), quantity, unitPriceMinor };
}
function simItem(id: string, simId: string, quantity: number, unitPriceMinor: number): PurchaseItem {
  const s = sampleSimCards.find((x) => x.id === simId)!;
  return { id, itemType: "SIM Card", itemId: s.id, label: s.name, quantity, unitPriceMinor };
}
function platformItem(id: string, platformId: string, quantity: number, unitPriceMinor: number): PurchaseItem {
  const p = samplePlatforms.find((x) => x.id === platformId)!;
  return { id, itemType: "Platform", itemId: p.id, label: p.name, quantity, unitPriceMinor };
}
function purchase(id: string, supplierId: string, date: string, status: PurchaseStatus, paidMinor: number, items: PurchaseItem[], notes = ""): Purchase {
  return {
    id,
    supplierId,
    supplierName: supplier(supplierId).name,
    date,
    status,
    notes,
    items,
    totalMinor: items.reduce((sum, i) => sum + itemAmountMinor(i), 0),
    paidMinor,
  };
}

export const samplePurchases: Purchase[] = [
  purchase("pu3", "s3", "2026-10-10", "Pending", 0, [
    productItem("pu3-1", "p3", 8, 980000),
    productItem("pu3-2", "p4", 5, 750000),
    platformItem("pu3-3", "pl1", 100, 12000),
  ]),
  purchase(
    "pu2",
    "s5",
    "2026-10-03",
    "Received",
    1500000,
    [simItem("pu2-1", "s1", 50, 45000), simItem("pu2-2", "s3", 30, 15000)],
    "Balance due at month end.",
  ),
  purchase("pu1", "s1", "2026-09-12", "Received", 16200000, [productItem("pu1-1", "p1", 20, 650000), productItem("pu1-2", "p2", 10, 320000)]),
];
