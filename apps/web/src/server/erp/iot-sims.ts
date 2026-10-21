import "server-only";
import { sql, type SQL } from "drizzle-orm";
import { EXPIRY_WINDOW_DAYS } from "@/lib/billing";
import type { GpsStatus } from "@/lib/gps-platform";
import {
  BILLING_PERIODS,
  IOT_SIM_TYPES,
  parseDate,
  parsePeriod,
  type BillingPeriod,
  type IotBill,
  type IotClient,
  type IotClientsPage,
  type IotCounts,
  type IotGroup,
  type IotGroupsResult,
  type IotOverview,
  type IotRenewal,
  type IotRenewalsResult,
  type IotSim,
  type IotSimsPage,
} from "@/lib/iot-sims";
import { parseMoney } from "@/lib/purchase-validation";
import { MAX_AMOUNT_MINOR } from "@/lib/sale-validation";
import type { AuthContext } from "../crm/auth";
import { getDb } from "../crm/db";
import { isUuid } from "../crm/http";
import { Reader, throwValidation, type Body } from "./body";

const PAGE_MAX = 100;
const today = sql.raw(`(now() AT TIME ZONE 'Africa/Nairobi')::date`);
const IOT_TYPES = sql.raw(IOT_SIM_TYPES.map((t) => `'${t}'`).join(", "));

/**
 * Every IoT SIM line of the company. A device sold again belongs to its newest sale; the line counts when that sale
 * took an IoT SIM out of stock (iot_billing). The expiry is the one set on the line, else one year after the sale.
 * The yearly bill share comes from the group's latest bill: amount / lines, times 12 for monthly billing.
 */
const lines = (tenantId: string) => sql`
  WITH d AS (
    SELECT DISTINCT ON (ps.imei) ps.sale_id, ps.imei, ps.vehicle_plate, ps.sim_card_id, ps.sim_number, ps.gps_status, ps.gps_synced_at,
      ps.iot_billing, s.customer_id, s.created_at
    FROM package_sales ps JOIN sales s ON s.id = ps.sale_id
    WHERE s.tenant_id = ${tenantId} AND s.type IN ('Package Sale', 'Hosting Sale')
    ORDER BY ps.imei, s.created_at DESC, s.id DESC
  ),
  bill AS (
    SELECT DISTINCT ON (b.sim_card_id) b.sim_card_id, b.amount_minor, b.lines
    FROM iot_sim_bills b WHERE b.tenant_id = ${tenantId}
    ORDER BY b.sim_card_id, b.period DESC, b.created_at DESC
  ),
  l AS (
    SELECT d.sale_id, d.imei, d.vehicle_plate, d.sim_card_id, d.sim_number, d.gps_status, d.gps_synced_at, d.customer_id,
      (d.created_at AT TIME ZONE 'Africa/Nairobi')::date AS activated,
      COALESCE(i.expiry_date, ((d.created_at AT TIME ZONE 'Africa/Nairobi')::date + interval '1 year')::date) AS expires,
      i.renewal_fee_minor, COALESCE(i.suspended, false) AS suspended,
      sc.name AS group_name, sc.type::text AS sim_type,
      c.name AS customer_name, c.phone AS customer_phone, c.account AS customer_account,
      CASE WHEN bill.lines > 0 THEN round(bill.amount_minor::numeric / bill.lines * CASE WHEN COALESCE(g.billing_period, 'Monthly') = 'Monthly' THEN 12 ELSE 1 END) END AS annual_cost
    FROM d
    JOIN sim_cards sc ON sc.id = d.sim_card_id AND sc.type IN (${IOT_TYPES})
    JOIN customers c ON c.id = d.customer_id
    LEFT JOIN iot_sims i ON i.sale_id = d.sale_id
    LEFT JOIN iot_sim_groups g ON g.sim_card_id = d.sim_card_id
    LEFT JOIN bill ON bill.sim_card_id = d.sim_card_id
    WHERE d.iot_billing
  )`;

const isExpired = sql`(NOT l.suspended AND l.expires < ${today})`;
const isSoon = sql`(NOT l.suspended AND l.expires BETWEEN ${today} AND ${today} + ${EXPIRY_WINDOW_DAYS}::int)`;
const counts = sql`
  count(*)::int AS sims,
  count(*) FILTER (WHERE NOT l.suspended)::int AS active,
  count(*) FILTER (WHERE l.suspended)::int AS suspended,
  count(*) FILTER (WHERE l.gps_status = 'Online')::int AS online,
  count(*) FILTER (WHERE l.gps_status = 'Offline')::int AS offline,
  count(*) FILTER (WHERE ${isExpired})::int AS expired,
  count(*) FILTER (WHERE ${isSoon})::int AS expiring_soon,
  coalesce(sum(l.renewal_fee_minor) FILTER (WHERE NOT l.suspended), 0)::bigint AS received,
  coalesce(sum(coalesce(l.renewal_fee_minor, 0) - coalesce(l.annual_cost, 0)) FILTER (WHERE NOT l.suspended), 0)::bigint AS profit`;

type CountRow = { sims: number; active: number; suspended: number; online: number; offline: number; expired: number; expiring_soon: number; received: string; profit: string };
const toCounts = (r: CountRow | undefined): IotCounts => ({
  sims: r?.sims ?? 0, active: r?.active ?? 0, suspended: r?.suspended ?? 0, online: r?.online ?? 0,
  offline: r?.offline ?? 0, expired: r?.expired ?? 0, expiringSoon: r?.expiring_soon ?? 0,
});

type LineRow = {
  sale_id: string; imei: string; vehicle_plate: string; sim_card_id: string; sim_number: string; gps_status: string | null;
  gps_synced_at: Date | string | null; customer_id: string; activated: string; expires: string; renewal_fee_minor: string | null;
  suspended: boolean; group_name: string; sim_type: string; customer_name: string; customer_phone: string; customer_account: string;
  annual_cost: string | null;
};
const SELECT_LINE = sql`l.*, l.activated::text AS activated, l.expires::text AS expires, l.renewal_fee_minor::text AS renewal_fee_minor, l.annual_cost::text AS annual_cost`;
const STATUSES: readonly string[] = ["Online", "Offline", "Expired"];

function toSim(r: LineRow): IotSim {
  const fee = r.renewal_fee_minor == null ? null : Number(r.renewal_fee_minor);
  const cost = r.annual_cost == null ? null : Number(r.annual_cost);
  return {
    saleId: r.sale_id, simCardId: r.sim_card_id, groupName: r.group_name, simType: r.sim_type, simNumber: r.sim_number,
    imei: r.imei, vehiclePlate: r.vehicle_plate, customerId: r.customer_id, customerName: r.customer_name, customerPhone: r.customer_phone,
    activationDate: r.activated, expiryDate: r.expires, renewalFeeMinor: fee, suspended: r.suspended,
    deviceStatus: r.gps_status && STATUSES.includes(r.gps_status) ? (r.gps_status as GpsStatus) : null,
    lastCheckedAt: r.gps_synced_at == null ? null : new Date(r.gps_synced_at).toISOString(),
    annualCostMinor: cost, profitMinor: (fee ?? 0) - (cost ?? 0),
  };
}

const likeOf = (q: string) => `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
const searchSql = (q: string): SQL =>
  q
    ? sql`(l.customer_name ILIKE ${likeOf(q)} OR l.customer_phone ILIKE ${likeOf(q)} OR l.customer_account ILIKE ${likeOf(q)}
          OR l.sim_number ILIKE ${likeOf(q)} OR l.vehicle_plate ILIKE ${likeOf(q)} OR l.imei ILIKE ${likeOf(q)})`
    : sql`TRUE`;

function paging(url: URL, def: number) {
  const p = url.searchParams;
  return {
    limit: Math.min(Math.max(Number(p.get("limit")) || def, 1), PAGE_MAX),
    offset: Math.max(Number(p.get("offset")) || 0, 0),
    q: (p.get("q") ?? "").trim().slice(0, 100),
  };
}

const sortSims = sql`ORDER BY l.expires, l.sim_number, l.sale_id`;

async function simsWhere(tenantId: string, where: SQL, extra: SQL = sql``): Promise<IotSim[]> {
  const r = await getDb().execute<LineRow>(sql`${lines(tenantId)} SELECT ${SELECT_LINE} FROM l WHERE ${where} ${extra}`);
  return r.rows.map(toSim);
}

// ------------------------------------------------------------------- reading

/** GET /api/iot-sims/clients — customers with IoT SIM lines (all their lines), paged, plus totals. */
export async function listIotClients(ctx: AuthContext, url: URL): Promise<IotClientsPage> {
  const { limit, offset, q } = paging(url, 20);
  const db = getDb();
  // A search can match a customer through one line; all of that customer's lines are still shown.
  const [page, totals] = await Promise.all([
    db.execute<{ id: string }>(sql`${lines(ctx.tenantId)}
      SELECT l.customer_id AS id FROM l GROUP BY l.customer_id, l.customer_name
      HAVING bool_or(${searchSql(q)})
      ORDER BY l.customer_name, l.customer_id LIMIT ${limit + 1} OFFSET ${offset}`),
    db.execute<CountRow>(sql`${lines(ctx.tenantId)}
      SELECT ${counts} FROM l WHERE l.customer_id IN (SELECT l.customer_id FROM l WHERE ${searchSql(q)})`),
  ]);
  const ids = page.rows.slice(0, limit).map((r) => r.id);
  const sims = ids.length ? await simsWhere(ctx.tenantId, sql`l.customer_id IN (${sql.join(ids.map((id) => sql`${id}::uuid`), sql`, `)})`, sortSims) : [];
  const items: IotClient[] = ids.map((id) => {
    const mine = sims.filter((s) => s.customerId === id);
    const first = mine[0]!;
    return { id, name: first.customerName, phone: first.customerPhone, account: "", sims: mine };
  });
  // The account is not part of IotSim; read it once for the page.
  if (ids.length) {
    const acc = await db.execute<{ id: string; account: string }>(sql`
      SELECT id, account FROM customers WHERE tenant_id = ${ctx.tenantId} AND id IN (${sql.join(ids.map((id) => sql`${id}::uuid`), sql`, `)})`);
    const m = new Map(acc.rows.map((r) => [r.id, r.account]));
    for (const c of items) c.account = m.get(c.id) ?? "";
  }
  return { items, nextOffset: page.rows.length > limit ? offset + limit : null, totals: toCounts(totals.rows[0]) };
}

type BillRow = { id: string; sim_card_id: string; period: string; amount_minor: string; lines: number; note: string; created_at: Date | string; group_name?: string };
const toBill = (b: BillRow): IotBill => ({
  id: b.id, simCardId: b.sim_card_id, period: b.period, amountMinor: Number(b.amount_minor), lines: b.lines, note: b.note, createdAt: new Date(b.created_at).toISOString(),
});

/** GET /api/iot-sims/groups — every IoT SIM card item in inventory (even with no lines yet) with its counts and billing. */
export async function listIotGroups(ctx: AuthContext): Promise<IotGroupsResult> {
  const db = getDb();
  const [groups, agg, bills, all] = await Promise.all([
    db.execute<{ id: string; name: string; type: string; billing_period: BillingPeriod | null }>(sql`
      SELECT sc.id, sc.name, sc.type::text AS type, g.billing_period
      FROM sim_cards sc LEFT JOIN iot_sim_groups g ON g.sim_card_id = sc.id
      WHERE sc.tenant_id = ${ctx.tenantId} AND sc.type IN (${IOT_TYPES})
      ORDER BY sc.name, sc.type, sc.id`),
    db.execute<CountRow & { sim_card_id: string }>(sql`${lines(ctx.tenantId)} SELECT l.sim_card_id, ${counts} FROM l GROUP BY l.sim_card_id`),
    db.execute<BillRow>(sql`
      SELECT DISTINCT ON (b.sim_card_id) b.id, b.sim_card_id, b.period, b.amount_minor::text AS amount_minor, b.lines, b.note, b.created_at
      FROM iot_sim_bills b WHERE b.tenant_id = ${ctx.tenantId}
      ORDER BY b.sim_card_id, b.period DESC, b.created_at DESC`),
    db.execute<CountRow>(sql`${lines(ctx.tenantId)} SELECT ${counts} FROM l`),
  ]);
  const aggBy = new Map(agg.rows.map((r) => [r.sim_card_id, r]));
  const billBy = new Map(bills.rows.map((b) => [b.sim_card_id, toBill(b)]));
  const result: IotGroup[] = groups.rows.map((g) => {
    const a = aggBy.get(g.id);
    const bill = billBy.get(g.id) ?? null;
    return {
      simCardId: g.id, name: g.name, type: g.type, billingPeriod: g.billing_period ?? "Monthly",
      ...toCounts(a),
      latestBill: bill,
      perLineMinor: bill && bill.lines > 0 ? Math.round(bill.amountMinor / bill.lines) : null,
      receivedMinor: Number(a?.received ?? 0),
      expectedProfitMinor: Number(a?.profit ?? 0),
    };
  });
  const t = all.rows[0];
  return { groups: result, totals: { ...toCounts(t), receivedMinor: Number(t?.received ?? 0), expectedProfitMinor: Number(t?.profit ?? 0) } };
}

async function ownGroup(tenantId: string, id: string): Promise<{ id: string; name: string; type: string } | null> {
  if (!isUuid(id)) return null;
  const r = await getDb().execute<{ id: string; name: string; type: string }>(sql`
    SELECT id, name, type::text AS type FROM sim_cards WHERE id = ${id}::uuid AND tenant_id = ${tenantId} AND type IN (${IOT_TYPES})`);
  return r.rows[0] ?? null;
}

/** GET /api/iot-sims/groups/{simCardId}/sims — the lines of one group, paged. */
export async function listGroupSims(ctx: AuthContext, id: string, url: URL): Promise<IotSimsPage | null> {
  if (!(await ownGroup(ctx.tenantId, id))) return null;
  const { limit, offset, q } = paging(url, 50);
  const rows = await simsWhere(ctx.tenantId, sql`l.sim_card_id = ${id}::uuid AND ${searchSql(q)}`, sql`${sortSims} LIMIT ${limit + 1} OFFSET ${offset}`);
  return { items: rows.slice(0, limit), nextOffset: rows.length > limit ? offset + limit : null };
}

type RenewalRow = { id: string; sale_id: string; sim_number: string; customer_name: string; amount_minor: string; previous_expiry: string | null; new_expiry: string; note: string; created_at: Date | string };
const toRenewal = (r: RenewalRow): IotRenewal => ({
  id: r.id, saleId: r.sale_id, simNumber: r.sim_number, customerName: r.customer_name, amountMinor: Number(r.amount_minor),
  previousExpiry: r.previous_expiry, newExpiry: r.new_expiry, note: r.note, createdAt: new Date(r.created_at).toISOString(),
});
const renewalsSql = (tenantId: string, where: SQL, limit: number) => sql`
  SELECT r.id, r.sale_id, ps.sim_number, s.customer_name, r.amount_minor::text AS amount_minor, r.previous_expiry::text AS previous_expiry,
    r.new_expiry::text AS new_expiry, r.note, r.created_at
  FROM iot_sim_renewals r JOIN package_sales ps ON ps.sale_id = r.sale_id JOIN sales s ON s.id = r.sale_id
  WHERE r.tenant_id = ${tenantId} AND ${where}
  ORDER BY r.created_at DESC, r.id DESC LIMIT ${limit}`;

/** GET /api/iot-sims/renewals — lines expired or due within the window (not suspended), soonest first, and recent renewals. */
export async function listIotRenewals(ctx: AuthContext, url: URL): Promise<IotRenewalsResult> {
  const { limit, offset } = paging(url, 100);
  const db = getDb();
  const [due, recent, n] = await Promise.all([
    simsWhere(ctx.tenantId, sql`(${isExpired} OR ${isSoon})`, sql`${sortSims} LIMIT ${limit} OFFSET ${offset}`),
    db.execute<RenewalRow>(renewalsSql(ctx.tenantId, sql`TRUE`, 20)),
    db.execute<{ expired: number; soon: number }>(sql`${lines(ctx.tenantId)}
      SELECT count(*) FILTER (WHERE ${isExpired})::int AS expired, count(*) FILTER (WHERE ${isSoon})::int AS soon FROM l`),
  ]);
  return { due, recent: recent.rows.map(toRenewal), expired: n.rows[0]?.expired ?? 0, dueSoon: n.rows[0]?.soon ?? 0 };
}

/** GET /api/iot-sims/overview — totals, per-group summary, recent renewals and bills. */
export async function iotOverview(ctx: AuthContext): Promise<IotOverview> {
  const db = getDb();
  const [groups, renewals, bills] = await Promise.all([
    listIotGroups(ctx),
    db.execute<RenewalRow>(renewalsSql(ctx.tenantId, sql`TRUE`, 10)),
    db.execute<BillRow>(sql`
      SELECT b.id, b.sim_card_id, b.period, b.amount_minor::text AS amount_minor, b.lines, b.note, b.created_at, sc.name || ' — ' || sc.type::text AS group_name
      FROM iot_sim_bills b JOIN sim_cards sc ON sc.id = b.sim_card_id
      WHERE b.tenant_id = ${ctx.tenantId} ORDER BY b.period DESC, b.created_at DESC LIMIT 10`),
  ]);
  return { ...groups, recentRenewals: renewals.rows.map(toRenewal), recentBills: bills.rows.map((b) => ({ ...toBill(b), groupName: b.group_name ?? "" })) };
}

/** One line of the company, or null (not theirs, not an IoT line, or not the device's newest sale). */
async function ownSim(tenantId: string, saleId: string): Promise<IotSim | null> {
  if (!isUuid(saleId)) return null;
  return (await simsWhere(tenantId, sql`l.sale_id = ${saleId}::uuid`))[0] ?? null;
}

/** GET /api/iot-sims/{saleId}/renewals — the renewal history of one line. */
export async function listSimRenewals(ctx: AuthContext, saleId: string): Promise<IotRenewal[] | null> {
  if (!(await ownSim(ctx.tenantId, saleId))) return null;
  const r = await getDb().execute<RenewalRow>(renewalsSql(ctx.tenantId, sql`r.sale_id = ${saleId}::uuid`, 200));
  return r.rows.map(toRenewal);
}

// ------------------------------------------------------------------- writing

/** PUT /api/iot-sims/{saleId} { renewalFee, expiryDate } — edit the line's renewal fee and expiry. */
export async function updateIotSim(ctx: AuthContext, saleId: string, body: Body): Promise<IotSim | null> {
  const r = new Reader(body, ["renewalFee", "expiryDate"]);
  const feeRaw = r.text("renewalFee");
  const expRaw = r.text("expiryDate");
  r.done();
  const errors: Record<string, string> = {};
  const fee = parseMoney(feeRaw, "Renewal fee", MAX_AMOUNT_MINOR);
  if (fee.error) errors.renewalFee = fee.error;
  const exp = parseDate(expRaw, "Expiry date");
  if (exp.error) errors.expiryDate = exp.error;
  if (Object.keys(errors).length) throwValidation(errors);
  if (!(await ownSim(ctx.tenantId, saleId))) return null;
  await getDb().execute(sql`
    INSERT INTO iot_sims (sale_id, tenant_id, renewal_fee_minor, expiry_date, updated_at)
    VALUES (${saleId}::uuid, ${ctx.tenantId}, ${fee.value!}, ${exp.value!}::date, now())
    ON CONFLICT (sale_id) DO UPDATE SET renewal_fee_minor = EXCLUDED.renewal_fee_minor, expiry_date = EXCLUDED.expiry_date, updated_at = now()
    WHERE iot_sims.tenant_id = ${ctx.tenantId}`);
  return ownSim(ctx.tenantId, saleId);
}

/**
 * POST /api/iot-sims/{saleId}/renew { amount, newExpiry, note } — record a renewal payment and move the expiry.
 * The new expiry must be after the current one. A suspended line cannot be renewed until it is reactivated.
 */
export async function renewIotSim(ctx: AuthContext, saleId: string, body: Body): Promise<IotSim | null> {
  const r = new Reader(body, ["amount", "newExpiry", "note"]);
  const amountRaw = r.text("amount");
  const expRaw = r.text("newExpiry");
  const note = r.text("note").trim();
  r.done();
  const errors: Record<string, string> = {};
  const amount = parseMoney(amountRaw, "Amount received", MAX_AMOUNT_MINOR);
  if (amount.error) errors.amount = amount.error;
  const exp = parseDate(expRaw, "New expiry date");
  if (exp.error) errors.newExpiry = exp.error;
  if (note.length > 300) errors.note = "Note must be 300 characters or fewer";
  if (Object.keys(errors).length) throwValidation(errors);

  const sim = await ownSim(ctx.tenantId, saleId);
  if (!sim) return null;
  const db = getDb();
  await db.transaction(async (tx) => {
    // Make sure the line has a row, then lock it so two renewals cannot both extend from the same expiry.
    await tx.execute(sql`
      INSERT INTO iot_sims (sale_id, tenant_id, renewal_fee_minor, expiry_date)
      VALUES (${saleId}::uuid, ${ctx.tenantId}, ${sim.renewalFeeMinor}, ${sim.expiryDate}::date)
      ON CONFLICT (sale_id) DO NOTHING`);
    const cur = await tx.execute<{ expiry_date: string; suspended: boolean; tenant_id: string }>(sql`
      SELECT expiry_date::text AS expiry_date, suspended, tenant_id FROM iot_sims WHERE sale_id = ${saleId}::uuid FOR UPDATE`);
    const row = cur.rows[0];
    if (!row || row.tenant_id !== ctx.tenantId) throwValidation({ newExpiry: "This SIM could not be renewed" });
    if (row.suspended) throwValidation({ newExpiry: "This SIM is suspended. Reactivate it before recording a renewal." });
    const previous = row.expiry_date ?? sim.expiryDate;
    if (exp.value! <= previous) throwValidation({ newExpiry: `The new expiry date must be after the current one (${previous})` });
    await tx.execute(sql`UPDATE iot_sims SET expiry_date = ${exp.value!}::date, updated_at = now() WHERE sale_id = ${saleId}::uuid`);
    await tx.execute(sql`
      INSERT INTO iot_sim_renewals (tenant_id, sale_id, amount_minor, previous_expiry, new_expiry, note, created_by)
      VALUES (${ctx.tenantId}, ${saleId}::uuid, ${amount.value!}, ${previous}::date, ${exp.value!}::date, ${note}, ${ctx.userId}::uuid)`);
  });
  return ownSim(ctx.tenantId, saleId);
}

/** POST /api/iot-sims/{saleId}/suspend { suspended } — suspend or reactivate a line. */
export async function suspendIotSim(ctx: AuthContext, saleId: string, body: Body): Promise<IotSim | null> {
  const r = new Reader(body, ["suspended"]);
  if (typeof body.suspended !== "boolean") r.errors.suspended = "Must be true or false";
  r.done();
  const suspended = body.suspended as boolean;
  const sim = await ownSim(ctx.tenantId, saleId);
  if (!sim) return null;
  await getDb().execute(sql`
    INSERT INTO iot_sims (sale_id, tenant_id, renewal_fee_minor, expiry_date, suspended, suspended_at, updated_at)
    VALUES (${saleId}::uuid, ${ctx.tenantId}, ${sim.renewalFeeMinor}, ${sim.expiryDate}::date, ${suspended}, ${suspended ? sql`now()` : sql`NULL`}, now())
    ON CONFLICT (sale_id) DO UPDATE SET suspended = EXCLUDED.suspended, suspended_at = EXCLUDED.suspended_at, updated_at = now()
    WHERE iot_sims.tenant_id = ${ctx.tenantId}`);
  return ownSim(ctx.tenantId, saleId);
}

/** PUT /api/iot-sims/groups/{simCardId} { billingPeriod } — how the provider bills this group. */
export async function updateIotGroup(ctx: AuthContext, id: string, body: Body): Promise<{ billingPeriod: BillingPeriod } | null> {
  const r = new Reader(body, ["billingPeriod"]);
  const period = r.text("billingPeriod");
  if (!(BILLING_PERIODS as readonly string[]).includes(period)) r.errors.billingPeriod = `Billing must be ${BILLING_PERIODS.join(" or ")}`;
  r.done();
  if (!(await ownGroup(ctx.tenantId, id))) return null;
  await getDb().execute(sql`
    INSERT INTO iot_sim_groups (sim_card_id, tenant_id, billing_period, updated_at) VALUES (${id}::uuid, ${ctx.tenantId}, ${period}, now())
    ON CONFLICT (sim_card_id) DO UPDATE SET billing_period = EXCLUDED.billing_period, updated_at = now()
    WHERE iot_sim_groups.tenant_id = ${ctx.tenantId}`);
  return { billingPeriod: period as BillingPeriod };
}

/** GET /api/iot-sims/groups/{simCardId}/bills — the provider bills recorded for the group, newest first. */
export async function listGroupBills(ctx: AuthContext, id: string): Promise<IotBill[] | null> {
  if (!(await ownGroup(ctx.tenantId, id))) return null;
  const r = await getDb().execute<BillRow>(sql`
    SELECT id, sim_card_id, period, amount_minor::text AS amount_minor, lines, note, created_at
    FROM iot_sim_bills WHERE tenant_id = ${ctx.tenantId} AND sim_card_id = ${id}::uuid ORDER BY period DESC, created_at DESC LIMIT 120`);
  return r.rows.map(toBill);
}

/**
 * POST /api/iot-sims/groups/{simCardId}/bills { period, amount, note } — record the provider's bill for a month.
 * Recording the same month again replaces it. The bill is shared across the group's active lines at that moment.
 */
export async function recordGroupBill(ctx: AuthContext, id: string, body: Body): Promise<IotBill | null> {
  const r = new Reader(body, ["period", "amount", "note"]);
  const periodRaw = r.text("period");
  const amountRaw = r.text("amount");
  const note = r.text("note").trim();
  r.done();
  const errors: Record<string, string> = {};
  const period = parsePeriod(periodRaw);
  if (period.error) errors.period = period.error;
  const amount = parseMoney(amountRaw, "Bill amount", MAX_AMOUNT_MINOR);
  if (amount.error) errors.amount = amount.error;
  if (note.length > 300) errors.note = "Note must be 300 characters or fewer";
  if (Object.keys(errors).length) throwValidation(errors);
  if (!(await ownGroup(ctx.tenantId, id))) return null;

  const active = await getDb().execute<{ n: number }>(sql`${lines(ctx.tenantId)}
    SELECT count(*)::int AS n FROM l WHERE l.sim_card_id = ${id}::uuid AND NOT l.suspended`);
  const res = await getDb().execute<BillRow>(sql`
    INSERT INTO iot_sim_bills (tenant_id, sim_card_id, period, amount_minor, lines, note, created_by)
    VALUES (${ctx.tenantId}, ${id}::uuid, ${period.value!}, ${amount.value!}, ${active.rows[0]?.n ?? 0}, ${note}, ${ctx.userId}::uuid)
    ON CONFLICT (tenant_id, sim_card_id, period) DO UPDATE SET amount_minor = EXCLUDED.amount_minor, lines = EXCLUDED.lines,
      note = EXCLUDED.note, created_by = EXCLUDED.created_by, created_at = now()
    RETURNING id, sim_card_id, period, amount_minor::text AS amount_minor, lines, note, created_at`);
  return toBill(res.rows[0]!);
}

