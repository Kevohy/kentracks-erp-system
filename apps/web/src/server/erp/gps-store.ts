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
      gps_synced_at = now()
    WHERE sale_id = ${saleId}::uuid AND EXISTS (SELECT 1 FROM sales s WHERE s.id = ${saleId}::uuid AND s.tenant_id = ${tenantId})`);
}
