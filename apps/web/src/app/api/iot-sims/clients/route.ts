import { getList } from "@/server/erp/iot-routes";
import { listIotClients } from "@/server/erp/iot-sims";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/iot-sims/clients?q=&offset=&limit= */
export const GET = getList(listIotClients);
