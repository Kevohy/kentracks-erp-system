import "server-only";
import { and, asc, eq } from "drizzle-orm";
import type { SalePackage } from "@/lib/sales";
import { validatePackage } from "@/lib/sale-validation";
import { requireAdmin, type AuthContext } from "../crm/auth";
import { getDb } from "../crm/db";
import { uniqueViolation } from "../crm/http";
import { Reader, throwValidation, type Body } from "./body";
import type { Db } from "./inventory";
import { salePackages } from "./schema";

const toPackage = (r: typeof salePackages.$inferSelect): SalePackage => ({ id: r.id, name: r.name });

export async function loadPackages(db: Db, tenantId: string): Promise<SalePackage[]> {
  const rows = await db.select().from(salePackages).where(eq(salePackages.tenantId, tenantId)).orderBy(asc(salePackages.createdAt), asc(salePackages.id)).limit(1000);
  return rows.map(toPackage);
}

export const listPackages = (ctx: AuthContext) => loadPackages(getDb(), ctx.tenantId);

const DUPLICATE = "A package with this name already exists";

function readName(body: Body): string {
  const r = new Reader(body, ["name"]);
  const name = r.text("name");
  r.done();
  return name;
}

export async function createPackage(ctx: AuthContext, body: Body): Promise<SalePackage> {
  requireAdmin(ctx, "add or rename packages");
  const raw = readName(body);
  const db = getDb();
  const { errors, name } = validatePackage({ name: raw }, await loadPackages(db, ctx.tenantId));
  if (errors.name) throwValidation({ name: errors.name });
  try {
    const [row] = await db.insert(salePackages).values({ tenantId: ctx.tenantId, name }).returning();
    return toPackage(row);
  } catch (e) {
    if (uniqueViolation(e) === "sale_packages_tenant_name_uq") throwValidation({ name: DUPLICATE });
    throw e;
  }
}

/** Renames a package. Past sales keep the name they were made with. */
export async function updatePackage(ctx: AuthContext, id: string, body: Body): Promise<SalePackage | null> {
  requireAdmin(ctx, "add or rename packages");
  const raw = readName(body);
  const db = getDb();
  const all = await loadPackages(db, ctx.tenantId);
  if (!all.some((p) => p.id === id)) return null;
  const { errors, name } = validatePackage({ name: raw }, all, id);
  if (errors.name) throwValidation({ name: errors.name });
  try {
    const [row] = await db.update(salePackages).set({ name }).where(and(eq(salePackages.id, id), eq(salePackages.tenantId, ctx.tenantId))).returning();
    return row ? toPackage(row) : null;
  } catch (e) {
    if (uniqueViolation(e) === "sale_packages_tenant_name_uq") throwValidation({ name: DUPLICATE });
    throw e;
  }
}
