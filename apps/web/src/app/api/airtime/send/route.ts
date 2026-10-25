import { getAuthContext } from "@/server/crm/auth";
import { handle, json, readJsonObject } from "@/server/crm/http";
import { sendAirtime } from "@/server/erp/airtime";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST { saleIds, amount, clientKey } — send airtime to tracker SIM lines with Africa's Talking. */
export const POST = (req: Request) =>
  handle(async () => {
    const ctx = await getAuthContext(req);
    // Up to 1,000 sale ids (about 40 KB).
    return json(await sendAirtime(ctx, await readJsonObject(req, 64 * 1024)));
  });
