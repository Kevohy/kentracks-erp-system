import type { PlatformCardType, SimCardType } from "./inventory";

/** Types and helpers for Purchases. Records are saved by the server (src/server/erp/purchases.ts). */

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
  /** SIM cards only: Local IoT, International IoT, Prepaid or Postpaid. */
  simType?: SimCardType;
  /** Platforms only: New Card, Annual Card or Lifelong Card. */
  cardType?: PlatformCardType;
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

// ---- Stock is derived on the server (src/server/erp/inventory.ts): received purchase quantities minus
// what sales took out. The latest buying price is the price on the latest-dated RECEIVED purchase; on the
// same date the purchase added last wins. Nothing here edits it.

export type StockEntry = { quantity: number; latestPriceMinor: number | null };

/**
 * One stock figure from the server. Platform licences are counted per card type: one row per card type
 * (cardType "New Card" etc., or NO_CARD_TYPE for licences bought before card types were recorded) plus a
 * total row for the platform (cardType undefined). Products and SIM cards only have the total row.
 */
export type StockRow = { type: PurchaseItemType; id: string; cardType?: string; quantity: number; latestPriceMinor: number | null };
export const NO_CARD_TYPE = "No card type";

/** Look up stock: the total for an item, or (platforms) the stock of one card type. */
export type StockLookup = (type: PurchaseItemType, id: string, cardType?: string) => StockEntry;
export function makeStockLookup(rows: StockRow[]): StockLookup {
  const key = (type: string, id: string, cardType?: string) => `${type}:${id}:${cardType ?? "*"}`;
  const m = new Map(rows.map((r) => [key(r.type, r.id, r.cardType), r]));
  return (type, id, cardType) => {
    const r = m.get(key(type, id, type === "Platform" ? cardType : undefined));
    return r ? { quantity: r.quantity, latestPriceMinor: r.latestPriceMinor } : { quantity: 0, latestPriceMinor: null };
  };
}
