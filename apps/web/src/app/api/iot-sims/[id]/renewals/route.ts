import { getById } from "@/server/erp/iot-routes";
import { listSimRenewals } from "@/server/erp/iot-sims";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/iot-sims/{saleId}/renewals */
export const GET = getById((c, id) => listSimRenewals(c, id));
