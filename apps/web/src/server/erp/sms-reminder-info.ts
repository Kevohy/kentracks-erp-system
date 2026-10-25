import "server-only";
import { sql } from "drizzle-orm";
import type { SmsReminderInfo } from "@/lib/sales";
import { getDb } from "../crm/db";

const RECENT = 6;
/** The current month in Nairobi as "YYYY-MM". */
const nairobiMonth = (d: Date) => new Date(d.getTime() + 3 * 3_600_000).toISOString().slice(0, 7);

/**
 * The monthly airtime reminder of each sale on the SMS reminder service, read from Bulk SMS history: Sales, Billing
 * and Bulk SMS all show the same thing. A reminder that failed does not count as this month's reminder.
 */
export async function smsReminderInfo(tenantId: string, saleIds: string[]): Promise<Map<string, SmsReminderInfo>> {
  const out = new Map<string, SmsReminderInfo>();
  if (!saleIds.length) return out;
  const r = await getDb().execute<{ sale_id: string; created_at: string | Date; status: SmsReminderInfo["recent"][number]["status"] }>(sql`
    SELECT m.sale_id, m.created_at, m.status
    FROM sms_messages m JOIN sms_batches b ON b.id = m.batch_id
    WHERE m.tenant_id = ${tenantId} AND b.kind = 'AirtimeReminder'
      AND m.sale_id IN (${sql.join(saleIds.map((id) => sql`${id}::uuid`), sql`, `)})
    ORDER BY m.created_at DESC, m.seq DESC`);
  const month = nairobiMonth(new Date());
  for (const id of saleIds) out.set(id, { status: "Due", recent: [], total: 0 });
  for (const x of r.rows) {
    const info = out.get(x.sale_id)!;
    const at = new Date(x.created_at);
    info.total++;
    if (info.recent.length < RECENT) info.recent.push({ at: at.toISOString(), status: x.status });
    if (x.status !== "Failed" && nairobiMonth(at) === month) info.status = "Sent this month";
  }
  return out;
}
