import { getAuthContext } from "@/server/crm/auth";
import { handle, json } from "@/server/crm/http";
import { runRemindersNow } from "@/server/erp/sms";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST — send today's monthly airtime reminders now (what the automatic job does at the send hour). */
export const POST = (req: Request) =>
  handle(async () => {
    const ctx = await getAuthContext(req);
    return json(await runRemindersNow(ctx));
  });
