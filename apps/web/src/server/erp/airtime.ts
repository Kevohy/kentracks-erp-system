import "server-only";
import { sql } from "drizzle-orm";
import {
  AIRTIME_MAX_RECIPIENTS,
  atAmount,
  parseAirtimeAmount,
  type AfricasTalkingStatus,
  type AirtimeBatch,
  type AirtimeItem,
  type AirtimeLine,
  type AirtimeStatus,
  type AirtimeExpirySource,
  type AirtimeMonthly,
  type AirtimeOverview,
  type AirtimePlan,
  type ApprovedAirtimeLine,
  type MonthlyState,
  type PendingAirtimeLine,
  validateAirtimePlan,
} from "@/lib/airtime";
import { EXPIRY_WINDOW_DAYS, todayInNairobi } from "@/lib/billing";
import { simServiceOf } from "@/lib/sales";
import { validatePhone } from "@/lib/validation";
import { requireAdmin, type AuthContext } from "../crm/auth";
import { getDb } from "../crm/db";
import { ApiError, isUuid } from "../crm/http";
import { Reader, throwValidation, type Body } from "./body";
import { billingDevices } from "./billing";
import { verifyImeisOnServer } from "./gps";
import { storeGpsDevice } from "./gps-store";
import { applyServiceChange, logAirtimeEvent } from "./sim-service";
import { sendSystemSms } from "./sms";
import { textSmsConfigured } from "./textsms";

/**
 * Communication → Airtime with Africa's Talking (https://api.africastalking.com/version1/airtime/send).
 *
 *   Settings → Africa's Talking   GET /api/settings/africastalking (status from the environment), POST …/test (balance)
 *   Communication → Airtime       GET /api/airtime/lines, GET /api/airtime/history, POST /api/airtime/send
 *   Monthly airtime (approvals)   GET /api/airtime/monthly, PUT/DELETE /api/airtime/plans/{saleId},
 *                                 POST /api/airtime/plans/{saleId}/imei-expiry, POST /api/airtime/send-monthly
 *
 * Only tracker SIM lines can get airtime: the SIM of the newest Package/Hosting Sale of each device, where that sale
 * allows airtime (prepaid SIMs, and non-IoT SIMs on hosting sales), with a valid phone number. A send is saved with
 * every line marked Pending BEFORE Africa's Talking is asked, and the request carries the send's id as its
 * Idempotency-Key, so a repeated click or a retry never sends airtime twice. The API key is never logged or returned.
 */

const LIVE_URL = "https://api.africastalking.com";
const TIMEOUT_MS = 30_000;
const IOT_TYPES = "'Local IoT', 'International IoT'";

/** AFRICASTALKING_API_URL may point at a fake Africa's Talking for tests; real use always goes to the live API. */
function baseUrl(): string {
  const raw = (process.env.AFRICASTALKING_API_URL ?? "").trim().replace(/\/+$/, "");
  return /^https?:\/\//.test(raw) ? raw : LIVE_URL;
}

// ------------------------------------------------------------------ account (server environment)

/**
 * The Africa's Talking account comes from the server environment, never from the database or the browser:
 *   AFRICASTALKING_USERNAME   the app username
 *   AFRICASTALKING_API_KEY    the app API key (never logged or returned; the page only sees its last 4 characters)
 */
type Creds = { username: string; apiKey: string };

function envCreds(): Creds | null {
  const username = (process.env.AFRICASTALKING_USERNAME ?? "").trim();
  const apiKey = (process.env.AFRICASTALKING_API_KEY ?? "").trim();
  return username && apiKey ? { username, apiKey } : null;
}

/** GET /api/settings/africastalking — only whether it is set up: nothing about the account or the key leaves the server. */
export async function getAfricasTalking(_ctx: AuthContext): Promise<AfricasTalkingStatus> { // eslint-disable-line @typescript-eslint/no-unused-vars
  return { configured: !!envCreds() };
}

function credsOrThrow(): Creds {
  const c = envCreds();
  if (!c) throw new ApiError(422, "Africa's Talking is not set up yet. Ask the system administrator to set it up.", { form: "Africa's Talking is not set up yet." });
  return c;
}

/** The account balance: proves the username and API key work. Never throws for a refusal; returns the message. */
async function balance(c: Creds): Promise<{ ok: true; balance: string } | { ok: false; message: string }> {
  const url = new URL(`${baseUrl()}/version1/user`);
  url.searchParams.set("username", c.username);
  let res: Response;
  try {
    res = await fetch(url, { headers: { apiKey: c.apiKey, Accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(15_000) });
  } catch {
    return { ok: false, message: "Could not reach Africa's Talking. Check the internet connection and try again." };
  }
  const text = await res.text();
  if (res.status === 401 || res.status === 403) return { ok: false, message: "Africa's Talking refused the account. Ask the system administrator to check it." };
  let body: { UserData?: { balance?: unknown } } = {};
  try {
    body = JSON.parse(text);
  } catch {
    /* not JSON */
  }
  const b = body.UserData?.balance;
  if (!res.ok || typeof b !== "string") return { ok: false, message: `Africa's Talking did not accept the request (HTTP ${res.status}).` };
  return { ok: true, balance: b };
}

/** POST /api/settings/africastalking/test — the balance of the account in the environment. */
export async function testAfricasTalking(_ctx: AuthContext): Promise<{ ok: boolean; balance?: string; message?: string }> { // eslint-disable-line @typescript-eslint/no-unused-vars
  const r = await balance(credsOrThrow());
  return r.ok ? { ok: true, balance: r.balance } : { ok: false, message: r.message };
}

// ------------------------------------------------------------------ SIM lines

type LineRow = {
  sale_id: string;
  customer_id: string;
  customer_name: string;
  customer_phone: string | null;
  vehicle_plate: string;
  imei: string;
  sim_name: string;
  sim_number: string;
  auto_recharge: boolean;
  sms_reminder: boolean;
  card_type: string;
  expires: string | Date | null;
  gps_status: string | null;
  renewal_fee_minor: string | null;
  last_amount: string | null;
  last_status: AirtimeStatus | null;
  last_at: string | Date | null;
  p_amount: string | null;
  p_price: string | null;
  p_source: AirtimeExpirySource | null;
  p_custom: string | Date | null;
  p_at: string | Date | null;
  p_by: string | null;
  p_suspended: boolean | null;
  p_reason: "Manual" | "Expired" | null;
  m_amount: string | null;
  m_status: AirtimeStatus | null;
  m_at: string | Date | null;
};

type FullLine = ApprovedAirtimeLine | (PendingAirtimeLine & { plan: null });

const daysUntil = (to: string, from: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
const ymd = (v: string | Date | null) => (v === null ? null : typeof v === "string" ? v.slice(0, 10) : v.toISOString().slice(0, 10));
const monthStart = sql.raw(`(date_trunc('month', now() AT TIME ZONE 'Africa/Nairobi') AT TIME ZONE 'Africa/Nairobi')`);

/**
 * Every tracker SIM line that may get airtime (see the top of this file), with its last airtime, its monthly airtime
 * approval (if any) and this month's monthly airtime.
 */
async function lines(tenantId: string, where = sql`TRUE`, eligibleOnly = true): Promise<FullLine[]> {
  const r = await getDb().execute<LineRow>(sql`
    SELECT v.sale_id, v.customer_id, c.name AS customer_name, NULLIF(c.phone, '') AS customer_phone, v.vehicle_plate, v.imei, v.sim_name, v.sim_number, v.auto_recharge, v.sms_reminder,
           v.card_type::text AS card_type, v.expires, v.gps_status, v.renewal_fee_minor::text AS renewal_fee_minor,
           li.amount_minor::text AS last_amount, li.status AS last_status, li.updated_at AS last_at,
           p.monthly_amount_minor::text AS p_amount, p.renewal_price_minor::text AS p_price, p.expiry_source AS p_source,
           p.custom_expiry::text AS p_custom, p.approved_at AS p_at, u.full_name AS p_by, p.suspended AS p_suspended, p.suspended_reason AS p_reason,
           mi.amount_minor::text AS m_amount, mi.status AS m_status, mi.updated_at AS m_at
    FROM (${billingDevices(tenantId)}) v
    JOIN sim_cards sc ON sc.id = v.sim_card_id
    JOIN customers c ON c.id = v.customer_id
    LEFT JOIN airtime_plans p ON p.sale_id = v.sale_id AND p.tenant_id = ${tenantId}
    LEFT JOIN users u ON u.id = p.approved_by AND u.tenant_id = ${tenantId}
    LEFT JOIN LATERAL (
      SELECT i.amount_minor, i.status, i.updated_at FROM airtime_items i
      WHERE i.tenant_id = ${tenantId} AND i.sale_id = v.sale_id ORDER BY i.updated_at DESC LIMIT 1
    ) li ON TRUE
    LEFT JOIN LATERAL (
      SELECT i.amount_minor, i.status, i.updated_at FROM airtime_items i JOIN airtime_batches b ON b.id = i.batch_id
      WHERE i.tenant_id = ${tenantId} AND i.sale_id = v.sale_id AND b.kind = 'Monthly' AND i.status <> 'Failed' AND b.created_at >= ${monthStart}
      ORDER BY i.updated_at DESC LIMIT 1
    ) mi ON TRUE
    WHERE ${eligibleOnly ? sql`sc.type::text NOT IN (${sql.raw(IOT_TYPES)}) AND (sc.type::text = 'Prepaid' OR v.sale_type = 'Hosting Sale')` : sql`TRUE`} AND ${where}
    ORDER BY c.name, v.vehicle_plate, v.imei`);
  const today = todayInNairobi();
  const expiredNow: string[] = [];
  const out = r.rows.map((x): FullLine => {
    const p = x.sim_number ? validatePhone(x.sim_number) : null;
    const phone = p && !p.error ? p.value! : null;
    const lifelong = x.card_type === "Lifelong Card";
    const imeiExpiry = lifelong ? null : ymd(x.expires);
    const base: PendingAirtimeLine = {
      saleId: x.sale_id,
      customerId: x.customer_id,
      customerName: x.customer_name,
      customerPhone: x.customer_phone,
      vehiclePlate: x.vehicle_plate,
      imei: x.imei,
      simName: x.sim_name,
      simNumber: x.sim_number,
      phone,
      autoRecharge: x.auto_recharge,
      service: simServiceOf(x.sms_reminder, x.auto_recharge),
      last: x.last_status ? { amountMinor: Number(x.last_amount), status: x.last_status, at: new Date(x.last_at!).toISOString() } : null,
      imeiExpiry,
      lifelong,
    };
    if (!x.p_source) return { ...base, plan: null };
    const plan: AirtimePlan = {
      monthlyAmountMinor: Number(x.p_amount),
      renewalPriceMinor: Number(x.p_price),
      expirySource: x.p_source,
      customExpiry: ymd(x.p_custom),
      approvedAt: new Date(x.p_at!).toISOString(),
      approvedBy: x.p_by,
      suspended: !!x.p_suspended,
      suspendedReason: x.p_suspended ? (x.p_reason ?? "Manual") : null,
    };
    const expiry = plan.expirySource === "Custom" ? plan.customExpiry : imeiExpiry;
    const thisMonth = x.m_status ? { amountMinor: Number(x.m_amount), status: x.m_status, at: new Date(x.m_at!).toISOString() } : null;
    const platformExpired = plan.expirySource === "IMEI" && !lifelong && x.gps_status === "Expired";
    const expired = (!!expiry && expiry < today) || platformExpired;
    // Reaching the expiry date suspends the line automatically: it never gets airtime again until renewed and resumed.
    if (expired && !plan.suspended) {
      plan.suspended = true;
      plan.suspendedReason = "Expired";
      expiredNow.push(x.sale_id);
    }
    const state: MonthlyState = plan.suspended
      ? (plan.suspendedReason === "Expired" && expired ? "Expired" : "Suspended")
      : thisMonth
      ? "Sent"
      : plan.expirySource === "IMEI" && !lifelong && !imeiExpiry
          ? "Expiry unknown"
          : !phone
            ? "No SIM number"
            : "Due";
    const connection = x.gps_status === "Online" || x.gps_status === "Offline" || x.gps_status === "Expired" ? x.gps_status : null;
    const expiringSoon = !!expiry && expiry >= today && daysUntil(expiry, today) <= EXPIRY_WINDOW_DAYS;
    return { ...base, plan, expiry, state, thisMonth, connection, expiringSoon };
  });
  if (expiredNow.length) {
    const done = await getDb().execute<{ sale_id: string }>(sql`
      UPDATE airtime_plans SET suspended = TRUE, suspended_reason = 'Expired', suspended_at = now(), updated_at = now()
      WHERE tenant_id = ${tenantId} AND NOT suspended AND sale_id IN (${sql.join(expiredNow.map((id) => sql`${id}::uuid`), sql`, `)})
      RETURNING sale_id`);
    await logAirtimeEvent(tenantId, done.rows.map((r) => r.sale_id), "Suspended", "Device expired (automatic)", null);
  }
  return out;
}

const baseLine = (l: FullLine): AirtimeLine => ({
  saleId: l.saleId, customerId: l.customerId, customerName: l.customerName, customerPhone: l.customerPhone, vehiclePlate: l.vehiclePlate, imei: l.imei,
  simName: l.simName, simNumber: l.simNumber, phone: l.phone, autoRecharge: l.autoRecharge, service: l.service, last: l.last,
});

/** GET /api/airtime/lines */
export const listAirtimeLines = async (ctx: AuthContext): Promise<AirtimeLine[]> => (await lines(ctx.tenantId)).map(baseLine);

// ------------------------------------------------------------------ monthly airtime (approvals)

/** GET /api/airtime/monthly — sales ticked for monthly airtime waiting for approval, and the approved lines. */
export async function getAirtimeMonthly(ctx: AuthContext): Promise<AirtimeMonthly> {
  // Every sale ticked "automatic airtime recharge", whatever the sale type or SIM type.
  const all = await lines(ctx.tenantId, sql`(v.auto_recharge OR p.sale_id IS NOT NULL)`, false);
  const pending: PendingAirtimeLine[] = [];
  const approved: ApprovedAirtimeLine[] = [];
  for (const l of all) {
    if (l.plan) approved.push(l as ApprovedAirtimeLine);
    else {
      const { plan: _plan, ...rest } = l; // eslint-disable-line @typescript-eslint/no-unused-vars
      pending.push(rest);
    }
  }
  return { month: todayInNairobi().slice(0, 7), pending, approved };
}

const oneLine = async (tenantId: string, saleId: string) =>
  isUuid(saleId) ? ((await lines(tenantId, sql`v.sale_id = ${saleId}::uuid AND (v.auto_recharge OR p.sale_id IS NOT NULL)`, false))[0] ?? null) : null;

/** PUT /api/airtime/plans/{saleId} { monthlyAmount, renewalPrice, expirySource, customExpiry } — approve or change. */
export async function approveAirtimePlan(ctx: AuthContext, saleId: string, body: Body): Promise<AirtimeMonthly | null> {
  requireAdmin(ctx, "approve or change automatic airtime");
  const r = new Reader(body, ["monthlyAmount", "renewalPrice", "expirySource", "customExpiry"]);
  const draft = { monthlyAmount: r.text("monthlyAmount"), renewalPrice: r.text("renewalPrice"), expirySource: r.text("expirySource"), customExpiry: r.text("customExpiry") };
  r.done();
  const line = await oneLine(ctx.tenantId, saleId);
  if (!line) return null;
  if (!line.plan && !line.autoRecharge) throwValidation({ form: "This sale was not ticked for automatic airtime recharge." });
  const v = validateAirtimePlan(draft, todayInNairobi());
  if (!v.value) throwValidation(v.errors);
  const p = v.value!;
  const by = isUuid(ctx.userId) ? ctx.userId : null;
  await getDb().execute(sql`
    INSERT INTO airtime_plans (sale_id, tenant_id, monthly_amount_minor, renewal_price_minor, expiry_source, custom_expiry, approved_by)
    VALUES (${saleId}::uuid, ${ctx.tenantId}, ${p.monthlyAmountMinor}, ${p.renewalPriceMinor}, ${p.expirySource}, ${p.customExpiry}::date, ${by}::uuid)
    ON CONFLICT (sale_id) DO UPDATE SET monthly_amount_minor = EXCLUDED.monthly_amount_minor, renewal_price_minor = EXCLUDED.renewal_price_minor,
      expiry_source = EXCLUDED.expiry_source, custom_expiry = EXCLUDED.custom_expiry, updated_at = now()
    WHERE airtime_plans.tenant_id = ${ctx.tenantId}`);
  return getAirtimeMonthly(ctx);
}

/** DELETE /api/airtime/plans/{saleId} — stop monthly airtime (the sale goes back to waiting for approval). */
export async function stopAirtimePlan(ctx: AuthContext, saleId: string): Promise<AirtimeMonthly | null> {
  requireAdmin(ctx, "stop automatic airtime");
  if (!isUuid(saleId)) return null;
  const r = await getDb().execute(sql`DELETE FROM airtime_plans WHERE sale_id = ${saleId}::uuid AND tenant_id = ${ctx.tenantId} RETURNING sale_id`);
  if (!r.rows.length) return null;
  return getAirtimeMonthly(ctx);
}

/** POST /api/airtime/plans/{saleId}/imei-expiry — read the device's expiry from the GPS platform now and store it. */
export async function refreshImeiExpiry(ctx: AuthContext, saleId: string): Promise<{ imeiExpiry: string | null; lifelong: boolean; message?: string } | null> {
  const line = await oneLine(ctx.tenantId, saleId);
  if (!line) return null;
  if (line.lifelong) return { imeiExpiry: null, lifelong: true };
  const res = (await verifyImeisOnServer(ctx.tenantId, [line.imei])).get(line.imei);
  if (!res || !res.ok) return { imeiExpiry: line.imeiExpiry, lifelong: false, message: `${res?.message ?? "The device could not be checked."} Showing the last known date.` };
  await storeGpsDevice(ctx.tenantId, saleId, res.device);
  const fresh = await oneLine(ctx.tenantId, saleId);
  return { imeiExpiry: fresh?.imeiExpiry ?? null, lifelong: false, ...(fresh?.imeiExpiry ? {} : { message: "The GPS platform has no expiry date for this device." }) };
}

// ------------------------------------------------------------------ sending

type BatchRow = { id: string; kind: "Manual" | "Monthly"; amount_minor: string | null; recipients: number; sent: number; failed: number; total_amount: string | null; total_discount: string | null; error: string | null; created_at: string | Date; created_by: string | null };
type ItemRow = { batch_id: string; sale_id: string | null; customer_name: string | null; vehicle_plate: string | null; phone: string; amount_minor: string; status: AirtimeStatus; request_id: string | null; discount: string | null; error: string | null };

async function batches(tenantId: string, where = sql`TRUE`, limit = 30): Promise<AirtimeBatch[]> {
  const db = getDb();
  const b = await db.execute<BatchRow>(sql`
    SELECT b.id, b.kind, b.amount_minor::text, b.recipients, b.sent, b.failed, b.total_amount, b.total_discount, b.error, b.created_at, u.full_name AS created_by
    FROM airtime_batches b LEFT JOIN users u ON u.id = b.created_by AND u.tenant_id = b.tenant_id
    WHERE b.tenant_id = ${tenantId} AND ${where} ORDER BY b.created_at DESC, b.id DESC LIMIT ${limit}`);
  if (!b.rows.length) return [];
  const ids = sql.join(b.rows.map((x) => sql`${x.id}::uuid`), sql`, `);
  const items = await db.execute<ItemRow>(sql`
    SELECT i.batch_id, i.sale_id, c.name AS customer_name, ps.vehicle_plate, i.phone, i.amount_minor::text, i.status, i.request_id, i.discount, i.error
    FROM airtime_items i LEFT JOIN sales s ON s.id = i.sale_id LEFT JOIN customers c ON c.id = s.customer_id LEFT JOIN package_sales ps ON ps.sale_id = i.sale_id
    WHERE i.tenant_id = ${tenantId} AND i.batch_id IN (${ids}) ORDER BY c.name, ps.vehicle_plate, i.phone`);
  return b.rows.map((x) => ({
    id: x.id,
    kind: x.kind,
    amountMinor: x.amount_minor === null ? null : Number(x.amount_minor),
    recipients: x.recipients,
    sent: x.sent,
    failed: x.failed,
    totalAmount: x.total_amount,
    totalDiscount: x.total_discount,
    error: x.error,
    createdAt: new Date(x.created_at).toISOString(),
    createdBy: x.created_by,
    items: items.rows.filter((i) => i.batch_id === x.id).map((i): AirtimeItem => ({
      saleId: i.sale_id,
      customerName: i.customer_name ?? "",
      vehiclePlate: i.vehicle_plate ?? "",
      phone: i.phone,
      amountMinor: Number(i.amount_minor),
      status: i.status,
      requestId: i.request_id,
      discount: i.discount,
      error: i.error,
    })),
  }));
}

/** GET /api/airtime/history — the latest sends with every line. */
export const listAirtimeHistory = (ctx: AuthContext) => batches(ctx.tenantId);

type AtEntry = { phoneNumber?: unknown; status?: unknown; requestId?: unknown; discount?: unknown; errorMessage?: unknown };
const str = (v: unknown, max = 200) => (typeof v === "string" && v.trim() && v.trim() !== "None" ? v.trim().slice(0, max) : null);

/** Shape checks shared by both sends: a list of 1–1000 different sale ids. */
function readSaleIds(raw: unknown, errors: Record<string, string>): string[] {
  if (!Array.isArray(raw) || raw.length === 0) errors.lines = "Select at least one SIM line";
  else if (raw.length > AIRTIME_MAX_RECIPIENTS) errors.lines = `Select at most ${AIRTIME_MAX_RECIPIENTS} SIM lines per send`;
  else if (!raw.every((x) => typeof x === "string" && isUuid(x))) errors.lines = "Invalid selection";
  else if (new Set(raw).size !== raw.length) errors.lines = "A SIM line is selected twice";
  return Array.isArray(raw) ? (raw as string[]) : [];
}

const idList = (ids: string[]) => sql.join(ids.map((id) => sql`${id}::uuid`), sql`, `);

/** POST /api/airtime/send { saleIds: string[], amount: "110", clientKey } — the same amount to the picked lines. */
export async function sendAirtime(ctx: AuthContext, body: Body): Promise<AirtimeBatch> {
  requireAdmin(ctx, "send airtime");
  const r = new Reader(body, ["saleIds", "amount", "clientKey"]);
  const amount = parseAirtimeAmount(r.text("amount"));
  const clientKey = r.clientKey();
  r.done();
  const errors: Record<string, string> = {};
  if (!clientKey) errors.form = "Missing request key";
  if (amount.error) errors.amount = amount.error;
  const saleIds = readSaleIds(body.saleIds, errors);
  if (Object.keys(errors).length) throwValidation(errors);

  const again = await replay(ctx.tenantId, clientKey!);
  if (again) return again;
  const creds = credsOrThrow();
  const chosen = await lines(ctx.tenantId, sql`v.sale_id IN (${idList(saleIds)})`);
  if (chosen.length !== saleIds.length) throwValidation({ lines: "Some selected lines cannot get airtime (not a tracker SIM line of yours, or no longer eligible). Reload the list." });
  return dispatch(ctx, creds, clientKey!, "Manual", chosen.map((line) => ({ line, amountMinor: amount.value! })));
}

/**
 * POST /api/airtime/send-monthly { saleIds, clientKey } — this month's airtime to approved lines that are due, each
 * with its approved monthly amount. A line already sent (or unconfirmed) this month is never sent again.
 */
export async function sendMonthlyAirtime(ctx: AuthContext, body: Body): Promise<AirtimeBatch> {
  requireAdmin(ctx, "send airtime");
  const r = new Reader(body, ["saleIds", "clientKey"]);
  const clientKey = r.clientKey();
  r.done();
  const errors: Record<string, string> = {};
  if (!clientKey) errors.form = "Missing request key";
  const saleIds = readSaleIds(body.saleIds, errors);
  if (Object.keys(errors).length) throwValidation(errors);

  const again = await replay(ctx.tenantId, clientKey!);
  if (again) return again;
  const creds = credsOrThrow();
  const chosen = await lines(ctx.tenantId, sql`v.sale_id IN (${idList(saleIds)}) AND p.sale_id IS NOT NULL`, false);
  if (chosen.length !== saleIds.length || chosen.some((l) => !l.plan)) throwValidation({ lines: "Some selected lines are not approved for monthly airtime. Reload the list." });
  const notDue = (chosen as ApprovedAirtimeLine[]).filter((l) => l.state !== "Due");
  if (notDue.length) throwValidation({ lines: `${notDue.length} selected line(s) are not due: ${notDue.slice(0, 3).map((l) => `${l.vehiclePlate || l.imei} (${l.state})`).join(", ")}. Reload the list.` });
  return dispatch(ctx, creds, clientKey!, "Monthly", (chosen as ApprovedAirtimeLine[]).map((line) => ({ line, amountMinor: line.plan.monthlyAmountMinor })));
}

/** The same form sent again: return that send, never send again. */
const replay = async (tenantId: string, clientKey: string) => (await batches(tenantId, sql`b.client_key = ${clientKey}`, 1))[0] ?? null;

/** One recipient: a tracker SIM line (saleId) or a number typed in for a one-off top-up (saleId null). */
type Recipient = { saleId: string | null; phone: string | null; vehiclePlate: string; imei: string };
type Pick = { line: Recipient; amountMinor: number };

async function dispatch(ctx: AuthContext, creds: Creds, clientKey: string, kind: AirtimeBatch["kind"], picks: Pick[]): Promise<AirtimeBatch> {
  const noPhone = picks.filter((p) => !p.line.phone);
  if (noPhone.length) throwValidation({ lines: `${noPhone.length} selected line(s) have no valid SIM number: ${noPhone.slice(0, 3).map((p) => p.line.vehiclePlate || p.line.imei).join(", ")}` });
  const phones = picks.map((p) => p.line.phone!);
  const dup = phones.find((p, i) => phones.indexOf(p) !== i);
  if (dup) throwValidation({ lines: `The SIM number ${dup} is on more than one selected line. Select it once.` });
  const amounts = new Set(picks.map((p) => p.amountMinor));
  const db = getDb();
  const saleIds = picks.map((p) => p.line.saleId).filter((x): x is string => !!x);

  // 1) Save the send with every line Pending.
  let batchId: string;
  try {
    batchId = await db.transaction(async (tx) => {
      if (kind === "Monthly") {
        // Two monthly sends at the same moment: the second waits here, then finds this month's airtime and stops.
        await tx.execute(sql`SELECT sale_id FROM airtime_plans WHERE tenant_id = ${ctx.tenantId} AND sale_id IN (${idList(saleIds)}) ORDER BY sale_id FOR UPDATE`);
        const sent = await tx.execute<{ sale_id: string }>(sql`
          SELECT DISTINCT i.sale_id FROM airtime_items i JOIN airtime_batches b ON b.id = i.batch_id
          WHERE i.tenant_id = ${ctx.tenantId} AND i.sale_id IN (${idList(saleIds)}) AND b.kind = 'Monthly' AND i.status <> 'Failed' AND b.created_at >= ${monthStart}`);
        if (sent.rows.length) throw new ApiError(422, "Please correct the highlighted fields", { lines: `${sent.rows.length} selected line(s) already got this month's airtime. Reload the list.` });
      }
      const b = await tx.execute<{ id: string }>(sql`
        INSERT INTO airtime_batches (tenant_id, client_key, kind, amount_minor, recipients, created_by)
        VALUES (${ctx.tenantId}, ${clientKey}, ${kind}, ${amounts.size === 1 ? picks[0].amountMinor : null}, ${picks.length}, ${isUuid(ctx.userId) ? ctx.userId : null}::uuid) RETURNING id`);
      const id = b.rows[0].id;
      await tx.execute(sql`
        INSERT INTO airtime_items (tenant_id, batch_id, sale_id, phone, amount_minor, status)
        VALUES ${sql.join(picks.map((p) => sql`(${ctx.tenantId}, ${id}::uuid, ${p.line.saleId}::uuid, ${p.line.phone}, ${p.amountMinor}, 'Pending')`), sql`, `)}`);
      return id;
    });
  } catch (e) {
    if (e instanceof ApiError) throw e;
    const replayed = await replay(ctx.tenantId, clientKey);
    if (replayed) return replayed;
    throw e;
  }

  // 2) Ask Africa's Talking. The send's id is the Idempotency-Key, so a retry of this same send is not duplicated.
  let answer: { status: number; body: { errorMessage?: unknown; totalAmount?: unknown; totalDiscount?: unknown; responses?: unknown } | null } | null = null;
  try {
    const res = await fetch(`${baseUrl()}/version1/airtime/send`, {
      method: "POST",
      cache: "no-store",
      headers: { "Content-Type": "application/json", Accept: "application/json", apiKey: creds.apiKey, "Idempotency-Key": batchId },
      body: JSON.stringify({
        username: creds.username,
        recipients: picks.map((p) => ({ phoneNumber: p.line.phone, amount: atAmount(p.amountMinor) })),
        maxNumRetry: 2,
        requestMetadata: { erpSendId: batchId },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const text = await res.text();
    let parsed = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
    answer = { status: res.status, body: parsed };
  } catch {
    answer = null;
  }

  // 3) Record the result per line.
  if (!answer) {
    await db.execute(sql`UPDATE airtime_items SET status = 'Unknown', error = 'No answer from Africa''s Talking. Check its dashboard before sending again.', updated_at = now() WHERE batch_id = ${batchId}::uuid`);
    await db.execute(sql`UPDATE airtime_batches SET error = 'No answer from Africa''s Talking: some airtime may have been sent. Check the Africa''s Talking dashboard before sending again.' WHERE id = ${batchId}::uuid`);
  } else {
    const responses = Array.isArray(answer.body?.responses) ? (answer.body!.responses as AtEntry[]) : [];
    const whole = str(answer.body?.errorMessage, 300);
    const refused = answer.status === 401 || answer.status === 403 ? "Africa's Talking refused the account. Ask the system administrator to check it." : null;
    for (const { line } of picks) {
      const e = responses.find((x) => typeof x.phoneNumber === "string" && x.phoneNumber.replace(/\s/g, "") === line.phone);
      const status: AirtimeStatus = e ? (e.status === "Sent" ? "Sent" : "Failed") : "Failed";
      const error = e ? str(e.errorMessage, 300) : (refused ?? whole ?? `Not accepted by Africa's Talking (HTTP ${answer.status}).`);
      await db.execute(sql`
        UPDATE airtime_items SET status = ${status}, request_id = ${e ? str(e.requestId, 100) : null}, discount = ${e ? str(e.discount, 40) : null},
          error = ${status === "Sent" ? null : error}, updated_at = now()
        WHERE batch_id = ${batchId}::uuid AND phone = ${line.phone}`);
    }
    await db.execute(sql`
      UPDATE airtime_batches SET
        sent = (SELECT count(*) FROM airtime_items WHERE batch_id = ${batchId}::uuid AND status = 'Sent'),
        failed = (SELECT count(*) FROM airtime_items WHERE batch_id = ${batchId}::uuid AND status = 'Failed'),
        total_amount = ${str(answer.body?.totalAmount, 40)}, total_discount = ${str(answer.body?.totalDiscount, 40)},
        error = ${refused ?? (responses.length === 0 ? (whole ?? `Not accepted by Africa's Talking (HTTP ${answer.status}).`) : null)}
      WHERE id = ${batchId}::uuid`);
  }
  return (await batches(ctx.tenantId, sql`b.id = ${batchId}::uuid`, 1))[0];
}

// ------------------------------------------------------------------ overview, suspend, one-off top-up

/** GET /api/airtime/overview — the Airtime dashboard: Africa's Talking balance and the monthly airtime counts. */
export async function getAirtimeOverview(ctx: AuthContext): Promise<AirtimeOverview> {
  const creds = envCreds();
  const [m, bal] = await Promise.all([getAirtimeMonthly(ctx), creds ? balance(creds) : Promise.resolve(null)]);
  const count = (st: MonthlyState[]) => m.approved.filter((l) => st.includes(l.state)).length;
  const due = m.approved.filter((l) => l.state === "Due");
  return {
    month: m.month,
    configured: !!creds,
    balance: bal && bal.ok ? bal.balance : null,
    balanceError: bal && !bal.ok ? bal.message : null,
    active: count(["Due", "Sent", "Expiry unknown", "No SIM number"]),
    suspended: count(["Suspended"]),
    expired: count(["Expired"]),
    pending: m.pending.length,
    dueCount: due.length,
    dueMinor: due.reduce((t, l) => t + l.plan.monthlyAmountMinor, 0),
    sentThisMonth: count(["Sent"]),
  };
}

/** POST /api/airtime/plans/{saleId}/suspend { suspended: boolean } — pause or resume monthly airtime for one line. */
export async function suspendAirtimePlan(ctx: AuthContext, saleId: string, body: Body): Promise<AirtimeMonthly | null> {
  requireAdmin(ctx, "suspend or resume automatic airtime");
  const r = new Reader(body, ["suspended"]);
  const suspended = r.bool("suspended");
  r.done();
  const line = await oneLine(ctx.tenantId, saleId);
  if (!line || !line.plan) return null;
  if (!suspended && line.state === "Expired") {
    throwValidation({ form: "This device has expired, so its airtime was suspended automatically. Renew the device (or set a later custom expiry with Edit) before resuming." });
  }
  const changed = await getDb().execute<{ sale_id: string }>(sql`
    UPDATE airtime_plans SET suspended = ${suspended}, suspended_reason = ${suspended ? "Manual" : null}, suspended_at = ${suspended ? sql`now()` : sql`NULL`}, updated_at = now()
    WHERE sale_id = ${saleId}::uuid AND tenant_id = ${ctx.tenantId} AND suspended IS DISTINCT FROM ${suspended}
    RETURNING sale_id`);
  if (changed.rows.length) {
    await logAirtimeEvent(ctx.tenantId, [saleId], suspended ? "Suspended" : "Resumed", suspended ? "Suspended from Communication → Airtime" : "Resumed from Communication → Airtime", isUuid(ctx.userId) ? ctx.userId : null);
  }
  return getAirtimeMonthly(ctx);
}

/** POST /api/airtime/topup { phone, amount, clientKey } — one-off airtime to a number typed in (any Kenyan number). */
export async function sendTopUp(ctx: AuthContext, body: Body): Promise<AirtimeBatch> {
  requireAdmin(ctx, "send airtime");
  const r = new Reader(body, ["phone", "amount", "clientKey"]);
  const rawPhone = r.text("phone").trim();
  const amount = parseAirtimeAmount(r.text("amount"));
  const clientKey = r.clientKey();
  r.done();
  const errors: Record<string, string> = {};
  if (!clientKey) errors.form = "Missing request key";
  const p = rawPhone ? validatePhone(rawPhone) : null;
  if (!rawPhone) errors.phone = "Enter the phone number";
  else if (!p || p.error) errors.phone = "Enter a valid phone number, e.g. 0712 345 678";
  if (amount.error) errors.amount = amount.error;
  if (Object.keys(errors).length) throwValidation(errors);
  const again = await replay(ctx.tenantId, clientKey!);
  if (again) return again;
  const creds = credsOrThrow();
  return dispatch(ctx, creds, clientKey!, "TopUp", [{ line: { saleId: null, phone: p!.value!, vehiclePlate: "", imei: "" }, amountMinor: amount.value! }]);
}

// ------------------------------------------------------------------ remove from airtime, add subscription

/**
 * POST /api/airtime/plans/{saleId}/remove { next: "None" | "SMS reminder", notify: "sms" | "none", message } — take the
 * line off automatic airtime: the approval is deleted and the sale's service becomes `next` (None, or the monthly
 * airtime alert SMS), logged in the sale's history. With "sms" the customer is sent the message through TextSMS
 * first (saved in Bulk SMS → History); the SMS result is recorded with the change.
 */
export async function removeFromAirtime(ctx: AuthContext, saleId: string, body: Body): Promise<{ monthly: AirtimeMonthly; sms: { status: "Sent" | "Failed"; error: string | null } | null } | null> {
  requireAdmin(ctx, "remove a line from automatic airtime");
  const r = new Reader(body, ["notify", "message", "next"]);
  const notify = r.text("notify");
  const message = r.text("message").trim();
  const next = (r.text("next") || "None") as "None" | "SMS reminder";
  r.done();
  const line = await oneLine(ctx.tenantId, saleId);
  if (!line) return null;
  if (notify !== "sms" && notify !== "none") throwValidation({ notify: "Choose whether to send the customer an SMS" });
  if (next !== "None" && next !== "SMS reminder") throwValidation({ next: "Choose the monthly airtime alert SMS or None" });
  let sms: { status: "Sent" | "Failed"; error: string | null } | null = null;
  if (notify === "sms") {
    const errors: Record<string, string> = {};
    const p = line.customerPhone ? validatePhone(line.customerPhone) : null;
    if (!p || p.error) errors.notify = "The customer has no valid phone number in CRM, so no SMS can be sent";
    if (!message) errors.message = "Enter the SMS message";
    else if (message.length > 480) errors.message = "Keep the SMS under 480 characters";
    if (Object.keys(errors).length) throwValidation(errors);
    if (!textSmsConfigured()) throwValidation({ notify: "TextSMS is not set up yet, so no SMS can be sent" });
    sms = await sendSystemSms(ctx, { customerId: line.customerId, saleId, phone: p!.value! }, message);
  }
  await applyServiceChange(ctx, saleId, { to: next, reason: "Removed from airtime", sms });
  return { monthly: await getAirtimeMonthly(ctx), sms };
}

/** GET /api/airtime/candidates — tracker lines that can take airtime but are not on automatic airtime recharge yet. */
export async function listAirtimeCandidates(ctx: AuthContext): Promise<AirtimeLine[]> {
  return (await lines(ctx.tenantId, sql`NOT v.auto_recharge AND p.sale_id IS NULL`)).map(baseLine);
}

/** POST /api/airtime/subscribe/{saleId} { reason } — switch an existing sale to automatic airtime recharge (it then waits for approval). */
export async function subscribeToAirtime(ctx: AuthContext, saleId: string, body: Body): Promise<AirtimeMonthly | null> {
  const r = new Reader(body, ["reason"]);
  const reason = r.text("reason").trim();
  r.done();
  if (reason.length > 300) throwValidation({ reason: "Keep the reason under 300 characters" });
  const done = await applyServiceChange(ctx, saleId, { to: "Automatic airtime recharge", reason: reason || "Added from Communication → Airtime" });
  if (!done) return null;
  return getAirtimeMonthly(ctx);
}
