import "server-only";
import { randomInt } from "node:crypto";
import { sql } from "drizzle-orm";
import { INVOICE_STATUSES, MAX_LINES, validateInvoice, type DraftLine, type Invoice, type InvoiceDraft, type InvoiceSale, type InvoiceStatus } from "@/lib/invoices";
import type { AuthContext } from "../crm/auth";
import { loadBrands } from "../crm/brands";
import { getDb } from "../crm/db";
import { asSystem } from "../crm/db-scope";
import { ApiError, isUuid } from "../crm/http";

/**
 * Documents → Invoices. Any signed-in user of the company can create invoices (day-to-day work, like recording a sale).
 */

type Body = Record<string, unknown>;
const invalid = (errors: Record<string, unknown>): never => {
  throw new ApiError(422, "Please correct the highlighted fields", errors as Record<string, string>);
};

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const verifyCode = () => Array.from({ length: 10 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("");

type Row = {
  id: string; number: string; verify_code: string; customer_id: string; brand_id: string; title: string; invoice_date: string; due_date: string;
  status: InvoiceStatus; payment_method: string; payment_details: string; vat: boolean; vat_rate: number; items_minor: string; expenses_minor: string;
  vat_minor: string; total_minor: string; customer_name: string; customer_phone: string; customer_email: string; customer_location: string;
  brand_name: string; brand_tagline: string; brand_phone: string; brand_email: string; brand_website: string; brand_location: string; director_name: string;
  created_at: Date | string; paid_at: Date | string | null; created_by_name: string | null;
};

async function readInvoices(tenantId: string, where: ReturnType<typeof sql>, limit: number, withLines: boolean): Promise<Invoice[]> {
  const db = getDb();
  const r = await db.execute<Row>(sql`
    SELECT i.id, i.number, i.verify_code, i.customer_id, i.brand_id, i.title, to_char(i.invoice_date, 'YYYY-MM-DD') AS invoice_date,
           to_char(i.due_date, 'YYYY-MM-DD') AS due_date, i.status, i.payment_method, i.payment_details, i.vat, i.vat_rate, i.items_minor,
           i.expenses_minor, i.vat_minor, i.total_minor, i.customer_name, i.customer_phone, i.customer_email, i.customer_location, i.brand_name,
           i.brand_tagline, i.brand_phone, i.brand_email, i.brand_website, i.brand_location, i.director_name, i.created_at, i.paid_at,
           u.full_name AS created_by_name
    FROM invoices i LEFT JOIN users u ON u.id = i.created_by AND u.tenant_id = i.tenant_id
    WHERE i.tenant_id = ${tenantId} AND ${where}
    ORDER BY i.created_at DESC, i.number DESC
    LIMIT ${limit}`);
  const ids = r.rows.map((x) => x.id);
  const lines = new Map<string, Invoice["lines"]>();
  if (withLines && ids.length) {
    const lr = await db.execute<{ invoice_id: string; kind: "item" | "expense"; sale_id: string | null; name: string; quantity: string; unit_price_minor: string; total_minor: string }>(sql`
      SELECT invoice_id, kind, sale_id, name, quantity, unit_price_minor, total_minor FROM invoice_lines
      WHERE tenant_id = ${tenantId} AND invoice_id IN (${sql.join(ids.map((i) => sql`${i}::uuid`), sql`, `)})
      ORDER BY invoice_id, position`);
    for (const l of lr.rows) {
      const list = lines.get(l.invoice_id) ?? [];
      list.push({ kind: l.kind, saleId: l.sale_id, name: l.name, quantity: Number(l.quantity), unitPriceMinor: Number(l.unit_price_minor), totalMinor: Number(l.total_minor) });
      lines.set(l.invoice_id, list);
    }
  }
  const brands = new Map((await loadBrands(db, tenantId)).map((b) => [b.id, b]));
  return r.rows.map((x) => {
    const b = brands.get(x.brand_id);
    return {
      id: x.id, number: x.number, verifyCode: x.verify_code, customerId: x.customer_id, brandId: x.brand_id, title: x.title, invoiceDate: x.invoice_date,
      dueDate: x.due_date, status: x.status, paymentMethod: x.payment_method, paymentDetails: x.payment_details, vat: x.vat, vatRate: x.vat_rate,
      itemsMinor: Number(x.items_minor), expensesMinor: Number(x.expenses_minor), vatMinor: Number(x.vat_minor), totalMinor: Number(x.total_minor),
      customerName: x.customer_name, customerPhone: x.customer_phone, customerEmail: x.customer_email, customerLocation: x.customer_location,
      brand: {
        name: x.brand_name, tagline: x.brand_tagline, phone: x.brand_phone, email: x.brand_email, website: x.brand_website, location: x.brand_location,
        directorName: x.director_name, logoUrl: b?.logoUrl ?? null, iconUrl: b?.iconUrl ?? null, signatureUrl: b?.signatureUrl ?? null, color: b?.color ?? "",
      },
      lines: lines.get(x.id) ?? [],
      createdAt: new Date(x.created_at).toISOString(),
      createdByName: x.created_by_name,
      paidAt: x.paid_at ? new Date(x.paid_at).toISOString() : null,
    };
  });
}

/** GET /api/invoices — newest first (without their lines). */
export const listInvoices = (ctx: AuthContext) => readInvoices(ctx.tenantId, sql`true`, 2000, false);

/** GET /api/invoices/{id} */
export async function getInvoice(ctx: AuthContext, id: string): Promise<Invoice | null> {
  if (!isUuid(id)) return null;
  return (await readInvoices(ctx.tenantId, sql`i.id = ${id}::uuid`, 1, true))[0] ?? null;
}

/** GET /api/invoices/customers/{id}/sales — the customer's sales, each with the invoice lines it would add. */
export async function listCustomerSales(ctx: AuthContext, customerId: string): Promise<InvoiceSale[] | null> {
  if (!isUuid(customerId)) return null;
  const db = getDb();
  const [c] = (await db.execute<{ id: string }>(sql`SELECT id FROM customers WHERE id = ${customerId}::uuid AND tenant_id = ${ctx.tenantId}`)).rows;
  if (!c) return null;
  const r = await db.execute<{
    id: string; type: string; date: string; total_minor: string; package_name: string | null; tracker: string | null; plate: string | null; imei: string | null;
    retail: { name: string; quantity: number; unitPriceMinor: number }[] | null; invoiced: number;
  }>(sql`
    SELECT s.id, s.type, to_char(s.created_at AT TIME ZONE 'Africa/Nairobi', 'YYYY-MM-DD') AS date, s.total_minor,
           ps.package_name, COALESCE(NULLIF(ps.tracker_model, ''), NULLIF(ps.gps_model, '')) AS tracker, ps.vehicle_plate AS plate, ps.imei,
           (SELECT json_agg(x ORDER BY x.pos) FROM (
              SELECT rp.position AS pos, trim(rp.category_name || ' ' || rp.model) AS name, rp.quantity, rp.unit_price_minor::bigint AS "unitPriceMinor" FROM retailer_product_lines rp WHERE rp.sale_id = s.id
              UNION ALL
              SELECT 1000 + rc.position, rc.platform_name || ' ' || rc.card_type, rc.quantity, rc.unit_price_minor::bigint FROM retailer_card_lines rc WHERE rc.sale_id = s.id
           ) x) AS retail,
           (SELECT count(DISTINCT il.invoice_id)::int FROM invoice_lines il WHERE il.tenant_id = s.tenant_id AND il.sale_id = s.id) AS invoiced
    FROM sales s LEFT JOIN package_sales ps ON ps.sale_id = s.id
    WHERE s.tenant_id = ${ctx.tenantId} AND s.customer_id = ${customerId}::uuid
    ORDER BY s.created_at DESC
    LIMIT 200`);
  return r.rows.map((x) => {
    const total = Number(x.total_minor);
    const lines = x.type === "Retailer Sale" && x.retail?.length
      ? x.retail.map((l) => ({ name: l.name, quantity: Number(l.quantity), unitPriceMinor: Number(l.unitPriceMinor) }))
      : [{
          name: [x.package_name, x.tracker ? `GPS tracker ${x.tracker}` : "GPS tracker", x.plate || (x.imei ? `IMEI ${x.imei}` : "")].filter(Boolean).join(" · "),
          quantity: 1,
          unitPriceMinor: total,
        }];
    return { saleId: x.id, type: x.type, date: x.date, totalMinor: total, lines, invoiced: x.invoiced };
  });
}

/** GET /api/invoices/payment-defaults/{brandId} — the payment method and details of the brand's last invoice. */
export async function paymentDefaults(ctx: AuthContext, brandId: string): Promise<{ id: string; paymentMethod: string; paymentDetails: string } | null> {
  if (!isUuid(brandId)) return null;
  const [x] = (await getDb().execute<{ payment_method: string; payment_details: string }>(sql`
    SELECT payment_method, payment_details FROM invoices WHERE tenant_id = ${ctx.tenantId} AND brand_id = ${brandId}::uuid AND payment_method <> ''
    ORDER BY created_at DESC LIMIT 1`)).rows;
  return { id: brandId, paymentMethod: x?.payment_method ?? "", paymentDetails: x?.payment_details ?? "" };
}

const FIELDS = ["customerId", "brandId", "title", "invoiceDate", "dueDate", "paymentMethod", "paymentDetails", "vat", "lines"] as const;

function readDraft(body: Body): InvoiceDraft {
  const extra = Object.keys(body).filter((k) => !(FIELDS as readonly string[]).includes(k));
  if (extra.length) invalid(Object.fromEntries(extra.map((k) => [k, "This field is not accepted"])));
  const text = (k: string) => {
    const v = body[k];
    if (v === undefined) return "";
    if (typeof v !== "string") invalid({ [k]: "Must be text" });
    return v as string;
  };
  if (body.vat !== undefined && typeof body.vat !== "boolean") invalid({ vat: "Must be true or false" });
  if (!Array.isArray(body.lines)) invalid({ lines: "Add at least one item" });
  const raw = body.lines as unknown[];
  if (raw.length > MAX_LINES) invalid({ lines: `An invoice can have up to ${MAX_LINES} lines` });
  const lines: DraftLine[] = raw.map((l, i) => {
    const o = (l ?? {}) as Record<string, unknown>;
    const kind = o.kind === "expense" ? "expense" : o.kind === "item" ? "item" : null;
    if (!kind || typeof o.name !== "string" || typeof o.unitPrice !== "string" || (kind === "item" && typeof o.quantity !== "string")
      || (o.saleId !== undefined && o.saleId !== null && typeof o.saleId !== "string")) invalid({ lines: `Line ${i + 1} is not valid` });
    return { key: String(i), kind: kind!, saleId: (o.saleId as string | null | undefined) || null, name: o.name as string, quantity: kind === "expense" ? "1" : (o.quantity as string), unitPrice: o.unitPrice as string };
  });
  return {
    customerId: text("customerId"), brandId: text("brandId"), title: text("title"), invoiceDate: text("invoiceDate"), dueDate: text("dueDate"),
    paymentMethod: text("paymentMethod"), paymentDetails: text("paymentDetails"), vat: body.vat === true, lines,
  };
}

/** POST /api/invoices — creates an invoice and gives it the next number for this year (INV-2026-000013). */
export async function createInvoice(ctx: AuthContext, body: Body): Promise<Invoice> {
  const d = readDraft(body);
  const { errors, value, totals } = validateInvoice(d);
  const db = getDb();
  const customer = isUuid(d.customerId)
    ? (await db.execute<{ id: string; name: string; phone: string; email: string; location: string }>(sql`SELECT id, name, phone, email, location FROM customers WHERE id = ${d.customerId}::uuid AND tenant_id = ${ctx.tenantId}`)).rows[0]
    : undefined;
  if (d.customerId && !customer) errors.customerId = "Select a customer";
  const brand = isUuid(d.brandId) ? (await loadBrands(db, ctx.tenantId)).find((b) => b.id === d.brandId) : undefined;
  if (d.brandId && !brand) errors.brandId = "Select a brand";
  // A line from a sale must be one of this customer's sales.
  const saleIds = [...new Set(value.lines.map((l) => l.saleId).filter((s): s is string => !!s))];
  if (saleIds.some((s) => !isUuid(s))) errors.lines = "A line refers to a sale that does not exist";
  else if (saleIds.length && customer) {
    const own = (await db.execute<{ id: string }>(sql`SELECT id FROM sales WHERE tenant_id = ${ctx.tenantId} AND customer_id = ${customer.id}::uuid AND id IN (${sql.join(saleIds.map((s) => sql`${s}::uuid`), sql`, `)})`)).rows;
    if (own.length !== saleIds.length) errors.lines = "A line refers to a sale of another customer";
  }
  if (Object.keys(errors).length || !customer || !brand) return invalid(errors);

  const year = value.invoiceDate.slice(0, 4);
  const stem = `INV-${year}-`;
  for (let attempt = 0; attempt < 5; attempt++) {
    const [{ n }] = (await db.execute<{ n: number }>(sql`
      SELECT COALESCE(MAX(substring(number from ${`^${stem}(\\d+)$`})::int), 0) + 1 AS n FROM invoices WHERE tenant_id = ${ctx.tenantId} AND number LIKE ${`${stem}%`}`)).rows;
    const number = `${stem}${String(n).padStart(6, "0")}`;
    try {
      const id = await db.transaction(async (tx) => {
        const [row] = (await tx.execute<{ id: string }>(sql`
          INSERT INTO invoices (tenant_id, number, verify_code, customer_id, brand_id, title, invoice_date, due_date, payment_method, payment_details, vat, vat_rate,
            items_minor, expenses_minor, vat_minor, total_minor, customer_name, customer_phone, customer_email, customer_location, brand_name, brand_tagline,
            brand_phone, brand_email, brand_website, brand_location, director_name, created_by)
          VALUES (${ctx.tenantId}, ${number}, ${verifyCode()}, ${customer.id}::uuid, ${brand.id}::uuid, ${value.title}, ${value.invoiceDate}::date, ${value.dueDate}::date,
            ${value.paymentMethod}, ${value.paymentDetails}, ${value.vat}, 16, ${totals.itemsMinor}, ${totals.expensesMinor}, ${totals.vatMinor}, ${totals.totalMinor},
            ${customer.name}, ${customer.phone}, ${customer.email}, ${customer.location}, ${brand.name}, ${brand.tagline}, ${brand.phone}, ${brand.email},
            ${brand.website}, ${brand.location}, ${brand.directorName}, ${isUuid(ctx.userId) ? ctx.userId : null}::uuid)
          RETURNING id`)).rows;
        for (const [i, l] of value.lines.entries()) {
          await tx.execute(sql`
            INSERT INTO invoice_lines (invoice_id, tenant_id, position, kind, sale_id, name, quantity, unit_price_minor, total_minor)
            VALUES (${row.id}::uuid, ${ctx.tenantId}, ${i}, ${l.kind}, ${l.saleId}::uuid, ${l.name}, ${l.quantity}, ${l.unitPriceMinor}, ${l.totalMinor})`);
        }
        return row.id;
      });
      return (await getInvoice(ctx, id))!;
    } catch (e) {
      const code = ((e as { cause?: { code?: string } }).cause ?? (e as { code?: string })).code;
      if (code !== "23505") throw e;
    }
  }
  throw new ApiError(409, "Another invoice was created at the same moment. Please try again.");
}

/** PATCH /api/invoices/{id} { status: "Paid" | "Unpaid" } */
export async function setInvoiceStatus(ctx: AuthContext, id: string, body: Body): Promise<Invoice | null> {
  const extra = Object.keys(body).filter((k) => k !== "status");
  if (extra.length) invalid(Object.fromEntries(extra.map((k) => [k, "This field is not accepted"])));
  const status = body.status;
  if (typeof status !== "string" || !(INVOICE_STATUSES as readonly string[]).includes(status)) return invalid({ status: "Choose Paid or Unpaid" });
  if (!isUuid(id)) return null;
  const r = await getDb().execute(sql`
    UPDATE invoices SET status = ${status}, paid_at = ${status === "Paid" ? sql`COALESCE(paid_at, now())` : sql`NULL`}
    WHERE id = ${id}::uuid AND tenant_id = ${ctx.tenantId}`);
  if (!r.rowCount) return null;
  return getInvoice(ctx, id);
}

/** What the public verification page shows for an invoice: enough to confirm it, no contact details. */
export type InvoiceCheck = { verifyCode: string; number: string; status: InvoiceStatus; customerName: string; brandName: string; invoiceDate: string; dueDate: string; totalMinor: number; title: string };

/** /verify/{code} for an invoice (public, no sign-in). The customer's name is shortened; no phone, email or address. */
export const checkInvoice = (code: string) => asSystem(() => checkInvoiceAny(code));

/** Looks the code up in every company (system scope: the public verify page has no signed-in user). */
async function checkInvoiceAny(code: string): Promise<InvoiceCheck | null> {
  const c = code.trim().toUpperCase();
  if (!/^[A-Z0-9]{10}$/.test(c)) return null;
  const [x] = (await getDb().execute<{ verify_code: string; number: string; status: InvoiceStatus; customer_name: string; brand_name: string; invoice_date: string; due_date: string; total_minor: string; title: string }>(sql`
    SELECT verify_code, number, status, customer_name, brand_name, to_char(invoice_date, 'YYYY-MM-DD') AS invoice_date, to_char(due_date, 'YYYY-MM-DD') AS due_date, total_minor, title
    FROM invoices WHERE verify_code = ${c}`)).rows;
  if (!x) return null;
  const words = x.customer_name.trim().split(/\s+/);
  const customerName = words.length > 1 ? `${words[0]} ${words.slice(1).map((w) => `${w[0]}.`).join(" ")}` : words[0];
  return { verifyCode: x.verify_code, number: x.number, status: x.status, customerName, brandName: x.brand_name, invoiceDate: x.invoice_date, dueDate: x.due_date, totalMinor: Number(x.total_minor), title: x.title };
}
