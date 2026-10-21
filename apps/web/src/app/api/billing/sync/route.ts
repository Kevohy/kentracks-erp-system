import { getAuthContext } from "@/server/crm/auth";
import { handle, json, readJsonObject } from "@/server/crm/http";
import { syncBilling } from "@/server/erp/billing";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/billing/sync { customerIds, force? } — refresh these customers' devices from GPSPlatform. */
export const POST = (req: Request) =>
  handle(async () => {
    const ctx = await getAuthContext(req); // authenticate before reading the body
    return json(await syncBilling(ctx, await readJsonObject(req)));
  });
