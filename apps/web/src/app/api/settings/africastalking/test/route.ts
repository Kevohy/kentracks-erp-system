import { getAuthContext } from "@/server/crm/auth";
import { handle, json } from "@/server/crm/http";
import { testAfricasTalking } from "@/server/erp/airtime";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST — check the saved account works and return its balance. */
export const POST = (req: Request) => handle(async () => json(await testAfricasTalking(await getAuthContext(req))));
