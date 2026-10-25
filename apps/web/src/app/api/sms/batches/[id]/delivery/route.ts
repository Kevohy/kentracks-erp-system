import { getAuthContext } from "@/server/crm/auth";
import { ApiError, handle, json } from "@/server/crm/http";
import { refreshSmsDelivery } from "@/server/erp/sms";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST — ask TextSMS for the delivery reports of this send's messages. */
export const POST = (req: Request, { params }: { params: Promise<{ id: string }> }) =>
  handle(async () => {
    const ctx = await getAuthContext(req);
    const r = await refreshSmsDelivery(ctx, (await params).id);
    if (!r) throw new ApiError(404, "Record not found");
    return json(r);
  });
