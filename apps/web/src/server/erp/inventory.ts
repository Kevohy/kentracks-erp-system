import "server-only";
import { asc, desc, eq, sql } from "drizzle-orm";
import { newPlatform, simCardTypes, type Platform, type Product, type ProductCategory, type SimCard } from "@/lib/inventory";
import { validateCategoryName, validateCategorySelection, validateModel, validatePlatformName, validateSimCardName, validateSimCardType } from "@/lib/inventory-validation";
import { NO_CARD_TYPE, makeStockLookup, type PurchaseItemType, type StockLookup, type StockRow } from "@/lib/purchases";
import type { AuthContext } from "../crm/auth";
import { getDb } from "../crm/db";
import { uniqueViolation } from "../crm/http";
import { Reader, throwValidation, type Body } from "./body";
import { platforms, productCategories, products, simCards } from "./schema";

/** The database or a transaction on it. Used so the same queries run inside sale/purchase transactions. */
export type Tx = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];
export type Db = ReturnType<typeof getDb> | Tx;

const LIMIT = 5000;

const toCategory = (r: typeof productCategories.$inferSelect): ProductCategory => ({ id: r.id, name: r.name });
const toProduct = (r: typeof products.$inferSelect): Product => ({ id: r.id, categoryId: r.categoryId, model: r.model });
const toSim = (r: typeof simCards.$inferSelect): SimCard => ({ id: r.id, name: r.name, type: r.type });
const toPlatform = (r: typeof platforms.$inferSelect): Platform => newPlatform(r.id, r.name);

// ---- reads (also used by the validators' context in purchases and sales)

export async function loadCategories(db: Db, tenantId: string): Promise<ProductCategory[]> {
  return (await db.select().from(productCategories).where(eq(productCategories.tenantId, tenantId)).orderBy(asc(productCategories.createdAt), asc(productCategories.id)).limit(LIMIT)).map(toCategory);
}
export async function loadProducts(db: Db, tenantId: string): Promise<Product[]> {
  return (await db.select().from(products).where(eq(products.tenantId, tenantId)).orderBy(desc(products.createdAt), desc(products.id)).limit(LIMIT)).map(toProduct);
}
export async function loadSimCards(db: Db, tenantId: string): Promise<SimCard[]> {
  return (await db.select().from(simCards).where(eq(simCards.tenantId, tenantId)).orderBy(desc(simCards.createdAt), desc(simCards.id)).limit(LIMIT)).map(toSim);
}
export async function loadPlatforms(db: Db, tenantId: string): Promise<Platform[]> {
  return (await db.select().from(platforms).where(eq(platforms.tenantId, tenantId)).orderBy(desc(platforms.createdAt), desc(platforms.id)).limit(LIMIT)).map(toPlatform);
}

export const listCategories = (ctx: AuthContext) => loadCategories(getDb(), ctx.tenantId);
export const listProducts = (ctx: AuthContext) => loadProducts(getDb(), ctx.tenantId);
export const listSimCards = (ctx: AuthContext) => loadSimCards(getDb(), ctx.tenantId);
export const listPlatforms = (ctx: AuthContext) => loadPlatforms(getDb(), ctx.tenantId);

// ---- creates

export async function createCategory(ctx: AuthContext, body: Body): Promise<ProductCategory> {
  const r = new Reader(body, ["name"]);
  const raw = r.text("name");
  r.done();
  const name = validateCategoryName(raw);
  if (name.error) throwValidation({ name: name.error });
  try {
    const [row] = await getDb().insert(productCategories).values({ tenantId: ctx.tenantId, name: name.value }).returning();
    return toCategory(row);
  } catch (e) {
    if (uniqueViolation(e) === "product_categories_tenant_name_uq") throwValidation({ name: "A category with this name already exists" });
    throw e;
  }
}

export async function createProduct(ctx: AuthContext, body: Body): Promise<Product> {
  const r = new Reader(body, ["category", "model"]);
  const rawCategory = r.text("category");
  const rawModel = r.text("model");
  r.done();
  const db = getDb();
  const errors: Record<string, string> = {};
  const categories = await loadCategories(db, ctx.tenantId);
  const category = validateCategorySelection(rawCategory, categories);
  if (category.error) errors.category = category.error;
  const model = validateModel(rawModel);
  if (model.error) errors.model = model.error;
  if (Object.keys(errors).length) throwValidation(errors);
  const [row] = await db.insert(products).values({ tenantId: ctx.tenantId, categoryId: category.value, model: model.value }).returning();
  return toProduct(row);
}

export async function createSimCard(ctx: AuthContext, body: Body): Promise<SimCard> {
  const r = new Reader(body, ["name", "type"]);
  const rawName = r.text("name");
  const rawType = r.text("type");
  r.done();
  const errors: Record<string, string> = {};
  const name = validateSimCardName(rawName);
  if (name.error) errors.name = name.error;
  const type = validateSimCardType(rawType);
  if (type.error) errors.type = type.error;
  if (Object.keys(errors).length) throwValidation(errors);
  const [row] = await getDb().insert(simCards).values({ tenantId: ctx.tenantId, name: name.value, type: type.value as (typeof simCardTypes)[number] }).returning();
  return toSim(row);
}

export async function createPlatform(ctx: AuthContext, body: Body): Promise<Platform> {
  const r = new Reader(body, ["name"]);
  const raw = r.text("name");
  r.done();
  const name = validatePlatformName(raw);
  if (name.error) throwValidation({ name: name.error });
  const [row] = await getDb().insert(platforms).values({ tenantId: ctx.tenantId, name: name.value }).returning();
  return toPlatform(row);
}

// ---- stock (derived, never stored)

export type { StockRow };

/**
 * Stock = received purchase quantities - quantities taken out by sales (stock_adjustments).
 * Platform licences are also counted per card type (licences bought before card types were recorded count
 * under NO_CARD_TYPE). Latest buying price = price on the latest-dated RECEIVED purchase; on the same date the
 * purchase added last wins, and within a purchase the first row. The rule is documented in src/lib/purchases.ts.
 */
export async function loadStock(db: Db, tenantId: string): Promise<StockRow[]> {
  // card: the platform's card type ('' for products and SIM cards, NO_CARD_TYPE for untyped licences)
  const card = (col: string) => sql.raw(`CASE WHEN ${col}.item_type = 'Platform' THEN COALESCE(${col}.card_type::text, '${NO_CARD_TYPE}') ELSE '' END`);
  const received = await db.execute<{ type: PurchaseItemType; id: string; card: string; quantity: string }>(sql`
    SELECT pi.item_type AS type, COALESCE(pi.product_id, pi.sim_card_id, pi.platform_id) AS id, ${card("pi")} AS card, SUM(pi.quantity)::text AS quantity
    FROM purchase_items pi JOIN purchases p ON p.id = pi.purchase_id
    WHERE p.tenant_id = ${tenantId} AND p.status = 'Received'
    GROUP BY 1, 2, 3`);
  const taken = await db.execute<{ type: PurchaseItemType; id: string; card: string; quantity: string }>(sql`
    SELECT a.item_type AS type, COALESCE(a.product_id, a.sim_card_id, a.platform_id) AS id, ${card("a")} AS card, SUM(a.quantity)::text AS quantity
    FROM stock_adjustments a WHERE a.tenant_id = ${tenantId} GROUP BY 1, 2, 3`);
  const prices = await db.execute<{ type: PurchaseItemType; id: string; card: string; price: string }>(sql`
    SELECT DISTINCT ON (1, 2, 3)
      pi.item_type AS type, COALESCE(pi.product_id, pi.sim_card_id, pi.platform_id) AS id, ${card("pi")} AS card, pi.unit_price_minor::text AS price
    FROM purchase_items pi JOIN purchases p ON p.id = pi.purchase_id
    WHERE p.tenant_id = ${tenantId} AND p.status = 'Received'
    ORDER BY 1, 2, 3, p.date DESC, p.created_at DESC, pi.position ASC`);
  const latestAny = await db.execute<{ id: string; price: string }>(sql`
    SELECT DISTINCT ON (pi.platform_id) pi.platform_id AS id, pi.unit_price_minor::text AS price
    FROM purchase_items pi JOIN purchases p ON p.id = pi.purchase_id
    WHERE p.tenant_id = ${tenantId} AND p.status = 'Received' AND pi.item_type = 'Platform'
    ORDER BY pi.platform_id, p.date DESC, p.created_at DESC, pi.position ASC`);

  const map = new Map<string, StockRow>();
  const key = (t: string, id: string, card: string) => `${t}:${id}:${card}`;
  const row = (t: PurchaseItemType, id: string, card: string) => {
    const k = key(t, id, card);
    if (!map.has(k)) map.set(k, { type: t, id, ...(card ? { cardType: card } : {}), quantity: 0, latestPriceMinor: null });
    return map.get(k)!;
  };
  for (const r of received.rows) row(r.type, r.id, r.card).quantity += Number(r.quantity);
  for (const r of taken.rows) row(r.type, r.id, r.card).quantity -= Number(r.quantity);
  for (const r of prices.rows) row(r.type, r.id, r.card).latestPriceMinor = Number(r.price);
  const rows = [...map.values()];
  // A total row per platform, so pages that show one figure per platform keep working.
  const totals = new Map<string, StockRow>();
  for (const r of rows.filter((x) => x.type === "Platform")) {
    const t = totals.get(r.id) ?? { type: "Platform" as const, id: r.id, quantity: 0, latestPriceMinor: null };
    t.quantity += r.quantity;
    totals.set(r.id, t);
  }
  for (const r of latestAny.rows) if (totals.has(r.id)) totals.get(r.id)!.latestPriceMinor = Number(r.price);
  return [...rows, ...totals.values()];
}

/** The lookup the shared validators expect. */
export const stockLookup = (rows: StockRow[]): StockLookup => makeStockLookup(rows);

export const listStock = (ctx: AuthContext) => loadStock(getDb(), ctx.tenantId);
