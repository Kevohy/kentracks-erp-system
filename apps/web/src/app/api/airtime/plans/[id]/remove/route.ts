import { removeFromAirtime } from "@/server/erp/airtime";
import { writeById } from "@/server/erp/iot-routes";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST { notify: "sms" | "none", message } — take a line off airtime (the sale's service becomes None), optionally texting the customer. */
export const POST = writeById((c, id, b) => removeFromAirtime(c, id, b));
