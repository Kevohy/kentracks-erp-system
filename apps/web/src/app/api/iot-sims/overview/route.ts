import { getList } from "@/server/erp/iot-routes";
import { iotOverview } from "@/server/erp/iot-sims";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/iot-sims/overview */
export const GET = getList((c) => iotOverview(c));
