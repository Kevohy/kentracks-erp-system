import { getById } from "@/server/erp/iot-routes";
import { getSmsBatch } from "@/server/erp/sms";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — one SMS send with every message and its status. */
export const GET = getById((c, id) => getSmsBatch(c, id));
