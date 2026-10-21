import "server-only";
import { sql } from "drizzle-orm";
import { todayInNairobi } from "@/lib/billing";
import { validatePayment, type PaymentMethod, type SalePayment, type SalePayments } from "@/lib/sale-payments";
import type { Sale } from "@/lib/sales";
import type { AuthContext } from "../crm/auth";
import { getDb } from "../crm/db";
import { ApiError, isUuid, uniqueViolation } from "../crm/http";
import { Reader, throwValidation, type Body } from "./body";
import { getSale } from "./sales";
import type { Tx } from "./inventory";

/**
 * Sales → a sale not paid in full → Record payment.
 *
 *   GET  /api/sales/{id}/payments                                              the payments of one sale
 *   POST /api/sales/{id}/payments { amount, method, reference, note, paidOn, clientKey }
 *
 * A payment is saved and added to the sale's amount paid in one transaction, with the sale row locked, so two
 * payments recorded at the same moment cannot together pass the balance. An old sale has no money to collect.
 */

type PaymentRow = {
  id: string;
  amount_minor: string;
  method: PaymentMethod;
  reference: string;
  note: string;
  paid_on: string;
  created_at: string | Date;
  recorded_by: string | null;
};

const toPayment = (r: PaymentRow): SalePayment => ({
  id: r.id,
  amountMinor: Number(r.amount_minor),
  method: r.method,
  reference: r.reference,
  note: r.note,
  paidOn: r.paid_on,
  recordedBy: r.recorded_by,
  createdAt: new Date(r.created_at).toISOString(),
});

type SaleMoney = { total_minor: string; paid_minor: string; old_sale: boolean; sale_day: string };

async function saleMoney(db: Tx | ReturnType<typeof getDb>, tenantId: string, saleId: string, lock = false): Promise<SaleMoney | null> {
  const r = await db.execute<SaleMoney>(sql`
    SELECT total_minor::text, paid_minor::text, old_sale, (created_at AT TIME ZONE 'Africa/Nairobi')::date::text AS sale_day
    FROM sales WHERE id = ${saleId}::uuid AND tenant_id = ${tenantId} ${lock ? sql`FOR UPDATE` : sql``}`);
  return r.rows[0] ?? null;
}

async function paymentsOf(tenantId: string, saleId: string, money: SaleMoney): Promise<SalePayments> {
  const rows = await getDb().execute<PaymentRow>(sql`
    SELECT p.id, p.amount_minor::text, p.method, p.reference, p.note, p.paid_on::text, p.created_at, u.full_name AS recorded_by
    FROM sale_payments p LEFT JOIN users u ON u.id = p.created_by AND u.tenant_id = p.tenant_id
    WHERE p.tenant_id = ${tenantId} AND p.sale_id = ${saleId}::uuid
    ORDER BY p.paid_on, p.created_at, p.id`);
  const payments = rows.rows.map(toPayment);
  const total = Number(money.total_minor);
  const paid = Number(money.paid_minor);
  const later = payments.reduce((a, p) => a + p.amountMinor, 0);
  return { atSaleMinor: paid - later, payments, totalMinor: total, paidMinor: paid, balanceMinor: total - paid };
}

/** GET /api/sales/{id}/payments */
export async function listSalePayments(ctx: AuthContext, saleId: string): Promise<SalePayments | null> {
  if (!isUuid(saleId)) return null;
  const money = await saleMoney(getDb(), ctx.tenantId, saleId);
  return money ? paymentsOf(ctx.tenantId, saleId, money) : null;
}

/** POST /api/sales/{id}/payments — the sale with its new amount paid, and its payments. */
export async function recordSalePayment(ctx: AuthContext, saleId: string, body: Body): Promise<{ sale: Sale; payments: SalePayments } | null> {
  if (!isUuid(saleId)) return null;
  const r = new Reader(body, ["amount", "method", "reference", "note", "paidOn", "clientKey"]);
  const draft = { amount: r.text("amount"), method: r.text("method"), reference: r.text("reference"), note: r.text("note"), paidOn: r.text("paidOn") };
  const clientKey = r.clientKey();
  r.done();

  const result = async () => {
    const sale = await getSale(ctx, saleId);
    const money = await saleMoney(getDb(), ctx.tenantId, saleId);
    return sale && money ? { sale, payments: await paymentsOf(ctx.tenantId, saleId, money) } : null;
  };

  try {
    const saved = await getDb().transaction(async (tx) => {
      // A repeated submit of the same form: the payment is already there.
      if (clientKey) {
        const dup = await tx.execute(sql`SELECT 1 FROM sale_payments WHERE tenant_id = ${ctx.tenantId} AND client_key = ${clientKey} AND sale_id = ${saleId}::uuid`);
        if (dup.rows.length) return "replay" as const;
      }
      const money = await saleMoney(tx, ctx.tenantId, saleId, true);
      if (!money) return null;
      if (money.old_sale) throw new ApiError(422, "An old sale is recorded for tracking only and has no balance to collect.", { form: "An old sale has no balance to collect." });
      const balance = Number(money.total_minor) - Number(money.paid_minor);
      if (balance <= 0) throw new ApiError(422, "This sale is already paid in full.", { form: "This sale is already paid in full." });
      const v = validatePayment(draft, { balanceMinor: balance, saleDate: money.sale_day, today: todayInNairobi() });
      if (!v.value) throwValidation(v.errors as Record<string, string>);
      const p = v.value!;
      await tx.execute(sql`
        INSERT INTO sale_payments (tenant_id, sale_id, client_key, amount_minor, method, reference, note, paid_on, created_by)
        VALUES (${ctx.tenantId}, ${saleId}::uuid, ${clientKey}, ${p.amountMinor}, ${p.method}, ${p.reference}, ${p.note}, ${p.paidOn}::date, ${isUuid(ctx.userId) ? ctx.userId : null}::uuid)`);
      await tx.execute(sql`UPDATE sales SET paid_minor = paid_minor + ${p.amountMinor} WHERE id = ${saleId}::uuid AND tenant_id = ${ctx.tenantId}`);
      return "saved" as const;
    });
    if (saved === null) return null;
  } catch (e) {
    // Two submits of the same form at the same moment: the second finds the first one's payment.
    if (uniqueViolation(e) !== "sale_payments_tenant_client_key_uq") throw e;
  }
  return result();
}
