import "server-only";
import { sql } from "drizzle-orm";
import { airtimeAllowed } from "@/lib/sale-validation";
import { SIM_SERVICES, simServiceOf, type Sale, type SimService } from "@/lib/sales";
import { requireAdmin, type AuthContext } from "../crm/auth";
import { getDb } from "../crm/db";
import { isUuid } from "../crm/http";
import { Reader, throwValidation, type Body } from "./body";
import { getSale } from "./sales";

/**
 * The airtime service of a sold tracker SIM (None / SMS reminder / Automatic airtime recharge) can be changed after
 * the sale: from the sale's details, or from Communication → Airtime ("Add subscription", "Remove from airtime").
 * The sale keeps one current choice (sms_reminder / auto_recharge on package_sales), so Billing, Bulk SMS and Airtime
 * all read the same record, and every change is logged in sale_service_changes so the previous choice is never lost.
 */

type SaleSim = { sale_type: "Package Sale" | "Hosting Sale"; sim_type: string; sms_reminder: boolean; auto_recharge: boolean };

async function saleSim(tenantId: string, saleId: string): Promise<SaleSim | null> {
  if (!isUuid(saleId)) return null;
  const r = await getDb().execute<SaleSim>(sql`
    SELECT s.type AS sale_type, sc.type::text AS sim_type, ps.sms_reminder, ps.auto_recharge
    FROM package_sales ps JOIN sales s ON s.id = ps.sale_id JOIN sim_cards sc ON sc.id = ps.sim_card_id
    WHERE ps.sale_id = ${saleId}::uuid AND s.tenant_id = ${tenantId}`);
  return r.rows[0] ?? null;
}

export type ServiceChange = { to: SimService; reason: string; sms?: { status: "Sent" | "Failed"; error: string | null } | null };

/**
 * Sets the service and logs the change in one transaction. Leaving automatic airtime also removes its approval.
 * Returns null when the sale is not one of this company's Package/Hosting sales.
 */
export async function applyServiceChange(ctx: AuthContext, saleId: string, change: ServiceChange): Promise<{ from: SimService } | null> {
  const cur = await saleSim(ctx.tenantId, saleId);
  if (!cur) return null;
  const from = simServiceOf(cur.sms_reminder, cur.auto_recharge);
  if (from === change.to) throwValidation({ service: `This sale already has: ${from}` });
  if (change.to !== "None" && !airtimeAllowed(cur.sale_type, cur.sim_type)) {
    throwValidation({ service: `A ${cur.sim_type} SIM on a ${cur.sale_type} cannot have airtime services (only prepaid SIMs, or a non-IoT SIM on a Hosting Sale).` });
  }
  // Leaving automatic airtime deletes its approved plan, and approving or stopping a plan is an administrator's job
  // (Communication → Airtime): staff could otherwise undo an approval from the sale's details.
  if (from === "Automatic airtime recharge" && change.to !== from) {
    const plan = await getDb().execute(sql`SELECT 1 FROM airtime_plans WHERE sale_id = ${saleId}::uuid AND tenant_id = ${ctx.tenantId}`);
    if (plan.rows.length) requireAdmin(ctx, "stop an approved automatic airtime plan");
  }
  const by = isUuid(ctx.userId) ? ctx.userId : null;
  await getDb().transaction(async (tx) => {
    await tx.execute(sql`
      UPDATE package_sales SET sms_reminder = ${change.to === "SMS reminder"}, auto_recharge = ${change.to === "Automatic airtime recharge"}
      WHERE sale_id = ${saleId}::uuid AND EXISTS (SELECT 1 FROM sales s WHERE s.id = ${saleId}::uuid AND s.tenant_id = ${ctx.tenantId})`);
    if (change.to !== "Automatic airtime recharge") await tx.execute(sql`DELETE FROM airtime_plans WHERE sale_id = ${saleId}::uuid AND tenant_id = ${ctx.tenantId}`);
    await tx.execute(sql`
      INSERT INTO sale_service_changes (tenant_id, sale_id, kind, from_service, to_service, reason, sms_status, sms_error, changed_by)
      VALUES (${ctx.tenantId}, ${saleId}::uuid, 'Service', ${from}, ${change.to}, ${change.reason}, ${change.sms?.status ?? null}, ${change.sms?.error ?? null}, ${by}::uuid)`);
  });
  return { from };
}

/** POST /api/sales/{id}/sim-service { service, reason } — change the airtime service of a sold tracker SIM. */
export async function changeSimService(ctx: AuthContext, saleId: string, body: Body): Promise<Sale | null> {
  const r = new Reader(body, ["service", "reason"]);
  const to = r.text("service") as SimService;
  const reason = r.text("reason").trim();
  r.done();
  if (!SIM_SERVICES.includes(to)) throwValidation({ service: "Choose None, SMS reminder or Automatic airtime recharge" });
  if (reason.length > 300) throwValidation({ reason: "Keep the reason under 300 characters" });
  const done = await applyServiceChange(ctx, saleId, { to, reason });
  if (!done) return null;
  return getSale(ctx, saleId);
}

/**
 * Records that automatic airtime was suspended or resumed for these sales (the service itself is unchanged), so the
 * sale's history shows it. `by` null means it happened automatically (the device reached its expiry date).
 */
export async function logAirtimeEvent(tenantId: string, saleIds: string[], kind: "Suspended" | "Resumed", reason: string, by: string | null): Promise<void> {
  if (!saleIds.length) return;
  await getDb().execute(sql`
    INSERT INTO sale_service_changes (tenant_id, sale_id, kind, from_service, to_service, reason, changed_by)
    SELECT ${tenantId}, s.id, ${kind}, 'Automatic airtime recharge', 'Automatic airtime recharge', ${reason}, ${by}::uuid
    FROM sales s WHERE s.tenant_id = ${tenantId} AND s.id IN (${sql.join(saleIds.map((id) => sql`${id}::uuid`), sql`, `)})`);
}
