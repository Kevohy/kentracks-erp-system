import { subscribeToAirtime } from "@/server/erp/airtime";
import { writeById } from "@/server/erp/iot-routes";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST { reason } — switch an existing sale to automatic airtime recharge; it then waits in Approval. */
export const POST = writeById((c, id, b) => subscribeToAirtime(c, id, b));
