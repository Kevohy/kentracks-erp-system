import { getById } from "@/server/erp/iot-routes";
import { listGroupSims } from "@/server/erp/iot-sims";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/iot-sims/groups/{simCardId}/sims?q=&offset=&limit= */
export const GET = getById(listGroupSims);
