import { suspendAirtimePlan } from "@/server/erp/airtime";
import { writeById } from "@/server/erp/iot-routes";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST { suspended: boolean } — pause or resume monthly airtime for one approved line. */
export const POST = writeById((c, id, b) => suspendAirtimePlan(c, id, b));
