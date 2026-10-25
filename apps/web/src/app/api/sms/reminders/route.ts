import { getList } from "@/server/erp/iot-routes";
import { listSmsReminders } from "@/server/erp/sms";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET ?type=airtime|expiry — tracker lines for the monthly airtime reminder or the expiry & renewal reminder. */
export const GET = getList((c, url) => listSmsReminders(c, url));
