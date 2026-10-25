import { getAuthContext } from "@/server/crm/auth";
import { handle, json, readJsonObject } from "@/server/crm/http";
import { sendTopUp } from "@/server/erp/airtime";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST { phone, amount, clientKey } — one-off airtime to a number typed in. */
export const POST = (req: Request) =>
  handle(async () => {
    const ctx = await getAuthContext(req);
    return json(await sendTopUp(ctx, await readJsonObject(req)));
  });
