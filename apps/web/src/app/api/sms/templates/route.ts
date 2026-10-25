import { getAuthContext } from "@/server/crm/auth";
import { handle, json, readJsonObject } from "@/server/crm/http";
import { getList } from "@/server/erp/iot-routes";
import { createSmsTemplate, listSmsTemplates } from "@/server/erp/sms";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — saved SMS templates. */
export const GET = getList((c) => listSmsTemplates(c));

/** POST { name, body, audience } — save a template. */
export const POST = (req: Request) =>
  handle(async () => {
    const ctx = await getAuthContext(req);
    return json(await createSmsTemplate(ctx, await readJsonObject(req)), 201);
  });
