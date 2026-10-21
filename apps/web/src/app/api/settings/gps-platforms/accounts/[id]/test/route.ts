import { getById } from "@/server/erp/iot-routes";
import { testGpsAccount } from "@/server/erp/gps-auth";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST — make sure the account holds a valid access token (asks the platform only when needed). */
export const POST = getById((c, id) => testGpsAccount(c, id));
