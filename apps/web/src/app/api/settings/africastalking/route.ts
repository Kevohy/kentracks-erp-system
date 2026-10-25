import { getAuthContext } from "@/server/crm/auth";
import { handle, json } from "@/server/crm/http";
import { getAfricasTalking } from "@/server/erp/airtime";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — whether Africa's Talking is set in the server environment (username and the last 4 characters of the key; never the key). */
export const GET = (req: Request) => handle(async () => json(await getAfricasTalking(await getAuthContext(req))));
