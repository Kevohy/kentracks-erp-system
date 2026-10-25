import { getList } from "@/server/erp/iot-routes";
import { getSmsOverview } from "@/server/erp/sms";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — the Bulk SMS dashboard: TextSMS credit, this month's SMS and the reminders due. */
export const GET = getList((c) => getSmsOverview(c));
