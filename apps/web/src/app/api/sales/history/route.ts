import { getAuthContext } from "@/server/crm/auth";
import { handle, json } from "@/server/crm/http";
import { listSalesPage } from "@/server/erp/sales";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/sales/history?limit=50&cursor=…&q=…&type=… — one page of the sale history plus totals. */
export const GET = (req: Request) => handle(async () => json(await listSalesPage(await getAuthContext(req), new URL(req.url))));
