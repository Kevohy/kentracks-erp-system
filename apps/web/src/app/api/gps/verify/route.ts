import { getList } from "@/server/erp/iot-routes";
import { verifyImeiOnServer } from "@/server/erp/gps";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/gps/verify?imei=… — verify one IMEI with the company's GPS platform accounts (never their secrets). */
export const GET = getList((c, url) => verifyImeiOnServer(c.tenantId, url.searchParams.get("imei") ?? ""));
