import { getAuthContext } from "@/server/crm/auth";
import { handle, json } from "@/server/crm/http";
import { listStock } from "@/server/erp/inventory";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = (req: Request) => handle(async () => json(await listStock(await getAuthContext(req))));
