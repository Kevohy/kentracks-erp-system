import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { loadBrands } from "./brands";
import { validateContact, validateField } from "@/lib/customer-validation";
import { customerTypes, fieldsByType, fromFormValues, type Customer, type CustomerType, type FieldName } from "@/lib/customers";
import { getDb } from "./db";
import { ApiError, isUuid, uniqueViolation } from "./http";
import { parseFields, parseType } from "./parse";
import { brands, customers } from "./schema";
import type { AuthContext } from "./auth";

type Row = typeof customers.$inferSelect;

export const toCustomer = (r: Row, brandName?: string | null): Customer => ({
  id: r.id,
  type: r.type,
  name: r.name ?? "",
  account: r.account,
  phone: r.phone,
  email: r.email,
  location: r.location,
  ...(r.brandId ? { brandId: r.brandId, brandName: brandName ?? "" } : {}),
  ...(r.type === "Company" ? { pin: r.pin ?? "" } : { firstName: r.firstName ?? "", lastName: r.lastName ?? "" }),
});

/**
 * Every customer must have a brand, and it must be one of this company's brands. A request that does not mention
 * the brand keeps the customer's current one (updates only); a customer that has none yet must be given one.
 */
async function brandFrom(ctx: AuthContext, body: Record<string, unknown>, current?: string | null): Promise<string> {
  const raw = body.brandId;
  if (raw === undefined && current) return current;
  if (raw === undefined || raw === null || raw === "") throw new ApiError(422, "Please correct the highlighted fields", { brandId: "Select a brand" });
  const bad = () => new ApiError(422, "Please correct the highlighted fields", { brandId: "Select a valid brand" });
  if (typeof raw !== "string" || !isUuid(raw)) throw bad();
  const all = await loadBrands(getDb(), ctx.tenantId);
  if (!all.some((b) => b.id === raw)) throw bad();
  return raw;
}

function columnsFrom(body: Record<string, unknown>, existingType?: CustomerType) {
  const { brandId: _brand, ...rest } = body;
  void _brand;
  const type = parseType(rest, customerTypes, existingType);
  const names = fieldsByType[type].map((f) => f.name).filter((n) => n !== "brandId");
  const clean = parseFields<FieldName>(rest, names, validateField);
  const contact = validateContact(clean.phone ?? "", clean.email ?? "");
  if (contact.phone) throw new ApiError(422, "Please correct the highlighted fields", contact);
  const c = fromFormValues("", type, clean);
  return {
    type,
    firstName: c.firstName ?? null,
    lastName: c.lastName ?? null,
    companyName: type === "Company" ? c.name : null,
    pin: type === "Company" ? (c.pin ?? "") : null,
    account: c.account,
    phone: c.phone,
    email: c.email,
    location: c.location,
  };
}

type Contact = { account: string; phone: string; email: string };
const ACCOUNT_TAKEN = "This account is already used by another customer";
const taken = (what: string, o: { name: string | null; account: string }) => `This ${what} is already used by ${o.name ?? "another customer"} (${o.account})`;

/**
 * One customer per account, per phone number and per email in a company (phones compare as E.164, emails and accounts
 * ignore case). Checked before saving so the message can name the customer who already has it; the unique indexes
 * (migration 0018) also stop two saves racing each other.
 */
async function ensureUnique(ctx: AuthContext, c: Contact, exceptId?: string) {
  const rows = await getDb()
    .select({ name: customers.name, account: customers.account, phone: customers.phone, email: customers.email })
    .from(customers)
    .where(
      and(
        eq(customers.tenantId, ctx.tenantId),
        exceptId ? sql`${customers.id} <> ${exceptId}::uuid` : undefined,
        sql`(lower(${customers.account}) = lower(${c.account})
          OR (${c.phone} <> '' AND ${customers.phone} = ${c.phone})
          OR (${c.email} <> '' AND lower(${customers.email}) = lower(${c.email})))`,
      ),
    )
    .limit(10);
  const errors: Record<string, string> = {};
  for (const o of rows) {
    if (!errors.account && o.account.toLowerCase() === c.account.toLowerCase()) errors.account = ACCOUNT_TAKEN;
    if (!errors.phone && c.phone && o.phone === c.phone) errors.phone = taken("phone number", o);
    if (!errors.email && c.email && o.email.toLowerCase() === c.email.toLowerCase()) errors.email = taken("email", o);
  }
  if (Object.keys(errors).length) throw new ApiError(409, "This customer already exists", errors);
}

function duplicateAccount(e: unknown): never {
  const index = uniqueViolation(e);
  if (index === "customers_tenant_account_uq") throw new ApiError(409, ACCOUNT_TAKEN, { account: ACCOUNT_TAKEN });
  if (index === "customers_tenant_phone_uq") throw new ApiError(409, "This customer already exists", { phone: "This phone number is already used by another customer" });
  if (index === "customers_tenant_email_uq") throw new ApiError(409, "This customer already exists", { email: "This email is already used by another customer" });
  throw e;
}

const withBrand = () => getDb().select({ c: customers, brandName: brands.name }).from(customers).leftJoin(brands, eq(brands.id, customers.brandId));

export async function listCustomers(ctx: AuthContext): Promise<Customer[]> {
  const rows = await withBrand().where(eq(customers.tenantId, ctx.tenantId)).orderBy(desc(customers.createdAt), desc(customers.id)).limit(5000);
  return rows.map((r) => toCustomer(r.c, r.brandName));
}

export async function getCustomer(ctx: AuthContext, id: string): Promise<Customer | null> {
  const [r] = await withBrand().where(and(eq(customers.id, id), eq(customers.tenantId, ctx.tenantId)));
  return r ? toCustomer(r.c, r.brandName) : null;
}

export async function createCustomer(ctx: AuthContext, body: Record<string, unknown>): Promise<Customer> {
  const cols = columnsFrom(body);
  const brandId = await brandFrom(ctx, body);
  await ensureUnique(ctx, cols);
  try {
    const [r] = await getDb().insert(customers).values({ ...cols, brandId, tenantId: ctx.tenantId }).returning();
    return (await getCustomer(ctx, r.id)) as Customer;
  } catch (e) {
    return duplicateAccount(e);
  }
}

export async function updateCustomer(ctx: AuthContext, id: string, body: Record<string, unknown>): Promise<Customer | null> {
  const db = getDb();
  const [current] = await db.select({ type: customers.type, brandId: customers.brandId }).from(customers).where(and(eq(customers.id, id), eq(customers.tenantId, ctx.tenantId)));
  if (!current) return null;
  const cols = columnsFrom(body, current.type);
  const brandId = await brandFrom(ctx, body, current.brandId);
  await ensureUnique(ctx, cols, id);
  try {
    const [r] = await db
      .update(customers)
      .set({ ...cols, brandId, updatedAt: new Date() })
      .where(and(eq(customers.id, id), eq(customers.tenantId, ctx.tenantId)))
      .returning({ id: customers.id });
    return r ? await getCustomer(ctx, r.id) : null;
  } catch (e) {
    return duplicateAccount(e);
  }
}

export async function deleteCustomer(ctx: AuthContext, id: string): Promise<boolean> {
  const r = await getDb().delete(customers).where(and(eq(customers.id, id), eq(customers.tenantId, ctx.tenantId))).returning({ id: customers.id });
  return r.length > 0;
}
