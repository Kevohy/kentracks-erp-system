import { getAuthContext } from "@/server/crm/auth";
import { handle, json, readJsonObject } from "@/server/crm/http";
import { sendMonthlyAirtime } from "@/server/erp/airtime";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST { saleIds, clientKey } — this month's airtime to approved lines that are due, each with its monthly amount. */
export const POST = (req: Request) =>
  handle(async () => {
    const ctx = await getAuthContext(req);
    // Up to 1,000 sale ids (about 40 KB).
    return json(await sendMonthlyAirtime(ctx, await readJsonObject(req, 64 * 1024)));
  });
