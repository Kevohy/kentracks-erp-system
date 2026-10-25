import { getAuthContext } from "@/server/crm/auth";
import { handle, json, readJsonObject } from "@/server/crm/http";
import { sendBulkSms } from "@/server/erp/sms";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST { kind, ids | phones, message, templateName, scheduleAt, clientKey } — send SMS with TextSMS. */
export const POST = (req: Request) =>
  handle(async () => {
    const ctx = await getAuthContext(req);
    // Up to 1,000 ids (about 40 KB) or 1,000 typed numbers.
    return json(await sendBulkSms(ctx, await readJsonObject(req, 64 * 1024)));
  });
