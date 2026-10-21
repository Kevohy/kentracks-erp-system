import { getAuthContext } from "@/server/crm/auth";
import { ApiError, handle, json, readJsonObject } from "@/server/crm/http";
import { addGpsAccount } from "@/server/erp/gps-auth";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** POST /api/settings/gps-platforms/{platform}/accounts { account, password } — add an account the platform accepts. */
export const POST = (req: Request, { params }: Ctx) =>
  handle(async () => {
    const ctx = await getAuthContext(req); // authenticate before reading the body
    const r = await addGpsAccount(ctx, (await params).id, await readJsonObject(req));
    if (!r) throw new ApiError(404, "Record not found");
    return json(r, 201);
  });
