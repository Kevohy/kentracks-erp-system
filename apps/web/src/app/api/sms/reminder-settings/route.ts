import { getAuthContext } from "@/server/crm/auth";
import { handle, json, readJsonObject } from "@/server/crm/http";
import { getList } from "@/server/erp/iot-routes";
import { getReminderSettings, saveReminderSettings } from "@/server/erp/sms";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — the automatic monthly airtime reminder settings. */
export const GET = getList((c) => getReminderSettings(c));

/** PUT { enabled, message, sendHour } — turn automatic reminders on or off, and set the message and time. */
export const PUT = (req: Request) =>
  handle(async () => {
    const ctx = await getAuthContext(req);
    return json(await saveReminderSettings(ctx, await readJsonObject(req)));
  });
