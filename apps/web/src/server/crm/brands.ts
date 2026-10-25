import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { validateBrand } from "@/lib/brand-validation";
import { defaultBrandNames, type Brand } from "@/lib/brands";
import { requireAdmin, type AuthContext } from "./auth";
import { getDb } from "./db";
import { ApiError, uniqueViolation } from "./http";
import { brands } from "./schema";

type Db = ReturnType<typeof getDb>;
const toBrand = (r: typeof brands.$inferSelect): Brand => ({ id: r.id, name: r.name });
const DUPLICATE = "A brand with this name already exists";

const select = (db: Db, tenantId: string) =>
  db.select().from(brands).where(eq(brands.tenantId, tenantId)).orderBy(asc(brands.createdAt), asc(brands.name)).limit(200);

/** This company's brands. A company with none yet gets the defaults (Protrack, Kentracks) the first time they are listed. */
export async function loadBrands(db: Db, tenantId: string): Promise<Brand[]> {
  let rows = await select(db, tenantId);
  if (rows.length === 0) {
    // Distinct timestamps keep them in this order (Protrack first) in every list.
    const now = Date.now();
    await db
      .insert(brands)
      .values(defaultBrandNames.map((name, i) => ({ tenantId, name, createdAt: new Date(now + i) })))
      .onConflictDoNothing();
    rows = await select(db, tenantId);
  }
  return rows.map(toBrand);
}

export const listBrands = (ctx: AuthContext) => loadBrands(getDb(), ctx.tenantId);

function readName(body: Record<string, unknown>): string {
  const extra = Object.keys(body).filter((k) => k !== "name");
  if (extra.length) throw new ApiError(422, "Please correct the highlighted fields", Object.fromEntries(extra.map((k) => [k, "This field is not accepted"])));
  if (body.name !== undefined && typeof body.name !== "string") throw new ApiError(422, "Please correct the highlighted fields", { name: "Must be text" });
  return (body.name as string | undefined) ?? "";
}

function fail(errors: { name?: string }): never {
  throw new ApiError(422, "Please correct the highlighted fields", { name: errors.name ?? "Invalid name" });
}

export async function createBrand(ctx: AuthContext, body: Record<string, unknown>): Promise<Brand> {
  requireAdmin(ctx, "add or rename brands");
  const raw = readName(body);
  const db = getDb();
  const { errors, name } = validateBrand({ name: raw }, await loadBrands(db, ctx.tenantId));
  if (errors.name) fail(errors);
  try {
    const [row] = await db.insert(brands).values({ tenantId: ctx.tenantId, name }).returning();
    return toBrand(row);
  } catch (e) {
    if (uniqueViolation(e) === "brands_tenant_name_uq") fail({ name: DUPLICATE });
    throw e;
  }
}

/** Renames a brand. Customers tagged with it follow the new name. */
export async function updateBrand(ctx: AuthContext, id: string, body: Record<string, unknown>): Promise<Brand | null> {
  requireAdmin(ctx, "add or rename brands");
  const raw = readName(body);
  const db = getDb();
  const all = await loadBrands(db, ctx.tenantId);
  if (!all.some((b) => b.id === id)) return null;
  const { errors, name } = validateBrand({ name: raw }, all, id);
  if (errors.name) fail(errors);
  try {
    const [row] = await db.update(brands).set({ name }).where(and(eq(brands.id, id), eq(brands.tenantId, ctx.tenantId))).returning();
    return row ? toBrand(row) : null;
  } catch (e) {
    if (uniqueViolation(e) === "brands_tenant_name_uq") fail({ name: DUPLICATE });
    throw e;
  }
}
