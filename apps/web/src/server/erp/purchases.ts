import "server-only";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { SimCardType } from "@/lib/inventory";
import type { Supplier } from "@/lib/suppliers";
import { type Purchase, type PurchaseItem } from "@/lib/purchases";
import { validatePurchase, type PurchaseDraft } from "@/lib/purchase-validation";
import type { AuthContext } from "../crm/auth";
import { getDb } from "../crm/db";
import { isUuid, uniqueViolation } from "../crm/http";
import { Replay } from "../crm/routes";
import { suppliers } from "../crm/schema";
import { Reader, throwValidation, type Body } from "./body";
import { loadCategories, loadPlatforms, loadProducts, loadSimCards } from "./inventory";
import { purchaseItems, purchases, simCards } from "./schema";

const LIMIT = 2000;
type PurchaseRow = typeof purchases.$inferSelect;
type ItemRow = typeof purchaseItems.$inferSelect;

const toItem = (r: ItemRow, simTypes: Map<string, SimCardType>): PurchaseItem => ({
  id: r.id,
  itemType: r.itemType,
  itemId: (r.productId ?? r.simCardId ?? r.platformId) as string,
  label: r.label,
  ...(r.categoryName !== null ? { categoryName: r.categoryName } : {}),
  ...(r.cardType ? { cardType: r.cardType } : {}),
  ...(r.simCardId && simTypes.has(r.simCardId) ? { simType: simTypes.get(r.simCardId) } : {}),
  quantity: r.quantity,
  unitPriceMinor: r.unitPriceMinor,
});

/** The supplier's name is read from the suppliers table, so the list shows the current name. */
function assemble(rows: { p: PurchaseRow; supplierName: string }[], items: ItemRow[], simTypes: Map<string, SimCardType>): Purchase[] {
  const byPurchase = new Map<string, ItemRow[]>();
  for (const i of items) byPurchase.set(i.purchaseId, [...(byPurchase.get(i.purchaseId) ?? []), i]);
  return rows.map(({ p, supplierName }) => ({
    id: p.id,
    supplierId: p.supplierId,
    supplierName,
    date: p.date,
    status: p.status,
    notes: p.notes,
    items: (byPurchase.get(p.id) ?? []).sort((a, b) => a.position - b.position).map((i) => toItem(i, simTypes)),
    totalMinor: p.totalMinor,
    paidMinor: p.paidMinor,
  }));
}

async function loadPurchases(tenantId: string, only?: string): Promise<Purchase[]> {
  const db = getDb();
  const where = only ? and(eq(purchases.tenantId, tenantId), eq(purchases.id, only)) : eq(purchases.tenantId, tenantId);
  const rows = await db
    .select({ p: purchases, supplierName: suppliers.name })
    .from(purchases)
    .innerJoin(suppliers, eq(suppliers.id, purchases.supplierId))
    .where(where)
    .orderBy(desc(purchases.createdAt), desc(purchases.id))
    .limit(LIMIT);
  if (rows.length === 0) return [];
  const items = await db.select().from(purchaseItems).where(inArray(purchaseItems.purchaseId, rows.map((r) => r.p.id))).orderBy(asc(purchaseItems.position));
  // The SIM card type is read from the SIM card record, so the list shows its current type.
  const simIds = [...new Set(items.map((i) => i.simCardId).filter((x): x is string => !!x))];
  const simRows = simIds.length ? await db.select({ id: simCards.id, type: simCards.type }).from(simCards).where(and(eq(simCards.tenantId, tenantId), inArray(simCards.id, simIds))) : [];
  return assemble(rows, items, new Map(simRows.map((r) => [r.id, r.type as SimCardType])));
}

export const listPurchases = (ctx: AuthContext) => loadPurchases(ctx.tenantId);
export async function getPurchase(ctx: AuthContext, id: string): Promise<Purchase | null> {
  return (await loadPurchases(ctx.tenantId, id))[0] ?? null;
}

export const PURCHASE_BODY_BYTES = 64 * 1024;

function readDraft(body: Body): { draft: PurchaseDraft; clientKey: string | null } {
  const r = new Reader(body, ["supplierId", "status", "date", "notes", "paid", "rows", "clientKey"]);
  const draft = {
    supplierId: r.text("supplierId"),
    status: r.text("status") as PurchaseDraft["status"],
    date: r.text("date"),
    notes: r.text("notes"),
    paid: r.text("paid"),
    rows: r.rows("rows", ["type", "categoryId", "itemId", "cardType", "quantity", "unitPrice"]) as unknown as PurchaseDraft["rows"],
  } satisfies PurchaseDraft;
  const clientKey = r.clientKey();
  r.done();
  return { draft, clientKey };
}

export async function createPurchase(ctx: AuthContext, body: Body): Promise<Purchase | Replay<Purchase>> {
  const { draft, clientKey } = readDraft(body);
  const db = getDb();

  // A repeated submit of the same form returns the purchase that was already saved.
  const replay = async () => {
    if (!clientKey) return null;
    const [row] = await db.select({ id: purchases.id }).from(purchases).where(and(eq(purchases.tenantId, ctx.tenantId), eq(purchases.clientKey, clientKey)));
    return row ? ((await getPurchase(ctx, row.id)) as Purchase) : null;
  };
  const existing = await replay();
  if (existing) return new Replay(existing);

  // Only this company's records are loaded, so a foreign id can never validate.
  const [supplierRows, categories, products, simCards, platforms] = await Promise.all([
    isUuid(draft.supplierId) ? db.select().from(suppliers).where(and(eq(suppliers.id, draft.supplierId), eq(suppliers.tenantId, ctx.tenantId))) : Promise.resolve([]),
    loadCategories(db, ctx.tenantId),
    loadProducts(db, ctx.tenantId),
    loadSimCards(db, ctx.tenantId),
    loadPlatforms(db, ctx.tenantId),
  ]);
  const supplierList: Supplier[] = supplierRows.map((s) => ({ id: s.id, type: s.type, name: s.name, phone: s.phone, email: s.email, location: s.location }));
  const { errors, result } = validatePurchase(draft, { suppliers: supplierList, categories, products, simCards, platforms });
  if (!result) throwValidation(errors);

  try {
    const id = await db.transaction(async (tx) => {
      const [p] = await tx
        .insert(purchases)
        .values({
          tenantId: ctx.tenantId,
          clientKey,
          supplierId: result.supplier.id,
          date: result.date,
          status: result.status,
          notes: result.notes,
          totalMinor: result.totalMinor,
          paidMinor: result.paidMinor,
        })
        .returning({ id: purchases.id });
      await tx.insert(purchaseItems).values(
        result.items.map((i, position) => ({
          purchaseId: p.id,
          position,
          itemType: i.itemType,
          productId: i.itemType === "Product" ? i.itemId : null,
          simCardId: i.itemType === "SIM Card" ? i.itemId : null,
          platformId: i.itemType === "Platform" ? i.itemId : null,
          label: i.label,
          categoryName: i.itemType === "Product" ? (i.categoryName ?? null) : null,
          cardType: i.itemType === "Platform" ? (i.cardType ?? null) : null,
          quantity: i.quantity,
          unitPriceMinor: i.unitPriceMinor,
        })),
      );
      return p.id;
    });
    return (await getPurchase(ctx, id)) as Purchase;
  } catch (e) {
    // Two identical submits raced past the check above: answer with the one that won.
    if (uniqueViolation(e) === "purchases_tenant_client_key_uq") {
      const won = await replay();
      if (won) return new Replay(won);
    }
    throw e;
  }
}

