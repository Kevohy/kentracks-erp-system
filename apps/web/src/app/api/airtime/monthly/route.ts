import { getList } from "@/server/erp/iot-routes";
import { getAirtimeMonthly } from "@/server/erp/airtime";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — sales ticked for monthly airtime waiting for approval, and the approved lines with this month's state. */
export const GET = getList((c) => getAirtimeMonthly(c));
