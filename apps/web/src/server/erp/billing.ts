import "server-only";
import { sql, type SQL } from "drizzle-orm";
import {
  billingFilters,
  EXPIRY_WINDOW_DAYS,
  LIVE_REFRESH_SECONDS,
  normalizeDate,
  type BillingCustomer,
  type BillingFilter,
  type BillingPage,
  type BillingSyncResult,
  type BillingTotals,
  type BillingVehicle,
} from "@/lib/billing";
import type { GpsStatus } from "@/lib/gps-platform";
import type { AuthContext } from "../crm/auth";
import { getDb } from "../crm/db";
import { isUuid } from "../crm/http";
import { Reader, throwValidation, type Body } from "./body";
import { parseMoney } from "@/lib/purchase-validation";
import { MAX_AMOUNT_MINOR } from "@/lib/sale-validation";
import { verifyImeisOnServer } from "./gps";

const PAGE_MAX = 50;
const SYNC_MAX_CUSTOMERS = 50;
const SYNC_MAX_DEVICES = 500;
const SYNC_CONCURRENCY = 6;

/**
 * The latest Package/Hosting sale of every IMEI in the company (a device sold again belongs to its newest sale),
 * with the expiry date billing works from: GPSPlatform's latest date, else the one recorded at sale.
 * A Lifelong Card never expires.
 */
export const billingDevices = (tenantId: string) => sql`
  SELECT DISTINCT ON (ps.imei)
    ps.*, s.customer_id, s.type AS sale_type, s.created_at AS sold_at,
    CASE WHEN ps.card_type = 'Lifelong Card' THEN NULL
         ELSE kt_safe_date(COALESCE(ps.gps_expiration_date, ps.platform_expiration_date)) END AS expires
  FROM package_sales ps JOIN sales s ON s.id = ps.sale_id
  WHERE s.tenant_id = ${tenantId} AND s.type IN ('Package Sale', 'Hosting Sale')
  ORDER BY ps.imei, s.created_at DESC, s.id DESC`;

const today = sql.raw(`(now() AT TIME ZONE 'Africa/Nairobi')::date`);
const isExpired = sql`(v.card_type <> 'Lifelong Card' AND (v.expires < ${today} OR v.gps_status = 'Expired'))`;
const isSoon = sql`(v.expires BETWEEN ${today} AND ${today} + ${EXPIRY_WINDOW_DAYS}::int AND v.gps_status IS DISTINCT FROM 'Expired')`;
const isOffline = sql`(v.gps_status = 'Offline')`;
const isOnline = sql`(v.gps_status = 'Online')`;
const isUnknown = sql`(v.gps_status IS NULL)`;

function filterSql(f: BillingFilter): SQL {
  if (f === "Expired") return isExpired;
  if (f === "Expiring soon") return isSoon;
  if (f === "Offline") return isOffline;
  if (f === "Online") return isOnline;
  if (f === "Unknown") return isUnknown;
  return sql`TRUE`;
}

type VehicleRow = {
  customer_id: string;
  sale_id: string;
  imei: string;
  vehicle_plate: string;
  gps_account: string;
  gps_model: string | null;
  tracker_model: string | null;
  package_name: string;
  sale_type: "Package Sale" | "Hosting Sale";
  platform_name: string;
  card_type: string;
  gps_status: string | null;
  sim_number: string;
  sim_name: string;
  sim_type: string | null;
  gps_activation_date: string | null;
  expires_text: string | null;
  renewal_text: string | null;
  technician_name: string | null;
  gps_synced_at: string | Date | null;
  sold_at: string | Date;
};

const iso = (v: string | Date | null) => (v == null ? null : new Date(v).toISOString());
const STATUSES: readonly string[] = ["Online", "Offline", "Expired"];

function toVehicle(r: VehicleRow): BillingVehicle {
  const soldAt = iso(r.sold_at)!;
  return {
    imei: r.imei,
    vehiclePlate: r.vehicle_plate,
    gpsAccount: r.gps_account,
    deviceModel: r.gps_model ?? r.tracker_model,
    packageName: r.package_name,
    saleType: r.sale_type,
    platformName: r.platform_name,
    cardType: r.card_type,
    status: r.gps_status && STATUSES.includes(r.gps_status) ? (r.gps_status as GpsStatus) : null,
    simNumber: r.sim_number,
    simName: r.sim_name,
    simType: r.sim_type ?? "",
    // The platform's activation date, else the day the device was sold.
    activationDate: normalizeDate(r.gps_activation_date) ?? soldAt.slice(0, 10),
    expirationDate: normalizeDate(r.expires_text),
    renewalFeeMinor: r.renewal_text == null ? null : Number(r.renewal_text),
    technicianName: r.technician_name,
    checkedAt: iso(r.gps_synced_at),
    saleId: r.sale_id,
    soldAt,
  };
}

/** Customers (with every one of their vehicles), in the given order. */
async function loadCustomers(tenantId: string, ids: string[]): Promise<BillingCustomer[]> {
  if (ids.length === 0) return [];
  const db = getDb();
  const idList = sql.join(ids.map((id) => sql`${id}::uuid`), sql`, `);
  const [cust, veh] = await Promise.all([
    db.execute<{ id: string; name: string; account: string; phone: string; email: string; brand_name: string | null }>(sql`
      SELECT c.id, c.name, c.account, c.phone, c.email, b.name AS brand_name
      FROM customers c LEFT JOIN brands b ON b.id = c.brand_id
      WHERE c.tenant_id = ${tenantId} AND c.id IN (${idList})`),
    db.execute<VehicleRow>(sql`
      SELECT v.*, v.expires::text AS expires_text, v.renewal_fee_minor::text AS renewal_text, sc.type::text AS sim_type
      FROM (${billingDevices(tenantId)}) v LEFT JOIN sim_cards sc ON sc.id = v.sim_card_id
      WHERE v.customer_id IN (${idList})
      ORDER BY v.vehicle_plate, v.imei`),
  ]);
  const byCustomer = new Map<string, BillingVehicle[]>();
  for (const r of veh.rows) {
    const list = byCustomer.get(r.customer_id) ?? [];
    list.push(toVehicle(r));
    byCustomer.set(r.customer_id, list);
  }
  const map = new Map(cust.rows.map((c) => [c.id, c]));
  return ids
    .map((id) => map.get(id))
    .filter((c) => c !== undefined)
    .map((c) => ({ id: c.id, name: c.name, account: c.account, phone: c.phone, email: c.email, brandName: c.brand_name, vehicles: byCustomer.get(c.id) ?? [] }));
}

/**
 * GET /api/billing — one page of customers who own tracked vehicles, with every vehicle, plus totals.
 * Search and the status filter run in the database, so it stays quick with many customers and devices.
 */
export async function listBillingPage(ctx: AuthContext, url: URL): Promise<BillingPage> {
  const p = url.searchParams;
  const limit = Math.min(Math.max(Number(p.get("limit")) || 20, 1), PAGE_MAX);
  const offset = Math.max(Number(p.get("offset")) || 0, 0);
  const q = (p.get("q") ?? "").trim().slice(0, 100);
  const filter = (p.get("filter") || "All") as BillingFilter;
  if (!billingFilters.includes(filter)) throwValidation({ filter: `Filter must be one of: ${billingFilters.join(", ")}` });

  const like = `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
  // A customer matches the search by name, account, phone or email, or by any of their vehicles' plate, IMEI, SIM or GPS account.
  const search = q
    ? sql`(c.name ILIKE ${like} OR c.account ILIKE ${like} OR c.phone ILIKE ${like} OR c.email ILIKE ${like}
          OR v.vehicle_plate ILIKE ${like} OR v.imei ILIKE ${like} OR v.sim_number ILIKE ${like} OR v.gps_account ILIKE ${like})`
    : sql`TRUE`;
  // The search may match a customer through one vehicle; their other vehicles still count.
  const scope = sql`
    WITH v AS (${billingDevices(ctx.tenantId)}),
    hit AS (SELECT DISTINCT c.id FROM customers c JOIN v ON v.customer_id = c.id WHERE c.tenant_id = ${ctx.tenantId} AND ${search}),
    sv AS (SELECT v.* FROM v JOIN hit ON hit.id = v.customer_id)`;

  const db = getDb();
  const [page, totals] = await Promise.all([
    db.execute<{ id: string }>(sql`${scope}
      SELECT c.id FROM customers c
      WHERE c.tenant_id = ${ctx.tenantId} AND EXISTS (SELECT 1 FROM sv v WHERE v.customer_id = c.id AND ${filterSql(filter)})
      ORDER BY c.name, c.id
      LIMIT ${limit + 1} OFFSET ${offset}`),
    db.execute<Record<keyof BillingTotals, string>>(sql`${scope}
      SELECT
        (SELECT count(DISTINCT v.customer_id) FROM sv v WHERE ${filterSql(filter)})::text AS "customers",
        count(*)::text AS "vehicles",
        count(*) FILTER (WHERE v.gps_status = 'Online')::text AS "online",
        count(*) FILTER (WHERE ${isOffline})::text AS "offline",
        count(*) FILTER (WHERE ${isUnknown})::text AS "unknown",
        count(*) FILTER (WHERE v.renewal_fee_minor IS NOT NULL AND (${isSoon} OR ${isExpired}))::text AS "renewalsDue",
        count(*) FILTER (WHERE ${isSoon})::text AS "expiringSoon",
        count(*) FILTER (WHERE ${isExpired})::text AS "expired",
        coalesce(sum(v.renewal_fee_minor) FILTER (WHERE ${isSoon} OR ${isExpired}), 0)::text AS "renewalDueMinor"
      FROM sv v`),
  ]);
  const more = page.rows.length > limit;
  const ids = page.rows.slice(0, limit).map((r) => r.id);
  const t = totals.rows[0];
  const num = (k: keyof BillingTotals) => Number(t?.[k] ?? 0);
  return {
    items: await loadCustomers(ctx.tenantId, ids),
    nextOffset: more ? offset + limit : null,
    totals: {
      customers: num("customers"),
      vehicles: num("vehicles"),
      online: num("online"),
      offline: num("offline"),
      expiringSoon: num("expiringSoon"),
      expired: num("expired"),
      unknown: num("unknown"),
      renewalsDue: num("renewalsDue"),
      renewalDueMinor: num("renewalDueMinor"),
    },
  };
}

/** Runs `fn` over `items`, at most `n` at a time. */
async function pool<T>(items: T[], n: number, fn: (t: T) => Promise<void>) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) await fn(items[i++]);
  }));
}

/**
 * POST /api/billing/sync { customerIds, force? } — asks GPSPlatform for the current model, status, activation and
 * expiry of these customers' devices and stores them. Without `force`, a device checked within the last
 * LIVE_REFRESH_SECONDS (less a little slack) is not asked again, so several open pages do not multiply the calls. Returns the customers again with fresh details.
 */
export async function syncBilling(ctx: AuthContext, body: Body): Promise<BillingSyncResult> {
  const raw = body.customerIds;
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > SYNC_MAX_CUSTOMERS || !raw.every((x) => typeof x === "string" && isUuid(x))) {
    throwValidation({ customerIds: `Send between 1 and ${SYNC_MAX_CUSTOMERS} customer ids` });
  }
  const ids = [...new Set(raw as string[])];
  const force = body.force === true;
  const idList = sql.join(ids.map((id) => sql`${id}::uuid`), sql`, `);
  const db = getDb();

  const due = await db.execute<{ sale_id: string; imei: string }>(sql`
    SELECT v.sale_id, v.imei FROM (${billingDevices(ctx.tenantId)}) v
    WHERE v.customer_id IN (${idList})
      ${force ? sql`` : sql`AND (v.gps_synced_at IS NULL OR v.gps_synced_at < now() - make_interval(secs => ${LIVE_REFRESH_SECONDS - 5}))`}
    LIMIT ${SYNC_MAX_DEVICES}`);

  let checked = 0;
  let failed = 0;
  let message: string | undefined;
  // One lookup for all the devices (Kentracks takes 100 IMEIs per request).
  const results = await verifyImeisOnServer(ctx.tenantId, due.rows.map((d) => d.imei));
  await pool(due.rows, SYNC_CONCURRENCY, async (d) => {
    const r = results.get(d.imei) ?? { ok: false as const, code: "api-error" as const, message: "The device could not be checked." };
    if (!r.ok) {
      failed++;
      message ??= r.message;
      return;
    }
    const dev = r.device;
    await db.execute(sql`
      UPDATE package_sales SET
        gps_model = ${dev.model},
        gps_status = ${dev.status ?? null},
        gps_activation_date = ${normalizeDate(dev.activationDate)},
        gps_expiration_date = ${normalizeDate(dev.expirationDate)},
        gps_synced_at = now()
      WHERE sale_id = ${d.sale_id}::uuid
        AND EXISTS (SELECT 1 FROM sales s WHERE s.id = ${d.sale_id}::uuid AND s.tenant_id = ${ctx.tenantId})`);
    checked++;
  });

  return {
    items: await loadCustomers(ctx.tenantId, ids),
    checked,
    failed,
    ...(failed ? { message: `${failed} device${failed === 1 ? "" : "s"} could not be checked: ${message} Showing the last known details.` } : {}),
  };
}

/** True when a renewal fee applies to this card type (everything except a Lifelong Card). */
const renewable = (cardType: string) => cardType !== "Lifelong Card";

/**
 * PUT /api/billing/renewal-fee/{saleId} { renewalFee } — change the renewal fee agreed for one sold device.
 * Lifelong Cards never renew, so they have no fee to change. Returns the customer with fresh vehicles.
 */
export async function updateRenewalFee(ctx: AuthContext, saleId: string, body: Body): Promise<BillingCustomer | null> {
  const r = new Reader(body, ["renewalFee"]);
  const raw = r.text("renewalFee");
  r.done();
  const fee = parseMoney(raw, "Renewal fee", MAX_AMOUNT_MINOR);
  if (fee.error) throwValidation({ renewalFee: fee.error });

  const db = getDb();
  const found = await db.execute<{ customer_id: string; card_type: string }>(sql`
    SELECT s.customer_id, ps.card_type::text AS card_type
    FROM package_sales ps JOIN sales s ON s.id = ps.sale_id
    WHERE ps.sale_id = ${saleId}::uuid AND s.tenant_id = ${ctx.tenantId}`);
  const row = found.rows[0];
  if (!row) return null;
  if (!renewable(row.card_type)) throwValidation({ renewalFee: "A Lifelong Card does not renew, so it has no renewal fee" });

  await db.execute(sql`
    UPDATE package_sales SET renewal_fee_minor = ${fee.value!}
    WHERE sale_id = ${saleId}::uuid AND card_type <> 'Lifelong Card'
      AND EXISTS (SELECT 1 FROM sales s WHERE s.id = ${saleId}::uuid AND s.tenant_id = ${ctx.tenantId})`);
  return (await loadCustomers(ctx.tenantId, [row.customer_id]))[0] ?? null;
}
