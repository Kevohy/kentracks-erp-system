import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { fromSupplierValues, supplierFields, supplierTypes, type Supplier, type SupplierFieldName, type SupplierType } from "@/lib/suppliers";
import { validateSupplierField } from "@/lib/supplier-validation";
import { getDb } from "./db";
import { parseFields, parseType } from "./parse";
import { suppliers } from "./schema";
import type { AuthContext } from "./auth";

type Row = typeof suppliers.$inferSelect;

const toSupplier = (r: Row): Supplier => ({
  id: r.id,
  type: r.type,
  name: r.name,
  ...(r.type === "Company" ? { contactPerson: r.contactPerson ?? "" } : {}),
  phone: r.phone,
  email: r.email,
  location: r.location,
  ...(r.kraPin ? { kraPin: r.kraPin } : {}),
  ...(r.type === "Company" ? { department: r.department ?? "" } : {}),
});

function columnsFrom(body: Record<string, unknown>, existingType?: SupplierType) {
  const type = parseType(body, supplierTypes, existingType);
  const names = supplierFields[type].map((f) => f.name);
  const clean = parseFields<SupplierFieldName>(body, names, validateSupplierField);
  const s = fromSupplierValues("", type, clean);
  return {
    type,
    name: s.name,
    contactPerson: type === "Company" ? (s.contactPerson ?? "") : null,
    phone: s.phone,
    email: s.email,
    location: s.location,
    kraPin: type === "Company" ? (s.kraPin ?? null) : null,
    department: type === "Company" ? (s.department ?? "") : null,
  };
}

export async function listSuppliers(ctx: AuthContext): Promise<Supplier[]> {
  const rows = await getDb().select().from(suppliers).where(eq(suppliers.tenantId, ctx.tenantId)).orderBy(desc(suppliers.createdAt), desc(suppliers.id)).limit(5000);
  return rows.map(toSupplier);
}

export async function getSupplier(ctx: AuthContext, id: string): Promise<Supplier | null> {
  const [r] = await getDb().select().from(suppliers).where(and(eq(suppliers.id, id), eq(suppliers.tenantId, ctx.tenantId)));
  return r ? toSupplier(r) : null;
}

export async function createSupplier(ctx: AuthContext, body: Record<string, unknown>): Promise<Supplier> {
  const [r] = await getDb().insert(suppliers).values({ ...columnsFrom(body), tenantId: ctx.tenantId }).returning();
  return toSupplier(r);
}

export async function updateSupplier(ctx: AuthContext, id: string, body: Record<string, unknown>): Promise<Supplier | null> {
  const db = getDb();
  const [current] = await db.select({ type: suppliers.type }).from(suppliers).where(and(eq(suppliers.id, id), eq(suppliers.tenantId, ctx.tenantId)));
  if (!current) return null;
  const [r] = await db.update(suppliers).set({ ...columnsFrom(body, current.type), updatedAt: new Date() }).where(and(eq(suppliers.id, id), eq(suppliers.tenantId, ctx.tenantId))).returning();
  return r ? toSupplier(r) : null;
}

export async function deleteSupplier(ctx: AuthContext, id: string): Promise<boolean> {
  const r = await getDb().delete(suppliers).where(and(eq(suppliers.id, id), eq(suppliers.tenantId, ctx.tenantId))).returning({ id: suppliers.id });
  return r.length > 0;
}
