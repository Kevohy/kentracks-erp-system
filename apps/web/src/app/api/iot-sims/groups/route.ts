import { getList } from "@/server/erp/iot-routes";
import { listIotGroups } from "@/server/erp/iot-sims";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/iot-sims/groups */
export const GET = getList((c) => listIotGroups(c));
