import { refreshImeiExpiry } from "@/server/erp/airtime";
import { writeById } from "@/server/erp/iot-routes";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST {} — read the device's expiry date from the GPS platform now (used when the expiry comes from the IMEI). */
export const POST = writeById((c, id) => refreshImeiExpiry(c, id));
