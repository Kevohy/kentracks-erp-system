import { getAuthContext } from "@/server/crm/auth";
import { ApiError, handle, json } from "@/server/crm/http";
import { writeById } from "@/server/erp/iot-routes";
import { deleteSmsTemplate, updateSmsTemplate } from "@/server/erp/sms";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** PUT { name, body, audience } — change a template. */
export const PUT = writeById((c, id, b) => updateSmsTemplate(c, id, b));

/** DELETE — delete a template (sends made with it keep their text). */
export const DELETE = (req: Request, { params }: { params: Promise<{ id: string }> }) =>
  handle(async () => {
    const ctx = await getAuthContext(req);
    const r = await deleteSmsTemplate(ctx, (await params).id);
    if (!r) throw new ApiError(404, "Record not found");
    return json(r);
  });
