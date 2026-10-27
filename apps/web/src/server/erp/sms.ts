import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { sql, type SQL } from "drizzle-orm";
import { EXPIRY_WINDOW_DAYS, normalizeDate, todayInNairobi } from "@/lib/billing";
import {
  checkSchedule,
  dayThisMonth,
  DEFAULT_REMINDER_MESSAGE,
  fieldValues,
  messageProblem,
  nairobiStamp,
  normalizeSms,
  parsePhoneList,
  renderSms,
  SMS_MAX_RECIPIENTS,
  smsParts,
  unknownFields,
  validateTemplate,
  type ReminderState,
  type SmsAudience,
  type SmsBatch,
  type SmsCustomer,
  type SmsKind,
  type SmsMessage,
  type SmsOverview,
  type SmsReminderLine,
  type SmsReminderSettings,
  type SmsStatus,
  type SmsTemplate,
  type TextSmsStatus,
} from "@/lib/sms";
import { validatePhone } from "@/lib/validation";
import { requireAdmin, type AuthContext } from "../crm/auth";
import { getDb } from "../crm/db";
import { asSystem, asTenant } from "../crm/db-scope";
import { ApiError, isUuid, uniqueViolation } from "../crm/http";
import { Reader, throwValidation, type Body } from "./body";
import { billingDevices } from "./billing";
import {
  TEXTSMS_BULK_MAX,
  textSmsBalance,
  textSmsConfigured,
  textSmsCreds,
  textSmsCredsOrThrow,
  textSmsDlr,
  textSmsSendBulk,
  textSmsSendScheduled,
  type SmsOutcome,
  type TextSmsCreds,
} from "./textsms";

/**
 * Communication → Bulk SMS with TextSMS.
 *
 *   GET  /api/sms/overview                    dashboard (credit balance, this month's SMS, reminders due)
 *   GET  /api/sms/customers                   customers to message (with device counts and their last SMS)
 *   GET  /api/sms/reminders?type=airtime|expiry   tracker lines for the monthly airtime / expiry & renewal reminder
 *   POST /api/sms/send                        { kind, ids | phones, message, templateName, scheduleAt, clientKey }
 *   GET  /api/sms/history, GET /api/sms/batches/{id}, POST /api/sms/batches/{id}/delivery
 *   GET/POST /api/sms/templates, PUT/DELETE /api/sms/templates/{id}
 *
 * A send is saved with every message Pending BEFORE TextSMS is asked, and the browser's clientKey makes a repeated
 * click return the same send. The monthly airtime reminder goes once per tracker line per month. The API key and the
 * partner ID are never logged or returned.
 */

const today = sql.raw(`(now() AT TIME ZONE 'Africa/Nairobi')::date`);
const monthStart = sql.raw(`(date_trunc('month', now() AT TIME ZONE 'Africa/Nairobi') AT TIME ZONE 'Africa/Nairobi')`);
const isExpired = sql`(v.card_type <> 'Lifelong Card' AND (v.expires < ${today} OR v.gps_status = 'Expired'))`;
const isSoon = sql`(v.card_type <> 'Lifelong Card' AND v.expires BETWEEN ${today} AND ${today} + ${EXPIRY_WINDOW_DAYS}::int AND v.gps_status IS DISTINCT FROM 'Expired')`;
/** Expired devices stay on the expiry reminder list for 90 days. */
const EXPIRED_LIST_DAYS = 90;

const iso = (v: string | Date) => new Date(v).toISOString();
const ymd = (v: string | Date | null) => (v === null ? null : typeof v === "string" ? v.slice(0, 10) : v.toISOString().slice(0, 10));
const phoneOf = (raw: string | null) => {
  if (!raw) return null;
  const p = validatePhone(raw);
  return p.error ? null : p.value;
};
const firstNameOf = (type: string, first: string | null, company: string | null, name: string) => (type === "Company" ? (company ?? name) : (first ?? name.split(" ")[0]));
const idList = (ids: string[]) => sql.join(ids.map((id) => sql`${id}::uuid`), sql`, `);

/** GET /api/settings/textsms — only whether it is set up: nothing about the account leaves the server. */
export async function getTextSms(_ctx: AuthContext): Promise<TextSmsStatus> { // eslint-disable-line @typescript-eslint/no-unused-vars
  return { configured: textSmsConfigured() };
}

// ------------------------------------------------------------------ audiences

type CustomerRow = {
  id: string; name: string; first_name: string | null; company_name: string | null; type: SmsCustomer["type"]; account: string; phone: string;
  brand_name: string | null; devices: number; expired: number; soon: number; last_at: string | Date | null; last_status: SmsStatus | null;
};

async function customers(tenantId: string, where: SQL = sql`TRUE`): Promise<SmsCustomer[]> {
  const r = await getDb().execute<CustomerRow>(sql`
    WITH v AS (${billingDevices(tenantId)})
    SELECT c.id, c.name, c.first_name, c.company_name, c.type::text AS type, c.account, c.phone, b.name AS brand_name,
           count(v.sale_id)::int AS devices,
           (count(v.sale_id) FILTER (WHERE ${isExpired}))::int AS expired,
           (count(v.sale_id) FILTER (WHERE ${isSoon}))::int AS soon,
           ls.created_at AS last_at, ls.status AS last_status
    FROM customers c
    LEFT JOIN brands b ON b.id = c.brand_id
    LEFT JOIN v ON v.customer_id = c.id
    LEFT JOIN LATERAL (
      SELECT m.created_at, m.status FROM sms_messages m WHERE m.tenant_id = ${tenantId} AND m.customer_id = c.id ORDER BY m.created_at DESC LIMIT 1
    ) ls ON TRUE
    WHERE c.tenant_id = ${tenantId} AND ${where}
    GROUP BY c.id, b.name, ls.created_at, ls.status
    ORDER BY c.name, c.account`);
  return r.rows.map((x) => ({
    id: x.id,
    name: x.name,
    firstName: firstNameOf(x.type, x.first_name, x.company_name, x.name),
    account: x.account,
    type: x.type,
    brandName: x.brand_name,
    phone: phoneOf(x.phone),
    devices: x.devices,
    expired: x.expired,
    expiringSoon: x.soon,
    last: x.last_at && x.last_status ? { at: iso(x.last_at), status: x.last_status } : null,
  }));
}

/** GET /api/sms/customers */
export const listSmsCustomers = (ctx: AuthContext) => customers(ctx.tenantId);

type LineRow = {
  sale_id: string; customer_id: string; customer_name: string; first_name: string | null; company_name: string | null; type: string; customer_phone: string;
  vehicle_plate: string; imei: string; sim_number: string; expires: string | Date | null; renewal_fee_minor: string | null;
  expired: boolean; soon: boolean; last_at: string | Date | null; last_status: SmsStatus | null; sent_month: boolean;
  sale_type: "Package Sale" | "Hosting Sale"; sold_at: string | Date; reminders: number;
  gps_model: string | null; tracker_model: string | null; package_name: string; total_minor: string; gps_activation_date: string | null; gps_synced_at: string | Date | null;
  ch_at: string | Date | null; ch_from: "None" | "Automatic airtime recharge" | null; ch_by: string | null; ch_reason: string | null;
  gps_status: string | null; blocked: boolean;
};

export type ReminderType = "airtime" | "expiry";
const reminderKind = (t: ReminderType): SmsKind => (t === "airtime" ? "AirtimeReminder" : "ExpiryReminder");

/**
 * Tracker lines for a reminder. airtime: sales on the monthly airtime alert SMS ("SMS reminder"), once per line per
 * month. expiry: devices expiring within the expiry window, or expired in the last 90 days.
 */
async function reminderLines(tenantId: string, type: ReminderType, where: SQL = sql`TRUE`): Promise<SmsReminderLine[]> {
  const kind = reminderKind(type);
  // The SMS reminder is for tracker SIMs only: never IoT SIMs (billed under Billing → IoT SIM), and only the newest sale
  // of each device (billingDevices), so a device sold again follows its new sale.
  const pick = type === "airtime"
    ? sql`v.sms_reminder AND NOT v.auto_recharge AND NOT v.iot_billing AND sc.type::text NOT IN ('Local IoT', 'International IoT')`
    : sql`(${isSoon} OR (${isExpired} AND (v.expires IS NULL OR v.expires >= ${today} - ${EXPIRED_LIST_DAYS}::int)))`;
  const r = await getDb().execute<LineRow>(sql`
    SELECT v.sale_id, v.customer_id, c.name AS customer_name, c.first_name, c.company_name, c.type::text AS type, c.phone AS customer_phone,
           v.vehicle_plate, v.imei, v.sim_number, v.expires, v.renewal_fee_minor::text AS renewal_fee_minor,
           ${isExpired} AS expired, ${isSoon} AS soon, v.sale_type, v.sold_at,
           v.gps_model, v.tracker_model, v.package_name, (SELECT s3.total_minor::text FROM sales s3 WHERE s3.id = v.sale_id) AS total_minor, v.gps_activation_date, v.gps_synced_at,
           ls.created_at AS last_at, ls.status AS last_status, (mm.x IS NOT NULL) AS sent_month,
           (SELECT count(*)::int FROM sms_messages m2 JOIN sms_batches b2 ON b2.id = m2.batch_id
             WHERE m2.tenant_id = ${tenantId} AND m2.sale_id = v.sale_id AND b2.kind = ${kind}) AS reminders,
           ch.created_at AS ch_at, ch.from_service AS ch_from, ch.by_name AS ch_by, ch.reason AS ch_reason,
           v.gps_status, (bl.customer_id IS NOT NULL) AS blocked
    FROM (${billingDevices(tenantId)}) v
    JOIN customers c ON c.id = v.customer_id
    LEFT JOIN sms_reminder_blocks bl ON bl.tenant_id = ${tenantId} AND bl.customer_id = v.customer_id
    JOIN sim_cards sc ON sc.id = v.sim_card_id
    LEFT JOIN LATERAL (
      SELECT x.created_at, x.from_service, x.reason, u.full_name AS by_name FROM sale_service_changes x
      LEFT JOIN users u ON u.id = x.changed_by AND u.tenant_id = x.tenant_id
      WHERE x.tenant_id = ${tenantId} AND x.sale_id = v.sale_id AND x.kind = 'Service' AND x.to_service = 'SMS reminder'
      ORDER BY x.created_at DESC, x.id DESC LIMIT 1
    ) ch ON TRUE
    LEFT JOIN LATERAL (
      SELECT m.created_at, m.status FROM sms_messages m JOIN sms_batches b ON b.id = m.batch_id
      WHERE m.tenant_id = ${tenantId} AND m.sale_id = v.sale_id AND b.kind = ${kind} ORDER BY m.created_at DESC LIMIT 1
    ) ls ON TRUE
    LEFT JOIN LATERAL (
      SELECT 1 AS x FROM sms_messages m JOIN sms_batches b ON b.id = m.batch_id
      WHERE m.tenant_id = ${tenantId} AND m.sale_id = v.sale_id AND b.kind = ${kind} AND m.status <> 'Failed' AND m.created_at >= ${monthStart} LIMIT 1
    ) mm ON TRUE
    WHERE ${pick} AND ${where}
    ORDER BY ${type === "expiry" ? sql`v.expires NULLS FIRST, c.name` : sql`c.name, v.vehicle_plate`}, v.imei`);
  const t = todayInNairobi();
  // Every sale of these devices (a device can be sold more than once), for "Sales history" in the vehicle view.
  const imeis = [...new Set(r.rows.map((x) => x.imei))];
  const hist = imeis.length ? await getDb().execute<{ imei: string; sale_id: string; type: "Package Sale" | "Hosting Sale"; created_at: string | Date; package_name: string; total_minor: string; card_type: string }>(sql`
    SELECT ps.imei, s.id AS sale_id, s.type::text AS type, s.created_at, ps.package_name, s.total_minor::text AS total_minor, ps.card_type::text AS card_type
    FROM package_sales ps JOIN sales s ON s.id = ps.sale_id
    WHERE s.tenant_id = ${tenantId} AND ps.imei IN (${sql.join(imeis.map((i) => sql`${i}`), sql`, `)})
    ORDER BY s.created_at DESC, s.id DESC`) : { rows: [] };
  const histBy = new Map<string, SmsReminderLine["history"]>();
  for (const h of hist.rows) {
    const list = histBy.get(h.imei) ?? [];
    list.push({ saleId: h.sale_id, type: h.type, at: iso(h.created_at), packageName: h.package_name, totalMinor: Number(h.total_minor), cardType: h.card_type });
    histBy.set(h.imei, list);
  }
  return r.rows.map((x) => {
    const phone = phoneOf(x.customer_phone);
    const expiry = ymd(x.expires);
    const daysLeft = expiry ? Math.round((Date.parse(`${expiry}T00:00:00Z`) - Date.parse(`${t}T00:00:00Z`)) / 86_400_000) : null;
    let state: ReminderState;
    if (x.blocked) state = "Blocked";
    else if (type === "airtime") state = !phone ? "No phone" : x.expired ? "Device expired" : x.sent_month ? "Sent this month" : "Due";
    else state = !phone ? "No phone" : x.expired ? "Expired" : "Expiring soon";
    // The reminder goes out on the device's expiry day each month; a device that never expires uses its sale day.
    const smsDay = expiry ? Number(expiry.slice(8, 10)) : new Date(new Date(x.sold_at).getTime() + 3 * 3_600_000).getUTCDate();
    return {
      saleId: x.sale_id,
      customerId: x.customer_id,
      customerName: x.customer_name,
      firstName: firstNameOf(x.type, x.first_name, x.company_name, x.customer_name),
      phone,
      vehiclePlate: x.vehicle_plate,
      imei: x.imei,
      simNumber: x.sim_number,
      expiry,
      daysLeft,
      renewalFeeMinor: x.renewal_fee_minor === null ? null : Number(x.renewal_fee_minor),
      state,
      selectable: type === "airtime" ? state === "Due" : !!phone && !x.blocked,
      last: x.last_at && x.last_status ? { at: iso(x.last_at), status: x.last_status } : null,
      saleType: x.sale_type,
      soldAt: iso(x.sold_at),
      subscribed: type !== "airtime" ? null : x.ch_at
        ? { how: "Changed", at: iso(x.ch_at), from: x.ch_from, by: x.ch_by, reason: x.ch_reason ?? "" }
        : { how: "At sale", at: iso(x.sold_at), from: null, by: null, reason: "" },
      reminders: x.reminders,
      smsDay,
      connection: x.gps_status === "Online" || x.gps_status === "Offline" || x.gps_status === "Expired" ? x.gps_status : null,
      blocked: x.blocked,
      model: x.gps_model ?? x.tracker_model,
      packageName: x.package_name,
      packagePriceMinor: Number(x.total_minor ?? 0),
      activationDate: normalizeDate(x.gps_activation_date) ?? iso(x.sold_at).slice(0, 10),
      checkedAt: x.gps_synced_at ? iso(x.gps_synced_at) : null,
      history: histBy.get(x.imei) ?? [],
    };
  });
}

/** GET /api/sms/reminders?type=airtime|expiry */
export async function listSmsReminders(ctx: AuthContext, url: URL): Promise<SmsReminderLine[]> {
  const type = url.searchParams.get("type");
  if (type !== "airtime" && type !== "expiry") throw new ApiError(422, "Choose the airtime or the expiry reminder", { type: "Choose airtime or expiry" });
  return reminderLines(ctx.tenantId, type);
}

// ------------------------------------------------------------------ history

type BatchRow = {
  id: string; kind: SmsKind; message: string; template_name: string | null; recipients: number; scheduled_for: string | Date | null; error: string | null;
  created_at: string | Date; created_by: string | null; sent: number; delivered: number; failed: number; parts: number;
};
type MessageRow = {
  id: string; customer_name: string | null; vehicle_plate: string | null; phone: string; message: string; parts: number; status: SmsStatus;
  message_id: string | null; error: string | null; dlr: string | null; updated_at: string | Date;
};

async function batches(tenantId: string, where: SQL = sql`TRUE`, limit = 40): Promise<SmsBatch[]> {
  const r = await getDb().execute<BatchRow>(sql`
    SELECT b.id, b.kind, b.message, b.template_name, b.recipients, b.scheduled_for, b.error, b.created_at, u.full_name AS created_by,
           (count(m.id) FILTER (WHERE m.status IN ('Sent', 'Delivered', 'Scheduled')))::int AS sent,
           (count(m.id) FILTER (WHERE m.status = 'Delivered'))::int AS delivered,
           (count(m.id) FILTER (WHERE m.status = 'Failed'))::int AS failed,
           COALESCE(sum(m.parts) FILTER (WHERE m.status IN ('Sent', 'Delivered', 'Scheduled')), 0)::int AS parts
    FROM sms_batches b
    LEFT JOIN users u ON u.id = b.created_by AND u.tenant_id = b.tenant_id
    LEFT JOIN sms_messages m ON m.batch_id = b.id
    WHERE b.tenant_id = ${tenantId} AND ${where}
    GROUP BY b.id, u.full_name
    ORDER BY b.created_at DESC, b.id DESC LIMIT ${limit}`);
  return r.rows.map((x) => ({
    id: x.id,
    kind: x.kind,
    message: x.message,
    templateName: x.template_name,
    recipients: x.recipients,
    sent: x.sent,
    delivered: x.delivered,
    failed: x.failed,
    parts: x.parts,
    scheduledFor: x.scheduled_for ? iso(x.scheduled_for) : null,
    error: x.error,
    createdAt: iso(x.created_at),
    createdBy: x.created_by,
    messages: null,
  }));
}

async function messagesOf(tenantId: string, batchId: string): Promise<SmsMessage[]> {
  const r = await getDb().execute<MessageRow>(sql`
    SELECT m.id, c.name AS customer_name, ps.vehicle_plate, m.phone, m.message, m.parts, m.status, m.message_id, m.error, m.dlr, m.updated_at
    FROM sms_messages m LEFT JOIN customers c ON c.id = m.customer_id LEFT JOIN package_sales ps ON ps.sale_id = m.sale_id
    WHERE m.tenant_id = ${tenantId} AND m.batch_id = ${batchId}::uuid ORDER BY m.seq`);
  return r.rows.map((x) => ({
    id: x.id,
    customerName: x.customer_name ?? "",
    vehiclePlate: x.vehicle_plate ?? "",
    phone: x.phone,
    message: x.message,
    parts: x.parts,
    status: x.status,
    messageId: x.message_id,
    error: x.error,
    dlr: x.dlr,
    updatedAt: iso(x.updated_at),
  }));
}

async function oneBatch(tenantId: string, id: string): Promise<SmsBatch | null> {
  if (!isUuid(id)) return null;
  const b = (await batches(tenantId, sql`b.id = ${id}::uuid`, 1))[0];
  return b ? { ...b, messages: await messagesOf(tenantId, id) } : null;
}

/** GET /api/sms/history?kind=… — the latest sends (open one to see its messages). */
export async function listSmsHistory(ctx: AuthContext, url: URL): Promise<SmsBatch[]> {
  const kind = url.searchParams.get("kind");
  const valid = ["Customers", "AirtimeReminder", "ExpiryReminder", "OneOff", "System"];
  return batches(ctx.tenantId, kind && valid.includes(kind) ? sql`b.kind = ${kind}` : sql`TRUE`);
}

/** GET /api/sms/batches/{id} */
export const getSmsBatch = (ctx: AuthContext, id: string) => oneBatch(ctx.tenantId, id);

// ------------------------------------------------------------------ sending

type Recipient = { customerId: string | null; saleId: string | null; phone: string; message: string; label: string };

function readIds(raw: unknown, errors: Record<string, string>, what: string): string[] {
  if (!Array.isArray(raw) || raw.length === 0) errors.recipients = `Select at least one ${what}`;
  else if (raw.length > SMS_MAX_RECIPIENTS) errors.recipients = `Select at most ${SMS_MAX_RECIPIENTS} per send`;
  else if (!raw.every((x) => typeof x === "string" && isUuid(x))) errors.recipients = "Invalid selection";
  else if (new Set(raw).size !== raw.length) errors.recipients = "A recipient is selected twice";
  return Array.isArray(raw) ? (raw as string[]) : [];
}

/** The same form sent again: return that send, never send again. */
const replay = async (tenantId: string, clientKey: string) => {
  const b = (await batches(tenantId, sql`b.client_key = ${clientKey}`, 1))[0];
  return b ? oneBatch(tenantId, b.id) : null;
};

/**
 * POST /api/sms/send { kind, ids, phones, message, templateName, scheduleAt, clientKey }
 *   Customers: ids are customer ids. AirtimeReminder / ExpiryReminder: ids are tracker lines (sale ids).
 *   OneOff: phones is the typed list. scheduleAt ("YYYY-MM-DDTHH:mm", Nairobi) makes TextSMS hold the messages.
 */
export async function sendBulkSms(ctx: AuthContext, body: Body): Promise<SmsBatch> {
  requireAdmin(ctx, "send SMS");
  const r = new Reader(body, ["kind", "ids", "phones", "message", "templateName", "scheduleAt", "clientKey"]);
  const kind = r.text("kind") as SmsAudience;
  const phonesRaw = r.text("phones");
  const message = normalizeSms(r.text("message")).trim();
  const templateName = r.text("templateName").trim().slice(0, 60) || null;
  const scheduleAt = r.text("scheduleAt").trim();
  const clientKey = r.clientKey();
  r.done();
  const errors: Record<string, string> = {};
  if (!clientKey) errors.form = "Missing request key";
  if (!["Customers", "AirtimeReminder", "ExpiryReminder", "OneOff"].includes(kind)) throwValidation({ kind: "Choose who to send to" });
  const problem = messageProblem(message);
  if (problem) errors.message = problem;
  else {
    const bad = unknownFields(message, kind);
    if (bad.length) errors.message = kind === "OneOff" ? `Messages to phone numbers cannot use fields: ${bad.join(" ")}` : `Unknown field${bad.length > 1 ? "s" : ""}: ${bad.join(" ")}`;
  }
  let scheduled: Date | null = null;
  if (scheduleAt) {
    const s = checkSchedule(scheduleAt);
    if (s.error) errors.scheduleAt = s.error;
    else scheduled = s.at!;
  }
  let ids: string[] = [];
  let phones: string[] = [];
  if (kind === "OneOff") {
    const p = parsePhoneList(phonesRaw);
    if (p.invalid.length) errors.phones = `Not valid phone number${p.invalid.length > 1 ? "s" : ""}: ${p.invalid.slice(0, 5).join(", ")}`;
    else if (!p.phones.length) errors.phones = "Enter at least one phone number";
    else if (p.phones.length > SMS_MAX_RECIPIENTS) errors.phones = `Enter at most ${SMS_MAX_RECIPIENTS} numbers per send`;
    phones = p.phones;
  } else ids = readIds(body.ids, errors, kind === "Customers" ? "customer" : "tracker line");
  if (Object.keys(errors).length) throwValidation(errors);

  const again = await replay(ctx.tenantId, clientKey!);
  if (again) return again;
  const creds = textSmsCredsOrThrow();

  let recipients: Recipient[] = [];
  if (kind === "OneOff") {
    recipients = phones.map((p) => ({ customerId: null, saleId: null, phone: p, message, label: p }));
  } else if (kind === "Customers") {
    const list = await customers(ctx.tenantId, sql`c.id IN (${idList(ids)})`);
    if (list.length !== ids.length) throwValidation({ recipients: "Some selected customers were not found. Reload the list." });
    const noPhone = list.filter((c) => !c.phone);
    if (noPhone.length) throwValidation({ recipients: `${noPhone.length} selected customer(s) have no valid phone number: ${noPhone.slice(0, 3).map((c) => c.name).join(", ")}` });
    recipients = list.map((c) => ({ customerId: c.id, saleId: null, phone: c.phone!, message: renderSms(message, fieldValues("Customers", c)), label: c.name }));
  } else {
    const type: ReminderType = kind === "AirtimeReminder" ? "airtime" : "expiry";
    const list = await reminderLines(ctx.tenantId, type, sql`v.sale_id IN (${idList(ids)})`);
    if (list.length !== ids.length) throwValidation({ recipients: "Some selected tracker lines are no longer on this list. Reload the list." });
    const notOk = list.filter((l) => !l.selectable);
    if (notOk.length) throwValidation({ recipients: `${notOk.length} selected line(s) cannot get this reminder: ${notOk.slice(0, 3).map((l) => `${l.vehiclePlate || l.imei} (${l.state})`).join(", ")}. Reload the list.` });
    recipients = list.map((l) => ({ customerId: l.customerId, saleId: l.saleId, phone: l.phone!, message: renderSms(message, fieldValues(kind, l)), label: `${l.customerName} (${l.vehiclePlate || l.imei})` }));
  }
  for (const x of recipients) {
    const p = messageProblem(x.message);
    if (p) throwValidation({ message: `For ${x.label}: ${p}` });
  }
  return dispatchSms(ctx, creds, clientKey!, kind, message, templateName, recipients, scheduled);
}

async function inPool<T>(items: T[], size: number, fn: (t: T) => Promise<void>) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) await fn(items[next++]);
  }));
}

const NO_ANSWER = "No answer from TextSMS. Check the TextSMS dashboard before sending again.";

async function dispatchSms(ctx: AuthContext, creds: TextSmsCreds, clientKey: string, kind: SmsKind, message: string, templateName: string | null, recipients: Recipient[], scheduled: Date | null): Promise<SmsBatch> {
  const db = getDb();
  const rows = recipients.map((x) => ({ ...x, id: randomUUID(), parts: smsParts(x.message) }));
  let batchId: string;
  let seqs: Map<string, number>;
  try {
    ({ batchId, seqs } = await db.transaction(async (tx) => {
      if (kind === "AirtimeReminder") {
        // Two reminder sends at the same moment: the second waits here, then finds this month's reminder and stops.
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`sms-airtime-${ctx.tenantId}`}))`);
        const sent = await tx.execute<{ sale_id: string }>(sql`
          SELECT DISTINCT m.sale_id FROM sms_messages m JOIN sms_batches b ON b.id = m.batch_id
          WHERE m.tenant_id = ${ctx.tenantId} AND b.kind = 'AirtimeReminder' AND m.status <> 'Failed' AND m.created_at >= ${monthStart}
            AND m.sale_id IN (${idList(rows.map((x) => x.saleId!))})`);
        if (sent.rows.length) throw new ApiError(422, "Please correct the highlighted fields", { recipients: `${sent.rows.length} selected line(s) already got this month's reminder. Reload the list.` });
      }
      const b = await tx.execute<{ id: string }>(sql`
        INSERT INTO sms_batches (tenant_id, client_key, kind, message, template_name, recipients, scheduled_for, created_by)
        VALUES (${ctx.tenantId}, ${clientKey}, ${kind}, ${message}, ${templateName}, ${rows.length}, ${scheduled ? scheduled.toISOString() : null}::timestamptz, ${isUuid(ctx.userId) ? ctx.userId : null}::uuid)
        RETURNING id`);
      const id = b.rows[0].id;
      const ins = await tx.execute<{ id: string; seq: string }>(sql`
        INSERT INTO sms_messages (id, tenant_id, batch_id, customer_id, sale_id, phone, message, parts, status)
        VALUES ${sql.join(rows.map((x) => sql`(${x.id}::uuid, ${ctx.tenantId}, ${id}::uuid, ${x.customerId}::uuid, ${x.saleId}::uuid, ${x.phone}, ${x.message}, ${x.parts}, 'Pending')`), sql`, `)}
        RETURNING id, seq::text`);
      return { batchId: id, seqs: new Map(ins.rows.map((m) => [m.id, Number(m.seq)])) };
    }));
  } catch (e) {
    if (e instanceof ApiError) throw e;
    const replayed = await replay(ctx.tenantId, clientKey);
    if (replayed) return replayed;
    throw e;
  }

  const results = new Map<string, SmsOutcome | null>();
  if (scheduled) {
    const stamp = nairobiStamp(scheduled);
    await inPool(rows, 5, async (x) => { results.set(x.id, await textSmsSendScheduled(creds, x, stamp)); });
  } else {
    const chunks: (typeof rows)[] = [];
    for (let i = 0; i < rows.length; i += TEXTSMS_BULK_MAX) chunks.push(rows.slice(i, i + TEXTSMS_BULK_MAX));
    await inPool(chunks, 3, async (chunk) => {
      const out = await textSmsSendBulk(creds, chunk.map((x) => ({ clientId: seqs.get(x.id)!, phone: x.phone, message: x.message })));
      for (const x of chunk) results.set(x.id, out ? (out.get(seqs.get(x.id)!) ?? { ok: false, error: "Not accepted by TextSMS." }) : null);
    });
  }

  const accepted: SmsStatus = scheduled ? "Scheduled" : "Sent";
  for (const x of rows) {
    const o = results.get(x.id) ?? null;
    const status: SmsStatus = o === null ? "Unknown" : o.ok ? accepted : "Failed";
    await db.execute(sql`
      UPDATE sms_messages SET status = ${status}, message_id = ${o && o.ok ? o.messageId : null}, error = ${o === null ? NO_ANSWER : o.ok ? null : o.error}, updated_at = now()
      WHERE id = ${x.id}::uuid`);
  }
  const outcomes = rows.map((x) => results.get(x.id) ?? null);
  const unknown = outcomes.filter((o) => o === null).length;
  const failedErrors = outcomes.filter((o): o is { ok: false; error: string } => !!o && !o.ok).map((o) => o.error);
  let batchError: string | null = null;
  if (unknown) batchError = `No answer from TextSMS for ${unknown} message(s): they may have been sent. Check the TextSMS dashboard before sending again.`;
  else if (failedErrors.length === rows.length && new Set(failedErrors).size === 1) batchError = failedErrors[0];
  if (batchError) await db.execute(sql`UPDATE sms_batches SET error = ${batchError} WHERE id = ${batchId}::uuid`);
  return (await oneBatch(ctx.tenantId, batchId))!;
}

/**
 * An SMS sent by another screen (e.g. Remove from airtime). Saved in Bulk SMS → History as a System send. Never throws
 * for a refusal; returns the result to record with the change.
 */
export async function sendSystemSms(ctx: AuthContext, to: { customerId: string | null; saleId: string | null; phone: string }, message: string): Promise<{ status: "Sent" | "Failed"; error: string | null }> {
  const creds = textSmsCreds();
  if (!creds) return { status: "Failed", error: "TextSMS is not set up yet." };
  const text = normalizeSms(message).trim();
  const problem = messageProblem(text);
  if (problem) return { status: "Failed", error: problem };
  const b = await dispatchSms(ctx, creds, `sys_${randomUUID().replace(/-/g, "")}`, "System", text, null, [{ ...to, message: text, label: to.phone }], null);
  const m = b.messages?.[0];
  return m && m.status === "Sent" ? { status: "Sent", error: null } : { status: "Failed", error: m?.error ?? b.error ?? "Not accepted by TextSMS." };
}

/**
 * POST /api/sms/batches/{id}/delivery — ask TextSMS for the delivery report of each accepted message (up to 200 per
 * click, the ones checked longest ago first).
 */
export async function refreshSmsDelivery(ctx: AuthContext, id: string): Promise<SmsBatch | null> {
  if (!isUuid(id)) return null;
  const b = (await batches(ctx.tenantId, sql`b.id = ${id}::uuid`, 1))[0];
  if (!b) return null;
  const creds = textSmsCredsOrThrow();
  const db = getDb();
  const todo = await db.execute<{ id: string; message_id: string; status: SmsStatus }>(sql`
    SELECT id, message_id, status FROM sms_messages
    WHERE tenant_id = ${ctx.tenantId} AND batch_id = ${id}::uuid AND status IN ('Sent', 'Scheduled') AND message_id IS NOT NULL
    ORDER BY dlr_checked_at NULLS FIRST, seq LIMIT 200`);
  const waiting = b.scheduledFor !== null && Date.parse(b.scheduledFor) > Date.now();
  await inPool(todo.rows, 6, async (m) => {
    const d = await textSmsDlr(creds, m.message_id);
    if (!d) return;
    const status: SmsStatus = d.status === "Sent" ? (m.status === "Scheduled" && waiting ? "Scheduled" : "Sent") : d.status;
    await db.execute(sql`
      UPDATE sms_messages SET status = ${status}, dlr = ${d.text}, dlr_checked_at = now(), updated_at = now(),
        error = ${status === "Failed" ? (d.text ?? "Not delivered") : null}
      WHERE id = ${m.id}::uuid`);
  });
  return oneBatch(ctx.tenantId, id);
}

// ------------------------------------------------------------------ overview

/** GET /api/sms/overview */
export async function getSmsOverview(ctx: AuthContext): Promise<SmsOverview> {
  const creds = textSmsCreds();
  const db = getDb();
  const [month, sched, airtime, expiry, cust, bal] = await Promise.all([
    db.execute<{ sent: number; delivered: number; failed: number; parts: number }>(sql`
      SELECT (count(*) FILTER (WHERE status IN ('Sent', 'Delivered')))::int AS sent,
             (count(*) FILTER (WHERE status = 'Delivered'))::int AS delivered,
             (count(*) FILTER (WHERE status = 'Failed'))::int AS failed,
             COALESCE(sum(parts) FILTER (WHERE status IN ('Sent', 'Delivered')), 0)::int AS parts
      FROM sms_messages WHERE tenant_id = ${ctx.tenantId} AND created_at >= ${monthStart}`),
    db.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM sms_messages WHERE tenant_id = ${ctx.tenantId} AND status = 'Scheduled'`),
    reminderLines(ctx.tenantId, "airtime"),
    reminderLines(ctx.tenantId, "expiry"),
    db.execute<{ phone: string }>(sql`SELECT phone FROM customers WHERE tenant_id = ${ctx.tenantId} AND phone <> ''`),
    creds ? textSmsBalance(creds) : Promise.resolve(null),
  ]);
  const m = month.rows[0];
  return {
    month: todayInNairobi().slice(0, 7),
    configured: !!creds,
    balance: bal && bal.ok ? bal.balance : null,
    balanceError: bal && !bal.ok ? bal.message : null,
    sentThisMonth: m.sent,
    deliveredThisMonth: m.delivered,
    failedThisMonth: m.failed,
    partsThisMonth: m.parts,
    scheduled: sched.rows[0].n,
    airtimeRemindersDue: airtime.filter((l) => l.state === "Due").length,
    expiringSoon: expiry.filter((l) => l.state === "Expiring soon" || (l.state === "No phone" && (l.daysLeft ?? -1) >= 0)).length,
    expired: expiry.filter((l) => l.state === "Expired" || (l.state === "No phone" && (l.daysLeft === null || l.daysLeft < 0))).length,
    customersWithPhone: cust.rows.filter((c) => phoneOf(c.phone)).length,
  };
}

// ------------------------------------------------------------------ templates

type TemplateRow = { id: string; name: string; body: string; audience: SmsAudience; updated_at: string | Date };
const toTemplate = (x: TemplateRow): SmsTemplate => ({ id: x.id, name: x.name, body: x.body, audience: x.audience, updatedAt: iso(x.updated_at) });

/** GET /api/sms/templates */
export async function listSmsTemplates(ctx: AuthContext): Promise<SmsTemplate[]> {
  const r = await getDb().execute<TemplateRow>(sql`SELECT id, name, body, audience, updated_at FROM sms_templates WHERE tenant_id = ${ctx.tenantId} ORDER BY lower(name)`);
  return r.rows.map(toTemplate);
}

function readTemplate(body: Body) {
  const r = new Reader(body, ["name", "body", "audience"]);
  const draft = { name: r.text("name"), body: r.text("body"), audience: r.text("audience") };
  r.done();
  const v = validateTemplate(draft);
  if (!v.value) throwValidation(v.errors);
  return v.value!;
}

const isDuplicateName = (e: unknown) => uniqueViolation(e) === "sms_templates_tenant_name_uq";

/** POST /api/sms/templates { name, body, audience } */
export async function createSmsTemplate(ctx: AuthContext, body: Body): Promise<SmsTemplate> {
  const t = readTemplate(body);
  try {
    const r = await getDb().execute<TemplateRow>(sql`
      INSERT INTO sms_templates (tenant_id, name, body, audience) VALUES (${ctx.tenantId}, ${t.name}, ${t.body}, ${t.audience})
      RETURNING id, name, body, audience, updated_at`);
    return toTemplate(r.rows[0]);
  } catch (e) {
    if (isDuplicateName(e)) throwValidation({ name: "A template with this name already exists" });
    throw e;
  }
}

/** PUT /api/sms/templates/{id} { name, body, audience } */
export async function updateSmsTemplate(ctx: AuthContext, id: string, body: Body): Promise<SmsTemplate | null> {
  if (!isUuid(id)) return null;
  const t = readTemplate(body);
  try {
    const r = await getDb().execute<TemplateRow>(sql`
      UPDATE sms_templates SET name = ${t.name}, body = ${t.body}, audience = ${t.audience}, updated_at = now()
      WHERE id = ${id}::uuid AND tenant_id = ${ctx.tenantId} RETURNING id, name, body, audience, updated_at`);
    return r.rows[0] ? toTemplate(r.rows[0]) : null;
  } catch (e) {
    if (isDuplicateName(e)) throwValidation({ name: "A template with this name already exists" });
    throw e;
  }
}

/** DELETE /api/sms/templates/{id} */
export async function deleteSmsTemplate(ctx: AuthContext, id: string): Promise<{ deleted: true } | null> {
  if (!isUuid(id)) return null;
  const r = await getDb().execute(sql`DELETE FROM sms_templates WHERE id = ${id}::uuid AND tenant_id = ${ctx.tenantId} RETURNING id`);
  return r.rows.length ? { deleted: true } : null;
}

// ------------------------------------------------------------------ automatic monthly airtime reminders

type SettingsRow = { enabled: boolean; message: string; send_hour: number; last_run_at: string | Date | null; last_run_note: string | null };

async function settingsOf(tenantId: string): Promise<SmsReminderSettings> {
  const r = await getDb().execute<SettingsRow>(sql`SELECT enabled, message, send_hour, last_run_at, last_run_note FROM sms_reminder_settings WHERE tenant_id = ${tenantId}`);
  const x = r.rows[0];
  return x
    ? { enabled: x.enabled, message: x.message, sendHour: x.send_hour, lastRunAt: x.last_run_at ? iso(x.last_run_at) : null, lastRunNote: x.last_run_note }
    : { enabled: false, message: DEFAULT_REMINDER_MESSAGE, sendHour: 9, lastRunAt: null, lastRunNote: null };
}

/** GET /api/sms/reminder-settings */
export const getReminderSettings = (ctx: AuthContext) => settingsOf(ctx.tenantId);

/** PUT /api/sms/reminder-settings { enabled, message, sendHour } */
export async function saveReminderSettings(ctx: AuthContext, body: Body): Promise<SmsReminderSettings> {
  requireAdmin(ctx, "change the automatic reminder settings");
  const r = new Reader(body, ["enabled", "message", "sendHour"]);
  const enabled = r.bool("enabled");
  const message = normalizeSms(r.text("message")).trim();
  const hourRaw = r.text("sendHour").trim();
  r.done();
  const errors: Record<string, string> = {};
  const problem = messageProblem(message);
  if (problem) errors.message = problem;
  else {
    const bad = unknownFields(message, "AirtimeReminder");
    if (bad.length) errors.message = `Unknown field${bad.length > 1 ? "s" : ""}: ${bad.join(" ")}`;
  }
  const hour = /^\d{1,2}$/.test(hourRaw) ? Number(hourRaw) : NaN;
  if (!(hour >= 6 && hour <= 20)) errors.sendHour = "Choose a time between 6:00 and 20:00";
  if (enabled && !textSmsConfigured()) errors.enabled = "TextSMS is not set up yet, so automatic reminders cannot be turned on";
  if (Object.keys(errors).length) throwValidation(errors);
  await getDb().execute(sql`
    INSERT INTO sms_reminder_settings (tenant_id, enabled, message, send_hour, updated_by)
    VALUES (${ctx.tenantId}, ${enabled}, ${message}, ${hour}, ${isUuid(ctx.userId) ? ctx.userId : null}::uuid)
    ON CONFLICT (tenant_id) DO UPDATE SET enabled = EXCLUDED.enabled, message = EXCLUDED.message, send_hour = EXCLUDED.send_hour,
      updated_by = EXCLUDED.updated_by, updated_at = now()`);
  return settingsOf(ctx.tenantId);
}

/** POST /api/sms/blocks/{customerId} { blocked } — block or unblock a customer from reminders. */
export async function setReminderBlock(ctx: AuthContext, customerId: string, body: Body): Promise<{ blocked: boolean } | null> {
  requireAdmin(ctx, "block or unblock reminders");
  const r = new Reader(body, ["blocked"]);
  const blocked = r.bool("blocked");
  r.done();
  if (!isUuid(customerId)) return null;
  const c = await getDb().execute(sql`SELECT 1 FROM customers WHERE id = ${customerId}::uuid AND tenant_id = ${ctx.tenantId}`);
  if (!c.rows.length) return null;
  if (blocked) {
    await getDb().execute(sql`
      INSERT INTO sms_reminder_blocks (tenant_id, customer_id, blocked_by) VALUES (${ctx.tenantId}, ${customerId}::uuid, ${isUuid(ctx.userId) ? ctx.userId : null}::uuid)
      ON CONFLICT (tenant_id, customer_id) DO NOTHING`);
  } else {
    await getDb().execute(sql`DELETE FROM sms_reminder_blocks WHERE tenant_id = ${ctx.tenantId} AND customer_id = ${customerId}::uuid`);
  }
  return { blocked };
}

const nairobiParts = (now: Date) => {
  const t = new Date(now.getTime() + 3 * 3_600_000);
  return { ymd: t.toISOString().slice(0, 10), ym: t.toISOString().slice(0, 7), day: t.getUTCDate(), hour: t.getUTCHours() };
};
/** A missed day (the server was down) is caught up for this many days. */
const CATCH_UP_DAYS = 2;

export type ReminderRun = { due: number; batch: SmsBatch | null; note: string };

/**
 * Sends today's monthly airtime reminders: every line that is Due whose reminder day is today (or up to two missed days
 * ago), with the company's reminder message. Each line still goes once a month, and a run repeated the same day with
 * the same lines returns the same send.
 */
export async function runReminders(ctx: AuthContext, now = new Date()): Promise<ReminderRun> {
  const s = await settingsOf(ctx.tenantId);
  const { ymd, ym, day } = nairobiParts(now);
  const lines = (await reminderLines(ctx.tenantId, "airtime")).filter((l) => {
    if (l.state !== "Due") return false;
    const d = dayThisMonth(l.smsDay, ym);
    return d <= day && d >= day - CATCH_UP_DAYS;
  });
  let batch: SmsBatch | null = null;
  let note: string;
  if (!lines.length) note = "No reminders due today.";
  else {
    const ids = lines.map((l) => l.saleId).sort();
    const key = `auto${ymd.replace(/-/g, "")}${createHash("sha256").update(ids.join(",")).digest("hex").slice(0, 16)}`;
    try {
      batch = await sendBulkSms(ctx, { kind: "AirtimeReminder", ids, message: s.message, templateName: "Automatic reminder", clientKey: key });
      note = `${batch.sent} of ${batch.recipients} reminders sent${batch.failed ? `, ${batch.failed} failed` : ""}.`;
    } catch (e) {
      const err = e as { message?: string; fields?: Record<string, string>; errors?: Record<string, string> };
      const detail = Object.values(err.fields ?? err.errors ?? {})[0];
      note = `Not sent: ${detail ?? err.message ?? "unexpected error"}`.slice(0, 300);
    }
  }
  await getDb().execute(sql`
    INSERT INTO sms_reminder_settings (tenant_id, message, last_run_at, last_run_note) VALUES (${ctx.tenantId}, ${s.message}, now(), ${note})
    ON CONFLICT (tenant_id) DO UPDATE SET last_run_at = now(), last_run_note = EXCLUDED.last_run_note`);
  return { due: lines.length, batch, note };
}

/** POST /api/sms/reminders/run — send today's reminders now (the same as the automatic job, without waiting for the hour). */
export async function runRemindersNow(ctx: AuthContext): Promise<ReminderRun & { settings: SmsReminderSettings }> {
  requireAdmin(ctx, "send today's reminders");
  textSmsCredsOrThrow();
  const r = await runReminders(ctx);
  return { ...r, settings: await settingsOf(ctx.tenantId) };
}

/**
 * The automatic job (started once per server, see src/instrumentation.ts): for every company with automatic reminders
 * on, once its send hour has come, sends the day's reminders. Safe to run often and on several servers at once: a line
 * that already got this month's reminder is never sent again.
 */
export async function runAutomaticReminders(now = new Date()): Promise<void> {
  if (!textSmsConfigured()) return;
  const { hour, ymd } = nairobiParts(now);
  // Which companies are due is a system question; each company's work then runs in that company only.
  const due = await asSystem(() => getDb().execute<{ tenant_id: string; last_run_at: string | Date | null }>(sql`
    SELECT tenant_id, last_run_at FROM sms_reminder_settings WHERE enabled AND send_hour <= ${hour}`));
  for (const t of due.rows) await asTenant(t.tenant_id, async () => {
    // Once a day after the send hour, then every run picks up lines that became due later the same day.
    const ranToday = t.last_run_at ? nairobiParts(new Date(t.last_run_at)).ymd === ymd : false;
    const ctx: AuthContext = { tenantId: t.tenant_id, userId: "" };
    try {
      if (!ranToday) await runReminders(ctx, now);
      else {
        const { ym, day } = nairobiParts(now);
        const pending = (await reminderLines(t.tenant_id, "airtime")).some((l) => l.state === "Due" && dayThisMonth(l.smsDay, ym) <= day && dayThisMonth(l.smsDay, ym) >= day - CATCH_UP_DAYS);
        if (pending) await runReminders(ctx, now);
      }
    } catch (e) {
      console.error("[sms] automatic reminders failed for a company:", (e as Error).message);
    }
  });
}
