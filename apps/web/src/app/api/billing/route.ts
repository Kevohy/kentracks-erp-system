import { getAuthContext } from "@/server/crm/auth";
import { handle, json } from "@/server/crm/http";
import { listBillingPage } from "@/server/erp/billing";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/billing?q=…&filter=…&offset=0&limit=20 — customers with their tracked vehicles, plus totals. */
export const GET = (req: Request) => handle(async () => json(await listBillingPage(await getAuthContext(req), new URL(req.url))));
