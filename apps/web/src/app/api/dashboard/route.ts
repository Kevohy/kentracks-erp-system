import { getList } from "@/server/erp/iot-routes";
import { dashboardSummary } from "@/server/erp/dashboard";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/dashboard — the main Dashboard figures, worked out from the company's own records. */
export const GET = getList((c) => dashboardSummary(c));
