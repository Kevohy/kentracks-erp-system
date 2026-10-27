import "server-only";
import { sql } from "drizzle-orm";
import { EXPIRY_WINDOW_DAYS, normalizeDate } from "@/lib/billing";
import {
  LOW_STOCK_UNITS,
  RECENT_SALES_SHOWN,
  RENEWALS_SHOWN,
  STOCK_SHOWN,
  TREND_DAYS,
  TREND_MONTHS,
  type DashboardRenewal,
  type DashboardSale,
  type DashboardStockItem,
  type DashboardSummary,
} from "@/lib/dashboard";
import type { AuthContext } from "../crm/auth";
import { getDb } from "../crm/db";
import { billingDevices } from "./billing";
import { loadStock } from "./inventory";
import { iotLines } from "./iot-sims";

/**
 * GET /api/dashboard — the main Dashboard, worked out from the company's own records:
 *
 *  - Revenue and profit: sales totals and profits (old sales are records only, never counted), this month so far
 *    compared with the same days of last month. Months follow Nairobi time.
 *  - Customers: all customers, new this month, and how many own a tracked vehicle (Billing).
 *  - Outstanding: total − paid over every sale not paid in full.
 *  - Revenue by month: this year and last year, January to December.
 *  - Renewals: GPS licences (Billing → Customer Vehicles, Lifelong cards never expire) and IoT SIM lines
 *    (Billing → IoT SIM, suspended lines left out) due in the next 30 days, plus those already expired.
 *  - Recent sales: the latest five.
 *  - Stock: received purchases minus what sales took out (the same figures as Inventory), lowest first.
 *  - Sales trend: number of sales and revenue per day for the last 30 days and per month for the last 12 months.
 *  - Devices: the tracked devices by GPS status, with the same rules as Billing (each device once, Expired first).
 */

const local = (col: string) => sql.raw(`(${col} AT TIME ZONE 'Africa/Nairobi')`);
const nowLocal = sql.raw(`(now() AT TIME ZONE 'Africa/Nairobi')`);
const today = sql.raw(`(now() AT TIME ZONE 'Africa/Nairobi')::date`);
const n = (v: string | number | null | undefined) => (v == null ? 0 : Number(v));

export async function dashboardSummary(ctx: AuthContext): Promise<DashboardSummary> {
  const db = getDb();
  const t = ctx.tenantId;
  const saleAt = local("s.created_at");

  const [money, months, customers, recent, renewals, stock, names] = await Promise.all([
    db.execute<{ rev_now: string; rev_prev: string; pro_now: string; pro_prev: string; due: string; due_sales: number; today: string; year: number }>(sql`
      WITH b AS (
        SELECT date_trunc('month', ${nowLocal}) AS cur,
               date_trunc('month', ${nowLocal}) - interval '1 month' AS prev,
               LEAST(date_trunc('month', ${nowLocal}) - interval '1 month' + (${nowLocal} - date_trunc('month', ${nowLocal})),
                     date_trunc('month', ${nowLocal})) AS prev_cut
      )
      SELECT
        COALESCE(sum(s.total_minor) FILTER (WHERE ${saleAt} >= b.cur), 0)::text AS rev_now,
        COALESCE(sum(s.total_minor) FILTER (WHERE ${saleAt} >= b.prev AND ${saleAt} < b.prev_cut), 0)::text AS rev_prev,
        COALESCE(sum(s.profit_minor) FILTER (WHERE ${saleAt} >= b.cur), 0)::text AS pro_now,
        COALESCE(sum(s.profit_minor) FILTER (WHERE ${saleAt} >= b.prev AND ${saleAt} < b.prev_cut), 0)::text AS pro_prev,
        COALESCE(sum(s.total_minor - s.paid_minor), 0)::text AS due,
        count(*) FILTER (WHERE s.paid_minor < s.total_minor)::int AS due_sales,
        ${today}::text AS today,
        extract(year FROM ${nowLocal})::int AS year
      FROM b LEFT JOIN sales s ON s.tenant_id = ${t} AND NOT s.old_sale
      GROUP BY b.cur, b.prev, b.prev_cut`),
    db.execute<{ y: number; m: number; total: string }>(sql`
      SELECT extract(year FROM ${saleAt})::int AS y, extract(month FROM ${saleAt})::int AS m, sum(s.total_minor)::text AS total
      FROM sales s
      WHERE s.tenant_id = ${t} AND NOT s.old_sale AND ${saleAt} >= date_trunc('year', ${nowLocal}) - interval '1 year'
      GROUP BY 1, 2`),
    db.execute<{ total: number; new_month: number; with_vehicles: number }>(sql`
      SELECT
        (SELECT count(*) FROM customers c WHERE c.tenant_id = ${t})::int AS total,
        (SELECT count(*) FROM customers c WHERE c.tenant_id = ${t} AND ${local("c.created_at")} >= date_trunc('month', ${nowLocal}))::int AS new_month,
        (SELECT count(DISTINCT v.customer_id) FROM (${billingDevices(t)}) v)::int AS with_vehicles`),
    db.execute<{ id: string; type: DashboardSale["type"]; customer_name: string; plate: string | null; day: string; total: string; paid: string }>(sql`
      SELECT s.id, s.type, s.customer_name, ps.vehicle_plate AS plate, ${saleAt}::date::text AS day, s.total_minor::text AS total, s.paid_minor::text AS paid
      FROM sales s LEFT JOIN package_sales ps ON ps.sale_id = s.id
      WHERE s.tenant_id = ${t} AND NOT s.old_sale
      ORDER BY s.created_at DESC, s.id DESC LIMIT ${RECENT_SALES_SHOWN}`),
    db.execute<{ kind: DashboardRenewal["kind"]; sale_id: string; customer_id: string; customer_name: string; plate: string; imei: string; expires: string; fee: string | null; overdue: boolean }>(sql`
      WITH gps AS (${billingDevices(t)}),
      due AS (
        SELECT 'GPS licence' AS kind, v.sale_id, v.customer_id, v.vehicle_plate AS plate, v.imei, v.expires, v.renewal_fee_minor AS fee,
               (v.expires < ${today} OR v.gps_status = 'Expired') AS overdue
        FROM gps v
        WHERE v.card_type <> 'Lifelong Card' AND v.expires IS NOT NULL
          AND (v.expires <= ${today} + ${EXPIRY_WINDOW_DAYS}::int OR v.gps_status = 'Expired')
        UNION ALL
        SELECT 'IoT SIM', l.sale_id, l.customer_id, l.vehicle_plate, l.imei, l.expires, l.renewal_fee_minor, l.expires < ${today}
        FROM (${iotLines(t)} SELECT * FROM l) l
        WHERE NOT l.suspended AND l.expires <= ${today} + ${EXPIRY_WINDOW_DAYS}::int
      )
      SELECT d.kind, d.sale_id, d.customer_id, c.name AS customer_name, d.plate, d.imei, d.expires::text AS expires, d.fee::text AS fee, d.overdue
      FROM due d JOIN customers c ON c.id = d.customer_id
      ORDER BY d.expires, c.name, d.imei`),
    loadStock(db, t),
    db.execute<{ kind: DashboardStockItem["kind"]; id: string; name: string; detail: string }>(sql`
      SELECT 'Product' AS kind, p.id, p.model AS name, pc.name AS detail FROM products p JOIN product_categories pc ON pc.id = p.category_id WHERE p.tenant_id = ${t}
      UNION ALL SELECT 'SIM Card', sc.id, sc.name, sc.type::text FROM sim_cards sc WHERE sc.tenant_id = ${t}
      UNION ALL SELECT 'Platform', pl.id, pl.name, 'Licences' FROM platforms pl WHERE pl.tenant_id = ${t}`),
  ]);

  const [daily, monthly, devices] = await Promise.all([
    db.execute<{ key: string; count: number; total: string }>(sql`
      WITH s AS (
        SELECT ${saleAt}::date AS day, count(*)::int AS count, sum(s.total_minor) AS total FROM sales s
        WHERE s.tenant_id = ${t} AND NOT s.old_sale AND ${saleAt} >= (${today} - ${TREND_DAYS - 1}::int)
        GROUP BY 1)
      SELECT to_char(d, 'YYYY-MM-DD') AS key, COALESCE(s.count, 0)::int AS count, COALESCE(s.total, 0)::text AS total
      FROM generate_series(${today} - ${TREND_DAYS - 1}::int, ${today}, interval '1 day') d LEFT JOIN s ON s.day = d::date
      ORDER BY d`),
    db.execute<{ key: string; count: number; total: string }>(sql`
      WITH s AS (
        SELECT date_trunc('month', ${saleAt}) AS mo, count(*)::int AS count, sum(s.total_minor) AS total FROM sales s
        WHERE s.tenant_id = ${t} AND NOT s.old_sale AND ${saleAt} >= date_trunc('month', ${nowLocal}) - make_interval(months => ${TREND_MONTHS - 1})
        GROUP BY 1)
      SELECT to_char(m.mo, 'YYYY-MM') AS key, COALESCE(s.count, 0)::int AS count, COALESCE(s.total, 0)::text AS total
      FROM generate_series(date_trunc('month', ${nowLocal}) - make_interval(months => ${TREND_MONTHS - 1}), date_trunc('month', ${nowLocal}), interval '1 month') m(mo)
      LEFT JOIN s ON s.mo = m.mo
      ORDER BY m.mo`),
    db.execute<{ total: number; online: number; offline: number; expired: number; unknown: number; soon: number; checked_at: Date | string | null }>(sql`
      WITH v AS (${billingDevices(t)}),
      x AS (SELECT v.*, COALESCE(v.card_type <> 'Lifelong Card' AND (v.expires < ${today} OR v.gps_status = 'Expired'), FALSE) AS dead FROM v)
      SELECT count(*)::int AS total,
             count(*) FILTER (WHERE NOT dead AND gps_status = 'Online')::int AS online,
             count(*) FILTER (WHERE NOT dead AND gps_status = 'Offline')::int AS offline,
             count(*) FILTER (WHERE dead)::int AS expired,
             count(*) FILTER (WHERE NOT dead AND (gps_status IS NULL OR gps_status NOT IN ('Online', 'Offline')))::int AS unknown,
             count(*) FILTER (WHERE NOT dead AND card_type <> 'Lifelong Card' AND expires BETWEEN ${today} AND ${today} + ${EXPIRY_WINDOW_DAYS}::int)::int AS soon,
             max(GREATEST(gps_status_at, gps_synced_at)) AS checked_at
      FROM x`),
  ]);

  const m = money.rows[0];
  const year = m.year;
  const thisYear = Array<number>(12).fill(0);
  const lastYear = Array<number>(12).fill(0);
  for (const r of months.rows) (r.y === year ? thisYear : lastYear)[r.m - 1] += n(r.total);

  const rows = renewals.rows.map((r) => ({
    overdue: r.overdue,
    item: {
      kind: r.kind,
      saleId: r.sale_id,
      customerId: r.customer_id,
      customerName: r.customer_name,
      vehiclePlate: r.plate,
      imei: r.imei,
      expiryDate: normalizeDate(r.expires) ?? r.expires,
      feeMinor: r.fee == null ? null : Number(r.fee),
    } satisfies DashboardRenewal,
  }));
  const upcoming = rows.filter((r) => !r.overdue);
  const overdue = rows.filter((r) => r.overdue);
  const fees = (list: typeof rows) => list.reduce((a, r) => a + (r.item.feeMinor ?? 0), 0);

  // Stock per item: products and SIM cards as they are; platforms as one total (the rows without a card type).
  const nameOf = new Map(names.rows.map((r) => [`${r.kind}:${r.id}`, r]));
  const allItems: DashboardStockItem[] = stock
    .filter((r) => r.type !== "Platform" || r.cardType === undefined)
    .flatMap((r) => {
      const meta = nameOf.get(`${r.type}:${r.id}`);
      return meta ? [{ kind: r.type, id: r.id, name: meta.name, detail: meta.detail, quantity: r.quantity }] : [];
    })
    .sort((a, b) => a.quantity - b.quantity || a.name.localeCompare(b.name));
  const items = allItems.slice(0, STOCK_SHOWN);
  const dv = devices.rows[0];
  const point = (r: { key: string; count: number; total: string }) => ({ key: r.key, count: r.count, totalMinor: n(r.total) });

  const c = customers.rows[0];
  return {
    asOf: new Date().toISOString(),
    today: m.today,
    revenue: { monthMinor: n(m.rev_now), previousMinor: n(m.rev_prev) },
    profit: { monthMinor: n(m.pro_now), previousMinor: n(m.pro_prev) },
    customers: { total: c.total, newThisMonth: c.new_month, withVehicles: c.with_vehicles },
    outstanding: { amountMinor: n(m.due), sales: m.due_sales },
    revenueByMonth: { year, thisYear, lastYear },
    renewals: {
      windowDays: EXPIRY_WINDOW_DAYS,
      upcoming: upcoming.slice(0, RENEWALS_SHOWN).map((r) => r.item),
      upcomingCount: upcoming.length,
      upcomingFeesMinor: fees(upcoming),
      overdueCount: overdue.length,
      overdueFeesMinor: fees(overdue),
    },
    recentSales: recent.rows.map((r) => ({
      id: r.id,
      type: r.type,
      customerName: r.customer_name,
      vehiclePlate: r.plate ?? "",
      date: r.day,
      totalMinor: n(r.total),
      paidMinor: n(r.paid),
    })),
    stock: items,
    lowStockCount: allItems.filter((i) => i.quantity <= LOW_STOCK_UNITS).length,
    salesTrend: { days: daily.rows.map(point), months: monthly.rows.map(point) },
    devices: {
      total: dv.total, online: dv.online, offline: dv.offline, expired: dv.expired, unknown: dv.unknown, expiringSoon: dv.soon,
      checkedAt: dv.checked_at ? new Date(dv.checked_at).toISOString() : null,
    },
  };
}
