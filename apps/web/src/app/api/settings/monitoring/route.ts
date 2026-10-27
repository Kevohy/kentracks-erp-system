import { getAuthContext } from "@/server/crm/auth";
import { handle, json } from "@/server/crm/http";
import { getMonitoring } from "@/server/ops/monitor";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — the server's health, load, request rate, rate limiting and background jobs (administrators only). */
export const GET = (req: Request) => handle(async () => json(await getMonitoring(await getAuthContext(req))));
