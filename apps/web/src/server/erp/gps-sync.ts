import "server-only";
import { sql } from "drizzle-orm";
import { getDb } from "../crm/db";
import { asSystem, asTenant } from "../crm/db-scope";
import { billingDevices } from "./billing";
import { liveStatuses, verifyImeis } from "./gps-devices";
import { storeGpsDevice, storeLiveStatuses } from "./gps-store";

/**
 * Background refresh of the devices' GPS details, so every page that reads them (Billing, Dashboard, SMS reminders,
 * Airtime, Certificates) stays current without anyone opening Billing.
 *
 * Each run, for every company with a GPS platform account, it asks for up to PER_RUN devices:
 *  1. first, recently sold devices still without an activation or expiry date (a device added to the platform a short
 *     while ago may not have them yet; they appear after a few hours) — asked again every NEW_DEVICE_MINUTES;
 *  2. then the devices checked longest ago (status and dates), once they are older than STALE_MINUTES.
 * Dates the platform has not set yet never wipe known ones (gps-store.ts).
 */
export const PER_RUN = 500;
/** The live status pass checks at most this many devices per company per run. */
export const STATUS_PER_RUN = 5000;
export const NEW_DEVICE_DAYS = 30;
export const NEW_DEVICE_MINUTES = 10;
export const STALE_MINUTES = 60;

export async function syncGpsDevices(): Promise<{ companies: number; checked: number; failed: number }> {
  const db = getDb();
  // The companies with a GPS account (a system question); each company's devices are then handled in that company only.
  const tenants = (await asSystem(() => db.execute<{ tenant_id: string }>(sql`SELECT DISTINCT tenant_id FROM gps_platform_accounts`))).rows;
  let checked = 0;
  let failed = 0;
  for (const { tenant_id: tenantId } of tenants) await asTenant(tenantId, async () => {
    const due = (await db.execute<{ sale_id: string; imei: string }>(sql`
      SELECT v.sale_id, v.imei FROM (${billingDevices(tenantId)}) v
      WHERE (
          (v.sold_at > now() - make_interval(days => ${NEW_DEVICE_DAYS})
            AND (v.gps_activation_date IS NULL OR (v.card_type <> 'Lifelong Card' AND v.gps_expiration_date IS NULL))
            AND (v.gps_synced_at IS NULL OR v.gps_synced_at < now() - make_interval(mins => ${NEW_DEVICE_MINUTES})))
          OR v.gps_synced_at IS NULL
          OR v.gps_synced_at < now() - make_interval(mins => ${STALE_MINUTES}))
      ORDER BY (v.gps_activation_date IS NULL OR v.gps_expiration_date IS NULL) DESC, v.gps_synced_at ASC NULLS FIRST
      LIMIT ${PER_RUN}`)).rows;
    if (!due.length) return;
    // Real platform accounts only: the development mock is never used in the background.
    const results = await verifyImeis(tenantId, due.map((d) => d.imei), null, false);
    for (const d of due) {
      const r = results.get(d.imei);
      if (r?.ok) {
        await storeGpsDevice(tenantId, d.sale_id, r.device);
        checked++;
      } else failed++;
    }
  });
  return { companies: tenants.length, checked, failed };
}

/**
 * The live status pass (every minute, see gps-scheduler.ts): asks the Track API for the status of every tracked device
 * whose status was checked longer ago than `freshSeconds`, so the Dashboard's device counts and Billing's totals stay
 * live without anyone opening each customer. Cheap: one request per 100 devices, no device details.
 */
export async function syncLiveStatus(freshSeconds: number): Promise<{ companies: number; checked: number; answered: number }> {
  const db = getDb();
  // The companies with a GPS account (a system question); each company's devices are then handled in that company only.
  const tenants = (await asSystem(() => db.execute<{ tenant_id: string }>(sql`SELECT DISTINCT tenant_id FROM gps_platform_accounts`))).rows;
  let checked = 0;
  let answered = 0;
  for (const { tenant_id: tenantId } of tenants) await asTenant(tenantId, async () => {
    const due = (await db.execute<{ sale_id: string; imei: string }>(sql`
      SELECT v.sale_id, v.imei FROM (${billingDevices(tenantId)}) v
      WHERE v.gps_status_at IS NULL OR v.gps_status_at < now() - make_interval(secs => ${freshSeconds})
      ORDER BY v.gps_status_at ASC NULLS FIRST
      LIMIT ${STATUS_PER_RUN}`)).rows;
    if (!due.length) return;
    const live = await liveStatuses(tenantId, due.map((d) => d.imei));
    await storeLiveStatuses(tenantId, due.map((d) => {
      const s = live.get(d.imei);
      return { saleId: d.sale_id, status: s?.status ?? null, lastSeen: s?.lastSeen ?? null };
    }));
    checked += due.length;
    answered += live.size;
  });
  return { companies: tenants.length, checked, answered };
}
