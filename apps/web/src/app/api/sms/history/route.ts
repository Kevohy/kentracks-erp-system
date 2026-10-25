import { getList } from "@/server/erp/iot-routes";
import { listSmsHistory } from "@/server/erp/sms";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET ?kind= — the latest SMS sends. */
export const GET = getList((c, url) => listSmsHistory(c, url));
