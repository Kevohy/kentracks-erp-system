import { getList } from "@/server/erp/iot-routes";
import { listIotRenewals } from "@/server/erp/iot-sims";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/iot-sims/renewals?offset=&limit= */
export const GET = getList(listIotRenewals);
