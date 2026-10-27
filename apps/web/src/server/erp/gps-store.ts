import "server-only";
import { sql } from "drizzle-orm";
import { normalizeDate } from "@/lib/billing";
import type { GpsDevice } from "@/lib/gps-platform";
import { getDb } from "../crm/db";

/** "YYYY-MM-DD HH:mm" (or a plain date) as the platform gave it, else null. */
const seenAt = (v: string | undefined) => (v && /^\d{4}-\d{2}-\d{2}( \d{2}:\d{2})?$/.test(v) ? v : null);

/**
 * Stores what the GPS platform reports about a sold device: model, status, dates and when it last sent data.
 *
 * A device added to the platform recently may have no activation or expiry date yet (the platform fills them in after a
 * while). An empty answer never wipes what is known: each date keeps its last value until the platform gives one,
 * and every page that reads these columns (Billing, Dashboard, SMS, Airtime, Certificates) picks the new dates up as
 * soon as they are stored. A status the platform could not give keeps the last known one, except Expired, which is
 * cleared, as the device may have been renewed.
 */
export async function storeGpsDevice(tenantId: string, saleId: string, d: GpsDevice): Promise<void> {
  await getDb().execute(sql`
    UPDATE package_sales SET
      gps_model = ${d.model},
      gps_status = COALESCE(${d.status ?? null}, CASE WHEN gps_status = 'Expired' THEN NULL ELSE gps_status END),
      gps_activation_date = COALESCE(${normalizeDate(d.activationDate)}, gps_activation_date),
      gps_expiration_date = COALESCE(${normalizeDate(d.expirationDate)}, gps_expiration_date),
      gps_last_seen = COALESCE(${seenAt(d.lastSeen)}, gps_last_seen),
      gps_synced_at = now(),
      gps_status_at = CASE WHEN ${d.status ?? null}::text IS NULL THEN gps_status_at ELSE now() END
    WHERE sale_id = ${saleId}::uuid AND EXISTS (SELECT 1 FROM sales s WHERE s.id = ${saleId}::uuid AND s.tenant_id = ${tenantId})`);
}

/**
 * Stores the live statuses of many devices at once (Track API only), in one statement. Devices the platform gave no
 * status for keep theirs; every device asked is marked as checked now.
 */
export async function storeLiveStatuses(tenantId: string, rows: { saleId: string; status: string | null; lastSeen: string | null }[]): Promise<void> {
  if (!rows.length) return;
  const json = JSON.stringify(rows.map((r) => ({ sale_id: r.saleId, status: r.status, last_seen: seenAt(r.lastSeen ?? undefined) })));
  await getDb().execute(sql`
    UPDATE package_sales ps SET
      gps_status = COALESCE(x.status, ps.gps_status),
      gps_last_seen = COALESCE(x.last_seen, ps.gps_last_seen),
      gps_status_at = now()
    FROM jsonb_to_recordset(${json}::jsonb) AS x(sale_id uuid, status text, last_seen text), sales s
    WHERE ps.sale_id = x.sale_id AND s.id = ps.sale_id AND s.tenant_id = ${tenantId}`);
}
